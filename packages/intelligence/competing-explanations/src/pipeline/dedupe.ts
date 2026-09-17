// ============================================================================
// Competing Explanation Identity + Dedupe (Phase 5A-PR15)
//
// Content-addressed identity (policy §8):
//   explanationId = sha256Hex(canonicalizeDeterministic(identityTuple))
//
// Tuples whose type + core claim + support/contradiction set are identical
// collapse to ONE explanation (policy §15). `canonicalizeDeterministic` sorts
// object keys and string arrays -> input-order independence.
// ============================================================================

import type { CompetingExplanationIdentityV1 } from '@indago/contracts';
import { canonicalizeDeterministic } from '@indago/contracts';
import type { CompetingExplanationBasis, CompetingExplanationType } from '@indago/contracts';
import type { RelationType } from '@indago/contracts';
import type { GapClassificationType } from '@indago/contracts';

import { sha256Hex } from './sha256.js';

/** The (case, version, hole, classification) context every identity binds to. */
export interface ExplanationSetContext {
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly graphHoleId: string;
  /** The PR14 classification type this set competes under (null => no set). */
  readonly classificationType: GapClassificationType | null;
  readonly expectedRelationshipType: RelationType | null;
  readonly policyVersion: 'v1';
}

/** The frozen identity tuple (policy §8). */
export function explanationIdentityFor(
  draft: {
    readonly explanationType: CompetingExplanationType;
    readonly basis: CompetingExplanationBasis;
    readonly supportingObservationIds: readonly string[];
    readonly contradictingObservationIds: readonly string[];
    readonly supportingHypothesisIds: readonly string[];
    readonly contradictingHypothesisIds: readonly string[];
    readonly structuralSignalIds: readonly string[];
  },
  ctx: ExplanationSetContext,
): CompetingExplanationIdentityV1 {
  return {
    caseId: ctx.caseId,
    graphVersionId: ctx.graphVersionId,
    graphHoleId: ctx.graphHoleId,
    classificationType: ctx.classificationType,
    explanationType: draft.explanationType,
    basis: draft.basis,
    expectedRelationshipType: ctx.expectedRelationshipType,
    supportingObservationIds: [...draft.supportingObservationIds],
    supportingHypothesisIds: [...draft.supportingHypothesisIds],
    contradictingObservationIds: [...draft.contradictingObservationIds],
    contradictingHypothesisIds: [...draft.contradictingHypothesisIds],
    structuralSignalIds: [...draft.structuralSignalIds],
    policyVersion: ctx.policyVersion,
  };
}

/** Content-addressed explanation id (policy §8). Order/execution independent. */
export function computeExplanationId(identity: CompetingExplanationIdentityV1): string {
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