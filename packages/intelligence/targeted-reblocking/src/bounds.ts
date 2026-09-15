// ============================================================================
// Targeted Reblocking — deterministic bounding (Phase 5A-PR11)
//
// Every bound is a HARD, deterministic truncation that is always surfaced in
// the accounting. Truncation is never silent: if the cap bites, the caller
// sees boundReached/truncated flags in the run record and audit trail.
//
// Ordering is canonical before slicing so truncation is deterministic and
// yields the same members/candidates/pairs on every identical input.
// ============================================================================

import type { BlockingCandidate, CandidatePairDraft } from '@indago/ingestion';

export interface CandidateBoundary {
  /** Candidates actually fed to M-A08 (slice of the sorted eligible set). */
  readonly processedCandidates: readonly BlockingCandidate[];
  /** eligible − processed (0 when no truncation). */
  readonly truncatedCount: number;
}

/** Truncate the region candidate universe to maxCandidates (canonical id-asc order). */
export function boundCandidates(input: {
  readonly selectedCandidates: readonly BlockingCandidate[];
  readonly maxCandidates: number;
}): CandidateBoundary {
  const selected = input.selectedCandidates;
  const truncatedCount = Math.max(0, selected.length - input.maxCandidates);
  return {
    processedCandidates: truncatedCount > 0
      ? selected.slice(0, input.maxCandidates)
      : selected,
    truncatedCount,
  };
}

export interface PairBoundary {
  /** Pair drafts passed through to persistence (M-A08 canonical pair-key order). */
  readonly drafts: readonly CandidatePairDraft[];
  /** true when the hard MAX_PAIRS bound was reached. */
  readonly truncated: boolean;
}

/** Truncate pair drafts to maxPairs (M-A08 output is already pair-key sorted). */
export function boundPairDrafts(input: {
  readonly drafts: readonly CandidatePairDraft[];
  readonly maxPairs: number;
}): PairBoundary {
  const drafts = input.drafts;
  const truncated = drafts.length > input.maxPairs;
  return {
    drafts: truncated ? drafts.slice(0, input.maxPairs) : drafts,
    truncated,
  };
}