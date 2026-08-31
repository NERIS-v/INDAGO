// ============================================================================
// M-A07 Entity Mention — GAZETTEER_MATCH rules
//
// The gazetteer is INJECTED DATA, never hardcoded algorithm logic. It is a
// deterministic lookup table mapping known tokens → an entity type. The lookup
// itself is pure code; the entries come from configuration / ingestion data.
//
// This is the SECOND stage of the pipeline:
//   PATTERN → GAZETTEER → CONTEXTUAL → HEURISTIC
//
// A token that appears verbatim in the gazetteer is classified with the
// gazetteer's type. Tokens not present fall through to the next stage.
// ============================================================================

import type { EntityType } from '@indago/contracts';

export interface GazetteerEntry {
  /** Exact token to match (case-normalized by the matcher, not the data). */
  readonly token: string;
  readonly entityType: EntityType;
}

/**
 * In-memory gazetteer wrapper. Data is provided at construction time; the
 * matcher performs a deterministic case-folded whole-token lookup.
 *
 * CRITICAL boundary: this structure only ACCEPTS data and looks it up. It
 * never invents entries. A default (built from platform-approved synonym data)
 * may be supplied by the caller; the engine itself never hardcodes more than
 * the zero-entry empty gazetteer.
 */
export interface Gazetteer {
  lookup(token: string): EntityType | undefined;
}

export function createGazetteer(entries: readonly GazetteerEntry[]): Gazetteer {
  // Precompute the case-folded index so every lookup is O(1) and the match
  // semantics are identical regardless of the source whitespace/case.
  const index = new Map<string, EntityType>();
  for (const entry of entries) {
    const key = entry.token.trim().toLowerCase();
    if (key.length === 0) continue;
    // First entry wins — determinism if data ever contains duplicates.
    if (!index.has(key)) index.set(key, entry.entityType);
  }

  return {
    lookup(token: string): EntityType | undefined {
      return index.get(token.trim().toLowerCase());
    },
  };
}

/** A no-op gazetteer: never classifies anything (safe default). */
export const EMPTY_GAZETTEER: Gazetteer = {
  lookup: () => undefined,
};
