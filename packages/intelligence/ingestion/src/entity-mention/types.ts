// ============================================================================
// M-A07 Entity Mention Candidate — shared types
//
// A PURE, deterministic pre-resolution mention generator. M-A07 answers
//   "What entity-like mentions occur in these source-supported observations,
//    and what type might each represent?"
//
// It NEVER answers "which canonical entity is this?" — that is Entity
// Resolution (M-A08+, future). Consequently this module:
//   - extracts typed OR untyped mentions from an Observation
//   - grounds each to the Observation → Evidence → Artifact provenance chain
//   - derives a deterministic identity scoped to
//     (observationId, start, end, entityType, canonicalMatchValue)
//   - does NOT create canonical Entity records
//   - does NOT assign EntityId / ResolutionScore
//   - does NOT merge candidates across observations
//
// Pipeline order is locked: PATTERN → GAZETTEER → CONTEXTUAL → HEURISTIC.
// The gazetteer is INJECTED data — never hardcoded algorithm logic.
// ============================================================================

import type {
  EntityMentionCandidate,
  EntityType,
  ExtractionMethod,
  Observation,
  Provenance,
} from '@indago/contracts';

// ============================================================================
// Inputs and outputs
// ============================================================================

/**
 * Extractable source unit for down-stream processing — a single deterministic
 * mention extracted from an observation's content. `EntityMentionCandidate`
 * (the durable contract) is assembled from these drafts at persistence time
 * (timestamps stamped by the orchestrating worker), mirroring how M-A06 keeps
 * extraction pure and stamps time only at persist.
 */
export interface EntityMentionDraft {
  /** Parent Observation this mention was extracted from */
  readonly observationId: string;
  /** Exact source/surface text of the mention */
  readonly text: string;
  /** Inclusive start offset within the observation content */
  readonly start: number;
  /** Exclusive end offset within the observation content */
  readonly end: number;
  /** Candidate type, or undefined when uncertain */
  readonly entityType?: EntityType;
  /** Categorical method describing how the mention was found */
  readonly extractionMethod: ExtractionMethod;
  /** Optional normalized matching value (distinct from surface text) */
  readonly canonicalMatchValue?: string;
  /**
   * Source-grounded provenance inherited from the Observation. Never
   * fabricated — the mention's provenance IS the observation's provenance
   * (the mention is a span of that same source content).
   */
  readonly provenance: Provenance;
}

/** Result of extracting mentions from one Observation. */
export interface EntityMentionExtractionResult {
  readonly drafts: readonly EntityMentionDraft[];
}

/** Bounds for deterministic, bounded extraction (mirror ObservationSchema). */
export const ENTITY_MENTION_BOUNDS = {
  /** Hard cap on mentions per observation (deterministic truncation). */
  maxMentions: 100,
  /** Hard cap on surface-text length (schema max 200). */
  maxTextLength: 200,
  /** Hard cap on canonical match value length (schema max 200). */
  maxCanonicalLength: 200,
} as const;

export type { EntityMentionCandidate, EntityType, ExtractionMethod, Observation };
