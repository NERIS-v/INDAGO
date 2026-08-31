// ============================================================================
// M-A07 Entity Mention — HEURISTIC_FALLBACK stage
//
// Deterministic, code-only fallback. A capitalized token that survived PATTERN,
// GAZETTEER, and CONTEXTUAL stages with no type is still a legitimate mention —
// we record it with `entityType` UNDEFINED and extractionMethod
// 'HEURISTIC_FALLBACK'. Explicit uncertainty beats fabricated specificity:
// we never force an ambiguous token into PERSON/LOCATION/ORGANIZATION.
//
// This is the FINAL stage of the pipeline:
//   PATTERN → GAZETTEER → CONTEXTUAL → HEURISTIC
// ============================================================================

import type { ExtractionMethod } from '@indago/contracts';

// Extraction methods are typed elsewhere; this stage always reports the
// fallback method and an UNTYPED candidate.

export const HEURISTIC_METHOD: ExtractionMethod = 'HEURISTIC_FALLBACK';

/**
 * Sanity gate for the heuristic stage: only accept a capitalized token when it
 * plausibly carries entity-like information. Rejects pure noise (single
 * initials, dates, pure digits) that the regexes above failed to type but that
 * clearly is not an entity mention.
 */
export function isPlausibleEntityToken(token: string): boolean {
  const t = token.trim();
  if (t.length < 3) return false;
  // Must contain at least one letter.
  if (!/[A-Za-z]/.test(t)) return false;
  // Reject pure-date and pure-number leftovers.
  if (/^\d[\d./-]*$/.test(t)) return false;
  // Reject single-initial fragments ("J", "A K").
  if (/^[A-Z][. ]?$/.test(t)) return false;
  return true;
}
