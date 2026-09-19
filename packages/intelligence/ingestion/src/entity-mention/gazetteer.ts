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
 * A match resolved by the gazetteer phrase pass — the exact source span plus
 * the injected classification.
 */
export interface GazetteerPhraseMatch {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly entityType: EntityType;
}

/**
 * In-memory gazetteer wrapper. Data is provided at construction time; the
 * matcher performs deterministic, case-folded, whole-phrase lookups.
 *
 * CRITICAL boundary: this structure only ACCEPTS data and looks it up. It
 * never invents entries. A default (built from platform-approved synonym data)
 * may be supplied by the caller; the engine itself never hardcodes more than
 * the zero-entry empty gazetteer.
 */
export interface Gazetteer {
  /** Whole-token lookup (legacy seam; deterministic case-folded exact match). */
  lookup(token: string): EntityType | undefined;
  /**
   * Deterministic full-content phrase pass. Every injected phrase is searched
   * for, word-boundary aware and case-insensitive, independent of the
   * capitalized-run tokenizer — so a multi-name run-on (Neha Kapoor Rohan
   * Singh) is typed at its true spans (Neha Kapoor, Rohan Singh) even though
   * no capitalized-run boundary falls exactly there. Result order and overlap
   * resolution are fixed: start asc, longer phrase preferred at the same
   * start, input order as the final tie-break.
   */
  matchAll(content: string): GazetteerPhraseMatch[];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createGazetteer(entries: readonly GazetteerEntry[]): Gazetteer {
  // Precompute the case-folded index so every lookup is O(1) and the match
  // semantics are identical regardless of the source whitespace/case.
  const index = new Map<string, EntityType>();
  const phrases: { key: string; entityType: EntityType; order: number }[] = [];
  for (const entry of entries) {
    const key = entry.token.trim().toLowerCase().replace(/\s+/g, ' ');
    if (key.length === 0) continue;
    // First entry wins — determinism if data ever contains duplicates.
    if (!index.has(key)) {
      index.set(key, entry.entityType);
      phrases.push({ key, entityType: entry.entityType, order: phrases.length });
    }
  }

  return {
    lookup(token: string): EntityType | undefined {
      return index.get(token.trim().toLowerCase());
    },

    matchAll(content: string): GazetteerPhraseMatch[] {
      if (content.length === 0 || phrases.length === 0) return [];

      // Deterministic raw collection: input order first (matching the first-entry
      // wins index semantics), then overlap resolution by start/longest.
      const raw: { text: string; start: number; end: number; entityType: EntityType }[] = [];
      for (const phrase of phrases) {
        const re = new RegExp(`\\b${escapeRegExp(phrase.key)}\\b`, 'gi');
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          raw.push({
            text: content.slice(m.index, m.index + m[0].length),
            start: m.index,
            end: m.index + m[0].length,
            entityType: phrase.entityType,
          });
        }
      }

      // Overlap resolution: earliest start first; at a tie the longer phrase wins
      // (more precise); input order is the final stable tie-break.
      raw.sort(
        (a, b) =>
          a.start - b.start ||
          (b.end - b.start) - (a.end - a.start),
      );

      const out: GazetteerPhraseMatch[] = [];
      let lastEnd = -1;
      for (const item of raw) {
        if (item.start < lastEnd) continue; // overlaps an already-emitted span
        out.push(item);
        lastEnd = item.end;
      }
      return out.sort((a, b) => a.start - b.start || a.end - b.end);
    },
  };
}

/** A no-op gazetteer: never classifies anything (safe default). */
export const EMPTY_GAZETTEER: Gazetteer = {
  lookup: () => undefined,
  matchAll: () => [],
};
