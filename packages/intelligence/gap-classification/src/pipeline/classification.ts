// ============================================================================
// Gap Classification (Phase 5A-PR14)
//
// Deterministic V1 pipeline (policy §6):
//   validate -> derive signals -> compute context digest -> predicates -> result
//
// The predicates are mutually exclusive by construction (each fires at most
// one category). Contradictions are PRESERVED (AMBIGUOUS), never collapsed
// into MISSING_DATA / CONCEALMENT_CONSISTENT_PATTERN. The classifier is a pure
// function over the supplied bounded input: no persistence, no mutation, no
// hidden retrieval.
//
// Frozen policy document: docs/architecture/pr14-gap-classification.md.
// ============================================================================

import type {
  GapClassificationReasonCode,
  GapClassificationResult,
  GapClassificationStatus,
  GapClassificationType,
  GapPriority,
} from '@indago/contracts';
import { GapClassificationResultSchema, canonicalizeDeterministic } from '@indago/contracts';

import type { GapClassificationInput } from '../contracts/classification-input.js';
import {
  CONSUMED_GAP_CLASSIFICATION_POLICY_VERSION,
  HIGH_SIGNIFICANCE,
  INSUFFICIENT_CONTEXT_SUGGESTED_ACTIONS,
  MEDIUM_SIGNIFICANCE,
  MIN_SIGNIFICANCE,
  MIN_STRUCTURAL_SCORE,
  SUGGESTED_ACTIONS,
} from '../contracts/classification-policy.js';
import { buildClassificationSignals } from './signals.js';
import type { DerivedClassificationFacts } from './signals.js';
import { GapClassificationError, GapClassificationErrorCodes } from './errors.js';
import { sha256Hex } from './sha256.js';

// ---------------------------------------------------------------------------
// Priority bands (deterministic heuristic; policy §6 — NOT a probability)
// ---------------------------------------------------------------------------

function priorityOf(significance: number): GapPriority {
  if (significance >= HIGH_SIGNIFICANCE) return 'CRITICAL';
  if (significance >= MIN_SIGNIFICANCE) return 'HIGH';
  if (significance >= MEDIUM_SIGNIFICANCE) return 'MEDIUM';
  return 'LOW';
}

// ---------------------------------------------------------------------------
// Predicates (policy §6) + epistemic status resolution
// ---------------------------------------------------------------------------

interface PredicateOutcome {
  readonly type: GapClassificationType | null;
  readonly status: GapClassificationStatus;
  readonly reasonCodes: readonly GapClassificationReasonCode[];
}

function contextEligible(facts: DerivedClassificationFacts): boolean {
  const s = facts.signals;
  return (
    s.inScopeObservationCount > 0 ||
    s.inScopeAtomicHypothesisCount > 0 ||
    s.supportingObservationCount > 0 ||
    s.contradictionPresence
  );
}

function resolveClassification(facts: DerivedClassificationFacts): PredicateOutcome {
  const s = facts.signals;

  // Policy §6 context-eligibility guard: NOT enough context to classify at all.
  // Explicitly distinct from MISSING_DATA (which describes the case, not the classifier).
  if (!contextEligible(facts)) {
    return { type: null, status: 'INSUFFICIENT_CONTEXT', reasonCodes: ['INSUFFICIENT_CONTEXT'] };
  }

  const questionIdentified = s.expectedRelationshipType !== null || s.supportingHypothesisCount > 0;
  const representationLimited =
    s.regionTruncated ||
    s.regionLimited ||
    s.contextCompleteness.observationContextLimited ||
    s.contextCompleteness.hypothesisGroupingTruncated;
  const retrievalLimited = s.contextCompleteness.semanticRetrievalTruncated;
  const systemCause = representationLimited || retrievalLimited;

  // P1 (CONCEALMENT_CONSISTENT_PATTERN): strong structural expectation, endpoint
  // context present, zero direct-link observations, no comparison baseline,
  // no contradictions, no system cause. Pattern-compatible ONLY (status SUPPORTED).
  const clearlySignificant =
    s.significance >= MIN_SIGNIFICANCE || s.structuralScore >= MIN_STRUCTURAL_SCORE;
  const concealmentCandidate =
    !s.contradictionPresence &&
    !systemCause &&
    clearlySignificant &&
    s.endpointObservationPresence &&
    s.supportingObservationCount === 0 &&
    !s.comparisonBaselinePresent;

  // Contradictions are always preserved (policy §13): the winning non-forbidden
  // category (P2/P4/P5) is emitted with AMBIGUOUS + CONTRADICTION_PRESERVED.
  if (s.contradictionPresence) {
    const type: GapClassificationType = systemCause
      ? 'INFRASTRUCTURE_GAP'
      : s.supportingObservationCount >= 1 && !s.comparisonBaselinePresent
        ? 'MISSING_COMPARISON'
        : 'MISSING_INVESTIGATION';
    return { type, status: 'AMBIGUOUS', reasonCodes: ['CONTRADICTION_PRESERVED'] };
  }

  if (concealmentCandidate) {
    return {
      type: 'CONCEALMENT_CONSISTENT_PATTERN',
      status: 'SUPPORTED',
      reasonCodes: [
        'STRUCTURAL_EXPECTATION_STRONG',
        'ENDPOINT_EVIDENCE_PRESENT',
        'ABSENT_DIRECT_LINK_EVIDENCE',
        'CONCEALMENT_PATTERN_COMPATIBLE',
      ],
    };
  }

  // P2 (INFRASTRUCTURE_GAP): system/representation cause.
  if (systemCause) {
    const reasonCodes: GapClassificationReasonCode[] = [];
    if (representationLimited) reasonCodes.push('REGION_REPRESENTATION_LIMITED');
    if (retrievalLimited) reasonCodes.push('SOURCE_CATEGORY_UNAVAILABLE');
    return { type: 'INFRASTRUCTURE_GAP', status: 'CONFIDENT', reasonCodes };
  }

  // P3 (MISSING_DATA): question identified, no supporting observations.
  if (questionIdentified && s.supportingObservationCount === 0) {
    return {
      type: 'MISSING_DATA',
      status: 'CONFIDENT',
      reasonCodes: ['QUESTION_IDENTIFIED', 'REQUIRED_INFORMATION_ABSENT'],
    };
  }

  // P4 (MISSING_COMPARISON): supporting evidence exists, no comparison baseline.
  if (s.supportingObservationCount >= 1 && !s.comparisonBaselinePresent) {
    return {
      type: 'MISSING_COMPARISON',
      status: 'CONFIDENT',
      reasonCodes: ['COMPARISON_BASELINE_ABSENT', 'QUESTION_IDENTIFIED'],
    };
  }

  // P5 (MISSING_INVESTIGATION): default — investigation not yet concluded.
  return {
    type: 'MISSING_INVESTIGATION',
    status: 'CONFIDENT',
    reasonCodes: questionIdentified
      ? ['QUESTION_IDENTIFIED', 'INVESTIGATION_NOT_CONCLUDED']
      : ['INVESTIGATION_NOT_CONCLUDED'],
  };
}

function referencesFor(outcome: PredicateOutcome, facts: DerivedClassificationFacts) {
  if (outcome.type === null) {
    return {
      supportingObservationIds: [] as readonly string[],
      supportingHypothesisIds: [] as readonly string[],
      structuralSignalIds: [] as readonly string[],
    };
  }
  if (outcome.type === 'CONCEALMENT_CONSISTENT_PATTERN') {
    return {
      supportingObservationIds: facts.endpointObservationIds,
      supportingHypothesisIds: [],
      structuralSignalIds: facts.candidateNodeIds,
    };
  }
  if (outcome.type === 'MISSING_COMPARISON') {
    return {
      supportingObservationIds: facts.candidateSupportingObservationIds,
      supportingHypothesisIds: facts.candidateSupportingHypothesisIds,
      structuralSignalIds: facts.candidateNodeIds,
    };
  }
  return {
    supportingObservationIds: [] as readonly string[],
    supportingHypothesisIds: facts.candidateSupportingHypothesisIds,
    structuralSignalIds: facts.candidateNodeIds,
  };
}

// ---------------------------------------------------------------------------
// Public API: classifyGap
// ---------------------------------------------------------------------------

/**
 * Classify WHY a qualified graph hole exists. Pure, deterministic, single-label.
 *
 * @throws GapClassificationError on boundary violations (INVALID_INPUT /
 *   UNSUPPORTED_POLICY / QUALIFIED_CANDIDATE_REQUIRED / CONTEXT_MISMATCH).
 *   Non-throwing epistemic state INSUFFICIENT_CONTEXT is a RESULT (no type).
 */
export function classifyGap(input: GapClassificationInput): GapClassificationResult {
  if (input === null || typeof input !== 'object') {
    throw new GapClassificationError(GapClassificationErrorCodes.INVALID_INPUT, 'input must be an object');
  }
  if (input.classificationPolicyVersion !== CONSUMED_GAP_CLASSIFICATION_POLICY_VERSION) {
    throw new GapClassificationError(
      GapClassificationErrorCodes.UNSUPPORTED_POLICY,
      `unsupported classificationPolicyVersion: ${String(input.classificationPolicyVersion)}`,
    );
  }
  if (!input.qualifiedCandidate) {
    throw new GapClassificationError(
      GapClassificationErrorCodes.QUALIFIED_CANDIDATE_REQUIRED,
      'qualifiedCandidate is required',
    );
  }
  if (input.qualifiedCandidate.qualified !== true) {
    throw new GapClassificationError(
      GapClassificationErrorCodes.QUALIFIED_CANDIDATE_REQUIRED,
      'PR14 classifies only already-qualified candidates',
    );
  }

  const facts = buildClassificationSignals(input);

  // Context digest (policy §6): SHA-256 over canonicalized signals + policy version.
  const contextSha256 = sha256Hex(
    canonicalizeDeterministic({
      signals: facts.signals,
      classificationPolicyVersion: input.classificationPolicyVersion,
    }),
  );

  const outcome = resolveClassification(facts);
  const type: GapClassificationType | undefined = outcome.type ?? undefined;
  const suggestedActions: readonly string[] =
    outcome.type === null ? INSUFFICIENT_CONTEXT_SUGGESTED_ACTIONS : SUGGESTED_ACTIONS[outcome.type];
  const references = referencesFor(outcome, facts);

  let result: GapClassificationResult;
  try {
    result = GapClassificationResultSchema.parse({
      graphHoleId: facts.signals.candidateId,
      type,
      status: outcome.status,
      reasonCodes: [...outcome.reasonCodes],
      supportingReferences: {
        supportingObservationIds: [...references.supportingObservationIds],
        supportingHypothesisIds: [...references.supportingHypothesisIds],
        structuralSignalIds: [...references.structuralSignalIds],
      },
      contextSha256,
      classificationPolicyVersion: input.classificationPolicyVersion,
      priority: priorityOf(facts.signals.significance),
      impact: facts.signals.significance,
      expectedInformationValue: facts.signals.expectedInformationValue,
      relatedEntityIds: [],
      relatedHypothesisIds: [],
      suggestedActions: [...suggestedActions],
      computedAt: input.computedAt,
    });
  } catch (err) {
    throw new GapClassificationError(
      GapClassificationErrorCodes.INVALID_INPUT,
      `classification result rejected by the frozen contract: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return result;
}