// ============================================================================
// Contradiction Preservation Validator (Phase 5A-PR8)
//
// Validates category: contradiction-preservation.
//
// Gap #7: Strengthened to relevance — only RELEVANT contradictions (those
// whose observationId or hypothesisId is referenced by the analysis) must
// be addressed. Unrelated contradictions (not referenced anywhere in the
// analysis) do NOT require mention.
//
// A relevant contradiction is "addressed" if ANY of:
//   - The observation is in some contradictingObservationIds list
//   - The hypothesis is referenced in a CONTRADICTION-kind reasoning step
//   - candidateAssessment === 'CONTRADICTED'
//   - A CONTRADICTIONS_PRESENT warning is emitted
// ============================================================================

import type { ValidationFinding } from './types.js';
import { VALIDATION_FINDING_CODE } from './types.js';

export function validateContradictionPreservation(
  analysis: {
    readonly candidateAssessment: string;
    readonly contradictingObservationIds: readonly string[];
    readonly warnings: ReadonlyArray<{ readonly code: string }>;
    readonly supportingHypothesisIds: readonly string[];
    readonly missingRelationship: {
      readonly supportingHypothesisIds: readonly string[];
    };
    readonly reasoning: ReadonlyArray<{
      readonly kind: string;
      readonly contradictingObservationIds: readonly string[];
      readonly referencedHypothesisIds: readonly string[];
    }>;
  },
  context: {
    readonly contradictions: ReadonlyArray<{
      readonly id: string;
      readonly observationId: string | null;
      readonly hypothesisId: string | null;
      readonly contradictsObservationId: string | null;
      readonly contradictsHypothesisId: string | null;
    }>;
  },
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  if (context.contradictions.length === 0) return findings;

  // Build the set of observation ids referenced by the analysis anywhere.
  const analysisAllObsIds = new Set(analysis.contradictingObservationIds);
  // (top-level supportingObservationIds not available here — only contradicting
  // is relevant for contradiction addressing. Supporting obs don't address
  // contradictions.)

  // Build the set of hypothesis ids referenced by the analysis.
  const analysisAllHypIds = new Set(analysis.supportingHypothesisIds);
  for (const hypId of analysis.missingRelationship.supportingHypothesisIds) {
    analysisAllHypIds.add(hypId);
  }
  for (const step of analysis.reasoning) {
    for (const hypId of step.referencedHypothesisIds) {
      analysisAllHypIds.add(hypId);
    }
  }

  // Build the set of hypothesis ids in CONTRADICTION-kind steps.
  const contradictionStepHyps = new Set<string>();
  for (const step of analysis.reasoning) {
    if (step.kind === 'CONTRADICTION') {
      for (const hypId of step.referencedHypothesisIds) {
        contradictionStepHyps.add(hypId);
      }
    }
  }

  const hasContradictionWarning = analysis.warnings.some(
    (w) => w.code === 'CONTRADICTIONS_PRESENT',
  );
  const isContradictedAssessment = analysis.candidateAssessment === 'CONTRADICTED';

  for (const contradiction of context.contradictions) {
    // Determine if this contradiction is relevant (referenced by the analysis).
    const isRelevant =
      (contradiction.observationId !== null && analysisAllObsIds.has(contradiction.observationId)) ||
      (contradiction.hypothesisId !== null && analysisAllHypIds.has(contradiction.hypothesisId)) ||
      (contradiction.contradictsHypothesisId !== null &&
        analysisAllHypIds.has(contradiction.contradictsHypothesisId));

    if (!isRelevant) continue;

    // Determine if the relevant contradiction is addressed.
    const obsAddressed =
      contradiction.contradictsObservationId !== null &&
      analysis.contradictingObservationIds.includes(contradiction.contradictsObservationId);

    // A hyp-vs-hyp contradiction is addressed when a CONTRADICTION-kind step
    // references either side of the conflict (the source hypothesisId or the
    // contradicted contradictsHypothesisId).
    const hypAddressed =
      (contradiction.hypothesisId !== null &&
        contradictionStepHyps.has(contradiction.hypothesisId)) ||
      (contradiction.contradictsHypothesisId !== null &&
        contradictionStepHyps.has(contradiction.contradictsHypothesisId));

    if (obsAddressed || hypAddressed || isContradictedAssessment || hasContradictionWarning) {
      continue;
    }

    findings.push({
      code: VALIDATION_FINDING_CODE.CONTRADICTION_IGNORED,
      severity: 'WARNING',
      path: 'analysis',
      referenceId: contradiction.id,
      message:
        `Context contradiction "${contradiction.id}" is relevant (referenced ` +
        'by the analysis) but not addressed — the analysis does not reference ' +
        'the contradicting observation, emit a CONTRADICTIONS_PRESENT warning, ' +
        'or use CONTRADICTED assessment',
    });
  }

  return findings;
}
