// ============================================================================
// M-A08 Candidate Pair — finalizer
//
// Pure, but requires clock-resolved timestamps from the caller: the blocking
// engine stays deterministic (no clock); the worker supplies observed times at
// persistence. Produces a fully schema-valid CandidatePair with a deterministic
// id — mirrors M-A07 finalizeEntityMention.
// ============================================================================

import { CandidatePairSchema, type CandidatePair } from '@indago/contracts';
import { deterministicCandidatePairId } from './blocking-identity.js';
import type { CandidatePairDraft } from './types.js';

export interface CandidatePairFinalizeInput {
  readonly draft: CandidatePairDraft;
  readonly nowIso: string;
}

export async function finalizeCandidatePair(
  input: CandidatePairFinalizeInput,
): Promise<CandidatePair> {
  const { draft, nowIso } = input;
  const id = await deterministicCandidatePairId({
    caseId: draft.caseId,
    leftCandidateId: draft.leftCandidateId,
    rightCandidateId: draft.rightCandidateId,
  });

  return CandidatePairSchema.parse({
    id,
    caseId: draft.caseId,
    ...(draft.investigationId !== undefined
      ? { investigationId: draft.investigationId }
      : {}),
    leftCandidateId: draft.leftCandidateId,
    rightCandidateId: draft.rightCandidateId,
    blockingPasses: draft.blockingPasses,
    createdAt: { value: nowIso, precision: 'exact' },
  });
}
