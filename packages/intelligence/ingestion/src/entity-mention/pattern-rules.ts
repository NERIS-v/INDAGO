// ============================================================================
// M-A07 Entity Mention — PATTERN_MATCH rules
//
// Deterministic, code-only regex policy. No AI, no randomness, no hidden
// environment state. Identical content MUST produce identical matches.
//
// This is the FIRST stage of the locked pipeline:
//   PATTERN → GAZETTEER → CONTEXTUAL → HEURISTIC
//
// Each pattern is anchored to a type classification. Only high-precision
// lexical shapes are classified here — anything ambiguous is left for later
// stages or stays untyped (explicit uncertainty over fabricated specificity).
// ============================================================================

import type { EntityType } from '@indago/contracts';

// ============================================================================
// Typed regexes — first pass, matched candidate by candidate.
// ============================================================================

export interface EntityPatternRule {
  readonly entityType: EntityType;
  readonly pattern: RegExp;
}

/**
 * Ordered pattern table. Priority matters: an EMAIL is also a PHONE-shaped
 * fragment? No — these are high-precision and mutually exclusive in practice,
 * but ordering still guarantees determinism (first matching rule classifies).
 */
export const ENTITY_PATTERN_RULES: readonly EntityPatternRule[] = [
  {
    entityType: 'EMAIL',
    // Single, self-contained email address (no surrounding word chars).
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    entityType: 'PHONE',
    // Explicit, mutually-exclusive phone shapes (NOT a universal 9-16 digit
    // matcher — a bare run of 9-16 digits with no +CC prefix and no separator
    // is an account/transaction/identifier, not a phone).
    //
    //   A) +CC prefix:  +91 9876543210, +91-98765-43210, +1 (212) 555-0199
    //   B) (area) code: (123) 456-7890
    //   C) grouped:     123-456-7890, 98765 43210
    //   D) bare 10d:    9876543210  (exactly 10 consecutive digits)
    //
    // Alternative D is guarded by (?<!\d) / (?!\d) so 11-16 digit identifiers
    // like 123456789012 are NOT phones — they fall through to ACCOUNT.
    pattern:
      /(?:\+\d{1,3}[ -]?(?:\d{2,5}[ -]?\d{2,5}(?:[ -]?\d{2,5})?|\d{7,12})|\(\d{1,4}\)[ -]?\d{3,4}[ -]?\d{3,4}|\d{2,5}[ -]\d{2,5}(?:[ -]\d{2,5})?)(?!\d)|(?<!\d)\d{10}(?!\d)/g,
  },
  {
    entityType: 'ACCOUNT',
    // Bank/card/account-shaped alphanumerics: 9-16 digits, or AAAA-1234-5678
    // style IBAN-like runs, or ledger identifiers like ACCT-xxxxx.
    pattern: /\b(?:ACCT[-_ ]?\d+|IBAN[: ]?[A-Z]{2}\d{2}[A-Z0-9]{11,30}|(?:\d{4}[ -]?){3}\d{2,4}|\d{9,16})\b/g,
  },
  {
    entityType: 'DEVICE',
    // Device / IMEI / serial-style identifiers: letters+digits runs.
    pattern: /\b(?:IMEI[: ]?\d{15}|(?:[A-Z]{2,3})[-/]?\d{6,}|(?:SN|Serial)[: ]\s*[A-Z0-9-]{6,})\b/g,
  },
  {
    entityType: 'VEHICLE',
    // Vehicle registration plates: state-code + number (India generic) and
    // VIN-style (17-char alphanumerics excluding I/O/Q).
    pattern: /\b[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{1,3}[ -]?\d{4}\b|\b[0-9A-HJ-NPR-Z]{17}\b/g,
  },
  {
    entityType: 'PERSON',
    // Honorific-prefixed full names, which are high precision.
    pattern: /\b(?:Mr|Mrs|Ms|Dr|Er|Prof|Sri|Smt|Shri)\.[ ]?[A-Z][a-z]+(?:[ ]+[A-Z][a-z]+){1,2}\b/g,
  },
];

// ============================================================================
// Untyped fallback pattern (HEURISTIC_FALLBACK)
//
// Capitalized name-like sequences. Kept SEPARATE from typed rules because
// capitalization alone is too weak to classify PERSON/LOCATION/ORGANIZATION —
// it is the heuristic fallback stage's raw material, not a pattern match.
// ============================================================================

/** Capitalized word runs (2-3 proper-noun-like tokens) — passed to later stages. */
export const CAPITALIZED_NAME_RE =
  /\b[A-Z][a-z]+(?:[ ]+[A-Z][a-z]+){0,2}\b/g;

/**
 * Match all typed patterns over a content string. Deterministic first-offset
 * ordering: results are in document order per the underlying regex global scan.
 * A single span is classified by the FIRST rule that matches it.
 */
export function matchTypedPatterns(content: string): Array<{
  text: string;
  start: number;
  end: number;
  entityType: EntityType;
}> {
  const found: Array<{
    text: string;
    start: number;
    end: number;
    entityType: EntityType;
  }> = [];

  // Build a list of (start, rule, match) then sort by start for document
  // order, preferring earlier start; ties broken by rule order (determinism).
  const raw: Array<{
    start: number;
    end: number;
    text: string;
    entityType: EntityType;
    order: number;
  }> = [];

  ENTITY_PATTERN_RULES.forEach((rule, ruleIndex) => {
    const re = rule.pattern;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      raw.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        entityType: rule.entityType,
        order: ruleIndex,
      });
      if (m[0].length === 0) {
        re.lastIndex += 1; // guard against zero-width infinite loops
      }
    }
  });

  raw.sort((a, b) => a.start - b.start || a.order - b.order);

  // Overlap resolution: a later rule must not split/re-cover an already
  // emitted span. Greedy first-offset emission keeps output deterministic.
  let lastEnd = -1;
  for (const item of raw) {
    if (item.start < lastEnd) continue; // overlaps an already-emitted span
    found.push({ text: item.text, start: item.start, end: item.end, entityType: item.entityType });
    lastEnd = item.end;
  }

  return found;
}
