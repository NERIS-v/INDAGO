// ============================================================================
// ER-Split Explanation Identity + Dedupe (Phase 5A-PR16, policy §8/§15)
//
// Content-addressed identity: explanationId = sha256Hex(canonicalizeDeterministic(identityTuple)).
//   { caseId, graphVersionId, graphHoleId, candidatePairId, policyVersion }
// CandidatePairId already canonicalizes pair orientation (deterministic
// left<right), so a swapped input collapses to the same pair and the same id.
// Duplicate rows (identical identity) are dropped before ranking/bounding.
// ============================================================================

import { canonicalizeDeterministic } from '@indago/contracts';
import type { CandidatePair } from '@indago/contracts';

import { CONSUMED_ER_SPLIT_POLICY_VERSION } from '../contracts/er-split-policy.js';
import { sha256Hex } from './sha256.js';

/** The frozen identity tuple (policy §8). */
export interface ErSplitExplanationIdentityTuple {
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly graphHoleId: string;
  readonly candidatePairId: string;
  readonly policyVersion: 'v1';
}

/** The frozen identity tuple (policy §8). */
export function explanationIdentityFor(
  pair: CandidatePair,
  ctx: { readonly caseId: string; readonly graphVersionId: string; readonly graphHoleId: string },
): ErSplitExplanationIdentityTuple {
  return {
    caseId: ctx.caseId,
    graphVersionId: ctx.graphVersionId,
    graphHoleId: ctx.graphHoleId,
    candidatePairId: pair.id,
    policyVersion: CONSUMED_ER_SPLIT_POLICY_VERSION,
  };
}

/** Content-addressed explanation id (policy §8). Order/execution independent. */
export function computeExplanationId(identity: ErSplitExplanationIdentityTuple): string {
  return sha256Hex(canonicalizeDeterministic(identity));
}

/** Dedupe by content-addressed id; first occurrence wins (policy §15). */
export function dedupeByExplanationId<T extends { readonly explanationId: string }>(
  candidates: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of candidates) {
    if (seen.has(c.explanationId)) continue;
    seen.add(c.explanationId);
    out.push(c);
  }
  return out;
}