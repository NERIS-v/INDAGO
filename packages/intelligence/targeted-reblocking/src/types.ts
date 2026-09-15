// ============================================================================
// Targeted Reblocking — shared types (Phase 5A-PR11)
//
// PURE domain types for the deterministic targeted-reblock core. Every type
// here is a plain interface; the frozen contract schemas live in
// @indago/contracts (intelligence/targeted-reblock.ts).
// ============================================================================

import type {
  EventTime,
  TargetedReblockRegionReference,
  TargetedReblockPolicyVersion,
  TemporalInterval,
} from '@indago/contracts';
import type {
  BlockingCandidate,
  CandidatePairDraft,
} from '@indago/ingestion';

/**
 * The authoritative region observation set supports two temporal sources:
 * validityInterval (M-A12 D5) and eventTime (M-A12 D1), with observedAt as a
 * fallback. This shape is a deliberate minimal projection of an Observation —
 * the pure core must never depend on the full Observation contract.
 */
export interface RegionObservation {
  readonly id: string;
  readonly eventTime?: EventTime | null;
  readonly observedAt?: EventTime | null;
  readonly validityInterval?: TemporalInterval | null;
}

/** Versioned PR11 policy bounds (defaults to the frozen contracts constants). */
export interface TargetedReblockPolicy {
  readonly version: TargetedReblockPolicyVersion;
  readonly maxRegionObservations: number;
  readonly maxCandidates: number;
  readonly maxPairs: number;
}

/** Deterministic core output after blocking (pre-persistence). */
export interface TargetedReblockCoreOutput {
  /** Fully schema-validated deterministic result (run identity, accounting, provenance). */
  readonly result: Readonly<
    import('@indago/contracts').TargetedReblockResult
  >;
  /** M-A08-generated pair drafts (unfinalized). Persistence is the caller's job. */
  readonly drafts: readonly CandidatePairDraft[];
}

export type { BlockingCandidate, CandidatePairDraft, TargetedReblockRegionReference };