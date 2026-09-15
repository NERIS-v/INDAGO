// ============================================================================
// Next-Best-Evidence Runtime — Input/Output Types (Phase 5A-PR10)
//
// These are the bounded, closed-world inputs to the PR10 selection runtime.
// The runtime NEVER reconstructs authoritative facts from free text: it
// consumes IDs (hypotheses, observations, gaps) and the frozen policy versions
// only. Every reference must resolve inside the supplied context or the
// candidate carrying it is deterministically dropped (never silently accepted).
//
// Inputs mirror the repository's authoritative producers:
//   candidate   -> PR5 QualifiedGraphHoleCandidate (@indago/contracts)
//   analysis    -> PR7 GraphHoleAnalysisV1         (@indago/graph-hole-analysis)
//   validation  -> PR8 ValidatedGraphHoleAnalysis  (@indago/graph-hole-validation)
//   decision    -> PR9 GraphHoleDecisionResolution (@indago/graph-hole-judge)
//
// PR10 is PERSISTENCE-FREE and ACQUISITION-FREE: it produces a ranked
// SELECTION snapshot. It never creates EvidenceRequest entities, never
// authorizes, never acquires evidence, and never mutates canonical state.
// ============================================================================

import type { TemporalInterval } from '@indago/contracts';
import type { EvidenceType, QualifiedGraphHoleCandidate } from '@indago/contracts';
import type { GraphHoleAnalysisV1 } from '@indago/graph-hole-analysis';
import type { GraphHoleDecisionResolution } from '@indago/graph-hole-judge';
import type { ValidatedGraphHoleAnalysis } from '@indago/graph-hole-validation';

// ============================================================================
// Bounded context consumed by PR10
// ============================================================================

/**
 * One atomic hypothesis from the bounded PR3 hypothesis context. PR10 reads
 * ONLY the structured fields it needs (IDs and signals); it never invents or
 * re-derives hypotheses. `derivedId` carries the deterministic
 * `atomic:<TYPE>:<canonicalUuid>` projection PR3 owns.
 */
export interface Pr10AtomicHypothesis {
  readonly derivedId: string;
  readonly supportingObservationIds: readonly string[];
  readonly contradictingObservationIds: readonly string[];
  readonly temporalScope?: TemporalInterval | null;
}

/** One supplied observation. PR10 needs its id (for grounding) and provenance evidence id. */
export interface Pr10Observation {
  readonly id: string;
  readonly evidenceId: string;
}

/**
 * Authoritative summary of evidence ALREADY represented in the case context.
 * The CALLER resolves this from canonical Evidence/observation records; PR10
 * uses it only for the deterministic existing-evidence exclusion (§7), never
 * to fabricate evidence.
 */
export interface ExistingEvidenceSummary {
  readonly evidenceType: EvidenceType;
  /** Canonical hypothesis ids this existing evidence already informs. */
  readonly hypothesisIds: readonly string[];
}

// ============================================================================
// Per-gap runtime input
// ============================================================================

/**
 * The complete closed-world input PR10 needs for ONE gap selection pass.
 * All ids belong to one investigation; `gapId` is the authoritative
 * InvestigativeGap UUID the qualified candidate addresses.
 */
export interface NextBestEvidenceGapInput {
  readonly gapId: string;
  /** PR5 qualified candidate. MUST have qualified === true. */
  readonly candidate: QualifiedGraphHoleCandidate;
  /** PR7 analysis. PR8-valid references are expected; PR10 re-validates resolution. */
  readonly analysis: GraphHoleAnalysisV1;
  /** PR8 validation result. MUST be valid === true (gate). */
  readonly validation: ValidatedGraphHoleAnalysis;
  /** PR9 decision resolution. MUST evaluate to ACTIVE (gate). */
  readonly decision: GraphHoleDecisionResolution;
  /** Bounded atomic-hypothesis context (PR3 projection) covering the analysis references. */
  readonly hypothesisContext: readonly Pr10AtomicHypothesis[];
  /** In-scope observations the analysis/candidates may reference (authoritative). */
  readonly observations: readonly Pr10Observation[];
  /** Already-represented evidence summaries for the existing-evidence exclusion. Optional. */
  readonly existingEvidence?: readonly ExistingEvidenceSummary[];
  /**
   * Deterministic source-availability override per canonical evidence type
   * ([0,1]; higher = more available/in-scope). Absent types use the frozen
   * missing-data default. Optional — when omitted PR10 uses type baselines only.
   */
  readonly sourceAvailabilityByType?: ReadonlyMap<EvidenceType, number>;
  /** Deterministic source-accessibility override per canonical evidence type
   * ([0,1]; higher = easier to access). Optional (missing-data default applies). */
  readonly sourceAccessibilityByType?: ReadonlyMap<EvidenceType, number>;
}

// ============================================================================
// Selection-run input
// ============================================================================

/**
 * The bounded input to one PR10 selection run over up to
 * MAX_GAPS_PER_SELECTION_RUN gaps, all within one investigation.
 */
export interface NextBestEvidenceSelectionInput {
  readonly investigationId: string;
  readonly gaps: readonly NextBestEvidenceGapInput[];
}

// ============================================================================
// Internal runtime accounting (surfaced via the result's metadata so that
// every drop/truncation/exclusion is observable and auditable).
//
// Emitted metadata shapes (assembled in orchestrate.ts):
//   selectionRun = { gapsRequested, gapsProcessed, runTruncated }
//   gapSummaries = GapSelectionAccounting[]                (one per processed gap)
//   provenance   = { gapId, rank, canonicalRequestKey }[]  (order-independent
//                  traceability anchor is canonicalRequestKey; the input-order-
//                  dependent recommendationIndex is never emitted)
// ============================================================================

export interface GapSelectionAccounting {
  readonly gapId: string;
  /** Recommended evidence records consumed from the PR7 analysis. */
  readonly recommendationsSeen: number;
  /** Candidates dropped because an invented/unresolvable reference was detected. */
  readonly unresolvedReferenceDrops: number;
  /** Candidates excluded because already-represented evidence covers their discrimination target. */
  readonly existingEvidenceExclusions: number;
  /** Equivalent candidates collapsed by the canonical request identity. */
  readonly deduplicatedCandidates: number;
  /** Distinct candidates entering ranking (after coverage exclusion + dedup). */
  readonly distinctCandidates: number;
  /** Candidates actually considered (bounded by maxCandidateRequestsConsideredPerGap). */
  readonly candidatesConsidered: number;
  /** Ranked candidates emitted in the selection (bounded by maxEvidenceRequestsPerGap). */
  readonly candidatesRanked: number;
  readonly truncated: boolean;
}