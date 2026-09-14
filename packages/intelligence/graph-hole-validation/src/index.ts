// ============================================================================
// @indago/graph-hole-validation — Public API (Phase 5A-PR8)
//
// Deterministic claim validator for GraphHoleAnalysisResult. Verifies
// that a PR7 analysis output is grounded in the exact bounded context
// supplied to the analyst.
//
// Exports are intentionally minimal:
//   1. validateGraphHoleAnalysis — the sole entry point
//   2. Types — for consumers to inspect the validation result
//   3. Finding codes — for programmatic error handling
//
// PR8 is a VALIDATOR, not an AI system. No LLM calls, no tool calls,
// no database, no network. Pure, deterministic, closed-world.
// ============================================================================

export { validateGraphHoleAnalysis } from './validate-analysis.js';

// Types for consumers.
export type {
  ValidationFinding,
  ValidationFindingCode,
  ValidationSeverity,
  ValidatedGraphHoleAnalysis,
  ValidationSummary,
} from './types.js';

// Finding code constants for programmatic handling.
export { VALIDATION_FINDING_CODE } from './types.js';
