// ============================================================================
// M-A06 Observation Rules
//
// Deterministic, code-only observation policy. No AI, no randomness, no hidden
// environment state. Identical input MUST produce identical output.
//
// Boundaries:
//   - The extractor creates observations ONLY. It NEVER creates entities,
//     relations, hypotheses, graph objects, leads, or gaps (entityIds=[]).
//   - candidateMentions are lexical hints for MA07 entity resolution. They are
//     NOT entities, entity IDs, hypotheses, or relations.
//   - Type/stength/mentions/observedAt are deterministic heuristics. Never
//     silent fallback to unsupported behavior — unsupported constructs are
//     skipped deterministically and a structured warning is recorded.
//   - NO semantic strengthening: canonical content is the source text,
//     mechanically canonicalized. No hedging is added, but no claim is
//     amplified either.
//   - NO fabricated provenance: offsets/indices are used ONLY when the source
//     actually provides them.
// ============================================================================

import type { EventTime, ObservationType } from '@indago/contracts';
import { TimestampPrecisionSchema } from '@indago/contracts';

// ============================================================================
// Extractor identity (recorded in Observation.provenance.extractor)
// ============================================================================

export const OBSERVATION_EXTRACTOR_ID = 'indago-observation-extractor';
export const OBSERVATION_EXTRACTOR_VERSION = '1.0.0';
export const OBSERVATION_EXTRACTOR_REF = `${OBSERVATION_EXTRACTOR_ID}@${OBSERVATION_EXTRACTOR_VERSION}`;

// ============================================================================
// Strength baselines (locked spec §31)
//
// Mission-declarative baselines, NOT machine-learned probabilities.
// OCR confidence is NEVER used as strength. Source catalog does NOT override
// these baselines. Documented ordering preserved:
//   STRUCTURED (0.7) > NARRATIVE (0.6) > RECONSTRUCTED (0.5)
//
// A sub-component ratio may lower (never raise) below the baseline; the
// baseline itself is the ceiling for its tier.
// ============================================================================

export const STRUCTURED_STRENGTH_BASELINE = 0.7;
export const NARRATIVE_STRENGTH_BASELINE = 0.6;
export const RECONSTRUCTED_STRENGTH_BASELINE = 0.5;

// ============================================================================
// Bounds (hard caps; deterministic truncation, never unbounded output)
// ============================================================================

export const OBSERVATION_BOUNDS = {
  maxObservations: 500,
  maxContentLength: 10000, // ObservationSchema content max
  maxMentions: 50, // ObservationSchema candidateMentions max
  maxMentionLength: 200, // ObservationSchema candidateMentions item max
  minAssertiveLetters: 8,
} as const;

// ============================================================================
// Source-faithful canonicalization
//
// Mechanical only. Whitespace/Unicode canonicalization distinguishes identity;
// it must NOT alter the claim. No modal changes, no paraphrase, no deletion of
// claim content.
// ============================================================================

function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function canonicalizeContent(raw: string, maxLength: number): string {
  let s = raw.normalize('NFC');
  s = s.replace(/\r\n?/g, '\n');
  s = s.replace(/[\t ]+/g, ' ');
  s = s.replace(/\s*\n\s*/g, ' ');
  s = s.trim();
  s = s.replace(/[.,;:]$/, '').trim();
  while (utf8Length(s) > maxLength) {
    s = s.slice(0, -1);
  }
  return s.trim();
}

// ============================================================================
// Triviality / boilerplate filtering
//
// A candidate is "assertive" when it plausibly states a claim about the world.
// Pure punctuation, whitespace, coordinates-only, document boilerplate, and
// meaningless fragments are dropped DETERMINISTICALLY (not silently — they are
// simply not observations).
// ============================================================================

const BOILERPLATE_PATTERN =
  /\b(confidential|privileged|attorney.client|do.not.forward|internal.use.only|document.generated|auto.generated)\b/i;

export function isAssertiveContent(content: string): boolean {
  const letters = content.replace(/[^\p{L}]/gu, '');
  if (letters.length < OBSERVATION_BOUNDS.minAssertiveLetters) return false;
  if (BOILERPLATE_PATTERN.test(content)) return false;
  return true;
}

// A single scalar leaf without any relational context is not an assertion
// (§28: "one field alone does not become a meaningless observation").
const COMMON_LEAF_NAMES = new Set([
  'id', 'id_', 'uid', 'uuid', 'index', 'seq', 'row', 'col', 'column',
  'page', 'source', 'filename', 'file', 'path', 'type', 'format',
  'created', 'updated', 'hash', 'checksum', 'status', 'version',
]);

export function isMeaningfulLeafPath(path: string, value: string): boolean {
  const last = path.split('.').pop() ?? path;
  if (COMMON_LEAF_NAMES.has(last.toLowerCase())) return false;
  if (typeof value !== 'string') return false;
  return isAssertiveContent(value);
}

// ============================================================================
// candidateMentions (§43)
//
// Deterministic lexical extraction, ordering = first-occurrence in the
// canonical content, duplicates removed. Hard-capped at 50 items / 200 chars.
// These are HINTS for MA07 — never resolved entities.
// ============================================================================

const MENTION_STOPWORDS = new Set([
  'the', 'this', 'that', 'these', 'those', 'with', 'from', 'into', 'when',
  'after', 'before', 'using', 'based', 'per', 'and', 'may', 'may be',
]);

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE = /https?:\/\/[^\s'"<>]+/g;
const PHONE_RE = /(?:\+\d{1,3}[ -]?)?(?:\(?\d{3}\)?[ -]?\d{3}[ -]?\d{4}|\d{5,})/g;
const CURRENCY_RE = /[₹$€£]\s?\d[\d,.]*|\d[\d,.]*(?:\s?(?:INR|USD|EUR|GBP|Rs\.?))(?![A-Z])/gi;
const IDENTIFIER_RE = /(?:\b[A-Z]{2,}\d{2,}[A-Z0-9]*\b)|(?:\b\d{9,16}\b)/g;
const CAPITALIZED_RE = /\b[A-Z][a-z]{1,}(?:\s[A-Z][a-z]{1,}){0,2}\b/g;

function collectMentions(content: string, pattern: RegExp, into: Map<string, number>): void {
  for (const m of content.matchAll(pattern)) {
    const token = m[0].trim().slice(0, OBSERVATION_BOUNDS.maxMentionLength);
    if (token.length === 0) continue;
    if (into.has(token)) continue;
    into.set(token, into.size + 1);
  }
}

export function extractCandidateMentions(content: string): string[] {
  const collected = new Map<string, number>();
  collectMentions(content, EMAIL_RE, collected);
  collectMentions(content, URL_RE, collected);
  collectMentions(content, PHONE_RE, collected);
  collectMentions(content, CURRENCY_RE, collected);
  collectMentions(content, IDENTIFIER_RE, collected);

  for (const m of content.matchAll(CAPITALIZED_RE)) {
    const token = m[0].trim();
    if (MENTION_STOPWORDS.has(token.toLowerCase())) continue;
    if (collected.has(token)) continue;
    collected.set(token, collected.size + 1);
  }

  const mentions = [...collected.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([token]) => token)
    .slice(0, OBSERVATION_BOUNDS.maxMentions);

  // Items longer than the schema bound are truncated deterministically.
  return mentions.map((m) =>
    m.length > OBSERVATION_BOUNDS.maxMentionLength
      ? m.slice(0, OBSERVATION_BOUNDS.maxMentionLength)
      : m,
  );
}

// ============================================================================
// observedAt (§41)
//
// Set ONLY when the assertion content itself carries an unambiguous ISO-8601
// timestamp representing the real-world event time. Ambiguous formats
// (DD/MM/YYYY) are NEVER guessed — that would fabricate a timestamp.
// ============================================================================

const OBSERVED_AT_RE =
  /\b(20\d{2}-\d{2}-\d{2})[T ](\d{1,2}:\d{2}(?::\d{2})?)?(Z|[+-]\d{2}:?\d{2})?\b/;

export function detectObservedAt(content: string): EventTime | undefined {
  const m = OBSERVED_AT_RE.exec(content);
  if (!m) return undefined;
  const date = m[1];
  const time = m[2];
  const offset = m[3];
  let value: string;
  let precision: (typeof TimestampPrecisionSchema)['_type'];
  if (time) {
    value = `${date}T${time}${offset ?? ''}`;
    precision = offset ? 'exact' : offset === 'Z' ? 'exact' : 'minute';
  } else {
    value = `${date}T00:00:00Z`;
    precision = 'day';
  }
  return { value, precision };
}

// ============================================================================
// Type inference
//
// Deterministic, priority-ordered. First matching rule wins. Conservative —
// when no class confidently applies, the assertion is FACTUAL; when content is
// not a self-contained assertion it is OTHER. Documented tables, no hidden AI.
// ============================================================================

const COMMUNICATION_RE =
  /\b(called|caller|callee|dial(?:ed)?|messag(?:e|ed|es)|texted|texts?\b|sms|communications|call.record|c-dr)\b/i;
const FINANCIAL_RE =
  /\b(credited|debited|transfer(?:red)?|transaction|payment|deposit(?:ed)?|withdraw(?:al|n)?|balance|amount|invoice|purchase(?:d)?|refund|UTR|remittan|\$\s?\d|[₹€£]\s?\d)\b/i;
const SPATIAL_RE =
  /\b(at the|near\b|located|l[o0]cation|coordinates|gps|address|premises?|building|residence|station|arrived at public)/i;
const TEMPORAL_RE =
  /\b(at \d{1,2}:\d{2}|between \d{1,2}:\d{2}|\d{2}:\d{2} hours|duration|time.range|for \d+ (?:min|hour|day)s?)\b/i;
const IDENTITY_RE =
  /\b(identified as|identity|passport|aadha?r|pan number|national id|id card|driver.?s license|surname|alias\b)\b/i;
const RELATIONAL_RE =
  /\b(married|met with|associated|affiliat|partner|collaborat|belongs|connected to|acquainted|in cahoots|co\.operat)\b/i;
const BEHAVIORAL_RE =
  /\b(visited|travel(?:led|ed|ling)?|purchased|attended|entered|proceeded|departed|arrived at|stayed at|frequented|checked into)\b/i;

/** Rule-ordered type inference. First match wins. */
export function inferObservationType(
  content: string,
  structuredHint?: { readonly relation?: 'communication' | 'financial' | 'spatial_locality' | null },
): ObservationType {
  if (structuredHint?.relation === 'communication') return 'COMMUNICATION';
  if (structuredHint?.relation === 'financial') return 'FINANCIAL';
  if (structuredHint?.relation === 'spatial_locality') return 'SPATIAL';

  if (COMMUNICATION_RE.test(content)) return 'COMMUNICATION';
  if (FINANCIAL_RE.test(content)) return 'FINANCIAL';
  if (SPATIAL_RE.test(content)) return 'SPATIAL';

  const hasDatetime = /20\d{2}-\d{2}-\d{2}[T ]\d{1,2}:\d{2}/.test(content);
  if (hasDatetime && TEMPORAL_RE.test(content)) return 'TEMPORAL';

  if (IDENTITY_RE.test(content)) return 'IDENTITY';
  if (RELATIONAL_RE.test(content)) return 'RELATIONAL';
  if (BEHAVIORAL_RE.test(content)) return 'BEHAVIORAL';

  const isSelfContained =
    /[A-Za-z]{4,} [a-z]{2,} [a-z]{2,}/.test(content) || hasDatetime;
  if (isSelfContained) return 'FACTUAL';
  return 'OTHER';
}

// ============================================================================
// Structured relation hinting (CDR / financial rows, tables)
//
// Column-name heuristics. Never a fabricated relationship — when the row
// carries columns that name a caller and a callee (or counterparties and an
// amount) the relationship exists in the material BY ITSELF.
// ============================================================================

type StructuredRelations = 'communication' | 'financial' | 'spatial_locality' | null;

const COMMUNICATION_COLUMNS = [
  'caller', 'calling', 'from', 'a.party', 'source.number', 'msisdn_a',
] as const;
const CALLEE_COLUMNS = [
  'callee', 'called', 'to', 'b.party', 'destination.number', 'msisdn_b',
] as const;
const TIMESTAMP_COLUMNS = [
  'timestamp', 'datetime', 'call.start', 'event.time', 'date.time', 'initiated', 'time',
] as const;
const FROM_ACCOUNT_COLUMNS = ['from.account', 'sender', 'debit.account', 'dr.account'] as const;
const TO_ACCOUNT_COLUMNS = ['to.account', 'recipient', 'credit.account', 'cr.account', 'beneficiary'] as const;
const AMOUNT_COLUMNS = ['amount', 'value', 'txn.amount', 'credit.amount', 'debit.amount', 'balance'] as const;

export function inferStructuredRelation(
  cells: ReadonlyArray<{ readonly columnName: string; readonly rawValue: string }>,
): StructuredRelations {
  // Column names arrive verbatim from headers (CSV) or cells (DOCX). Both
  // 'caller' and 'CALLER' match; separated conventions 'from_account' /
  // 'from.account' are normalized to a single canonical comparison form.
  const names = cells.map((c) => c.columnName.toLowerCase().replace(/_/g, '.'));
  const hasAny = (cols: readonly string[]) => cols.some((c) => names.includes(c));

  if (hasAny(COMMUNICATION_COLUMNS) && (hasAny(CALLEE_COLUMNS) || hasAny(TIMESTAMP_COLUMNS))) {
    return 'communication';
  }
  if (hasAny(AMOUNT_COLUMNS) && (hasAny(FROM_ACCOUNT_COLUMNS) || hasAny(TO_ACCOUNT_COLUMNS))) {
    return 'financial';
  }
  return null;
}

/**
 * Deterministic row composition. Source-faithful; assertion text is assembled
 * from cell values with explicit column labels — it is a deterministic
 * mechanical reconstruction, never a paraphrase.
 */
export function composeStructuredRow(
  relation: StructuredRelations,
  headerNames: readonly string[],
  values: ReadonlyArray<string | undefined>,
): string {
  const parts: string[] = [];
  const normalizedHeaders = headerNames.map((h) => h.toLowerCase().replace(/_/g, '.'));
  const valueOf = (...names: readonly string[]) => {
    for (const n of names) {
      const idx = normalizedHeaders.indexOf(n);
      if (idx >= 0 && values[idx] !== undefined) return values[idx];
    }
    return undefined;
  };

  if (relation === 'communication') {
    const a = valueOf(...COMMUNICATION_COLUMNS);
    const b = valueOf(...CALLEE_COLUMNS);
    const ts = valueOf(...TIMESTAMP_COLUMNS);
    if (a !== undefined && b !== undefined) parts.push(`${a} called ${b}`);
    else if (a !== undefined) parts.push(`${a} initiated call`);
    if (ts !== undefined) parts.push(`at ${ts}`);
  } else if (relation === 'financial') {
    const from = valueOf(...FROM_ACCOUNT_COLUMNS);
    const to = valueOf(...TO_ACCOUNT_COLUMNS);
    const amt = valueOf(...AMOUNT_COLUMNS);
    if (from !== undefined && to !== undefined) parts.push(`transfer from ${from} to ${to}`);
    else if (to !== undefined) parts.push(`payment to ${to}`);
    else if (from !== undefined) parts.push(`transfer from ${from}`);
    if (amt !== undefined) parts.push(`amount ${amt}`);
  } else {
    for (let i = 0; i < headerNames.length && i < values.length; i += 1) {
      const name = headerNames[i];
      const v = values[i];
      if (v === undefined || v === '' || /^(mostly )?$/.test(v)) continue;
      parts.push(`${name}=${v}`);
    }
  }

  return canonicalizeContent(parts.join(' '), OBSERVATION_BOUNDS.maxContentLength);
}