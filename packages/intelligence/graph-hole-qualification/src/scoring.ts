// ============================================================================
// PR5 scoring (Phase 5A-PR5)
//
// FROZEN V1 FORMULAS (V1.1 scoring calibration, GRAPH_HOLE_SCORING_POLICY_VERSION
// = 'v2') — every number is a HEURISTIC DETERMINISTIC SCORE, NOT a probability.
// Do not interpret any of these as "70% confidence" or "probability that the
// relationship existed."
//
// Structural score (weights in STRUCTURAL_SCORE_WEIGHTS; sum=1.0):
//   structuralScore = sum(weight_i * value_i) / sum(available_weights)
//   A component is AVAILABLE (present) unless it is genuinely NOT APPLICABLE:
//     - temporalSupport  absent when no temporal scope can be claimed
//     - communitySupport absent when no deterministic communities are supplied
//     An ABSENT component is RENORMALIZED AWAY (§7). A PRESENT component of
//     0.0 means genuinely zero evidence and counts against the score.
//
//   patternStrength    = basisStrength * (0.60 + 0.40 * evidenceRatio)  ≤ basisStrength
//   connectivitySupport= mean region-scope neighbor density of candidate nodes
//   contextualSupport  = 0.6 * hypothesis evidenceSupport (mean)
//                        + 0.4 * supporting observation strength (mean)
//   temporalSupport    = 0.5 * scope/region overlap + 0.5 * observation fit
//   communitySupport   = 0.9 cross-community | 0.3 same-community | 0.4 partial
//
// Evidence support score (weighted geometric mean; ε = GEOMETRIC_MEAN_EPSILON):
//   supportBreadth        = min(U, 4) / 4   (U = independent support units)
//   supportConsistency    = supporting/(supporting+contradicting) | 0.5 when 0
//   provenanceCompleteness= traceableSupporting / totalSupporting | 0 when none
//   evidenceSupportScore  = exp(0.50*ln(max(breadth,ε)) + 0.30*ln(max(consistency,ε))
//                               + 0.20*ln(max(provenance,ε)))
//
// Expected information value (opportunity for useful resolution — NOT a
// calibrated information-theoretic quantity and NOT "information gain"):
//   supportBalance        = supporting/(supporting+contradicting) | 0.5 when 0
//   uncertaintyPotential  = 1 - |2*supportBalance - 1|   (max at balance 0.5)
//   hypothesisCoverage    = min(H, 3) / 3   (H = distinct supporting atomics)
//   evidenceDiversity     = min(U, 4) / 4
//   expectedInformationValue = 0.50*uncertaintyPotential + 0.30*hypothesisCoverage
//                              + 0.20*evidenceDiversity
//
// Significance:
//   significance = 0.60*structuralScore + 0.25*evidenceSupportScore
//                  + 0.15*expectedInformationValue
//
// Numeric determinism: every emitted score is normalizeScore() (clamp01 then
// round6). All averaging inputs are sorted before reduction so FP summation
// is order-independent. All weighted sums iterate the FROZEN weight order.
// ============================================================================

import {
  STRUCTURAL_SCORE_WEIGHTS,
  SIGNIFICANCE_WEIGHTS,
  EVIDENCE_SUPPORT_GEOMETRIC_WEIGHTS,
  PATTERN_STRENGTH_INFLUENCE_WEIGHTS,
  EXPECTED_INFORMATION_VALUE_WEIGHTS,
  SUPPORT_BREADTH_SATURATION,
  HYPOTHESIS_COVERAGE_SATURATION,
  EVIDENCE_DIVERSITY_SATURATION,
  GEOMETRIC_MEAN_EPSILON,
  type StructuralBasis,
} from '@indago/contracts';
import type {
  QualificationObservation,
} from './types.js';
import type { HypothesisContext } from '@indago/hypothesis-context';
import type { RawGraphHoleCandidate } from '@indago/contracts';
import type { GraphHoleRegion } from '@indago/graph-hole-region';
import {
  intervalsOverlap,
  temporalScopeOf,
} from './temporal.js';
import type { SupportUnitResolutionResult } from './support-units.js';
import { normalizeScore, mean } from './determinism.js';

/** Frozen signal strength of every structural basis (V1, heuristically justified). */
export const STRUCTURAL_BASIS_STRENGTH: Readonly<Record<StructuralBasis, number>> = {
  SHARED_HYPOTHESIS_CONTEXT: 0.9,
  EXPECTED_PATH_BROKEN: 0.85,
  CHAIN_EXPECTED_CONTINUATION: 0.8,
  OBSERVED_NEIGHBOR_CONTEXT: 0.75,
  TEMPORAL_DISCONTINUITY: 0.7,
  CROSS_COMMUNITY_HYPOTHESIS_CONTEXT: 0.65,
  HYPOTHESIS_REFERENCED_NODE: 0.6,
  SEED_REFERENCED_NODE: 0.5,
};

/** Per-component structural score values. null = genuinely NOT APPLICABLE (renormalized). */
export interface StructuralComponents {
  readonly patternStrength: number;
  readonly connectivitySupport: number;
  readonly contextualSupport: number;
  readonly temporalSupport: number | null;
  readonly communitySupport: number | null;
}

/** Precomputed, bounded region context consumed by the scorers. */
export interface ScoringContext {
  readonly region: GraphHoleRegion;
  readonly hypothesisContext: HypothesisContext;
  readonly observations: readonly QualificationObservation[];
  /** region-scope neighbor degree per canonical node id. */
  readonly neighborDegrees: ReadonlyMap<string, number>;
  readonly communities: ReadonlyMap<string, string> | null;
}

/** Precomputed support unit resolution result. */
export interface SupportInput {
  readonly result: SupportUnitResolutionResult;
}

function supportingAtomicHypotheses(candidate: RawGraphHoleCandidate, ctx: ScoringContext) {
  const byDerivedId = new Map(ctx.hypothesisContext.atomic.map((a) => [a.derivedId, a] as const));
  const selected: { evidenceSupport: number }[] = [];
  for (const id of [...candidate.supportingHypothesisIds].sort()) {
    const atomic = byDerivedId.get(id);
    if (atomic !== undefined) selected.push({ evidenceSupport: atomic.evidenceSupport });
  }
  return selected;
}

function derivePatternStrength(candidate: RawGraphHoleCandidate): number {
  const basis = STRUCTURAL_BASIS_STRENGTH[candidate.structuralBasis];
  const supporting = candidate.supportingObservationIds.length;
  const contradicting = candidate.contradictingObservationIds.length;
  const total = supporting + contradicting;
  const evidenceRatio = total > 0 ? supporting / total : 0.5;
  return normalizeScore(
    basis * (
      PATTERN_STRENGTH_INFLUENCE_WEIGHTS.base +
      PATTERN_STRENGTH_INFLUENCE_WEIGHTS.evidenceRatio * evidenceRatio
    ),
  );
}

function deriveConnectivitySupport(candidate: RawGraphHoleCandidate, ctx: ScoringContext): number {
  const nodeCount = ctx.region.nodeIds.length;
  const maxPossibleDegree = Math.max(1, nodeCount - 1);
  const densities: number[] = [];
  for (const nodeId of [...candidate.nodeIds].sort()) {
    const degree = ctx.neighborDegrees.get(nodeId) ?? 0;
    densities.push(degree / maxPossibleDegree);
  }
  densities.sort();
  return normalizeScore(mean(densities));
}

function deriveContextualSupport(
  candidate: RawGraphHoleCandidate,
  ctx: ScoringContext,
): number {
  const hypothesisSupportValues = supportingAtomicHypotheses(candidate, ctx)
    .map((a) => a.evidenceSupport)
    .sort();
  const hypothesisContextScore = hypothesisSupportValues.length > 0
    ? mean(hypothesisSupportValues)
    : 0;

  const obsById = new Map(ctx.observations.map((o) => [o.id, o] as const));
  const observationStrengths: number[] = [];
  for (const id of [...candidate.supportingObservationIds].sort()) {
    const obs = obsById.get(id);
    if (obs !== undefined) observationStrengths.push(obs.strength);
  }
  observationStrengths.sort();
  const observationContextScore = observationStrengths.length > 0
    ? mean(observationStrengths)
    : 0;

  return normalizeScore(0.6 * hypothesisContextScore + 0.4 * observationContextScore);
}

function deriveTemporalSupport(
  candidate: RawGraphHoleCandidate,
  ctx: ScoringContext,
): number | null {
  const scope = temporalScopeOf(candidate, ctx.region);
  if (scope === null) return null;

  const regionContext = ctx.region.identity.temporalContext;
  const overlapScore =
    regionContext === undefined || regionContext === null
      ? 0.5
      : intervalsOverlap(scope, regionContext)
        ? 1
        : 0;

  const obsById = new Map(ctx.observations.map((o) => [o.id, o] as const));
  let fitted = 0;
  let total = 0;
  for (const id of [...candidate.supportingObservationIds].sort()) {
    const obs = obsById.get(id);
    if (obs !== undefined && obs.validityInterval !== undefined && obs.validityInterval !== null) {
      total += 1;
      if (intervalsOverlap(obs.validityInterval, scope)) fitted += 1;
    }
  }
  const observationFitScore = total === 0 ? 0.5 : fitted / total;

  return normalizeScore(0.5 * overlapScore + 0.5 * observationFitScore);
}

function deriveCommunitySupport(
  candidate: RawGraphHoleCandidate,
  ctx: ScoringContext,
): number | null {
  if (ctx.communities === null) return null;
  let present = 0;
  const total = candidate.nodeIds.length;
  const uniqueCommunities = new Set<string>();
  for (const nodeId of [...candidate.nodeIds].sort()) {
    const community = ctx.communities.get(nodeId);
    if (community !== undefined) {
      present += 1;
      uniqueCommunities.add(community);
    }
  }
  if (present === 0) return null;
  if (present < total) return normalizeScore(0.4);
  if (uniqueCommunities.size > 1) return normalizeScore(0.9);
  return normalizeScore(0.3);
}

const STRUCTURAL_COMPONENT_ORDER = [
  'patternStrength',
  'connectivitySupport',
  'contextualSupport',
  'temporalSupport',
  'communitySupport',
] as const;

/**
 * Derive the per-component structural values and compute the renormalized
 * structural score. Absent (null) components are renormalized away.
 */
export function deriveStructuralComponents(
  candidate: RawGraphHoleCandidate,
  ctx: ScoringContext,
): { components: StructuralComponents; structuralScore: number } {
  const components: StructuralComponents = {
    patternStrength: derivePatternStrength(candidate),
    connectivitySupport: deriveConnectivitySupport(candidate, ctx),
    contextualSupport: deriveContextualSupport(candidate, ctx),
    temporalSupport: deriveTemporalSupport(candidate, ctx),
    communitySupport: deriveCommunitySupport(candidate, ctx),
  };

  let weightedSum = 0;
  let applicableWeightSum = 0;
  for (const key of STRUCTURAL_COMPONENT_ORDER) {
    const value = components[key];
    if (value === null) continue;
    const weight = STRUCTURAL_SCORE_WEIGHTS[key];
    weightedSum += weight * value;
    applicableWeightSum += weight;
  }
  const structuralScore = applicableWeightSum > 0
    ? normalizeScore(weightedSum / applicableWeightSum)
    : 0;

  return { components, structuralScore };
}

export interface EvidenceSupportResult {
  readonly score: number;
  readonly components: {
    readonly supportBreadth: number;
    readonly supportConsistency: number;
    readonly provenanceCompleteness: number;
  };
}

export interface ExpectedInformationValueResult {
  readonly score: number;
  readonly components: {
    readonly uncertaintyPotential: number;
    readonly hypothesisCoverage: number;
    readonly evidenceDiversity: number;
  };
}

export function deriveEvidenceSupportScore(
  candidate: RawGraphHoleCandidate,
  support: SupportInput,
): EvidenceSupportResult {
  const supporting = candidate.supportingObservationIds.length;
  const contradicting = candidate.contradictingObservationIds.length;
  const total = supporting + contradicting;
  const units = support.result.keys.length;

  const supportBreadth = Math.min(units, SUPPORT_BREADTH_SATURATION) / SUPPORT_BREADTH_SATURATION;
  const supportConsistency = total > 0 ? supporting / total : 0.5;
  const traceableSupporting = supporting - support.result.missingObservationIds.length;
  const provenanceCompleteness = supporting > 0 ? traceableSupporting / supporting : 0;

  const geometricMean = Math.exp(
    EVIDENCE_SUPPORT_GEOMETRIC_WEIGHTS.supportBreadth * Math.log(Math.max(supportBreadth, GEOMETRIC_MEAN_EPSILON)) +
    EVIDENCE_SUPPORT_GEOMETRIC_WEIGHTS.supportConsistency * Math.log(Math.max(supportConsistency, GEOMETRIC_MEAN_EPSILON)) +
    EVIDENCE_SUPPORT_GEOMETRIC_WEIGHTS.provenanceCompleteness * Math.log(Math.max(provenanceCompleteness, GEOMETRIC_MEAN_EPSILON)),
  );

  return {
    score: normalizeScore(geometricMean),
    components: { supportBreadth, supportConsistency, provenanceCompleteness },
  };
}

export function deriveExpectedInformationValue(
  candidate: RawGraphHoleCandidate,
  support: SupportInput,
): ExpectedInformationValueResult {
  const supporting = candidate.supportingObservationIds.length;
  const contradicting = candidate.contradictingObservationIds.length;
  const total = supporting + contradicting;
  const supportBalance = total > 0 ? supporting / total : 0.5;
  const uncertaintyPotential = 1 - Math.abs(2 * supportBalance - 1);
  const distinctSupportingHypotheses = new Set(candidate.supportingHypothesisIds).size;
  const hypothesisCoverage =
    Math.min(distinctSupportingHypotheses, HYPOTHESIS_COVERAGE_SATURATION) / HYPOTHESIS_COVERAGE_SATURATION;
  const evidenceDiversity =
    Math.min(support.result.keys.length, EVIDENCE_DIVERSITY_SATURATION) / EVIDENCE_DIVERSITY_SATURATION;

  return {
    score: normalizeScore(
      EXPECTED_INFORMATION_VALUE_WEIGHTS.uncertaintyPotential * uncertaintyPotential +
      EXPECTED_INFORMATION_VALUE_WEIGHTS.hypothesisCoverage * hypothesisCoverage +
      EXPECTED_INFORMATION_VALUE_WEIGHTS.evidenceDiversity * evidenceDiversity,
    ),
    components: { uncertaintyPotential, hypothesisCoverage, evidenceDiversity },
  };
}

export function deriveSignificance(
  structuralScore: number,
  evidenceSupportScore: number,
  expectedInformationValue: number,
): number {
  return normalizeScore(
    SIGNIFICANCE_WEIGHTS.structuralScore * structuralScore +
      SIGNIFICANCE_WEIGHTS.evidenceSupportScore * evidenceSupportScore +
      SIGNIFICANCE_WEIGHTS.expectedInformationValue * expectedInformationValue,
  );
}