// ============================================================================
// PR18 — Bounded closed-world context derivation (Phase 5A)
//
// Builds the deterministic lookups PR18 needs to compute the four utility
// components from the certified-chain projection. All hypothesis ids are
// resolved with PR10's OWN reference resolvers (`canonicalHypothesisIdFromDerivedId`)
// so the UUID extraction is byte-identical to PR10 — no second resolver, no
// invented ids. Membership is closed-world against the supplied representation.
// ============================================================================

import type { TemporalInterval } from '@indago/contracts';
import { canonicalHypothesisIdFromDerivedId } from '../references.js';
import type { CandidateUtilityContext } from './types.js';

export interface DerivedCandidateContext {
  /** All represented competing hypothesis UUIDs (supporting ∪ contradicting). */
  readonly allCompetingUuids: readonly string[];
  /** Gap-expectation hypothesis UUIDs (resolved from gapExpectationDerivedIds). */
  readonly gapExpectationUuids: readonly string[];
  /** Per-UUID supporting/contradicting signal counts (for EIG). */
  readonly signalsByUuid: ReadonlyMap<string, { readonly supporting: number; readonly contradicting: number }>;
  /** Per-UUID temporal scope (for relevance temporal fit). */
  readonly temporalScopeByUuid: ReadonlyMap<string, TemporalInterval | null>;
  /** Canonical ids of the supplied observations (grounding). */
  readonly observationIdSet: ReadonlySet<string>;
}

/** Resolve derivedIds to canonical UUIDs, counting unresolvable refs (PR10 rule). */
function resolveDerivedIds(derivedIds: readonly string[]): { uuids: string[]; unresolvable: number } {
  const set = new Set<string>();
  let unresolvable = 0;
  for (const ref of derivedIds) {
    const uuid = canonicalHypothesisIdFromDerivedId(ref);
    if (uuid === null) {
      unresolvable += 1;
      continue;
    }
    set.add(uuid);
  }
  return { uuids: [...set].sort(), unresolvable };
}

/**
 * Derive the deterministic lookups PR18 needs from the bounded context.
 * Pure and input-order independent (ids are sorted/deduped). Never throws —
 * empty signal sets are a valid (low-EIG) input.
 */
export function buildDerivedCandidateContext(context: CandidateUtilityContext): DerivedCandidateContext {
  const allCompeting = new Set<string>();
  const signals = new Map<string, { supporting: number; contradicting: number }>();
  const temporalByUuid = new Map<string, TemporalInterval | null>();

  for (const explanation of context.representedExplanations) {
    const support = resolveDerivedIds(explanation.supportingHypothesisIds);
    const contra = resolveDerivedIds(explanation.contradictingHypothesisIds);

    for (const uuid of support.uuids) {
      allCompeting.add(uuid);
      const sig = signals.get(uuid) ?? { supporting: 0, contradicting: 0 };
      sig.supporting += 1;
      signals.set(uuid, sig);
    }
    for (const uuid of contra.uuids) {
      allCompeting.add(uuid);
      const sig = signals.get(uuid) ?? { supporting: 0, contradicting: 0 };
      sig.contradicting += 1;
      signals.set(uuid, sig);
    }

    const scope: TemporalInterval | null = explanation.temporalScope ?? null;
    for (const uuid of [...support.uuids, ...contra.uuids]) {
      if (!temporalByUuid.has(uuid)) temporalByUuid.set(uuid, scope);
    }
  }

  const gap = resolveDerivedIds(context.gapExpectationDerivedIds ?? []);

  return {
    allCompetingUuids: [...allCompeting].sort(),
    gapExpectationUuids: gap.uuids,
    signalsByUuid: signals,
    temporalScopeByUuid: temporalByUuid,
    observationIdSet: new Set((context.observations ?? []).map((o) => o.id)),
  };
}