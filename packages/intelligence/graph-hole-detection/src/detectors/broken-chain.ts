// ============================================================================
// BROKEN_CHAIN detector (Phase 5A-PR4)
//
// "An observed chain of relations ends at C, a relation hypothesis expects
// C—D, no edge documents it, and D itself continues the observed structure."
//
// Detected as: a deterministic simple observed chain [c0..ck] (k ≥ 1, length
// capped) whose TAIL ck has an asserted-but-unmaterialized pair (ck, d) where
// d ∉ chain (no cycle-back), d has its own observed neighbors (the structure
// continues onwards), and no edge ck–d exists. The candidate preserves the
// observed chain + the missing continuation node. Expected type comes only
// from the hypothesis predicate when it is an authoritative RelationType.
//
// Chain enumeration is depth-capped and globally budgeted (boundKind
// PAIR_EVALUATIONS), never enumerated unbounded.
// ============================================================================

import { hasEdgeBetween, relationTypeOrNull } from './shared.js';
import { DETECTOR_BOUNDS } from '../bounds.js';
import { pairKey, sortedUnique } from '../determinism.js';
import { DetectorRun } from './run.js';
import type { RelationType } from '@indago/contracts';
import type { DetectorCandidate, GraphHoleDetectionContext } from '../types.js';

export function detectBrokenChain(ctx: GraphHoleDetectionContext): DetectorRun {
  const run = new DetectorRun('BROKEN_CHAIN');

  const continuationsByNode = new Map<string, Array<{
    readonly d: string;
    readonly expected: RelationType | null;
    readonly atomic: typeof assertions[number]['atomic'];
  }>>();
  const assertions = siteExpectationPairs(ctx);

  const addContinuation = (tail: string, other: string, descriptor: (typeof assertions)[number]): void => {
    const list = continuationsByNode.get(tail) ?? [];
    const duplicate = list.some((item) => item.d === other);
    if (!duplicate) {
      list.push({
        d: other,
        expected: descriptor.expected,
        atomic: descriptor.atomic,
      });
      continuationsByNode.set(tail, list);
    }
  };

  // Index asserted-but-unmaterialized pairs under both endpoints so any chain
  // tail can be looked up whatever the hypothesis orientation.
  for (const assertion of assertions) {
    addContinuation(assertion.a, assertion.b, assertion);
    addContinuation(assertion.b, assertion.a, assertion);
  }

  const emitted: DetectorCandidate[] = [];
  const maxChainByTail = new Map<string, string[]>();
  let budget = DETECTOR_BOUNDS.maxChainEvaluationsPerDetector;
  const exhausted = (): boolean => budget <= 0;

  const recordChain = (chain: readonly string[]): void => {
    const tail = chain[chain.length - 1];
    if (tail === undefined || chain.length < 2) return;
    const previous = maxChainByTail.get(tail);
    if (previous === undefined || chain.length > previous.length) {
      maxChainByTail.set(tail, [...chain]);
      return;
    }
    // Equal length: keep the lexicographically smallest node sequence so the
    // choice is byte-stable regardless of graph-node iteration order.
    if (chain.length === previous.length && chain.join('|') < previous.join('|')) {
      maxChainByTail.set(tail, [...chain]);
    }
  };

  const visited = new Set<string>();
  const walk = (chain: string[]): void => {
    if (exhausted()) {
      run.stop('PAIR_EVALUATIONS');
      return;
    }
    if (chain.length >= 2) recordChain(chain);
    if (chain.length >= DETECTOR_BOUNDS.brokenChainMaxObservedLength) return;
    const tail = chain[chain.length - 1]!;
    if (tail === undefined) return;
    for (const neighbor of ctx.adjacency.get(tail) ?? []) {
      if (visited.has(neighbor)) continue;
      budget -= 1;
      visited.add(neighbor);
      chain.push(neighbor);
      walk(chain);
      chain.pop();
      visited.delete(neighbor);
      if (exhausted()) break;
    }
  };

  for (const node of ctx.nodes) {
    if (exhausted()) break;
    visited.add(node.id);
    walk([node.id]);
    visited.delete(node.id);
  }

  if (exhausted()) {
    run.stop('PAIR_EVALUATIONS');
    return run;
  }

  // Emit exactly ONE candidate per asserted-but-unmaterialized pair: the side
  // whose observed chain is LONGEST (deterministic tie-break by node id). A
  // single broken link C—D is one story whether we reach it from C's side or
  // D's side; mirror chains [.. <C] and [.. <D] must not double-report it.
  const seenKeys = new Set<string>();
  for (const tail of continuationsByNode.keys()) {
    for (const continuation of continuationsByNode.get(tail) ?? []) {
      const d = continuation.d;
      const key = pairKey(tail, d);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const chainTail = maxChainByTail.get(tail);
      const chainD = maxChainByTail.get(d);
      if (chainTail === undefined || chainD === undefined) continue;

      const useTailSide =
        chainTail.length > chainD.length ||
        (chainTail.length === chainD.length && tail < d);
      const chain = useTailSide ? chainTail : chainD;
      const continuationNode = useTailSide ? d : tail;
      if (chain.includes(continuationNode)) continue; // would close a cycle, not a gap
      if ((ctx.adjacency.get(continuationNode) ?? []).length === 0) continue; // onward structure required
      if (continuation.atomic.supportingObservations.length === 0) continue; // no traceable support
      if (!run.evaluate()) {
        run.stop('PAIR_EVALUATIONS');
        return run;
      }
      emitted.push({
        detectorType: 'BROKEN_CHAIN',
        nodeIds: sortedUnique([...chain, continuationNode]),
        observedEdgeIds: sortedUnique(
          [...chain, continuationNode].flatMap(
            (id) => [...(ctx.edgesByNode.get(id) ?? [])],
          ),
        ),
        expectedRelationshipType: continuation.expected,
        temporalScope: null,
        supportingHypothesisIds: sortedUnique([continuation.atomic.derivedId]),
        supportingObservationIds: sortedUnique(
          [...continuation.atomic.supportingObservations],
        ),
        contradictingObservationIds: sortedUnique(
          [...continuation.atomic.contradictingObservations],
        ),
        structuralBasis: 'CHAIN_EXPECTED_CONTINUATION',
      });
    }
  }

  for (const candidate of emitted) {
    run.emit(candidate);
  }
  return run;
}

function siteExpectationPairs(
  ctx: GraphHoleDetectionContext,
): ReadonlyArray<{
  readonly a: string;
  readonly b: string;
  readonly expected: RelationType | null;
  readonly atomic: { readonly derivedId: string } & {
    readonly predicate: string;
    readonly supportingObservations: readonly string[];
    readonly contradictingObservations: readonly string[];
  };
}> {
  const seen = new Set<string>();
  const out: ReturnType<typeof siteExpectationPairs>[number][] = [];
  for (const atomic of ctx.hypothesisContext.atomic) {
    if (atomic.hypothesisType !== 'RELATION_HYPOTHESIS') continue;
    const refs = atomic.referencedCanonicalEntityIds;
    if (refs.length < 2) continue;
    const expected = relationTypeOrNull(atomic.predicate);
    for (let i = 0; i < refs.length; i += 1) {
      for (let j = i + 1; j < refs.length; j += 1) {
        const a = refs[i]!;
        const b = refs[j]!;
        if (hasEdgeBetween(ctx, a, b)) continue;
        const key = pairKey(a, b);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ a, b, expected, atomic });
      }
    }
  }
  return out;
}