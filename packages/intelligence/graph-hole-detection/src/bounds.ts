// ============================================================================
// Detector bounds (Phase 5A-PR4)
//
// Detector-LOCAL computation/output caps. These are distinct from the region
// construction budget semantics (graph-hole-region) — a detector that hits a
// bound reports boundReached + boundKind in its own metadata and NEVER
// silently truncates candidate output (dropped candidates are accounted, see
// orchestrate.ts).
//
// All bounds are deterministic: the same input always hits the same bound in
// the same place.
// ============================================================================

export const DETECTOR_BOUNDS = {
  /** Structural pair/unit evaluations per detector run. */
  maxPairEvaluationsPerDetector: 2_500,
  /** Bounded path-existence queries per detector run (MISSING_PATH). */
  maxTraversalQueriesPerDetector: 100,
  /** Bounded observed-chain evaluations per detector run (BROKEN_CHAIN). */
  maxChainEvaluationsPerDetector: 2_500,
  /** Max observed hops for bounded path-existence (mirrors M-A13 TRAVERSAL_BOUNDS.maxHops). */
  missingPathHops: 4,
  /** Max observed length of a broken-chain context (nodes before the gap). */
  brokenChainMaxObservedLength: 4,
  /** Max RAW candidates emitted per region analysis (pre-dedupe budget reference). */
  maxRegionCandidates: 10,
} as const;

export type DetectorBounds = typeof DETECTOR_BOUNDS;