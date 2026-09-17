// ============================================================================
// Candidate identity (Phase 5A-PR17, policy §4/§6)
//
// PR17 REUSES the frozen PR10 identity function
// `canonicalizeNextBestEvidenceRequest` over {gapId, evidenceType,
// discriminatesAmongIds, hypothesisIds}. It NEVER defines a parallel identity
// key — a candidate emitted here slots byte-identically into PR10's
// `NextBestEvidenceCandidateSchema.canonicalRequestKey`.
//
// `discriminatesAmongIds` are the REAL explanation ids (PR15/PR16 content
// addresses) this request would tell apart; `hypothesisIds` are the canonical
// hypothesis UUIDs embedded in those explanations' supporting derivedIds.
// ============================================================================

import {
  canonicalizeNextBestEvidenceRequest,
  type EvidenceType,
} from '@indago/contracts';

export interface CandidateIdentityInput {
  readonly gapId: string;
  readonly evidenceType: EvidenceType;
  readonly discriminatesAmongIds: readonly string[];
  readonly hypothesisIds: readonly string[];
}

/** The canonical content-addressed key of a candidate (PR10 frozen fn). */
export function canonicalRequestKey(input: CandidateIdentityInput): string {
  return canonicalizeNextBestEvidenceRequest({
    gapId: input.gapId,
    evidenceType: input.evidenceType,
    discriminatesAmongIds: input.discriminatesAmongIds,
    hypothesisIds: input.hypothesisIds,
  });
}

/**
 * Extract the canonical hypothesis UUIDs embedded in PR3 atomic derivedIds
 * (e.g. `atomic:RELATION_HYPOTHESIS:<uuid>`). Explanations that carry no
 * resolvable hypothesis refs contribute no hypothesis ids — the identity key
 * is then over an empty hypothesis set (deterministic, never invented).
 */
const HYPOTHESIS_UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function hypothesisIdsFromDerivedIds(derivedIds: readonly string[]): string[] {
  const out = new Set<string>();
  for (const id of derivedIds) {
    const m = id.match(HYPOTHESIS_UUID_RE);
    if (m) out.add(m[0].toLowerCase());
  }
  return [...out].sort();
}

export { sortedUniqueString } from './sorted.js';