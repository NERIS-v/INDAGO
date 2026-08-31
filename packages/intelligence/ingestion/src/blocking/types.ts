// ============================================================================
// M-A08 Candidate Pair — shared blocking types and bounds
//
// Blocking answers "which candidates are worth comparing?" — it provides a
// deterministic, bounded COMPARISON UNIVERSE. It never answers "are these the
// same entity?" — that is Entity Resolution (M-A09, future).
// ============================================================================

import type {
  BlockingPass,
  CandidatePair,
  EntityMentionCandidate,
  EntityType,
} from '@indago/contracts';

/**
 * The single durable source a blocking pass consumes. The engine operates on
 * EntityMentionCandidates only — never on raw text, artifacts, or the legacy
 * Observation.candidateMentions string[].
 */
export type BlockingCandidate = EntityMentionCandidate;

/**
 * Bounds that keep blocking strictly bounded and deterministic. Chosen to be
 * conservative relative to ENTITY_MENTION_BOUNDS (max 100 mentions) — a block
 * larger than maxBlockSize is considered pathological and is SKIPPED for that
 * pass (never expanded to N² pairs).
 */
export const CANDIDATE_PAIR_BOUNDS = {
  /** Hard cap on candidates per block; oversized blocks are skipped. */
  maxBlockSize: 50,
  /** Hard cap on discovery passes recorded on a single pair. */
  maxPassesPerPair: 100,
} as const;

/** A fully-formed-but-unfinalized pair. The durable CandidatePair (with a
 * deterministic id and timestamps) is assembled from these at persistence
 * time by the orchestrating worker — mirroring M-A07's draft/finalize split. */
export interface CandidatePairDraft {
  readonly leftCandidateId: string;
  readonly rightCandidateId: string;
  readonly caseId: string;
  readonly investigationId?: string;
  readonly blockingPasses: readonly BlockingPass[];
}

export interface BlockingMetrics {
  candidatesConsidered: number;
  blocksGenerated: number;
  blocksSkippedOversized: number;
  pairsPerPass: Readonly<Record<BlockingPass, number>>;
  uniquePairsAfterUnion: number;
  rejectedSameObservation: number;
}

export interface BlockingResult {
  readonly drafts: readonly CandidatePairDraft[];
  readonly metrics: BlockingMetrics;
}

export interface BlockingConfig {
  /**
   * Whether two candidates from the SAME Observation may form a pair.
   * Default false: repeated identical mentions within one observation are NOT
   * compared (no meaningless self-corroboration pairs).
   */
  readonly allowSameObservationPairs?: boolean;
}

export type { CandidatePair, EntityType };
