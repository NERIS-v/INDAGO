// ============================================================================
// Next-Best-Evidence Runtime — Derivation Parameters (Phase 5A-PR10)
//
// These constants parameterize the DETERMINISTIC component derivations that
// feed the FROZEN utility composition (EVIDENCE_UTILITY_POLICY_V1 in
// @indago/contracts). The frozen weights and composition formula live in
// the contracts package; this module documents the request-level
// derivation sub-weights and evidence-type base profiles that feed it.
//
// OWNERSHIP: these constants are RUNTIME-OWNED (PR10 runtime), NOT
// FROZEN-POLICY-OWNED. They may be re-calibrated with a runtime change
// (accompanied by doc update). The frozen policy (formula, weights,
// cost inversion, rank order, bounds) is NEVER altered here.
//
// The evidence-type baseline profiles encode repository-supported,
// deterministic prior estimates of investigative burden and scope-footprint
// for each canonical EvidenceType. They are NOT monetary values, NOT
// probabilities, NOT calibrated on external data. They represent a
// consensus heuristic of relative effort, tuned for monotonic rank quality
// (low feasibility/below cost for harder-to-obtain types, high for easier).
// Callers MAY override them via sourceAvailabilityByType /
// sourceAccessibilityByType when authoritative per-case operational data
// is available. When absent, these baselines apply with the documented
// missing-data defaults (neutral, never maximum).
// ============================================================================

import type { EvidenceType } from '@indago/contracts';

// ============================================================================
// EIG derivation sub-weights
// ============================================================================

/**
 * How request-level Expected Information Gain is derived from structured
 * discrimination signals. These sum to 1.0.
 *
 * discriminationBreadth — the fraction of represented competing explanations
 *   the candidate distinguishes. Dominant weight (0.50): discrimination breadth
 *   is PR10's core objective.
 * averageUncertainty — average uncertainty among the target explanations
 *   (support balance from bounded observations). Higher when supporting and
 *   contradicting evidence is balanced (unresolved). Weight 0.30.
 * unresolvedTargets — fraction of target explanations with no supporting
 *   observations yet (potential remains). Weight 0.20.
 */
export const EIG_SUBWEIGHTS = {
  discriminationBreadth: 0.50,
  averageUncertainty: 0.30,
  unresolvedTargets: 0.20,
} as const;

// ============================================================================
// Relevance derivation sub-weights
// ============================================================================

/**
 * Relevance captures the link between a candidate request and the specific
 * GraphHole + discrimination target it serves. These sum to 1.0.
 *
 * gapExpectationLink — overlap between the candidate's discrimination target
 *   and the main gap-expectation hypotheses. Direct connection to the hole.
 * discriminationBreadth — breadth of the discrimination target, weighted as
 *   breadth-of-relevance (captures breadth of informative scope).
 * observationGrounding — fraction of candidate's PR7-supplied supporting
 *   observations that are actually present in the authoritative supplied
 *   observations (groundedness in real context, NOT LLM assertion).
 * temporalFit — mean per-target temporal compatibility of the target
 *   hypotheses against the candidate's own temporal scope.
 */
export const RELEVANCE_SUBWEIGHTS = {
  gapExpectationLink: 0.45,
  discriminationBreadth: 0.25,
  observationGrounding: 0.20,
  temporalFit: 0.10,
} as const;

// ============================================================================
// Feasibility derivation weights + missing-data semantics
// ============================================================================

/**
 * Feasibility blends an evidence-type baseline (type foot-print) with
 * caller-supplied source availability (0 = unavailable, 1 = highly available).
 * Weights sum to 1.0.
 */
export const FEASIBILITY_COMPONENT_WEIGHTS = {
  typeBaseline: 0.70,
  sourceAvailability: 0.30,
} as const;

/** Missing source availability for a type: neutral (0.5), never maximum. */
export const MISSING_SOURCE_AVAILABILITY = 0.5 as const;

// ============================================================================
// Cost derivation weights + missing-data semantics
// ============================================================================

/**
 * Cost blends an evidence-type baseline burden with source accessibility
 * (1 = easiest, so accessBurden = 1 - accessibility). Weights sum to 1.0.
 */
export const COST_COMPONENT_WEIGHTS = {
  typeBaseline: 0.70,
  sourceAccessibility: 0.30,
} as const;

/** Missing source accessibility for a type: neutral (0.5), never easiest. */
export const MISSING_SOURCE_ACCESSIBILITY = 0.5 as const;

// ============================================================================
// Evidence-type baseline profiles
//
// Deterministic priors on [0,1]. NOT calibrated empirical values.
// Tuned for monotonic consistency across the canonical vocabulary:
//   DOCUMENT/RECORD are data-record types; TESTIMONY involves people;
//   PHYSICAL is out-of-system; DIGITAL is in-system; FINANCIAL may be
//   heavily guarded; COMMUNICATION has a similar in-system profile to
//   DIGITAL but may carry authorization barriers.
//
// feasibilityBaseline: higher = easier/more realistically obtainable
//   within authorized scope; 1 = trivially accessible, 0 = essentially
//   inaccessible. Missing types map to the MISSING default.
//
// costBaseline: higher = more burdensome; 1 = maximum burden within
//   authorized scope, 0 = trivial burden. Missing types map to neutral.
// ============================================================================

export const FEASIBILITY_TYPE_BASELINE: Readonly<Record<EvidenceType, number>> = {
  DOCUMENT:      0.70,
  RECORD:        0.65,
  TESTIMONY:     0.50,
  PHYSICAL:      0.40,
  DIGITAL:       0.75,
  FINANCIAL:     0.55,
  COMMUNICATION: 0.65,
  OTHER:         0.50,
} as const;

export const COST_TYPE_BASELINE: Readonly<Record<EvidenceType, number>> = {
  DOCUMENT:      0.40,
  RECORD:        0.45,
  TESTIMONY:     0.65,
  PHYSICAL:      0.70,
  DIGITAL:       0.35,
  FINANCIAL:     0.55,
  COMMUNICATION: 0.45,
  OTHER:         0.50,
} as const;