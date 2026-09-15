// ============================================================================
// @indago/graph-hole-analysis — Public API (Phase 5A-PR7)
//
// The feature-owned graph-hole AI analyst: converts a deterministic, already-
// qualified graph-hole candidate and its bounded context into a structured,
// validated GraphHoleAnalysisV1 via an AI runtime.
//
// Exports are intentionally minimal:
//   1. buildGraphHoleAnalysisContext — deterministic context construction
//   2. analyzeGraphHole — runtime-dependent structured analysis
//
// Both functions enforce a strict authority boundary (caseId, graphVersionId,
// regionId must agree across all inputs). Provider details, retries, timeouts,
// and JSON-schema mapping are NOT visible at this layer.
// ============================================================================

export { buildGraphHoleAnalysisContext } from './context/build-context.js';
export { analyzeGraphHole } from './analyst/analyze.js';

// Context types (for callers assembling input).
export type { GraphHoleAnalysisInput, CommunityMembershipInput } from './contracts/analysis-input.js';
export type { GraphHoleAnalysisContext } from './context/types.js';
export type { GraphHoleAnalysisResult, GraphHoleAnalysisExecution } from './contracts/analysis-result.js';
export type { GraphHoleAnalysisV1 } from './contracts/analysis-v1.js';
export type { GraphHoleAnalysisBounds } from './contracts/analysis-policy.js';

// Error types (for typed error handling).
export {
  GraphHoleAnalysisError,
  isGraphHoleAnalysisError,
} from './errors/analysis-error.js';
export type { GraphHoleAnalysisErrorCode } from './errors/analysis-error.js';

// Schema (for downstream consumers / tests wanting to parse/validate).
export { GraphHoleAnalysisV1Schema } from './contracts/analysis-v1.js';
export { GraphHoleAnalysisSchemaStampSchema } from './contracts/analysis-v1.js';
export { RecommendedEvidenceSchema } from './contracts/analysis-v1.js';
export type { RecommendedEvidence } from './contracts/analysis-v1.js';

// Canonical serializer (for downstream validators reconstructing the profile).
export { canonicalStringify } from './context/serialize.js';

// Policy/version constants (for version-gating / audits).
export {
  GRAPH_HOLE_ANALYSIS_POLICY_VERSION,
  GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION,
  GRAPH_HOLE_ANALYSIS_PROMPT_VERSION,
  DEFAULT_GRAPH_HOLE_ANALYSIS_BOUNDS,
} from './contracts/analysis-policy.js';