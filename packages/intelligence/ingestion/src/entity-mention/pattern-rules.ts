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
    entityType: 'DATE',
    // ISO-8601 calendar dates, optionally with a time component. FIRST rule:
    // a 4-2-2 numeric triple is a DATE, never a phone/account digit run. This
    // prevents the PHONE grouped alternative from swallowing "2026-08-12".
    pattern:
      /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g,
  },
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
    // Bank/card/account-shaped alphanumerics: 9-16 digits; AAAA-1234-5678 style
    // IBAN-like runs; ledger identifiers like ACCT-xxxxx; separator-joined
    // reference IDs that contain a digit (AX-4471, MT-883, ORX-102, MT-SET-119);
    // and explicitly labelled transaction references (Reference: MT-SET-119).
    // Every new alternative requires a digit so pure words are never ACCOUNTs.
    //
    // RULE-INTERACTION FIX (PR-31): a document serial number such as
    // "Invoice 7842" is an EVIDENCE identifier, NOT a financial account. The
    // Invoice/Inv alternative was a dimensionality mistake — it promoted a
    // document number into the ACCOUNT pool and, in the golden corpus, drove a
    // CRITICAL financial lead from a fabricated account node. Invoice/Inv are
    // deliberately NOT account-shaped here; a separate DOCUMENT-ID label guard
    // (isAccountLikeSpan) suppresses evidence/document identifiers that the
    // separator-joined alternative would otherwise capture (FS-EV-001…004).
    pattern:
      /\b(?:ACCT[-_ ]?\d+|IBAN[: ]?[A-Z]{2}\d{2}[A-Z0-9]{11,30}|(?:\d{4}[ -]?){3}\d{2,4}|\d{9,16}|(?=[A-Z0-9/-]*\d)[A-Z]{2,6}(?:[-/][A-Z0-9]+)+|(?:[Tt]xn|[Tt]ransaction)\s*[:#-]?\s*[A-Za-z0-9-]*\d[A-Za-z0-9-]*)\b/g,
  },
  {
    entityType: 'ORGANIZATION',
    // Capitalized proper-noun runs ending in a corporate/industry suffix. The
    // suffix is the evidence: a bare capitalized pair is NOT typed here (it
    // falls through to CONTEXTUAL/HEURISTIC) so document headings such as
    // "Bank Transfer Report" are never fabricated into organizations.
    //
    // RULE-INTERACTION FIX (PR-31): the pre-suffix tail was greedy ({0,3} →
    // up to 4 tokens) which silently swallowed a preceding person name —
    // "Neha Kapoor Blue Dusk Logistics" was typed as a single ORGANIZATION and
    // the Neha Kapoor draft was dropped by span dedupe (a contributor to the
    // Arjun/Neha drop). The tail is restricted to a single qualifier token
    // ({0,1}) so a person name plus an organization suffix can NOT collapse
    // into one span: "Neha Kapoor" stays a separate candidate and only the
    // capitalized cluster anchored by the suffix ("Blue Dusk Logistics") is
    // typed ORGANIZATION. This preserves every suffixed name in the corpus
    // (Orion Exports Pvt. Ltd., Meridian Trading LLP, Blue Dusk Logistics,
    // Northstar Warehousing).
    pattern:
      /\b[A-Z][A-Za-z&.'-]+(?:\s+[A-Z][A-Za-z&.'-]+){0,1}\s+(?:LLP|Pvt\.?\s*Ltd\.?|Ltd\.?|Limited|Inc\.?|Corp\.?|Corporation|Company|Co\.?|Enterprises?|Exports?|Logistics|Trading|Warehousing|Solutions|Services|Industries|Technologies|Systems|Holdings|Group)\b/g,
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
 * Document-identifier label guard (RULE-INTERACTION FIX, PR-31).
 *
 * True when a match's START is immediately preceded (bounded window) by an
 * explicit evidence/document identifier label such as "Evidence ID",
 * "Document ID" or "Doc No". An identifier in that syntactic position is a
 * document reference — it must never be classified as a financial ACCOUNT.
 * Deterministic: fixed label vocabulary, word-boundary aware, right-anchored
 * against the match position.
 */
const DOCUMENT_ID_LABEL_RE =
  /\b(?:Evidence|Document|Doc)\s+(?:ID|No\.?|Number)\s*[:|]?\s*$/i;

function isLabeledDocumentId(content: string, start: number): boolean {
  const prefix = content.slice(Math.max(0, start - 48), start);
  return DOCUMENT_ID_LABEL_RE.test(prefix);
}

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
      // RULE-INTERACTION FIX (PR-31): an ACCOUNT-shaped span that is explicitly
      // labelled an evidence/document identifier ("Evidence ID: FS-EV-001") is
      // a document reference, not an account. Suppress rather than mis-type.
      if (rule.entityType === 'ACCOUNT' && isLabeledDocumentId(content, m.index)) {
        continue;
      }
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
