// ============================================================================
// Evidence Classification Consistency Validator (Phase 5A-PR8)
//
// Validates category: evidence-classification-consistency.
//
// Reasoning steps carry an epistemic kind. The validator verifies that
// the references within each step are consistent with its declared kind.
// ============================================================================

import type { ValidationFinding } from './types.js';
import { VALIDATION_FINDING_CODE } from './types.js';

export function validateEvidenceClassification(
  reasoning: ReadonlyArray<{
    readonly id: string;
    readonly kind: string;
    readonly supportingObservationIds: readonly string[];
    readonly contradictingObservationIds: readonly string[];
    readonly referencedHypothesisIds: readonly string[];
  }>,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  for (let i = 0; i < reasoning.length; i++) {
    const step = reasoning[i]!;
    const basePath = `analysis.reasoning[${i}]`;
    const hasObsRefs =
      step.supportingObservationIds.length > 0 ||
      step.contradictingObservationIds.length > 0;
    const hasHypRefs = step.referencedHypothesisIds.length > 0;

    switch (step.kind) {
      case 'OBSERVED_FACT':
        if (!hasObsRefs && hasHypRefs) {
          findings.push({
            code: VALIDATION_FINDING_CODE.EVIDENCE_CLASSIFICATION_MISMATCH,
            severity: 'WARNING',
            path: `${basePath}.kind`,
            referenceId: step.id,
            message:
              `Reasoning step "${step.id}" is classified OBSERVED_FACT but only ` +
              'references hypotheses, not observations',
          });
        }
        break;

      case 'HYPOTHESIS':
        if (hasObsRefs && !hasHypRefs) {
          findings.push({
            code: VALIDATION_FINDING_CODE.EVIDENCE_CLASSIFICATION_MISMATCH,
            severity: 'WARNING',
            path: `${basePath}.kind`,
            referenceId: step.id,
            message:
              `Reasoning step "${step.id}" is classified HYPOTHESIS but only ` +
              'references observations, not hypotheses',
          });
        }
        break;

      case 'INFERENCE':
        if (hasObsRefs && !hasHypRefs) {
          findings.push({
            code: VALIDATION_FINDING_CODE.EVIDENCE_CLASSIFICATION_MISMATCH,
            severity: 'WARNING',
            path: `${basePath}.kind`,
            referenceId: step.id,
            message:
              `Reasoning step "${step.id}" is classified INFERENCE but only ` +
              'references observations without hypothesis attribution — inference ' +
              'should be clearly labelled as analyst interpretation',
          });
        }
        break;

      case 'CONTRADICTION':
        if (!hasObsRefs && !hasHypRefs) {
          findings.push({
            code: VALIDATION_FINDING_CODE.EVIDENCE_CLASSIFICATION_MISMATCH,
            severity: 'WARNING',
            path: `${basePath}.kind`,
            referenceId: step.id,
            message:
              `Reasoning step "${step.id}" is classified CONTRADICTION but ` +
              'references neither observations nor hypotheses',
          });
        }
        break;

      default:
        break;
    }
  }

  return findings;
}
