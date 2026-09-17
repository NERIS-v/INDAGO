// ============================================================================
// ER-Split Boundary: validation + binding + indexing (Phase 5A-PR16)
//
// Enforces the frozen authority boundary (policy §5/§7):
//   - structural shape + policy versions (INVALID_INPUT / UNSUPPORTED_POLICY),
//   - hard slice bounds (policy §5 — bounded M-A08/M-A09 reuse),
//   - deterministic re-run of `classifyGap(context)` and EQUALITY with the
//     supplied `gapClassification` (CONTEXT_MISMATCH),
//   - optional PR15 competing-explanation-set binding: policyVersion 'v1',
//     same graphHoleId, and its embedded classification projection equal to
//     the recomputed classification (CONTEXT_MISMATCH),
//   - every referenced id exists in the closed package / supplied universe
//     (INVALID_REFERENCE) and every pair/hypothesis is same-case
//     (CONTEXT_MISMATCH on case mismatch).
//
// Produces the deterministic indexes the signal/derivation layers consume.
// No clock, no randomness, no mutation, no retrieval.
// ============================================================================

import type { ObservedTime } from '@indago/contracts';
import { canonicalizeDeterministic } from '@indago/contracts';
import type {
  CandidatePair,
  EntityHypothesis,
  EntityMentionCandidate,
  GraphNode,
  Observation,
  CompetingExplanationSet,
} from '@indago/contracts';
import type { GapClassificationInput, GapClassificationResult } from '@indago/gap-classification';
import { classifyGap, GapClassificationError, GapClassificationErrorCodes } from '@indago/gap-classification';

import type { ErSplitExplanationInput } from '../contracts/er-split-input.js';
import {
  MAX_CANDIDATE_PAIRS_BOUND,
  MAX_ENTITY_HYPOTHESES_BOUND,
} from '../contracts/er-split-policy.js';
import { ErSplitExplanationError, ErSplitExplanationErrorCodes } from './errors.js';
import { sha256Hex } from './sha256.js';
import { sortedUnique } from './sorted.js';

/** Deterministic indexes over the supplied closed world + M-A07/M-A08/M-A09 slice. */
export interface ErSplitBoundContext {
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly graphHoleId: string;
  readonly context: GapClassificationInput;
  /** The recomputed, bound PR14 classification (equals the supplied one). */
  readonly classification: GapClassificationResult;
  /** SHA-256(canonicalizeDeterministic(context)) — the closed-package digest (policy §9). */
  readonly contextSha256: string;
  /** The PR15 set's own digest, echoed when a competingExplanationSet was supplied. */
  readonly competingExplanationSetContextSha256: string | undefined;
  /** Sorted-unique M-A08 pair slice (read-only reuse). */
  readonly pairs: readonly CandidatePair[];
  /** M-A09 hypotheses keyed by candidatePairId (sorted-unique per pair). */
  readonly hypothesesByPair: ReadonlyMap<string, readonly EntityHypothesis[]>;
  /** M-A07 universe keyed by candidate id. */
  readonly universeById: ReadonlyMap<string, EntityMentionCandidate>;
  /** In-scope observations keyed by id. */
  readonly observationsById: ReadonlyMap<string, Observation>;
  /** In-scope graph nodes keyed by id (GraphNode.id IS the canonical EntityId). */
  readonly nodesById: ReadonlyMap<string, GraphNode>;
  /** Observation id -> sourceId (evidence-diversity ranking input). */
  readonly sourceByObservation: ReadonlyMap<string, string>;
  /** Caller-supplied system time (echoed; never used as domain evidence). */
  readonly computedAt: ObservedTime;
}

function fail(code: 'INVALID_INPUT' | 'UNSUPPORTED_POLICY' | 'CONTEXT_MISMATCH' | 'INVALID_REFERENCE', message: string): never {
  throw new ErSplitExplanationError(code, message);
}

function enforceClassificationBinding(recomputed: GapClassificationResult, supplied: GapClassificationResult): void {
  if (recomputed.graphHoleId !== supplied.graphHoleId) {
    fail(ErSplitExplanationErrorCodes.CONTEXT_MISMATCH, 'gapClassification.graphHoleId does not match the recomputed classification');
  }
  if (recomputed.contextSha256 !== supplied.contextSha256) {
    fail(ErSplitExplanationErrorCodes.CONTEXT_MISMATCH, 'gapClassification.contextSha256 does not match the recomputed classification; the supplied result does not bind to the context');
  }
  if (recomputed.type !== supplied.type) {
    fail(ErSplitExplanationErrorCodes.CONTEXT_MISMATCH, 'gapClassification.type does not match the recomputed classification');
  }
  if (recomputed.status !== supplied.status) {
    fail(ErSplitExplanationErrorCodes.CONTEXT_MISMATCH, 'gapClassification.status does not match the recomputed classification');
  }
  if (
    recomputed.reasonCodes.length !== supplied.reasonCodes.length ||
    recomputed.reasonCodes.some((code, i) => code !== supplied.reasonCodes[i])
  ) {
    fail(ErSplitExplanationErrorCodes.CONTEXT_MISMATCH, 'gapClassification.reasonCodes do not match the recomputed classification');
  }
}

function enforceCompetingSetBinding(set: CompetingExplanationSet, recomputed: GapClassificationResult): void {
  if (set.policyVersion !== 'v1') {
    fail(ErSplitExplanationErrorCodes.UNSUPPORTED_POLICY, 'competingExplanationSet.policyVersion must be v1');
  }
  if (set.graphHoleId !== recomputed.graphHoleId) {
    fail(ErSplitExplanationErrorCodes.CONTEXT_MISMATCH, 'competingExplanationSet targets a different graphHoleId than the supplied context');
  }
  if (set.classification.classificationPolicyVersion !== 'v1') {
    fail(ErSplitExplanationErrorCodes.UNSUPPORTED_POLICY, 'competingExplanationSet.classification.classificationPolicyVersion must be v1');
  }
  if (set.classification.type !== recomputed.type) {
    fail(ErSplitExplanationErrorCodes.CONTEXT_MISMATCH, 'competingExplanationSet classification type disagrees with the recomputed classification');
  }
  if (set.classification.status !== recomputed.status) {
    fail(ErSplitExplanationErrorCodes.CONTEXT_MISMATCH, 'competingExplanationSet classification status disagrees with the recomputed classification');
  }
}

function assertReferencePresent(
  known: ReadonlyMap<string, unknown> | ReadonlySet<string>,
  id: string,
  what: string,
): void {
  const present = known instanceof Map ? known.has(id) : known.has(id);
  if (!present) {
    fail(ErSplitExplanationErrorCodes.INVALID_REFERENCE, `${what} references an id that is not in the supplied package/universe: ${id}`);
  }
}

/**
 * Validate, bind and index the supplied closed world. Throws a typed
 * ErSplitExplanationError on §7 boundary violations. Never mutates input.
 */
export function buildBoundContext(input: ErSplitExplanationInput): ErSplitBoundContext {
  if (input === null || typeof input !== 'object') {
    fail(ErSplitExplanationErrorCodes.INVALID_INPUT, 'input must be an object');
  }
  if (typeof input.erSplitPolicyVersion !== 'string') {
    fail(ErSplitExplanationErrorCodes.INVALID_INPUT, 'erSplitPolicyVersion is required');
  }
  if (input.erSplitPolicyVersion !== 'v1') {
    fail(ErSplitExplanationErrorCodes.UNSUPPORTED_POLICY, `unsupported erSplitPolicyVersion: ${String(input.erSplitPolicyVersion)}`);
  }
  if (input.context == null || input.gapClassification == null) {
    fail(ErSplitExplanationErrorCodes.INVALID_INPUT, 'context and gapClassification are required');
  }
  if (!Array.isArray(input.candidatePairs)) {
    fail(ErSplitExplanationErrorCodes.INVALID_INPUT, 'candidatePairs must be an array');
  }
  if (!Array.isArray(input.entityHypotheses)) {
    fail(ErSplitExplanationErrorCodes.INVALID_INPUT, 'entityHypotheses must be an array');
  }
  if (!Array.isArray(input.candidateUniverse)) {
    fail(ErSplitExplanationErrorCodes.INVALID_INPUT, 'candidateUniverse must be an array');
  }
  if (input.candidatePairs.length > MAX_CANDIDATE_PAIRS_BOUND) {
    fail(ErSplitExplanationErrorCodes.INVALID_INPUT, `candidatePairs exceeds the bound of ${String(MAX_CANDIDATE_PAIRS_BOUND)}`);
  }
  if (input.entityHypotheses.length > MAX_ENTITY_HYPOTHESES_BOUND) {
    fail(ErSplitExplanationErrorCodes.INVALID_INPUT, `entityHypotheses exceeds the bound of ${String(MAX_ENTITY_HYPOTHESES_BOUND)}`);
  }

  // Re-run the deterministic classifier: supplies every authority check AND
  // produces the classification the supplied result must equal (policy §7).
  let recomputed: GapClassificationResult;
  try {
    recomputed = classifyGap(input.context);
  } catch (err) {
    if (err instanceof ErSplitExplanationError) throw err;
    if (err instanceof GapClassificationError) {
      const code =
        err.code === GapClassificationErrorCodes.QUALIFIED_CANDIDATE_REQUIRED ||
        err.code === GapClassificationErrorCodes.CONTEXT_MISMATCH
          ? ErSplitExplanationErrorCodes.CONTEXT_MISMATCH
          : err.code === GapClassificationErrorCodes.UNSUPPORTED_POLICY
            ? ErSplitExplanationErrorCodes.UNSUPPORTED_POLICY
            : ErSplitExplanationErrorCodes.INVALID_INPUT;
      fail(code, err.message);
    }
    fail(ErSplitExplanationErrorCodes.INVALID_INPUT, `context validation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  enforceClassificationBinding(recomputed, input.gapClassification);

  let setContextSha256: string | undefined;
  if (input.competingExplanationSet !== undefined) {
    enforceCompetingSetBinding(input.competingExplanationSet, recomputed);
    setContextSha256 = input.competingExplanationSet.contextSha256;
  }

  // Deterministic indexes (sorted-first construction; policy §2).
  const universeById = new Map<string, EntityMentionCandidate>();
  for (const c of input.candidateUniverse) universeById.set(c.id, c);
  const observationsById = new Map<string, Observation>();
  for (const o of input.context.observations) observationsById.set(o.id, o);
  const nodesById = new Map<string, GraphNode>();
  for (const n of input.context.nodes) nodesById.set(n.id, n);

  const pairs = sortedUnique(input.candidatePairs, (p) => p.id);
  const seenPairIds = new Set<string>();
  for (const p of pairs) {
    if (p.caseId !== input.context.caseId) {
      fail(ErSplitExplanationErrorCodes.CONTEXT_MISMATCH, `candidatePair ${p.id} carries a different caseId`);
    }
    if (seenPairIds.has(p.id)) {
      fail(ErSplitExplanationErrorCodes.INVALID_INPUT, `duplicate candidatePair id: ${p.id}`);
    }
    seenPairIds.add(p.id);
    assertReferencePresent(universeById, p.leftCandidateId, `candidatePair ${p.id}.leftCandidateId`);
    assertReferencePresent(universeById, p.rightCandidateId, `candidatePair ${p.id}.rightCandidateId`);
    const left = universeById.get(p.leftCandidateId)!;
    const right = universeById.get(p.rightCandidateId)!;
    assertReferencePresent(observationsById, left.observationId, `candidate ${left.id}`);
    assertReferencePresent(observationsById, right.observationId, `candidate ${right.id}`);
  }

  const pairIds = new Set(pairs.map((p) => p.id));
  const hypothesisMap = new Map<string, EntityHypothesis[]>();
  for (const h of input.entityHypotheses) {
    if (h.caseId !== input.context.caseId) {
      fail(ErSplitExplanationErrorCodes.CONTEXT_MISMATCH, `entityHypothesis ${h.id} carries a different caseId`);
    }
    if (h.candidatePairId === undefined) continue;
    assertReferencePresent(pairIds, h.candidatePairId as string, `entityHypothesis ${h.id}.candidatePairId`);
    for (const cid of h.supportingCandidateIds ?? []) {
      assertReferencePresent(universeById, cid, `entityHypothesis ${h.id}.supportingCandidateIds`);
    }
    for (const oid of h.supportingObservationIds ?? []) {
      assertReferencePresent(observationsById, oid, `entityHypothesis ${h.id}.supportingObservationIds`);
    }
    for (const oid of h.contradictingObservationIds ?? []) {
      assertReferencePresent(observationsById, oid, `entityHypothesis ${h.id}.contradictingObservationIds`);
    }
    const list = hypothesisMap.get(h.candidatePairId);
    if (list === undefined) {
      hypothesisMap.set(h.candidatePairId, [h]);
    } else {
      list.push(h);
    }
  }
  const hypothesesByPair: ReadonlyMap<string, readonly EntityHypothesis[]> = new Map(
    [...hypothesisMap.entries()].map(([pairId, list]) => [pairId, sortedUnique(list, (h) => h.id)]),
  );

  return {
    caseId: input.context.caseId,
    graphVersionId: input.context.graphVersionId,
    graphHoleId: recomputed.graphHoleId,
    context: input.context,
    classification: recomputed,
    contextSha256: sha256Hex(canonicalizeDeterministic(input.context)),
    competingExplanationSetContextSha256: setContextSha256,
    pairs,
    hypothesesByPair,
    universeById,
    observationsById,
    nodesById,
    sourceByObservation: new Map(input.context.observations.map((o) => [o.id, o.sourceId])),
    computedAt: input.computedAt,
  };
}