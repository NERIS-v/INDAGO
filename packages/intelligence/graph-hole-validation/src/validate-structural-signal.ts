// ============================================================================
// Structural Signal Consistency Validator (Phase 5A-PR8)
//
// Validates category: structural-signal-consistency.
//
// The analysis output's structural claims should be consistent with the
// structural signals supplied in the context.
//
// Additional checks (Gap #4):
//   - STRUCTURAL_SIGNAL reasoning steps with no references (ungrounded
//     structural claims) are flagged as evidence-classification mismatch.
//   - Candidate structuralBasis/regionStatus enum validation (existing).
// ============================================================================

import type { ValidationFinding } from './types.js';
import { VALIDATION_FINDING_CODE } from './types.js';

const VALID_STRUCTURAL_BASIS = new Set([
  'SHARED_HYPOTHESIS_CONTEXT',
  'OBSERVED_NEIGHBOR_CONTEXT',
  'HYPOTHESIS_REFERENCED_NODE',
  'SEED_REFERENCED_NODE',
  'CHAIN_EXPECTED_CONTINUATION',
  'TEMPORAL_DISCONTINUITY',
  'CROSS_COMMUNITY_HYPOTHESIS_CONTEXT',
  'EXPECTED_PATH_BROKEN',
]);

const VALID_REGION_STATUS = new Set([
  'SATURATED',
  'LIMITED',
  'DEGRADED',
  'EMPTY',
  'DISABLED',
  'REJECTED',
]);

export function validateStructuralSignalConsistency(
  context: {
    readonly candidate: {
      readonly structuralBasis: string;
      readonly regionStatus: string;
      readonly holeType: string;
    };
    readonly structuralSignals: ReadonlyArray<{
      readonly id: string;
      readonly kindLabel: string;
    }>;
  },
  reasoning: ReadonlyArray<{
    readonly id: string;
    readonly kind: string;
    readonly supportingObservationIds: readonly string[];
    readonly contradictingObservationIds: readonly string[];
    readonly referencedHypothesisIds: readonly string[];
  }> = [],
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  if (!VALID_STRUCTURAL_BASIS.has(context.candidate.structuralBasis)) {
    findings.push({
      code: VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY,
      severity: 'ERROR',
      path: 'context.candidate.structuralBasis',
      referenceId: context.candidate.structuralBasis,
      message: `Unknown structural basis "${context.candidate.structuralBasis}"`,
    });
  }

  if (!VALID_REGION_STATUS.has(context.candidate.regionStatus)) {
    findings.push({
      code: VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY,
      severity: 'ERROR',
      path: 'context.candidate.regionStatus',
      referenceId: context.candidate.regionStatus,
      message: `Unknown region status "${context.candidate.regionStatus}"`,
    });
  }

  // Gap #4: STRUCTURAL_SIGNAL reasoning steps with no references.
  for (let i = 0; i < reasoning.length; i++) {
    const step = reasoning[i]!;
    if (step.kind !== 'STRUCTURAL_SIGNAL') continue;
    const hasRefs =
      step.supportingObservationIds.length > 0 ||
      step.contradictingObservationIds.length > 0 ||
      step.referencedHypothesisIds.length > 0;
    if (!hasRefs) {
      findings.push({
        code: VALIDATION_FINDING_CODE.EVIDENCE_CLASSIFICATION_MISMATCH,
        severity: 'WARNING',
        path: `analysis.reasoning[${i}].kind`,
        referenceId: step.id,
        message:
          `Reasoning step "${step.id}" is classified STRUCTURAL_SIGNAL but ` +
          'references neither observations nor hypotheses — structural claims ' +
          'must be grounded in the supplied context',
      });
    }
  }

  return findings;
}
