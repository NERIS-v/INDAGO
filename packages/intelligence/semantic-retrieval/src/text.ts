// ============================================================================
// Canonical semantic text (Phase 5A-PR1.5)
//
// The deterministic normalization pipeline applied to EVERY text before it may
// be embedded or retrieved. Determinism requirements:
//   - same input ⇒ same output (no locale, no randomness, no wall-clock)
//   - NFKC Unicode normalization (canonical equivalence)
//   - whitespace is collapsed to single ASCII spaces and trimmed
//   - a text that collapses to empty is REJECTED (never embedded)
//
// NOTE: case is deliberately PRESERVED (case folding is not always faithful and
// embedding models handle case); do not add lower-casing here.
// ============================================================================

import { EmbeddingEngineError } from './types.js';

/** Canonical form embeddable by any provider. Throws when the result is empty. */
export function canonicalizeSemanticText(input: string): string {
  if (typeof input !== 'string') {
    throw new EmbeddingEngineError(
      'EMPTY_SEMANTIC_TEXT',
      'Semantic text must be a string',
    );
  }
  const normalized = input.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (normalized.length === 0) {
    throw new EmbeddingEngineError(
      'EMPTY_SEMANTIC_TEXT',
      'Semantic text collapses to an empty canonical form',
    );
  }
  return normalized;
}