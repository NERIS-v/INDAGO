// ============================================================================
// @indago/graph-hole-qualification — public surface (Phase 5A-PR5)
//
// Deterministic, bounded, zero-side-effect qualification, scoring and ranking
// of PR4 raw graph-hole candidates. PR5 never mutates the graph, creates
// entities/relations, persists anything, invokes an LLM, or uses embeddings.
// ============================================================================

// --- Orchestrator ------------------------------------------------------------
export { qualifyAndRankGraphHoleCandidates, DETECTOR_ORDER } from './orchestrate.js';

// --- Scoring (exposed for direct testing / verification) ----------------------
export {
  deriveStructuralComponents,
  deriveEvidenceSupportScore,
  deriveExpectedInformationValue,
  deriveSignificance,
  STRUCTURAL_BASIS_STRENGTH,
} from './scoring.js';
export type {
  StructuralComponents,
  ScoringContext,
  EvidenceSupportResult,
  ExpectedInformationValueResult,
} from './scoring.js';

// --- Support units ------------------------------------------------------------
export { resolveIndependentSupportUnits, independentSupportUnitCount } from './support-units.js';
export type { SupportUnitResolutionResult } from './support-units.js';

// --- Qualification gates -------------------------------------------------------
export {
  evaluateQualificationGates,
  candidateInRegionScope,
  isResolvedCandidate,
} from './qualify.js';
export type { GateParams } from './qualify.js';

// --- Temporal gate -------------------------------------------------------------
export {
  temporalGateIsValid,
  temporalScopeOf,
  intervalsOverlap,
  isStrictlyAfterInterval,
} from './temporal.js';

// --- Ranking -------------------------------------------------------------------
export { buildRankingKey, byRankingKey } from './ranking.js';

// --- Determinism ---------------------------------------------------------------
export { clamp01, round6, normalizeScore, mean, scoreRankToken } from './determinism.js';

// --- Types ---------------------------------------------------------------------
export type { QualificationInput, QualificationObservation } from './types.js';