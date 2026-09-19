// ============================================================================
// @indago/next-best-evidence — Public API (Phase 5A-PR10)
//
// Deterministic, persistence-free, acquisition-free Next-Best-Evidence
// SELECTION: given a bounded, closed-world per-gap input (PR4/5 candidate +
// PR7 analysis + PR8 validation + PR9 decision + bounded hypothesis/observation
// context), produce a ranked snapshot of which candidate evidence requests
// would discriminate MOST among the explicitly considered competing
// explanations.
//
// Authority boundary:
//   - CONSUMES PR5/PR7/PR8/PR9 outputs; never re-implements their gates.
//   - Never creates EvidenceRequest entities, never authorizes, never
//     acquires, never persists, never calls an LLM.
//   - Every derived number is a normalized deterministic heuristic in [0,1],
//     never a calibrated probability and never a monetary value.
// ============================================================================

// ---- Top-level orchestration ----
export { selectNextBestEvidence } from './orchestrate.js';
export type { SelectionRunOptions } from './orchestrate.js';

// ---- Per-gap selection core (pure) ----
export { selectForGap } from './select.js';
export type { GapSelectionCoreResult } from './select.js';

// ---- Input / accounting types ----
export type {
  NextBestEvidenceSelectionInput,
  NextBestEvidenceGapInput,
  Pr10AtomicHypothesis,
  Pr10Observation,
  ExistingEvidenceSummary,
  GapSelectionAccounting,
} from './types.js';

// ---- Determinism helpers ----
export { clamp01, round6, normalizeScore, mean } from './determinism.js';

// ---- Reference resolution ----
export {
  canonicalHypothesisIdFromDerivedId,
  buildAtomicLookup,
  resolveDerivedIdsToUuids,
  buildUuidToAtomicMap,
} from './references.js';

// ---- Discrimination logic ----
export {
  extractCompetingExplanations,
  resolveDiscriminationTarget,
} from './discrimination.js';
export type {
  CompetingExplanations,
  DiscriminationTargetResolution,
} from './discrimination.js';

// ---- Candidate normalization ----
export { buildCandidateDraft } from './normalize.js';
export type { CandidateDraft, CandidateDraftDeps } from './normalize.js';

// ---- Existing-evidence exclusion ----
export { isCoveredByExistingEvidence } from './coverage.js';
export type { ExistingEvidenceCoverage } from './coverage.js';

// ---- Utility component derivation + frozen composition ----
export {
  computeExpectedInformationGain,
  computeEvidenceRelevance,
  computeEvidenceFeasibility,
  computeEvidenceCost,
  computeEvidenceUtility,
} from './components.js';
export type {
  ExpectedInformationGainInput,
  EvidenceRelevanceInput,
  EvidenceUtilityComponents,
  ComputedEvidenceUtility,
} from './components.js';

// ---- Deduplication / ranking ----
export {
  deduplicateAndRank,
  canonicalIdentityKey,
  compareRankedCandidates,
} from './dedup.js';
export type { ScoredCandidate, RankedEvidenceCandidate, DedupResult } from './dedup.js';

// ---- Selection gate ----
export { assertSelectionGate } from './gate.js';

// ---- Errors ----
export {
  NextBestEvidenceError,
  NEXT_BEST_EVIDENCE_ERROR_CODE,
  GATE_FAILURE_REASON,
} from './errors.js';
export type {
  NextBestEvidenceErrorCode,
  GateFailureReason,
} from './errors.js';

// ---- PR18 candidate-driven utility selection (Phase 5A) ----
export { selectBestEvidenceFromCandidates } from './pr18/select.js';
export { buildDerivedCandidateContext } from './pr18/context.js';
export { scoreCandidate } from './pr18/score.js';
export type {
  CandidateEvidenceSelectionInput,
  CandidateEvidenceSelectionResult,
  CandidateUtilityContext,
  CandidateScoreInput,
  ScoredCandidateRequest,
  RankedCandidateRequest,
  CandidateSelectionAccounting,
  RepresentedExplanation,
} from './pr18/types.js';

// ---- Runtime derivation parameters (documented, runtime-owned) ----
export {
  EIG_SUBWEIGHTS,
  RELEVANCE_SUBWEIGHTS,
  FEASIBILITY_COMPONENT_WEIGHTS,
  COST_COMPONENT_WEIGHTS,
  MISSING_SOURCE_AVAILABILITY,
  MISSING_SOURCE_ACCESSIBILITY,
  FEASIBILITY_TYPE_BASELINE,
  COST_TYPE_BASELINE,
} from './policy.js';