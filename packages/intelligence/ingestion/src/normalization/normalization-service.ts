// ============================================================================
// Normalization Service (M-A05)
//
// Pure, deterministic canonicalization of a RawExtraction into canonical
// fields + quality metadata + bounded lexical statistics.
//
// HARD RULES:
//   - Deterministic: same input + same config → byte-identical output.
//     No dependence on machine, time, locale, randomness, network, or AI.
//   - Never guesses. AMBIGUOUS → normalizedValue null; UNPARSED/INVALID
//     → normalizedValue null. rawValue is ALWAYS preserved verbatim.
//   - Bounded: field count, field length, and all lexical collections are
//     hard-capped by the explicit versionable NormalizationConfig.
//   - No intelligence: this module creates NO Observation / Entity /
//     Relation / Graph element / Lead / Hypothesis. It is the boundary
//     between RAW MATERIAL and CANONICAL REPRESENTATION (pre-MA06).
//   - No I/O: no storage, no queue, no network, no OCR rerun. OCR confidence
//     from the extraction is only summarized, never recomputed.
//
// Zero direct dependency on Prisma / BullMQ / Redis / Express / UploadThing /
// @indago/platform — this package must stay importable by the pure layer.
// ============================================================================

import type {
  CleanlinessFlags,
  LanguageMetadata,
  LexicalStatistics,
  NormalizationConfig,
  NormalizationProvenance,
  NormalizedExtraction,
  NormalizedField,
  NormalizedValueType,
  OcrQualitySummary,
  QualityMetadata,
  SourceReference,
} from '@indago/contracts';
import {
  DEFAULT_NORMALIZATION_CONFIG,
  NormalizedExtractionSchema,
} from '@indago/contracts';
import type { RawExtraction, XmlNode } from '../extraction/types.js';

export const NORMALIZER_ID = 'indago-text-canonicalizer';
export const NORMALIZER_VERSION = '1.0.0';

// ============================================================================
// Deterministic regex constants
// ============================================================================

const TOKEN_SPLIT_RE = /[^\p{L}\p{N}]+/u;
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const TRAILING_PUNCT_RE = /[.,;:]+$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?([Zz]|[+-]\d{2}:?\d{2})?$/;
const PART_DATE_YMD_RE = /^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})$/;
const PART_DATE_DMY_RE = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/;
const MONTH_YEAR_RE = /^(0?[1-9]|1[0-2])[/.\-](20\d{2})$/;
const NAMED_DMY_RE = /^(\d{1,2})\s+([a-zA-Z]{3,9})\.?,?\s+(\d{4})$/;
const NAMED_MDY_RE = /^([a-zA-Z]{3,9})\.?,?\s+(\d{1,2}),?\s+(\d{4})$/;
const INTEGER_RE = /^[+-]?\d+$/;
const DECIMAL_RE = /^[+-]?\d+\.\d+$/;
const GROUPED_RE = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;
const SCIENTIFIC_RE = /^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/;
const COMMA_AMBIGUOUS_RE = /^\d+,\d+$/;
const CURRENCY_RE = /^([$€£₹¥])\s?([+-]?[\d,]+)(\.\d+)?$/;
const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const URL_RE = /^https?:\/\/\S+$/;
const FRACTION_RE = /^(\d+)\s*\/\s*([1-9]\d*)$/;
const PHONE_LOOSE_RE = /^\+?[\d\s().-]{7,30}$/;

const MONTH_BY_NAME: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DEVANAGARI_RE = /[\u0900-\u097F]/;
const ARABIC_RE = /[\u0600-\u06FF]/;
const CYRILLIC_RE = /[\u0400-\u04FF]/;
const CJK_RE = /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/;
const GREEK_RE = /[\u0370-\u03FF]/;

const ENGLISH_FUNCTION_WORDS = new Set([
  'the', 'and', 'of', 'to', 'in', 'is', 'was', 'that', 'for', 'it', 'with',
  'on', 'as', 'at', 'by', 'from', 'this', 'have', 'are', 'not', 'be', 'an',
  'his', 'her', 'he', 'she', 'they', 'we', 'or', 'but', 'if', 'then', 'has',
  'had', 'were', 'been', 'their', 'there', 'which', 'will', 'would', 'can',
  'could', 'should', 'about', 'after', 'before', 'between', 'during', 'into',
  'over', 'under', 'without', 'also', 'all', 'when', 'where', 'how', 'than',
  'so', 'too', 'our', 'your', 'my', 'its',
]);

const MAX_TREE_DEPTH = 16;

// ============================================================================
// Internal result types
// ============================================================================

interface CanonicalResult {
  readonly normalizedValue: string | null;
  readonly type: NormalizedValueType;
  readonly status: 'NORMALIZED' | 'UNCHANGED' | 'AMBIGUOUS' | 'UNPARSED' | 'INVALID';
  readonly confidence: number;
  readonly transform: Partial<CleanlinessFlags>;
}

interface CandidateField {
  readonly rawValue: string;
  readonly source: SourceReference;
}

interface FieldResult {
  readonly field: NormalizedField;
  readonly clean: string;
  readonly transform: Partial<CleanlinessFlags>;
}

// ============================================================================
// Field collection — bounded, deterministic traversal per format
// ============================================================================

function collectFields(raw: RawExtraction, bounds: NormalizationConfig['bounds']): CandidateField[] {
  const out: CandidateField[] = [];
  const max = bounds.maxFields;

  switch (raw.format) {
    case 'TXT': {
      for (const line of raw.lines) {
        if (out.length >= max) break;
        out.push({
          rawValue: line.text,
          source: {
            kind: 'txt-line',
            detail: {
              lineNumber: line.lineNumber,
              charStart: line.sourceLocation.charStart,
              charEnd: line.sourceLocation.charEnd,
            },
          },
        });
      }
      break;
    }
    case 'PDF': {
      for (const page of raw.pages) {
        if (out.length >= max) break;
        const text = page.spans.map((span) => span.text).join(' ');
        if (text.trim().length === 0) continue;
        out.push({ rawValue: text, source: { kind: 'pdf-page', detail: { pageNumber: page.pageNumber } } });
      }
      break;
    }
    case 'DOCX': {
      for (const section of raw.sections) {
        if (out.length >= max) break;
        if (section.type === 'table') {
          const blockIndex = section.sourceLocation.blockIndex;
          const tableIndex = section.sourceLocation.tableIndex;
          for (let row = 0; row < section.rows.length; row += 1) {
            const rowObj = section.rows[row];
            if (rowObj === undefined) continue;
            for (let cell = 0; cell < rowObj.cells.length; cell += 1) {
              if (out.length >= max) break;
              const cellObj = rowObj.cells[cell];
              if (cellObj === undefined) continue;
              const detail: Record<string, string | number | boolean> = {
                blockIndex,
                rowIndex: row,
                cellIndex: cell,
              };
              if (tableIndex !== undefined) detail.tableIndex = tableIndex;
              out.push({
                rawValue: cellObj.text,
                source: { kind: 'docx-table', detail },
              });
            }
          }
        } else {
          out.push({
            rawValue: section.text,
            source: {
              kind: 'docx-block',
              detail: { blockIndex: section.sourceLocation.blockIndex },
            },
          });
        }
      }
      break;
    }
    case 'CSV': {
      for (const record of raw.records) {
        for (const cell of record.cells) {
          if (out.length >= max) break;
          out.push({
            rawValue: cell.rawValue,
            source: {
              kind: 'csv-cell',
              detail: {
                rowNumber: cell.sourceLocation.rowNumber,
                columnIndex: cell.sourceLocation.columnIndex,
                columnName: cell.sourceLocation.columnName,
              },
            },
          });
        }
      }
      break;
    }
    case 'JSON': {
      collectJsonFields(raw.data, '', out, max, 0);
      break;
    }
    case 'XML': {
      collectXmlFields(raw.root, raw.root.name, out, max, 0);
      break;
    }
    case 'IMAGE': {
      if (raw.extractionMethod === 'ocr') {
        const lines = raw.ocrLines !== undefined
          ? raw.ocrLines.map((line) => line.text)
          : (raw.text ?? '').split('\n');
        for (let i = 0; i < lines.length; i += 1) {
          if (out.length >= max) break;
          const line = lines[i];
          if (line === undefined) continue;
          if (line.trim().length === 0) continue;
          out.push({ rawValue: line, source: { kind: 'ocr-line', detail: { lineNumber: i + 1 } } });
        }
      }
      break;
    }
  }

  return out;
}

function collectJsonFields(
  value: unknown,
  path: string,
  out: CandidateField[],
  max: number,
  depth: number,
): void {
  if (out.length >= max || depth > MAX_TREE_DEPTH) return;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    out.push({
      rawValue: value === null ? 'null' : String(value),
      source: { kind: 'json-root', detail: { path } },
    });
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      collectJsonFields(value[i], path ? `${path}[${i}]` : `[${i}]`, out, max, depth + 1);
    }
    return;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      collectJsonFields(record[key], path ? `${path}.${key}` : key, out, max, depth + 1);
    }
  }
}

function collectXmlFields(
  node: XmlNode,
  path: string,
  out: CandidateField[],
  max: number,
  depth: number,
): void {
  if (out.length >= max || depth > MAX_TREE_DEPTH) return;
  for (const child of node.children) {
    if (out.length >= max) return;
    if (typeof child === 'string') {
      if (child.trim().length === 0) continue;
      out.push({ rawValue: child, source: { kind: 'xml-root', detail: { path } } });
    } else {
      collectXmlFields(child, path ? `${path}.${child.name}` : child.name, out, max, depth + 1);
    }
  }
}

// ============================================================================
// Text cleaning — mechanical, deterministic, order fixed
// ============================================================================

function cleanText(raw: string): { clean: string; transform: Partial<CleanlinessFlags> } {
  const transform: Partial<CleanlinessFlags> = {};
  let s = raw;

  if (s.startsWith('\uFEFF')) {
    s = s.slice(1);
    transform.bomStripped = true;
  }
  if (/\r/.test(s)) {
    s = s.replace(/\r\n?/g, '\n');
    transform.lineEndingsNormalized = true;
  }
  if (CONTROL_CHARS_RE.test(s)) {
    s = s.replace(CONTROL_CHARS_RE, '');
    transform.controlCharsRemoved = true;
  }
  const nfc = s.normalize('NFC');
  if (nfc !== s) {
    s = nfc;
    transform.unicodeNormalized = true;
  }
  const edgeTrimmed = s.trim();
  if (edgeTrimmed !== s || /\s{2,}|\t|\n/.test(s)) {
    s = s.replace(/\s+/g, ' ').trim();
    transform.whitespaceCollapsed = true;
  }

  return { clean: s, transform };
}

// ============================================================================
// Date & time helpers (deterministic, no guessing, no locale)
// ============================================================================

function zeroPad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function isValidDateParts(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function monthFromName(name: string): number | undefined {
  return MONTH_BY_NAME[name.slice(0, 3).toLowerCase()];
}

function detectDate(value: string): CanonicalResult | undefined {
  const isoDate = ISO_DATE_RE.exec(value);
  if (isoDate) {
    const y = Number(isoDate[1]);
    const m = Number(isoDate[2]);
    const d = Number(isoDate[3]);
    if (isValidDateParts(y, m, d)) {
      return { normalizedValue: `${zeroPad(y, 4)}-${zeroPad(m)}-${zeroPad(d)}`, type: 'date', status: 'NORMALIZED', confidence: 1, transform: {} };
    }
    return { normalizedValue: null, type: 'date', status: 'INVALID', confidence: 1, transform: {} };
  }

  const isoDt = ISO_DATETIME_RE.exec(value);
  if (isoDt) {
    const y = Number(isoDt[1]);
    const m = Number(isoDt[2]);
    const d = Number(isoDt[3]);
    const hh = Number(isoDt[4]);
    const mm = Number(isoDt[5]);
    const ss = Number(isoDt[6] ?? '0');
    const ms = Number((isoDt[7] ?? '').padEnd(3, '0').slice(0, 3));
    const zone = isoDt[8];
    if (!isValidDateParts(y, m, d) || hh > 23 || mm > 59 || ss > 59) {
      return { normalizedValue: null, type: 'datetime', status: 'INVALID', confidence: 1, transform: {} };
    }
    if (zone === undefined) {
      return { normalizedValue: null, type: 'datetime', status: 'AMBIGUOUS', confidence: 1, transform: {} };
    }
    if (/^[Zz]$/.test(zone)) {
      return {
        normalizedValue: new Date(Date.UTC(y, m - 1, d, hh, mm, ss, ms)).toISOString(),
        type: 'datetime',
        status: 'NORMALIZED',
        confidence: 1,
        transform: {},
      };
    }
    const zm = /^([+-])(\d{2}):?(\d{2})$/.exec(zone);
    if (!zm || Number(zm[2]!) > 23 || Number(zm[3]!) > 59) {
      return { normalizedValue: null, type: 'datetime', status: 'INVALID', confidence: 1, transform: {} };
    }
    const sign = zm[1] === '-' ? -1 : 1;
    const offsetMinutes = sign * (Number(zm[2]!) * 60 + Number(zm[3]!));
    const utc = Date.UTC(y, m - 1, d, hh, mm, ss, ms) - offsetMinutes * 60000;
    return { normalizedValue: new Date(utc).toISOString(), type: 'datetime', status: 'NORMALIZED', confidence: 1, transform: {} };
  }

  const ymd = PART_DATE_YMD_RE.exec(value);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (isValidDateParts(y, m, d)) {
      return { normalizedValue: `${zeroPad(y, 4)}-${zeroPad(m)}-${zeroPad(d)}`, type: 'date', status: 'NORMALIZED', confidence: 0.9, transform: {} };
    }
    return { normalizedValue: null, type: 'date', status: 'INVALID', confidence: 1, transform: {} };
  }

  const dmy = PART_DATE_DMY_RE.exec(value);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const y = Number(dmy[3]);
    const dmValid = isValidDateParts(y, b, a);
    const mdValid = isValidDateParts(y, a, b);
    if (dmValid && mdValid) {
      return { normalizedValue: null, type: 'date', status: 'AMBIGUOUS', confidence: 1, transform: {} };
    }
    if (dmValid) {
      return { normalizedValue: `${zeroPad(y, 4)}-${zeroPad(b)}-${zeroPad(a)}`, type: 'date', status: 'NORMALIZED', confidence: 0.8, transform: {} };
    }
    if (mdValid) {
      return { normalizedValue: `${zeroPad(y, 4)}-${zeroPad(a)}-${zeroPad(b)}`, type: 'date', status: 'NORMALIZED', confidence: 0.8, transform: {} };
    }
    return { normalizedValue: null, type: 'date', status: 'INVALID', confidence: 1, transform: {} };
  }

  if (MONTH_YEAR_RE.test(value)) {
    return { normalizedValue: null, type: 'date', status: 'AMBIGUOUS', confidence: 1, transform: {} };
  }

  const namedDmy = NAMED_DMY_RE.exec(value);
  if (namedDmy) {
    const month = monthFromName(namedDmy[2]!);
    if (month === undefined) return undefined;
    const d = Number(namedDmy[1]);
    const y = Number(namedDmy[3]);
    if (isValidDateParts(y, month, d)) {
      return { normalizedValue: `${zeroPad(y, 4)}-${zeroPad(month)}-${zeroPad(d)}`, type: 'date', status: 'NORMALIZED', confidence: 0.9, transform: {} };
    }
    return { normalizedValue: null, type: 'date', status: 'INVALID', confidence: 1, transform: {} };
  }

  const namedMdy = NAMED_MDY_RE.exec(value);
  if (namedMdy) {
    const month = monthFromName(namedMdy[1]!);
    if (month === undefined) return undefined;
    const d = Number(namedMdy[2]);
    const y = Number(namedMdy[3]);
    if (isValidDateParts(y, month, d)) {
      return { normalizedValue: `${zeroPad(y, 4)}-${zeroPad(month)}-${zeroPad(d)}`, type: 'date', status: 'NORMALIZED', confidence: 0.9, transform: {} };
    }
    return { normalizedValue: null, type: 'date', status: 'INVALID', confidence: 1, transform: {} };
  }

  return undefined;
}

// ============================================================================
// Type detection & canonicalization
// ============================================================================

function stripLeadingZeros(digits: string): string {
  return digits.replace(/^([+-]?)0+(?=\d)/, '$1');
}

function detectCanonical(clean: string): CanonicalResult {
  if (clean.length === 0) {
    return { normalizedValue: null, type: 'other', status: 'UNPARSED', confidence: 0, transform: {} };
  }

  const dateResult = detectDate(clean);
  if (dateResult) return dateResult;

  if (INTEGER_RE.test(clean)) {
    const normalizedValue = stripLeadingZeros(clean);
    if (normalizedValue !== clean) {
      return { normalizedValue, type: 'integer', status: 'NORMALIZED', confidence: 0.9, transform: {} };
    }
    return { normalizedValue: clean, type: 'integer', status: 'UNCHANGED', confidence: 1, transform: {} };
  }

  if (DECIMAL_RE.test(clean)) {
    const dot = clean.indexOf('.');
    const intPart = stripLeadingZeros(clean.slice(0, dot));
    const fracPart = clean.slice(dot).replace(/0+$/, '');
    const normalizedValue = fracPart === '.' ? intPart : `${intPart}${fracPart}`;
    if (normalizedValue !== clean) {
      return { normalizedValue, type: 'number', status: 'NORMALIZED', confidence: 0.9, transform: {} };
    }
    return { normalizedValue: clean, type: 'number', status: 'UNCHANGED', confidence: 1, transform: {} };
  }

  if (GROUPED_RE.test(clean)) {
    const normalizedValue = stripLeadingZeros(clean.replace(/,/g, ''));
    return { normalizedValue, type: 'number', status: 'NORMALIZED', confidence: 0.8, transform: {} };
  }

  if (SCIENTIFIC_RE.test(clean)) {
    return { normalizedValue: clean, type: 'number', status: 'UNCHANGED', confidence: 1, transform: {} };
  }

  if (COMMA_AMBIGUOUS_RE.test(clean)) {
    return { normalizedValue: null, type: 'number', status: 'AMBIGUOUS', confidence: 1, transform: {} };
  }

  const currency = CURRENCY_RE.exec(clean);
  if (currency) {
    const normalizedValue = stripLeadingZeros(`${currency[2]}${currency[3] ?? ''}`.replace(/,/g, ''));
    return { normalizedValue, type: 'currency', status: 'NORMALIZED', confidence: 0.8, transform: {} };
  }

  if (UUID_RE.test(clean)) {
    const lowered = clean.toLowerCase();
    if (lowered !== clean) {
      return { normalizedValue: lowered, type: 'uuid', status: 'NORMALIZED', confidence: 0.9, transform: {} };
    }
    return { normalizedValue: clean, type: 'uuid', status: 'UNCHANGED', confidence: 1, transform: {} };
  }

  if (EMAIL_RE.test(clean)) {
    const lowered = clean.toLowerCase();
    if (lowered !== clean) {
      return { normalizedValue: lowered, type: 'email', status: 'NORMALIZED', confidence: 0.9, transform: {} };
    }
    return { normalizedValue: clean, type: 'email', status: 'UNCHANGED', confidence: 1, transform: {} };
  }

  if (URL_RE.test(clean)) {
    const trimmed = clean.replace(TRAILING_PUNCT_RE, '');
    if (trimmed !== clean) {
      return { normalizedValue: trimmed, type: 'url', status: 'NORMALIZED', confidence: 0.9, transform: { trailingPunctuationTrimmed: true } };
    }
    return { normalizedValue: clean, type: 'url', status: 'UNCHANGED', confidence: 1, transform: {} };
  }

  if (FRACTION_RE.test(clean)) {
    const normalizedValue = clean.replace(/\s+/g, '');
    return { normalizedValue, type: 'fraction', status: 'NORMALIZED', confidence: 0.7, transform: {} };
  }

  if (PHONE_LOOSE_RE.test(clean)) {
    const digits = clean.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) {
      const normalizedValue = `${clean.startsWith('+') ? '+' : ''}${digits}`;
      if (normalizedValue !== clean) {
        return { normalizedValue, type: 'phone', status: 'NORMALIZED', confidence: 0.8, transform: {} };
      }
      return { normalizedValue, type: 'phone', status: 'UNCHANGED', confidence: 1, transform: {} };
    }
  }

  const trimmed = clean.replace(TRAILING_PUNCT_RE, '');
  if (trimmed !== clean) {
    return { normalizedValue: trimmed, type: 'string', status: 'NORMALIZED', confidence: 1, transform: { trailingPunctuationTrimmed: true } };
  }
  return { normalizedValue: clean, type: 'string', status: 'UNCHANGED', confidence: 1, transform: {} };
}

// ============================================================================
// Lexical statistics — bounded, deterministic
// ============================================================================

function tokenize(text: string, maxTokenLength: number): string[] {
  return text
    .toLowerCase()
    .split(TOKEN_SPLIT_RE)
    .filter((t) => t.length > 0)
    .map((t) => (t.length > maxTokenLength ? t.slice(0, maxTokenLength) : t));
}

function computeLexical(values: readonly string[], config: NormalizationConfig): LexicalStatistics {
  const hints = config.tokenHints;
  const counts = new Map<string, number>();
  const bigramCounts = new Map<string, number>();
  let tokenCount = 0;
  let totalLength = 0;
  let previous = '';

  outer:
  for (const value of values) {
    const tokens = tokenize(value, hints.maxTokenLength);
    for (const token of tokens) {
      if (tokenCount >= hints.maxTokens) break outer;
      if (!counts.has(token) && counts.size >= hints.maxUniqueTokens) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
      tokenCount += 1;
      totalLength += token.length;
      if (previous.length > 0) {
        const bigram = `${previous} ${token}`;
        bigramCounts.set(bigram, (bigramCounts.get(bigram) ?? 0) + 1);
      }
      previous = token;
    }
  }

  const compareDesc = (a: [string, number], b: [string, number]): number =>
    b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

  const topTokens = [...counts.entries()]
    .sort(compareDesc)
    .slice(0, hints.maxTopTokens)
    .map(([token, count]) => ({ token, count }));

  const topBigrams = [...bigramCounts.entries()]
    .sort(compareDesc)
    .slice(0, hints.maxTopBigrams)
    .map(([bigram, count]) => ({ bigram, count }));

  return {
    tokenCount,
    uniqueTokenCount: counts.size,
    averageTokenLength: tokenCount > 0 ? totalLength / tokenCount : 0,
    topTokens,
    topBigrams,
  };
}

// ============================================================================
// Language metadata — quality metadata ONLY, deterministic heuristic
// ============================================================================

function scriptRatio(re: RegExp, sample: string): number {
  let matches = 0;
  for (const ch of sample) {
    if (re.test(ch)) matches += 1;
  }
  return sample.length > 0 ? matches / sample.length : 0;
}

function detectLanguage(values: readonly string[]): LanguageMetadata | undefined {
  const sample = values.join(' ').slice(0, 2000);
  if (sample.length === 0) return undefined;

  const scripts: ReadonlyArray<{ re: RegExp; code: string }> = [
    { re: DEVANAGARI_RE, code: 'hi' },
    { re: ARABIC_RE, code: 'ar' },
    { re: CYRILLIC_RE, code: 'ru' },
    { re: CJK_RE, code: 'zh' },
    { re: GREEK_RE, code: 'el' },
  ];
  for (const script of scripts) {
    const ratio = scriptRatio(script.re, sample);
    if (ratio >= 0.02) {
      return { code: script.code, confidence: Math.min(0.97, 0.9 + ratio / 2) };
    }
  }

  const tokens = tokenize(sample, 128);
  if (tokens.length === 0) return undefined;
  let hits = 0;
  for (const token of tokens) {
    if (ENGLISH_FUNCTION_WORDS.has(token)) hits += 1;
  }
  const ratio = hits / tokens.length;
  if (ratio < 0.04) return undefined;
  return { code: 'en', confidence: Math.min(0.97, 0.5 + ratio) };
}

// ============================================================================
// Quality metadata
// ============================================================================

function buildQuality(
  raw: RawExtraction,
  fields: readonly NormalizedField[],
  cleanliness: CleanlinessFlags,
  language: LanguageMetadata | undefined,
): QualityMetadata {
  const normalized = fields.filter((f) => f.normalizationStatus === 'NORMALIZED').length;
  const unchanged = fields.filter((f) => f.normalizationStatus === 'UNCHANGED').length;
  const ambiguous = fields.filter((f) => f.normalizationStatus === 'AMBIGUOUS').length;
  const unparsed = fields.filter((f) => f.normalizationStatus === 'UNPARSED').length;
  const invalid = fields.filter((f) => f.normalizationStatus === 'INVALID').length;
  const total = fields.length;

  const byCode: Record<string, number> = {};
  for (const warning of raw.warnings) {
    byCode[warning.code] = (byCode[warning.code] ?? 0) + 1;
  }

  const quality: QualityMetadata = {
    completeness: total > 0 ? (normalized + unchanged) / total : 0,
    statusCounts: { normalized, unchanged, ambiguous, unparsed, invalid },
    perFieldConfidence: fields.map((f) => f.confidence),
    cleanliness,
    warnings: { totalCount: raw.warnings.length, byCode },
  };

  if (raw.format === 'IMAGE' && raw.extractionMethod === 'ocr') {
    const lineConfidences = raw.ocrLines !== undefined
      ? raw.ocrLines.map((line) => line.confidence)
      : (raw.ocrConfidence !== undefined ? [raw.ocrConfidence] : []);
    const lineBound = raw.ocrLines !== undefined
      ? raw.ocrLines.length
      : (raw.text !== undefined ? raw.text.split('\n').length : 0);
    const mean = lineConfidences.length > 0
      ? lineConfidences.reduce((sum, c) => sum + c, 0) / lineConfidences.length
      : undefined;
    const min = lineConfidences.length > 0
      ? Math.min(...lineConfidences)
      : undefined;
    const ocr: OcrQualitySummary = {
      applied: true,
      lineCount: lineBound,
      ...(mean !== undefined ? { meanConfidence: mean } : {}),
      ...(min !== undefined ? { minConfidence: min } : {}),
    };
    quality.ocr = ocr;
  }

  if (language) quality.language = language;

  return quality;
}

// ============================================================================
// NormalizationService
// ============================================================================

export class NormalizationService {
  constructor(private readonly defaultConfig: NormalizationConfig = DEFAULT_NORMALIZATION_CONFIG) {}

  /**
   * Normalize a RawExtraction into the canonical NormalizedExtraction.
   * Pure and deterministic — the ONLY output-producing entry point.
   */
  normalize(
    raw: RawExtraction,
    provenance: NormalizationProvenance,
    config: NormalizationConfig = this.defaultConfig,
  ): NormalizedExtraction {
    const bounds = config.bounds;
    const candidates = collectFields(raw, bounds);

    const fields: NormalizedField[] = [];
    const cleanedValues: string[] = [];
    const cleanliness: CleanlinessFlags = {};

    for (const candidate of candidates) {
      if (fields.length >= bounds.maxFields) break;
      const result = canonicalizeField(candidate, bounds);
      fields.push(result.field);
      cleanedValues.push(result.clean);
      mergeFlags(cleanliness, result.transform);
    }

    const language = detectLanguage(cleanedValues);
    const quality = buildQuality(raw, fields, cleanliness, language);
    const lexicalStatistics = computeLexical(cleanedValues, config);

    const extraction: NormalizedExtraction = {
      attemptId: provenance.attemptId,
      artifactId: raw.artifactId,
      investigationId: provenance.investigationId,
      caseId: provenance.caseId,
      normalizerId: NORMALIZER_ID,
      normalizerVersion: NORMALIZER_VERSION,
      config,
      canonicalFields: fields,
      quality,
      lexicalStatistics,
    };

    return NormalizedExtractionSchema.parse(extraction);
  }
}

function canonicalizeField(candidate: CandidateField, bounds: NormalizationConfig['bounds']): FieldResult {
  const rawValue = candidate.rawValue.length > bounds.maxFieldLength
    ? candidate.rawValue.slice(0, bounds.maxFieldLength)
    : candidate.rawValue;

  const { clean, transform } = cleanText(rawValue);
  const detected = detectCanonical(clean);

  const field: NormalizedField = {
    rawValue,
    normalizedValue: detected.normalizedValue,
    type: detected.type,
    normalizationStatus: detected.status,
    confidence: detected.confidence,
    sourceReference: candidate.source,
  };

  return {
    field,
    clean,
    transform: { ...transform, ...detected.transform },
  };
}

function mergeFlags(target: CleanlinessFlags, flags: Partial<CleanlinessFlags>): void {
  for (const key of Object.keys(flags) as Array<keyof CleanlinessFlags>) {
    if (flags[key] === true) target[key] = true;
  }
}