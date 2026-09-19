// ============================================================================
// M-A10 Relation Resolution — deterministic scoring
//
// Applies the versioned RELATION_SCORING_V1 weights (see types.ts header for
// the full, one-sentence-justified table). The result is a RelationSupport
// that is a support signal for the existence/type of a relationship, NOT a
// calibrated probability.
//
// Settlement:
//   raw = baseline
//         + Σ positive weights (co-occurrence, repeated, source diversity,
//              temporal proximity, type signal)
//         − Σ contradiction weights
//   score = clamp(raw, minScore, maxScore)
//
// ABSENT evidence contributes 0 and is NEVER counted as a contradiction.
//
// ALL DECLARED FEATURES ARE IMPLEMENTED — this is not a table of constants.
// scoreRelationPair() computes every signal from the actual observations:
//   coOccurrence, repeatedCoOccurrence, sourceDiversity, temporalProximity,
//   typeSignal, and hardContradiction.
// ============================================================================

import type { RelationStatus, Observation, RelationType } from '@indago/contracts';
import {
  RELATION_PROPOSAL_THRESHOLD,
  RELATION_SCORING_V1,
} from './types.js';

function parseEventTimeMs(observation: Observation): number | null {
  const t = observation.observedAt?.value;
  if (t === undefined) return null;
  const iso = t.split('T')[0];
  if (iso === undefined) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Temporal-proximity signal: whether the co-occurrence timestamps span a
 * window narrower than the proximity constant. Returns false when fewer than
 * two timestamps are available (absent time data is never treated as signal).
 */
export function hasTemporalRelationProximity(
  coOccurrenceObservations: readonly Observation[],
  windowMs: number,
): boolean {
  const timestamps = coOccurrenceObservations
    .map(parseEventTimeMs)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  if (timestamps.length < 2) return false;
  return timestamps[timestamps.length - 1]! - timestamps[0]! <= windowMs;
}

/**
 * Temporal coverage [0,1]: the proportion of the case's overall observed time
 * range spanned by the pair's co-occurrence window. Returns 0 when there is no
 * usable time data for the pair, 1 when the pair span alone defines the range.
 */
export function computeTemporalCoverage(
  coOccurrenceObservations: readonly Observation[],
  allObservations: readonly Observation[],
): number {
  const pairTimes = coOccurrenceObservations
    .map(parseEventTimeMs)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  if (pairTimes.length === 0) return 0;
  const pairSpan = pairTimes[pairTimes.length - 1]! - pairTimes[0]!;
  if (pairSpan <= 0) return 1;

  const allTimes = allObservations
    .map(parseEventTimeMs)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  if (allTimes.length === 0) return 0;
  const caseSpan = allTimes[allTimes.length - 1]! - allTimes[0]!;
  if (caseSpan <= 0) return 0;
  return Math.min(1, pairSpan / caseSpan);
}

/**
 * Source coverage [0,1]: the proportion of the case's distinct sources
 * represented in the pair's co-occurrences. Returns 0 when the case has no
 * distinct sources.
 */
export function computeSourceCoverage(
  coOccurrenceObservations: readonly Observation[],
  allObservations: readonly Observation[],
): number {
  const allSources = new Set<string>();
  for (const o of allObservations) allSources.add(o.sourceId);
  if (allSources.size === 0) return 0;
  const pairSources = new Set<string>();
  for (const o of coOccurrenceObservations) pairSources.add(o.sourceId);
  return Math.min(1, pairSources.size / allSources.size);
}

/**
 * Average supporting-evidence strength [0,1] from the co-occurrence
 * observations (mean of Observation.strength). Returns 0 with no evidence.
 */
export function computeEvidenceStrength(
  coOccurrenceObservations: readonly Observation[],
): number {
  if (coOccurrenceObservations.length === 0) return 0;
  const sum = coOccurrenceObservations.reduce(
    (acc, o) => acc + (typeof o.strength === 'number' ? o.strength : 0),
    0,
  );
  return Math.min(1, sum / coOccurrenceObservations.length);
}

/**
 * Settle the weighted evidence into a bounded RelationSupport.
 * Sums positive weights minus contradiction weights, clamped to [min, max].
 */
export function settleRelationScore(evidenceWeights: readonly number[]): number {
  let raw = RELATION_SCORING_V1.baseline;
  for (const weight of evidenceWeights) {
    raw += weight;
  }
  return Math.min(
    RELATION_SCORING_V1.maxScore,
    Math.max(RELATION_SCORING_V1.minScore, raw),
  );
}

/**
 * Deterministic hypothesis LIFECYCLE status.
 *
 * CRITICAL: score NEVER auto-accepts. A high score maps only to PROPOSED —
 * the reversibility product requirement. Low-signal pairs do not propose a
 * positive relation hypothesis. Human acceptance is a separate, explicit
 * decision path.
 *
 * PR-31 FIX 5 — near-miss observability: a pair whose support is below the
 * proposal threshold but which IS source-grounded in real observation
 * co-occurrence (groundingEvidenceCount > 0) receives the NEAR_MISS grade
 * instead of silent rejection. REJECTED is thereby reserved for truly
 * negative outcomes: a hard contradiction or the ABSENCE of grounding. This
 * makes the "could have been a relation" population inspectable WITHOUT
 * lowering RELATION_PROPOSAL_THRESHOLD.
 */
export function deriveRelationHypothesisStatus(
  score: number,
  hasHardContradiction: boolean,
  groundingEvidenceCount: number,
): RelationStatus {
  if (hasHardContradiction) return 'REJECTED';
  if (groundingEvidenceCount === 0) return 'REJECTED';
  if (score < RELATION_PROPOSAL_THRESHOLD) return 'NEAR_MISS';
  return 'PROPOSED';
}

/**
 * Whether a relation resolution produced enough signal to generate a PROPOSED
 * hypothesis. Highly-scored resolutions generate PROPOSED (never ACCEPTED).
 * Hard contradictions and low-signal pairs do not propose.
 */
export function shouldProposeRelationHypothesis(
  score: number,
  hasHardContradiction: boolean,
): boolean {
  return !hasHardContradiction && score >= RELATION_PROPOSAL_THRESHOLD;
}

/** True if any evidence item is a hard contradiction. */
export function hasHardRelationContradiction(
  evidenceWeights: readonly number[],
): boolean {
  return evidenceWeights.some(
    (w) => w === RELATION_SCORING_V1.hardContradiction,
  );
}

/**
 * Full, deterministic score settlement for a relation pair given its
 * co-occurrence observations and the case observation set. Implements every
 * declared scoring feature — see types.ts header table.
 */
export function scoreRelationPair(params: {
  coOccurrenceObservations: readonly Observation[];
  allObservations: readonly Observation[];
  relationType: RelationType;
  observationsByType?: ReadonlyMap<RelationType, Set<string>>;
  explicitContradiction?: boolean;
  temporalWindowMs: number;
}): {
  score: number;
  hasHardContradiction: boolean;
  evidenceStrength: number;
  sourceCoverage: number;
  temporalCoverage: number;
} {
  const {
    coOccurrenceObservations,
    allObservations,
    relationType,
    explicitContradiction = false,
    observationsByType,
    temporalWindowMs,
  } = params;

  const weights: number[] = [RELATION_SCORING_V1.baseline];

  if (coOccurrenceObservations.length > 0) {
    weights.push(RELATION_SCORING_V1.coOccurrence);
  }
  if (coOccurrenceObservations.length > 1) {
    weights.push(RELATION_SCORING_V1.repeatedCoOccurrence);
  }

  const sources = new Set<string>();
  for (const o of coOccurrenceObservations) sources.add(o.sourceId);
  if (sources.size > 1) weights.push(RELATION_SCORING_V1.sourceDiversity);

  if (
    hasTemporalRelationProximity(coOccurrenceObservations, temporalWindowMs)
  ) {
    weights.push(RELATION_SCORING_V1.temporalProximity);
  }

  // Relation type signal: any co-occurrence observation is a member of this
  // relation type's signal set (classified by the deterministic classifier).
  //
  // A type signal is only awarded for a CONCRETE relation type. The `other`
  // fallback means the content did NOT directly classify a relationship, so it
  // must never award the type-signal weight — otherwise the absence of a type
  // would masquerade as positive evidence (false precision). Generic
  // co-occurrence scores on co-occurrence/repetition/source/temporal only.
  let hasTypeSignal = false;
  const typeSignalIds =
    relationType === 'other' ? undefined : observationsByType?.get(relationType);
  if (typeSignalIds && typeSignalIds.size > 0) {
    for (const o of coOccurrenceObservations) {
      if (typeSignalIds.has(o.id)) {
        hasTypeSignal = true;
        break;
      }
    }
  }
  if (hasTypeSignal) weights.push(RELATION_SCORING_V1.typeSignal);

  if (explicitContradiction) weights.push(RELATION_SCORING_V1.hardContradiction);

  const score = settleRelationScore(weights);

  return {
    score,
    hasHardContradiction: explicitContradiction,
    evidenceStrength: computeEvidenceStrength(coOccurrenceObservations),
    sourceCoverage: computeSourceCoverage(coOccurrenceObservations, allObservations),
    temporalCoverage: computeTemporalCoverage(coOccurrenceObservations, allObservations),
  };
}
