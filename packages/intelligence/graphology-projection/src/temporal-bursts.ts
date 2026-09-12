// ============================================================================
// P4 Graph Analytics — temporal burst detection
//
// A BURST is a canonical entity whose incident accepted-relation edges
// cluster densely in domain (event) time relative to that same entity's own
// baseline activity rate. It is a STRUCTURAL/TEMPORAL signal only — a burst
// says "unusually many recorded relations around this entity in a short
// window", never "this entity did something wrong" (see graph-analysis.ts
// discipline: structural signal ≠ criminal relevance).
//
// INPUT: edge `temporalRange` attributes carried through verbatim from the
// authoritative Relation.validityInterval (never fabricated — see M-A12 D1).
// Only edges whose validFrom instant is actually PARSEABLE contribute; an
// edge with no temporal data, or a non-instantable precision (`range`,
// `approximate`, `unknown`), is silently excluded rather than guessed at.
//
// ALGORITHM (deterministic, no clock/no randomness):
//   1. For each node, collect the validFrom instant of every incident edge
//      that has a parseable temporal range.
//   2. Bucket those instants into fixed-width time buckets (default 1 day).
//   3. baseline = mean edge count over the node's own ACTIVE buckets (buckets
//      with >= 1 event) — i.e. compare the node against itself, not a global
//      population.
//   4. A bucket is a burst window if its count >= MIN_EVENTS_FOR_BURST and
//      (count >= baseline * BURST_MULTIPLIER, or it is the node's only active
//      bucket and already meets MIN_EVENTS_FOR_BURST).
//
// READ-ONLY: burst detection never mutates the graph or any domain record.
// ============================================================================

import Graph from 'graphology';

export interface TemporalBurstCandidate {
  /** Canonical EntityId whose incident relations cluster in this window. */
  readonly nodeId: string;
  /** ISO instant of the bucket's lower bound. */
  readonly windowStart: string;
  /** ISO instant of the bucket's upper bound (exclusive). */
  readonly windowEnd: string;
  /** Number of qualifying edges falling in this window. */
  readonly eventCount: number;
  /** Mean edge count over the node's own active buckets (self-baseline). */
  readonly baselineRate: number;
  /** eventCount / max(baselineRate, epsilon) — higher = more anomalous. */
  readonly burstScore: number;
  /** Canonical RelationIds contributing to this burst window, sorted. */
  readonly edgeIds: readonly string[];
}

export const BURST_BOUNDS = {
  /** Bucket width in milliseconds. Default: 1 day. */
  bucketMs: 24 * 60 * 60 * 1000,
  /** Minimum events in a bucket to even be eligible as a burst. */
  minEventsForBurst: 3,
  /** A bucket must be at least this many multiples of the node's baseline. */
  burstMultiplier: 2,
  /** Hard cap on burst candidates returned. */
  maxResults: 2_000,
} as const;

interface TemporalRangeLike {
  readonly validFrom?: { readonly value?: unknown; readonly precision?: unknown };
}

const INSTANTABLE_PRECISIONS = new Set(['exact', 'minute', 'hour', 'day', 'month', 'year']);

/**
 * Parse an edge's `temporalRange.validFrom` into an epoch-ms instant. Returns
 * null (never a guessed value) if the range is absent, malformed, or carries
 * a non-instantable precision (`range`, `approximate`, `unknown`).
 */
function parseValidFromInstant(temporalRange: unknown): number | null {
  if (temporalRange === null || typeof temporalRange !== 'object') return null;
  const range = temporalRange as TemporalRangeLike;
  const validFrom = range.validFrom;
  if (validFrom === undefined || typeof validFrom !== 'object' || validFrom === null) return null;
  const precision = (validFrom as { precision?: unknown }).precision;
  if (typeof precision !== 'string' || !INSTANTABLE_PRECISIONS.has(precision)) return null;
  const value = (validFrom as { value?: unknown }).value;
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

interface QualifyingEvent {
  readonly edgeId: string;
  readonly instant: number;
}

/**
 * Detect temporal burst candidates across every node in the projection.
 * Deterministic: iteration order is fixed (sorted node ids, sorted bucket
 * keys, sorted edge ids within a bucket).
 */
export function detectTemporalBursts(
  graph: Graph,
  bounds: Partial<typeof BURST_BOUNDS> = {},
): TemporalBurstCandidate[] {
  const cfg = { ...BURST_BOUNDS, ...bounds };

  // node -> qualifying events (from all incident edges).
  const nodeEvents = new Map<string, QualifyingEvent[]>();

  graph.forEachEdge((edgeKey, attrs, source, target) => {
    const relationId =
      typeof (attrs as { relationId?: unknown }).relationId === 'string'
        ? (attrs as { relationId: string }).relationId
        : edgeKey;
    const instant = parseValidFromInstant((attrs as { temporalRange?: unknown }).temporalRange);
    if (instant === null) return;
    for (const nodeId of source === target ? [source] : [source, target]) {
      let list = nodeEvents.get(nodeId);
      if (list === undefined) {
        list = [];
        nodeEvents.set(nodeId, list);
      }
      list.push({ edgeId: relationId, instant });
    }
  });

  const results: TemporalBurstCandidate[] = [];
  const nodeIds = [...nodeEvents.keys()].sort();

  for (const nodeId of nodeIds) {
    const events = nodeEvents.get(nodeId)!;

    // Bucket the events.
    const buckets = new Map<number, QualifyingEvent[]>();
    for (const ev of events) {
      const bucketKey = Math.floor(ev.instant / cfg.bucketMs);
      let list = buckets.get(bucketKey);
      if (list === undefined) {
        list = [];
        buckets.set(bucketKey, list);
      }
      list.push(ev);
    }

    const activeBucketKeys = [...buckets.keys()];
    const activeBucketCount = activeBucketKeys.length;
    const totalEvents = events.length;
    const baselineRate = activeBucketCount > 0 ? totalEvents / activeBucketCount : 0;

    const sortedBucketKeys = [...activeBucketKeys].sort((a, b) => a - b);
    for (const bucketKey of sortedBucketKeys) {
      const bucketEvents = buckets.get(bucketKey)!;
      const count = bucketEvents.length;
      if (count < cfg.minEventsForBurst) continue;

      const isOnlyBucket = activeBucketCount === 1;
      const meetsMultiplier = count >= baselineRate * cfg.burstMultiplier;
      if (!isOnlyBucket && !meetsMultiplier) continue;

      const windowStartMs = bucketKey * cfg.bucketMs;
      const windowEndMs = windowStartMs + cfg.bucketMs;
      const edgeIds = [...new Set(bucketEvents.map((e) => e.edgeId))].sort();

      results.push({
        nodeId,
        windowStart: new Date(windowStartMs).toISOString(),
        windowEnd: new Date(windowEndMs).toISOString(),
        eventCount: count,
        baselineRate,
        burstScore: baselineRate > 0 ? count / baselineRate : count,
        edgeIds,
      });
    }
  }

  results.sort((a, b) => {
    if (a.burstScore !== b.burstScore) return b.burstScore - a.burstScore;
    if (a.nodeId !== b.nodeId) return a.nodeId < b.nodeId ? -1 : 1;
    return a.windowStart < b.windowStart ? -1 : a.windowStart > b.windowStart ? 1 : 0;
  });

  return results.slice(0, cfg.maxResults);
}
