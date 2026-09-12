// ============================================================================
// Lead identity
//
// A Lead's id is a deterministic UUID derived from
// (caseId, sourceCandidateType, sourceCandidateKey) — mirroring the identity
// discipline used everywhere else in INDAGO (Relation.relationKey,
// deterministicEntityId, deterministicRelationHypothesisId, ...): re-running
// lead generation over an UNCHANGED candidate reproduces the SAME lead id,
// so generation is idempotent (upsert, never a duplicate row) rather than
// minting a fresh lead on every pass over the same graph state.
//
// sourceCandidateKey is caller-supplied and MUST itself be a stable,
// deterministic identity for the candidate (see each build*LeadDraft
// function for how it is derived per candidate type — e.g. a bridge's edge
// id, a burst's node+window, a community's sorted member set, a cross-case
// match's case+entity pair).
// ============================================================================

import { computeContentHash, bytesToUuid4 } from '@indago/ingestion';
import type { LeadSourceCandidateType } from '@indago/contracts';

export const LEAD_IDENTITY_NAMESPACE = 'indago:lead:v1';

export interface LeadIdentityInput {
  readonly caseId: string;
  readonly sourceCandidateType: LeadSourceCandidateType;
  readonly sourceCandidateKey: string;
}

/**
 * Build the canonical identity key string for a lead. Exposed for callers
 * that need the raw key (e.g. for logging/debugging) as well as the derived
 * UUID.
 */
export function buildLeadIdentityKey(input: LeadIdentityInput): string {
  return [
    LEAD_IDENTITY_NAMESPACE,
    input.caseId,
    input.sourceCandidateType,
    input.sourceCandidateKey,
  ].join('|');
}

/**
 * Derive the deterministic Lead UUID from its identity key. Same input ->
 * same output, always (SHA-256 of the identity key, coerced into UUID v4
 * shape — same construction as deterministicEntityId /
 * deterministicRelationHypothesisId).
 */
export async function deterministicLeadId(input: LeadIdentityInput): Promise<string> {
  const digest = await computeContentHash(new TextEncoder().encode(buildLeadIdentityKey(input)));
  const hexPairs = digest.slice(0, 32).match(/.{1,2}/g) ?? [];
  const bytes = hexPairs.map((h) => parseInt(h, 16));
  return bytesToUuid4(bytes);
}
