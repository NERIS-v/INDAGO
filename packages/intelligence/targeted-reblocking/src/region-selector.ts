// ============================================================================
// Targeted Reblocking — region candidate selector (Phase 5A-PR11)
//
// The ONLY rule deciding which EntityMentionCandidates legitimately belong to
// a targeted reblock universe:
//
//   candidate.observationId ∈ regionMemberObservationIds
//
// No fuzzy matching, no embeddings, no LLM judgment, no undocumented
// heuristics, no "nearby" thresholds. Ordering is canonical: candidate id asc
// (the same canonical order used by entityMentionStore.listByCase).
//
// Case isolation is enforced by the CALLER loading candidates via case-scoped
// DB stores; this selector additionally requires every candidate's
// observationId to be an explicit member — so an injected candidate whose
// observation is outside the region can never enter the universe.
// ============================================================================

import type { BlockingCandidate } from '@indago/ingestion';

export interface RegionCandidateSelection {
  /** Region-member candidates sorted by id asc (deduplicated). */
  readonly selectedCandidates: readonly BlockingCandidate[];
  /** Selected count (eligible). */
  readonly eligibleCount: number;
  /** universe candidates that were NOT region members (defensive rejects). */
  readonly excludedCount: number;
}

export function selectCandidatesForRegion(input: {
  readonly memberObservationIds: readonly string[];
  readonly candidates: readonly BlockingCandidate[];
}): RegionCandidateSelection {
  const memberSet = new Set<string>(input.memberObservationIds);

  const unique = new Map<string, BlockingCandidate>();
  for (const candidate of input.candidates) {
    if (!memberSet.has(candidate.observationId)) continue;
    unique.set(candidate.id, candidate);
  }

  const selected = [...unique.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  return {
    selectedCandidates: selected,
    eligibleCount: selected.length,
    excludedCount: input.candidates.length - selected.length,
  };
}