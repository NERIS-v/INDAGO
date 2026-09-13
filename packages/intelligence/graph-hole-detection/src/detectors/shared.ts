// ============================================================================
// Shared detector helpers (Phase 5A-PR4)
//
// Deterministic primitives shared across detectors. All input arrays are
// already sorted by the context; helpers only intersect/sort.
// ============================================================================

import type { AtomicRelationshipHypothesis } from '@indago/hypothesis-context';
import { RelationTypeSchema } from '@indago/contracts';
import type { RelationType } from '@indago/contracts';
import { pairKey, sortedUnique } from '../determinism.js';
import type { GraphHoleDetectionContext } from '../types.js';

const RELATION_TYPES: ReadonlySet<string> = new Set(Object.values(RelationTypeSchema.enum));

/** True when the value is an authoritative RelationType (never an invented type). */
export function isRelationType(value: string): boolean {
  return RELATION_TYPES.has(value);
}

/** The authoritative RelationType for a predicate, or null when it is not one. */
export function relationTypeOrNull(value: string): RelationType | null {
  return RELATION_TYPES.has(value) ? (value as RelationType) : null;
}

/** True when a canonical edge exists between a and b (either direction). */
export function hasEdgeBetween(
  ctx: GraphHoleDetectionContext,
  a: string,
  b: string,
): boolean {
  return (ctx.adjacency.get(a) ?? []).includes(b);
}

/** True when the node id is inside the bounded region scope. */
export function isInRegion(ctx: GraphHoleDetectionContext, id: string): boolean {
  return ctx.nodeById.has(id);
}

/** Sorted unique region edges incident to the given nodes. */
export function incidentEdgeIds(
  ctx: GraphHoleDetectionContext,
  nodeIds: readonly string[],
): string[] {
  const ids: string[] = [];
  for (const id of nodeIds) {
    ids.push(...(ctx.edgesByNode.get(id) ?? []));
  }
  return sortedUnique(ids);
}

interface AssertedPair {
  readonly a: string;
  readonly b: string;
  readonly atomic: AtomicRelationshipHypothesis;
  readonly expected: RelationType | null;
}

/**
 * All unordered pairs jointly referenced by a SINGLE relation-hypothesis
 * atomic that are NOT materialized as a canonical edge in the region. This is
 * the strongest allowed expectation source: an authoritative relation
 * hypothesis asserting A—B while the graph has no edge, with no string/semantic
 * guessing involved.
 */
export function unmaterializedAssertedPairs(
  ctx: GraphHoleDetectionContext,
): AssertedPair[] {
  const out: AssertedPair[] = [];
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
        out.push({ a, b, atomic, expected });
      }
    }
  }
  return out;
}

/**
 * Every unordered canonical pair jointly referenced by ANY atomic (relation or
 * entity hypothesis). Used to keep structural detectors from double-reporting
 * pairs already claimed by a hypothesis source.
 */
export function jointlyReferencedPairKeys(ctx: GraphHoleDetectionContext): Set<string> {
  const keys = new Set<string>();
  for (const atomic of ctx.hypothesisContext.atomic) {
    const refs = atomic.referencedCanonicalEntityIds;
    for (let i = 0; i < refs.length; i += 1) {
      for (let j = i + 1; j < refs.length; j += 1) {
        keys.add(pairKey(refs[i]!, refs[j]!));
      }
    }
  }
  return keys;
}

export function intersectSorted(a: readonly string[], b: readonly string[]): string[] {
  const right = new Set(b);
  const intersection: string[] = [];
  for (const id of a) {
    if (right.has(id)) intersection.push(id);
  }
  return intersection;
}