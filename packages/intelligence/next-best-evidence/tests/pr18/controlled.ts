// Controlled PR18 inputs for deterministic unit tests (ranking/dedup/selection).
// Uses synthetic canonicalRequestKeys to isolate ranking/dedup mechanics; the
// real PR10-identity integration is covered in integration.test.ts.

import type { CandidateEvidenceRequest, CandidateUtilityContext, CandidateEvidenceSelectionInput } from '../../src/pr18/types.js';
import { GAP_ID, INVESTIGATION_ID, OBSERVED_AT } from './fixtures.js';

export const H1 = '11111111-1111-1111-1111-111111111111';
export const H2 = '22222222-2222-2222-2222-222222222222';

export const CTX: CandidateUtilityContext = {
  gapTemporalScope: null,
  representedExplanations: [
    { supportingHypothesisIds: [`atomic:RELATION_HYPOTHESIS:${H1}`], contradictingHypothesisIds: [], temporalScope: null },
    { supportingHypothesisIds: [`atomic:RELATION_HYPOTHESIS:${H2}`], contradictingHypothesisIds: [], temporalScope: null },
  ],
  observations: [],
};

export function mkCandidate(
  key: string,
  opts: { evidenceType?: CandidateEvidenceRequest['evidenceType']; hypothesisIds?: string[]; discriminatesAmongIds?: string[]; description?: string } = {},
): CandidateEvidenceRequest {
  const discriminates = opts.discriminatesAmongIds ?? [];
  return {
    canonicalRequestKey: key,
    gapId: GAP_ID,
    evidenceType: opts.evidenceType ?? 'RECORD',
    discriminatesAmongIds: [...discriminates],
    hypothesisIds: [...(opts.hypothesisIds ?? [])],
    rationale: 'rationale',
    description: opts.description ?? 'description',
    discriminationKind: 'COMPETING_PAIR',
    temporalScope: null,
    sourceExplanationIds: [...discriminates],
    supportingObservationIds: [],
    structuralSignalIds: [],
  };
}

export function mkInput(candidateRequests: readonly CandidateEvidenceRequest[], overrides: Partial<CandidateEvidenceSelectionInput> = {}): CandidateEvidenceSelectionInput {
  return {
    investigationId: INVESTIGATION_ID,
    gapId: GAP_ID,
    candidateRequests,
    context: CTX,
    policyVersion: 'v1',
    computedAt: OBSERVED_AT,
    ...overrides,
  };
}