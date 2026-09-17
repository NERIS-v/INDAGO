// ============================================================================
// PR18 — Candidate Evidence Utility Selection (Phase 5A)
//
// Consumes PR17's candidate evidence requests and produces a deterministic,
// bounded, ranked/selected set under the FROZEN PR10 evidence-utility policy.
//
// PR18 does NOT generate candidates (PR17 does), does NOT invent a new
// identity (PR10 canonicalRequestKey is the single source of truth), does NOT
// re-implement the utility formula or ranking order (both are PR10-owned and
// imported here). PR18 is the candidate-driven consumption surface of the same
// frozen policy that PR10's analysis-driven `selectNextBestEvidence` already
// uses — one utility policy, two input surfaces.
//
// The closed-world context below is the minimal projection PR18 needs to
// derive the four deterministic utility components. It is derived from the
// certified PR14/PR15/PR16 chain (see tests) — never fabricated, never
// whole-case.
// ============================================================================

import type { EvidenceType, TemporalInterval, ObservedTime } from '@indago/contracts';
import type { CandidateEvidenceRequest } from '@indago/evidence-request-generation';
import type { ComputedEvidenceUtility } from '../components.js';
import type { ExistingEvidenceSummary } from '../types.js';

export { EVIDENCE_UTILITY_POLICY_VERSION } from '@indago/contracts';
export type { EvidenceUtilityPolicyVersion } from '@indago/contracts';

/** One represented competing explanation's bounded hypothesis signal (PR15/PR16). */
export interface RepresentedExplanation {
  readonly supportingHypothesisIds: readonly string[];
  readonly contradictingHypothesisIds: readonly string[];
  readonly temporalScope?: TemporalInterval | null;
}

/**
 * The bounded, closed-world input PR18 derives utility components from. This
 * is the certified-chain projection (PR14 context + PR15/PR16 explanation
 * sets); the caller derives it from the real chain, never fabricates it.
 */
export interface CandidateUtilityContext {
  /** The gap candidate's declared temporal scope (PR14 rawCandidate.temporalScope). */
  readonly gapTemporalScope?: TemporalInterval | null;
  /** PR3 atomic derivedIds of the gap-expectation hypotheses (PR14 candidate supportingHypothesisIds). */
  readonly gapExpectationDerivedIds?: readonly string[];
  /** All represented competing explanations (union of PR15 + PR16 explanations). */
  readonly representedExplanations: readonly RepresentedExplanation[];
  /** REAL explanation ids present in the closed-world (for context-binding validation). */
  readonly representedExplanationIds?: readonly string[];
  /** Canonical ids of the supplied observations (closed-world grounding). */
  readonly observations?: readonly { id: string }[];
}

/** Per-candidate deterministic scoring inputs (reused PR10 components). */
export interface CandidateScoreInput {
  readonly eig: number;
  readonly relevance: number;
  readonly feasibility: number;
  readonly cost: number;
  readonly utility: ComputedEvidenceUtility;
  /** Deterministic per-target temporal fit (for provenance). */
  readonly perTargetTemporalFit: readonly number[];
  readonly groundedObservationCount: number;
  readonly totalCandidateObservationRefs: number;
}

/** One scored PR17 candidate (before dedup/selection). */
export interface ScoredCandidateRequest extends CandidateScoreInput {
  readonly candidate: CandidateEvidenceRequest;
}

/**
 * One ranked/selected candidate evidence request. Carries the PR10
 * NextBestEvidenceCandidate fields (canonicalRequestKey/gapId/hypothesisIds/
 * evidenceType/discriminatesAmongIds/utility/rationale) PLUS PR17 provenance
 * (description, discriminationKind, temporalScope, source explanation ids).
 * Projecting to the 7 PR10 fields yields a valid NextBestEvidenceCandidate.
 */
export interface RankedCandidateRequest {
  readonly rank: number;
  readonly canonicalRequestKey: string;
  readonly gapId: string;
  readonly evidenceType: EvidenceType;
  readonly discriminatesAmongIds: readonly string[];
  readonly hypothesisIds: readonly string[];
  readonly rationale: string;
  readonly description: string;
  readonly discriminationKind: string;
  readonly temporalScope: TemporalInterval | null;
  /** Merged across all PR17 candidates collapsed into this canonical identity. */
  readonly sourceExplanationIds: readonly string[];
  readonly supportingObservationIds: readonly string[];
  readonly structuralSignalIds: readonly string[];
  readonly utility: ComputedEvidenceUtility;
}

export interface CandidateSelectionAccounting {
  readonly candidatesSeen: number;
  readonly existingEvidenceExclusions: number;
  readonly deduplicatedCandidates: number;
  readonly distinctCandidates: number;
  readonly candidatesConsidered: number;
  readonly candidatesRanked: number;
  readonly truncated: boolean;
}

/**
 * The authoritative, closed-world input to PR18. `candidateRequests` is the
 * REAL PR17 output; `context` is the certified-chain projection it was derived
 * from. Every candidate must belong to the same (case, GraphVersion, gap).
 */
export interface CandidateEvidenceSelectionInput {
  readonly investigationId: string;
  readonly gapId: string;
  /** PR17 candidate evidence requests (real output; may be empty => empty result). */
  readonly candidateRequests: readonly CandidateEvidenceRequest[];
  /** Bounded closed-world context for deterministic component derivation. */
  readonly context: CandidateUtilityContext;
  /** Already-represented evidence summaries (exact-coverage exclusion; optional). */
  readonly existingEvidence?: readonly ExistingEvidenceSummary[];
  /** Deterministic source-availability override per EvidenceType (optional). */
  readonly sourceAvailabilityByType?: ReadonlyMap<EvidenceType, number>;
  /** Deterministic source-accessibility override per EvidenceType (optional). */
  readonly sourceAccessibilityByType?: ReadonlyMap<EvidenceType, number>;
  /** PR10 evidence-utility policy version consumed ('v1'). */
  readonly policyVersion: 'v1';
  /** Caller-supplied observed time (no wall clock). */
  readonly computedAt: ObservedTime;
}

export interface CandidateEvidenceSelectionResult {
  readonly investigationId: string;
  readonly gapId: string;
  /** Ranked selected candidates (bounded by MAX_EVIDENCE_REQUESTS_PER_GAP). */
  readonly rankedRequests: readonly RankedCandidateRequest[];
  /** Total distinct candidates considered before selection. */
  readonly consideredCount: number;
  /** true when a bound was hit (input truncation preserved or selection cap reached). */
  readonly truncated: boolean;
  readonly accounting: CandidateSelectionAccounting;
  readonly utilityPolicyVersion: 'v1';
  readonly computedAt: ObservedTime;
}