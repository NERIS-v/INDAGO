// ============================================================================
// Next-Best-Evidence Runtime — Discrimination Logic (Phase 5A-PR10)
//
// PR10's core purpose: given competing explanations (alternative hypotheses)
// and candidate evidence, identify which explanations each request helps
// distinguish.
//
// "Competing explanations" (PR10) = the EXPLICITLY CONSIDERED representations
// from the PR7 analysis:
//   1. the main gap-expectation hypotheses (analysis.supportingHypothesisIds)
//   2. each alternative explanation's referenced hypotheses
//      (analysis.alternativeExplanations[*].referencedHypothesisIds)
//
// These are advisory PR7 surfaces; PR10 resolves them to canonical UUIDs
// deterministically, validating against the supplied atomic context.
//
// This module does NOT infer discrimination from natural language rationales.
// A candidate without an explicit, validated discrimination target receives
// EIG = 0 (fail-closed: no discrimination claim without verifying hypotheses
// in the supplied context).
// ============================================================================

import type { GraphHoleAnalysisV1 } from '@indago/graph-hole-analysis';
import type { Pr10AtomicHypothesis } from './types.js';
import { resolveDerivedIdsToUuids } from './references.js';

/** The resolved, canonical-UUID representation of all competing explanations. */
export interface CompetingExplanations {
  /** All hypotheses representing the main gap expectation. */
  readonly gapExpectationUuids: string[];
  /** All hypotheses referenced across alternative explanations. */
  readonly alternativeHypothesisUuids: string[];
  /** Union of both sets (sorted unique). This is the "represented competing explanations" set. */
  readonly allCompetingUuids: string[];
  /** Total count of distinct competing explanations (for EIG denominator). */
  readonly count: number;
}

/** Discrimination target resolution result for a single recommended evidence. */
export interface DiscriminationTargetResolution {
  /** Canonical UUIDs of the competing explanations this request targets (validated, subset of competing set). */
  readonly targetUuids: string[];
  /** DerivedIds from the recommendation that did NOT resolve to a valid competing-hypothesis UUID. */
  readonly unresolvableTargets: number;
}

/**
 * Build the set of explicitly considered competing explanations from the PR7
 * analysis, validated against the supplied atomic context.
 *
 * Returns ALL resolved competing hypothesis UUIDs (sorted unique) plus the
 * gap-expectation subset and the alternative-hypothesis subset, both
 * individually available for downstream use (e.g. relevance gapExpectationLink).
 */
export function extractCompetingExplanations(
  analysis: GraphHoleAnalysisV1,
  atomicLookup: ReadonlyMap<string, Pr10AtomicHypothesis>,
): CompetingExplanations {
  // 1. Main gap-expectation hypotheses
  const gapExpectation = resolveDerivedIdsToUuids(
    analysis.supportingHypothesisIds.map((r) => r),
    atomicLookup,
  );

  // 2. Alternative explanation hypotheses (union across all alternatives)
  const altUuids = new Set<string>();
  let totalAltUnresolved = 0;
  for (const alt of analysis.alternativeExplanations) {
    const res = resolveDerivedIdsToUuids(
      alt.referencedHypothesisIds.map((r) => r),
      atomicLookup,
    );
    for (const u of res.resolved) altUuids.add(u);
    totalAltUnresolved += res.unresolvableCount;
  }

  // Union: gap-expectation ∪ alternatives (both are advisory; valid ones enter the competing set)
  const allCompeting = new Set<string>();
  for (const u of gapExpectation.resolved) allCompeting.add(u);
  for (const u of altUuids) allCompeting.add(u);

  return {
    gapExpectationUuids: [...gapExpectation.resolved].sort(),
    alternativeHypothesisUuids: [...altUuids].sort(),
    allCompetingUuids: [...allCompeting].sort(),
    count: allCompeting.size,
  };
}

/**
 * Resolve the explicit discrimination target of a recommended evidence record
 * to canonical UUIDs. Every target UUID is validated against the supplied
 * competing-explanations set: targets NOT in the competing set are dropped
 * (fail-closed — a candidate cannot claim to discriminate among non-represented
 * explanations).
 *
 * Returns resolved target UUIDs (sorted unique) and an unresolvable count.
 */
export function resolveDiscriminationTarget(
  explicitTargetDerivedIds: readonly string[],
  atomicLookup: ReadonlyMap<string, Pr10AtomicHypothesis>,
  competingSet: ReadonlySet<string>,
): DiscriminationTargetResolution {
  // Step 1: deriveIds → UUIDs (closed-world against supplied atomics)
  const fromAtomic = resolveDerivedIdsToUuids(explicitTargetDerivedIds, atomicLookup);

  // Step 2: validate each UUID is in the competing set (closed-world against competing explanations)
  const validated = new Set<string>();
  let unresolvable = fromAtomic.unresolvableCount;

  for (const uuid of fromAtomic.resolved) {
    if (competingSet.has(uuid)) {
      validated.add(uuid);
    } else {
      // UUID exists as a valid atomic but is NOT a represented competing explanation — drop (fail-closed)
      unresolvable += 1;
    }
  }

  return {
    targetUuids: [...validated].sort(),
    unresolvableTargets: unresolvable,
  };
}