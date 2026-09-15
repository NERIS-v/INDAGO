// ============================================================================
// Next-Best-Evidence Runtime — Utility Component Derivation (Phase 5A-PR10)
//
// Each exported function computes ONE request-level utility component from
// deterministic inputs and the frozen derivation parameters in policy.ts.
// Every output is a NORMALIZED HEURISTIC in [0,1] — NOT a calibrated
// probability, NOT a calibrated information-theoretic quantity.
//
// The FINAL utility composition (score) is performed by computeEvidenceUtility
// using the FROZEN EVIDENCE_UTILITY_POLICY_V1 weights from @indago/contracts;
// these functions only produce the individual components.
//
// Determinism: same input ⇒ byte-equivalent output. No randomness, no
// external state, no provider dependency. Rounding occurs only at the
// final utility composition (computeEvidenceUtility).
// ============================================================================

import type { EvidenceType } from '@indago/contracts';
import { EVIDENCE_UTILITY_POLICY_V1 } from '@indago/contracts';
import { mean, normalizeScore } from './determinism.js';
import {
  NextBestEvidenceError,
  NEXT_BEST_EVIDENCE_ERROR_CODE,
} from './errors.js';
import {
  EIG_SUBWEIGHTS,
  RELEVANCE_SUBWEIGHTS,
  FEASIBILITY_COMPONENT_WEIGHTS,
  COST_COMPONENT_WEIGHTS,
  MISSING_SOURCE_AVAILABILITY,
  MISSING_SOURCE_ACCESSIBILITY,
  FEASIBILITY_TYPE_BASELINE,
  COST_TYPE_BASELINE,
} from './policy.js';

// ============================================================================
// Expected Information Gain (§9)
//
// A request-level heuristic for how much discriminating among the EXPLICITLY
// CONSIDERED competing explanations this candidate is expected to provide.
//
// Inputs are all from structured, authoritative context — never from
// the rationale text.
// ============================================================================

export interface ExpectedInformationGainInput {
  /**
   * Canonical UUIDs of the explicit discrimination target (validated against
   * the supplied competing set). Empty => EIG = 0 (fail-closed).
   */
  readonly targetUuids: readonly string[];
  /** Canonical UUIDs of ALL represented competing explanations. */
  readonly allCompetingUuids: readonly string[];
  /** Per-hypothesis signal counts (support/contradicting) from bounded atomic context. */
  readonly signalsByUuid: ReadonlyMap<string, { readonly supporting: number; readonly contradicting: number }>;
}

/**
 * Compute the request-level Expected Information Gain from structured
 * discrimination signals. Deterministic, normalized [0,1].
 *
 * EIG = 0 when no explicit discrimination target exists. When a target exists,
 * EIG is a weighted blend of discrimination signals (sub-weights in policy.ts).
 */
export function computeExpectedInformationGain(input: ExpectedInformationGainInput): number {
  const { targetUuids, allCompetingUuids, signalsByUuid } = input;

  if (targetUuids.length === 0) return 0;

  const represented = Math.max(1, allCompetingUuids.length);
  const discriminationBreadth = targetUuids.length / represented;

  let unresolvedTargets = 0;
  const uncertainties: number[] = [];

  for (const uuid of targetUuids) {
    const sig = signalsByUuid.get(uuid);
    const supporting = sig?.supporting ?? 0;
    const contradicting = sig?.contradicting ?? 0;
    const total = supporting + contradicting;

    // Uncertainty: max (1.0) when perfectly balanced or no evidence yet;
    // min (0.0) when only supporting or only contradicting observations exist.
    const balance = total > 0 ? supporting / total : 0.5;
    uncertainties.push(1 - Math.abs(2 * balance - 1));

    // "Unresolved" = no supporting observations yet (genuine unknown potential)
    if (supporting === 0) unresolvedTargets += 1;
  }

  uncertainties.sort();
  const averageUncertainty = mean(uncertainties);
  const unresolvedRatio = targetUuids.length > 0
    ? unresolvedTargets / targetUuids.length
    : 0;

  const raw =
    EIG_SUBWEIGHTS.discriminationBreadth * discriminationBreadth +
    EIG_SUBWEIGHTS.averageUncertainty * averageUncertainty +
    EIG_SUBWEIGHTS.unresolvedTargets * unresolvedRatio;

  return normalizeScore(raw);
}

// ============================================================================
// Relevance (§13)
//
// How directly the candidate request ties to the GraphHole and the
// hypotheses being discriminated. Deterministic, normalized [0,1].
// ============================================================================

export interface EvidenceRelevanceInput {
  readonly targetUuids: readonly string[];
  readonly gapExpectationUuids: readonly string[];
  readonly allCompetingUuids: readonly string[];
  /** Number of PR7 supportingObservationIds that resolve to supplied authoritative observations. */
  readonly groundedObservationCount: number;
  /** Total number of PR7 supportingObservationIds on the recommendation. */
  readonly totalCandidateObservationRefs: number;
  /** Per-target temporal fit [0,1]; empty => 0 (unknown — no temporal claim). */
  readonly perTargetTemporalFit: readonly number[];
}

/**
 * Compute relevance: how directly this candidate request connects to the
 * GraphHole and the discriminated hypotheses. Deterministic, normalized [0,1].
 * Sub-weights in policy.ts.
 */
export function computeEvidenceRelevance(input: EvidenceRelevanceInput): number {
  const {
    targetUuids,
    gapExpectationUuids,
    allCompetingUuids,
    groundedObservationCount,
    totalCandidateObservationRefs,
    perTargetTemporalFit,
  } = input;

  // Fail-closed: without a validated discrimination target there is no direct
  // link to the hypotheses being discriminated, so relevance is zero (mirrors
  // the EIG fail-closed rule).
  if (targetUuids.length === 0) return 0;

  const represented = Math.max(1, allCompetingUuids.length);
  const discriminationBreadth = targetUuids.length / represented;

  // Gap-expectation overlap: what fraction of targets belong to the gap expectation
  const gapSet = new Set(gapExpectationUuids);
  let gapOverlap = 0;
  for (const uuid of targetUuids) {
    if (gapSet.has(uuid)) gapOverlap += 1;
  }
  const gapExpectationLink = targetUuids.length > 0 ? gapOverlap / targetUuids.length : 0;

  // Observation grounding: authoritative vs asserted
  const observationGrounding = totalCandidateObservationRefs > 0
    ? groundedObservationCount / totalCandidateObservationRefs
    : 0;

  // Temporal fit: mean of per-target fits (missing => 0 is conservative)
  const temporalFit = perTargetTemporalFit.length > 0
    ? mean([...perTargetTemporalFit].sort())
    : 0;

  const raw =
    RELEVANCE_SUBWEIGHTS.gapExpectationLink * gapExpectationLink +
    RELEVANCE_SUBWEIGHTS.discriminationBreadth * discriminationBreadth +
    RELEVANCE_SUBWEIGHTS.observationGrounding * observationGrounding +
    RELEVANCE_SUBWEIGHTS.temporalFit * temporalFit;

  return normalizeScore(raw);
}

// ============================================================================
// Feasibility (§11)
//
// Practical ability to obtain the evidence within authorized scope. Deterministic,
// normalized [0,1]. NOT "the model thinks this is easy."
//
// Inputs: evidence type + caller-supplied source availability override (optional).
// Missing data => neutral baseline (never maximum).
// ============================================================================

/**
 * Compute feasibility for one evidence type. Deterministic, normalized [0,1].
 *
 *   feasibility = 0.70 * typeBaseline + 0.30 * sourceAvailability
 *
 * Missing source availability defaults to MISSING_SOURCE_AVAILABILITY (0.5) —
 * never assumed maximum.
 */
export function computeEvidenceFeasibility(
  evidenceType: EvidenceType,
  sourceAvailabilityOverride?: ReadonlyMap<EvidenceType, number>,
): number {
  const typeBaseline = FEASIBILITY_TYPE_BASELINE[evidenceType] ?? 0.5;
  const availability = sourceAvailabilityOverride?.get(evidenceType) ?? MISSING_SOURCE_AVAILABILITY;

  return normalizeScore(
    FEASIBILITY_COMPONENT_WEIGHTS.typeBaseline * typeBaseline +
    FEASIBILITY_COMPONENT_WEIGHTS.sourceAvailability * availability,
  );
}

// ============================================================================
// Cost (§12)
//
// Investigative burden: higher = more burdensome. NOT monetary, NOT a
// probability. Deterministic, normalized [0,1].
//
// Inputs: evidence type + caller-supplied source accessibility override
// (higher = easier to access). Cost rises as accessibility falls:
//   cost = 0.70 * typeBaseline + 0.30 * (1 - accessibility)
// Missing data => neutral default (never easiest).
// ============================================================================

/**
 * Compute cost for one evidence type. Deterministic, normalized [0,1].
 */
export function computeEvidenceCost(
  evidenceType: EvidenceType,
  sourceAccessibilityOverride?: ReadonlyMap<EvidenceType, number>,
): number {
  const typeBaseline = COST_TYPE_BASELINE[evidenceType] ?? 0.5;
  const accessibility = sourceAccessibilityOverride?.get(evidenceType) ?? MISSING_SOURCE_ACCESSIBILITY;
  const accessBurden = 1 - accessibility;

  return normalizeScore(
    COST_COMPONENT_WEIGHTS.typeBaseline * typeBaseline +
    COST_COMPONENT_WEIGHTS.sourceAccessibility * accessBurden,
  );
}

// ============================================================================
// Utility Composition (§10) — FROZEN FORMULA
//
// Composes the four components into the final utility record using the EXACT
// frozen EVIDENCE_UTILITY_POLICY_V1 composition:
//
//   effectiveCost = 1 - cost
//   score = clamp01(round6(
//       wEIG * expectedInformationGain
//     + wRel * relevance
//     + wFeas * feasibility
//     + wCost * effectiveCost ))
//
// Every score is RECOMPUTED from validated components by the frozen formula;
// an externally supplied score is never trusted.
// ============================================================================

export interface EvidenceUtilityComponents {
  readonly expectedInformationGain: number;
  readonly relevance: number;
  readonly feasibility: number;
  readonly cost: number;
  /**
   * Optional schema-compatible alias (`eig === expectedInformationGain`, frozen
   * PR10 alias rule). When supplied it MUST equal `expectedInformationGain` or
   * the composition fails closed with DIVERGENT_EIG_ALIAS — one field never
   * silently overrides the other. When omitted, `eig` is derived from the
   * canonical `expectedInformationGain`.
   */
  readonly eig?: number;
}

/**
 * The complete computed utility record — exactly matching the frozen
 * EvidenceUtilitySchema (eig === expectedInformationGain enforced).
 */
export interface ComputedEvidenceUtility {
  readonly expectedInformationGain: number;
  readonly eig: number;
  readonly relevance: number;
  readonly feasibility: number;
  readonly cost: number;
  readonly score: number;
}

/**
 * Validate all utility components are finite and in [0,1], then compose the
 * final score using the frozen utility policy.
 *
 * Invalid caller-supplied components fail closed with a typed
 * NextBestEvidenceError:
 *   - non-finite (NaN / ±Infinity)  -> NAN_OR_INFINITE_COMPONENT
 *   - finite outside [0,1]          -> OUT_OF_RANGE_COMPONENT
 *   - divergent `eig` alias         -> DIVERGENT_EIG_ALIAS
 *
 * Components are NEVER clamped into a valid score. The final score is always
 * RECOMPUTED by the frozen formula from validated components — an externally
 * supplied `score` is never trusted.
 */
export function computeEvidenceUtility(components: EvidenceUtilityComponents): ComputedEvidenceUtility {
  const entries: readonly [string, number][] = [
    ['expectedInformationGain', components.expectedInformationGain],
    ['relevance', components.relevance],
    ['feasibility', components.feasibility],
    ['cost', components.cost],
  ];

  for (const [name, value] of entries) {
    if (!Number.isFinite(value)) {
      throw new NextBestEvidenceError(
        NEXT_BEST_EVIDENCE_ERROR_CODE.NAN_OR_INFINITE_COMPONENT,
        `Utility component ${name} is not finite.`,
        {
          component: name,
          value,
          expected: 'finite number in [0, 1]',
          category: 'NAN_OR_INFINITE',
        },
      );
    }
    if (value < 0 || value > 1) {
      throw new NextBestEvidenceError(
        NEXT_BEST_EVIDENCE_ERROR_CODE.OUT_OF_RANGE_COMPONENT,
        `Utility component ${name} is outside [0, 1].`,
        {
          component: name,
          value,
          expected: '[0, 1]',
          category: 'OUT_OF_RANGE',
        },
      );
    }
  }

  if (
    components.eig !== undefined
    && components.eig !== components.expectedInformationGain
  ) {
    throw new NextBestEvidenceError(
      NEXT_BEST_EVIDENCE_ERROR_CODE.DIVERGENT_EIG_ALIAS,
      'evidenceUtility.eig must equal evidenceUtility.expectedInformationGain (frozen PR10 alias).',
      {
        expectedInformationGain: components.expectedInformationGain,
        eig: components.eig,
        expected: 'eig === expectedInformationGain',
      },
    );
  }

  const eig = components.expectedInformationGain;

  // Frozen cost inversion
  const effectiveCost = 1 - components.cost;

  // Frozen weighted composition (weights sum to exactly 1.0 in policy v1)
  const w = EVIDENCE_UTILITY_POLICY_V1.weights;
  const weighted =
    w.expectedInformationGain * eig +
    w.relevance * components.relevance +
    w.feasibility * components.feasibility +
    w.effectiveCost * effectiveCost;

  // Frozen output transform: clamp01(round6(weighted))
  const score = normalizeScore(weighted);

  return {
    expectedInformationGain: eig,
    eig,
    relevance: components.relevance,
    feasibility: components.feasibility,
    cost: components.cost,
    score,
  };
}