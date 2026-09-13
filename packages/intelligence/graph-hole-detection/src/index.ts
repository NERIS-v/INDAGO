// ============================================================================
// @indago/graph-hole-detection — public surface (Phase 5A-PR4)
//
// Deterministic, bounded, zero-side-effect detection of structural graph-hole
// CANDIDATES. This module is a pure function of the bounded region + PR3
// hypothesis context. It never mutates the graph, creates relations/entities,
// invokes an LLM, or persists anything.
// ============================================================================

// --- Orchestrator & context builder -----------------------------------------
export { detectGraphHoleCandidates, DETECTOR_ORDER } from './orchestrate.js';
export { buildDetectionContext } from './context.js';

// --- Bounds & constants -----------------------------------------------------
export { DETECTOR_BOUNDS } from './bounds.js';
export { GRAPH_HOLE_DETECTION_EXTRACTOR } from './candidate.js';

// --- Per-detector entry points (direct invocation / testing) ----------------
export { detectMissingEdge } from './detectors/missing-edge.js';
export { detectMissingPath } from './detectors/missing-path.js';
export { detectIsolatedNode } from './detectors/isolated-node.js';
export { detectBrokenChain } from './detectors/broken-chain.js';
export { detectTemporalGap } from './detectors/temporal-gap.js';
export { detectCommunityBoundary } from './detectors/community-boundary.js';

// --- Shared primitives (exposed for testing only) ---------------------------
export { DetectorRun } from './detectors/run.js';

// --- Types ------------------------------------------------------------------
export type {
  DetectionInput,
  GraphHoleDetectionContext,
  GraphHoleDetectionResult,
  GraphHoleDetectionSummary,
  DetectorRunSummary,
  DetectorCandidate,
  DetectionObservation,
} from './types.js';

export { GraphHoleDetectionError } from './types.js';