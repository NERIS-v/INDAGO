// ============================================================================
// M-A09 Candidate Resolution — shared types and scoring model config
//
// M-A09 answers:
//   "How strongly does the available evidence support these candidates
//    representing the same identity, and what reversible hypothesis should
//    be recorded?"
//
// This module is PURE. It has NO IO dependencies: no Prisma, BullMQ, Redis,
// network clients, or web framework. It is deterministic and explainable.
//
// ResolutionScore is a RANKING / SUPPORT signal. It is NOT a calibrated
// probability. The numeric weights below are an EXPLAINABLE RANKING
// HEURISTIC, not probabilistic calibration. A reviewer can explain every
// weight in one sentence.
//
// ============================================================================
// SCORING MODEL v1 — indago:resolution-score:v1
//
// Weighted-additive evidence accumulation with contradiction handling.
// Scores are clamped to [0, 1]. Not a probability.
//
// | Evidence                                            | Effect  | Why                          |
// |-----------------------------------------------------|---------|------------------------------|
// | Exact strong identifier match (phone/email/account/  | +0.35   | A normalized high-quality identifier (phone, email, account, UUID, vehicle, device, address) being identical is the strongest available identity signal. |
// |  vehicle/device/UUID/address)                       |         |                              |
// | Exact canonical name match                          | +0.25   | Identical normalized PERSON/ORG name is a strong but less unique signal than an identifier. |
// | Name initial agreement (surname + first initial)    | +0.15   | "R. Sharma" ↔ "Rahul Sharma" agree on surname+initial — moderate name evidence. |
// | Type compatibility                                  |  0.00   | Compatible types alone prove NOTHING about identity — a 0-weight baseline fit. No bonus for merely surviving blocking. |
// | Hard contradiction (DIFFERENT strong identifier)    | -0.30   | Mutually exclusive strong identifiers (phone X vs phone Y, both present) directly argue AGAINST the identity — recorded, never averaged away. |
// | Incompatible entity types                           | exclude | Type mismatch makes a pair ineligible (defensive guard; M-A08 normally prevents this). |
// | ABSENT data (left/right/both)                      |  0.00   | Missing data is NOT contradictory. It contributes no positive signal and no negative signal. |
//
// There is NO baseline. The fact that a CandidatePair exists (it survived a
// blocking pass) is comparison-UNIVERSE eligibility, NOT identity evidence.
// typeCompatibility weight is 0 for the same reason — being type-compatible
// is eligibility, not evidence.
//
// CONTRADICTION RULE: A hard contradiction (both candidates present a
// DIFFERENT value for the SAME strong-identifier feature) does NOT average
// away. It subtracts a fixed -0.30 and may drive the score low enough to
// produce REJECTED / CONTRADICTED per the explicit deterministic rule.
//
// SCORE SETTLEMENT:  final = clamp(0 + Σ positive weights − Σ contradiction
// weights, 0, 1).
//
// FLOW:
//   CandidatePair → identifier evidence
//                 → name evidence
//                 → type compatibility
//                 → contradiction handling
//   → deterministic scoring model v1 → ResolutionScore
//   → EntityHypothesis: PROPOSED (never auto-ACCEPTED)
//
// NOTE ON ABSENT ≠ DIFFERENT:
//   - ABSENT (one/both sides lack a feature) → 0 weight, never a contradiction.
//   - DIFFERENT (both sides carry a DIFFERENT value for a strong identifier)
//     → -0.30 hard contradiction.
// ============================================================================

import type {
  CandidatePair,
  EntityMentionCandidate,
} from '@indago/contracts';

/** The single durable source M-A09 v1 consumes. */
export type ResolutionCandidate = EntityMentionCandidate;

/**
 * Bounds that keep resolution strictly bounded and deterministic — mirrored
 * from the M-A07/M-A08 caps so arrays never grow unbounded.
 */
export const RESOLUTION_BOUNDS = {
  /** Hard cap on supporting observation IDs recorded on a resolution. */
  maxSupportingObservationIds: 100,
  /** Hard cap on contradicting observation IDs recorded on a resolution. */
  maxContradictingObservationIds: 100,
  /** Hard cap on comparison-evidence entries in a resolution. */
  maxComparisonEvidence: 100,
} as const;

/**
 * Versioned identity of the deterministic scoring model.
 * Changing future scoring rules MUST bump this so historical hypotheses
 * remain interpretable against the model that produced them.
 */
export const RESOLUTION_SCORE_MODEL_VERSION = 'indago:resolution-score:v1';

/**
 * Deterministic scoring weights for model v1. See the header table for the
 * one-sentence justification of each weight.
 */
export const SCORING_V1 = {
  /** Floor applied to ANY comparison. Zero — surviving blocking is eligibility, not identity evidence. */
  baseline: 0,
  /** Positive weight for an exact normalized strong-identifier match. */
  strongIdentifierExactMatch: 0.35,
  /** Positive weight for an exact canonical name match. */
  canonicalNameExactMatch: 0.25,
  /** Positive weight for surname + first-initial agreement (name initials). */
  nameInitialAgreement: 0.15,
  /** Type compatibility carries ZERO weight — it is eligibility, not identity evidence. */
  typeCompatibility: 0,
  /** Fixed negative weight for a DIFFERENT strong identifier (contradiction). */
  hardContradiction: -0.3,
  /** Hard score floor (after clamping). */
  minScore: 0,
  /** Hard score ceiling (after clamping). */
  maxScore: 1,
} as const;

/**
 * Minimum score below which a comparison is deemed LOW-SIGNAL and does NOT
 * generate a positive identity proposition. If the evidence cannot clear
 * this floor, the resolver does NOT manufacture a positive hypothesis.
 */
export const RESOLUTION_PROPOSAL_THRESHOLD = 0.25;

export interface ResolutionResolutionInput {
  readonly pair: CandidatePair;
  readonly leftCandidate: EntityMentionCandidate;
  readonly rightCandidate: EntityMentionCandidate;
}

export interface ResolutionMetrics {
  candidatePairsConsidered: number;
  comparisonsPerformed: number;
  hypothesesProposed: number;
  hypothesesRejectedOrContradicted: number;
  lowEvidenceCount: number;
  ineligiblePairsSkipped: number;
}

export interface MultiPairResolutionInput {
  readonly pairs: readonly Readonly<ResolutionResolutionInput>[];
}

export interface MultiPairResolutionMetrics extends ResolutionMetrics {
  perPair: ReadonlyArray<{
    readonly candidatePairId: string;
    readonly score: number;
    readonly status: string;
  }>;
}
