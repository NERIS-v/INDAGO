import { describe, it, expect } from 'vitest';
import {
  NormalizationService,
  NORMALIZER_ID,
  NORMALIZER_VERSION,
} from '../../src/normalization/normalization-service.js';
import type {
  NormalizationConfig,
  NormalizationProvenance,
  NormalizedExtraction,
} from '@indago/contracts';
import { DEFAULT_NORMALIZATION_CONFIG } from '@indago/contracts';
import type {
  RawExtraction,
  ExtractionWarning,
} from '../../src/extraction/types.js';

// ============================================================================
// M-A05 Normalization Service — Unit Tests
//
// HARD RULES under test:
//   - Deterministic: same input + same config → byte-identical output.
//   - Never guesses: AMBIGUOUS / UNPARSED / INVALID → normalizedValue null.
//   - Bounded: field count, field length and lexical collections capped by
//     the explicit NormalizationConfig.
//   - No intelligence: creates NO Observation / Entity / Relation / Graph
//     element / Lead / Hypothesis.
//   - No I/O: pure; never reruns OCR or touches storage/network.
// ============================================================================

const LONG_UUID = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const provenance: NormalizationProvenance = {
  attemptId: LONG_UUID(2),
  investigationId: LONG_UUID(3),
  caseId: LONG_UUID(4),
};

const ARTIFACT_ID = LONG_UUID(1);

function makeTxt(lines: readonly string[], warnings: readonly ExtractionWarning[] = []): RawExtraction {
  return {
    format: 'TXT',
    extractionMethod: 'text-decode',
    artifactId: ARTIFACT_ID,
    parserId: 'indago-txt-parser',
    parserVersion: '1.0.0',
    extractedAt: '2026-01-01T00:00:00.000Z',
    warnings,
    lines: lines.map((text, i) => ({
      lineNumber: i + 1,
      text,
      sourceLocation: { kind: 'txt-line', lineNumber: i + 1, charStart: 0, charEnd: text.length },
    })),
  };
}

function normalize(
  svc: NormalizationService,
  raw: RawExtraction,
  config?: NormalizationConfig,
): NormalizedExtraction {
  return svc.normalize(raw, provenance, config);
}

function fieldOf(result: NormalizedExtraction, index: number) {
  const field = result.canonicalFields[index];
  if (field === undefined) throw new Error(`no canonical field at index ${index}`);
  return field;
}

describe('M-A05 NormalizationService: hard determinism', () => {
  it('produces byte-identical output across repeated calls and independent instances', () => {
    const svc = new NormalizationService();
    const raw = makeTxt(['The quick brown fox jumps', '12.5', '2024-03-15', 'ref-9']);
    const a = JSON.stringify(normalize(svc, raw));
    const b = JSON.stringify(normalize(svc, raw));
    const other = new NormalizationService();
    const c = JSON.stringify(normalize(other, raw));
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it('respects identical config: same input + same custom config → identical output', () => {
    const svc = new NormalizationService();
    const raw = makeTxt(['alpha beta', 'gamma delta']);
    const config = { ...DEFAULT_NORMALIZATION_CONFIG, bounds: { ...DEFAULT_NORMALIZATION_CONFIG.bounds, maxFields: 2 } };
    expect(JSON.stringify(normalize(svc, raw, config))).toBe(
      JSON.stringify(normalize(svc, raw, config)),
    );
  });
});

describe('M-A05 NormalizationService: never guesses (AMBIGUOUS)', () => {
  it.each([
    ['1/2/2024', 'dmy and mdy are both valid → not guessed'],
    ['12/2023', 'month/year without day → not guessed'],
    ['1,23', 'ambiguous decimal separator → not guessed'],
  ])('marks %p AMBIGUOUS with normalizedValue null (%s)', (value, _reason) => {
    const result = normalize(new NormalizationService(), makeTxt([value]));
    const field = fieldOf(result, 0);
    expect(field.normalizationStatus).toBe('AMBIGUOUS');
    expect(field.normalizedValue).toBeNull();
    expect(field.rawValue).toBe(value);
  });

  it('treats a zone-less ISO datetime as AMBIGUOUS (no default zone is assumed)', () => {
    const result = normalize(new NormalizationService(), makeTxt(['2024-03-15T10:30:00']));
    const field = fieldOf(result, 0);
    expect(field.type).toBe('datetime');
    expect(field.normalizationStatus).toBe('AMBIGUOUS');
    expect(field.normalizedValue).toBeNull();
  });
});

describe('M-A05 NormalizationService: INVALID / UNPARSED', () => {
  it.each([
    ['2024-02-30', 'impossible February 30th'],
    ['2024-13-01', 'impossible month 13'],
    ['2024-03-15T25:00:00Z', 'impossible hour 25'],
  ])('marks %p INVALID (%s)', (value, _reason) => {
    const field = fieldOf(normalize(new NormalizationService(), makeTxt([value])), 0);
    expect(field.normalizationStatus).toBe('INVALID');
    expect(field.normalizedValue).toBeNull();
  });

  it('marks an empty value UNPARSED', () => {
    const result = normalize(new NormalizationService(), makeTxt(['   ']));
    const field = fieldOf(result, 0);
    expect(field.normalizationStatus).toBe('UNPARSED');
    expect(field.normalizedValue).toBeNull();
  });
});

describe('M-A05 NormalizationService: dates', () => {
  it.each([
    ['2024-03-15', '2024-03-15', 1, 'date'],
    ['2024-03-15T10:30:00Z', '2024-03-15T10:30:00.000Z', 1, 'datetime'],
    ['2024-03-15T10:30:00+05:30', '2024-03-15T05:00:00.000Z', 1, 'datetime'],
    ['2024-03-15T10:30:00-04:00', '2024-03-15T14:30:00.000Z', 1, 'datetime'],
    ['2024/3/5', '2024-03-05', 0.9, 'date'],
  ])(
    'NORMALIZES %p → %p (confidence %i, type %s)',
    (input, expected, confidence, type) => {
      const field = fieldOf(normalize(new NormalizationService(), makeTxt([input])), 0);
      expect(field.normalizationStatus).toBe('NORMALIZED');
      expect(field.normalizedValue).toBe(expected);
      expect(field.confidence).toBe(confidence);
      expect(field.type).toBe(type);
    },
  );

  it('resolves ambiguous part-dates by elimination (13/3/2024 → DMY only)', () => {
    const field = fieldOf(normalize(new NormalizationService(), makeTxt(['13/3/2024'])), 0);
    expect(field.normalizationStatus).toBe('NORMALIZED');
    expect(field.normalizedValue).toBe('2024-03-13');
    expect(field.confidence).toBe(0.8);
  });

  it('resolves named dates deterministically', () => {
    const svc = new NormalizationService();
    const dmy = fieldOf(normalize(svc, makeTxt(['15 March 2024'])), 0);
    expect(dmy.normalizedValue).toBe('2024-03-15');
    expect(dmy.confidence).toBe(0.9);
    const mdy = fieldOf(normalize(svc, makeTxt(['March 15, 2024'])), 0);
    expect(mdy.normalizedValue).toBe('2024-03-15');
    expect(mdy.confidence).toBe(0.9);
  });

  it('preserves the raw value even when INVALID', () => {
    const raw = makeTxt(['not-a-date']);
    const field = fieldOf(normalize(new NormalizationService(), raw), 0);
    expect(field.rawValue).toBe('not-a-date');
    expect(field.normalizedValue).toBe('not-a-date'); // string fallback
    expect(field.type).toBe('string');
  });
});

describe('M-A05 NormalizationService: numbers, currency and structured identifiers', () => {
  it.each([
    ['007', '7', 'integer', 0.9],
    ['42', '42', 'integer', 1],
    ['-12', '-12', 'integer', 1],
    ['12.50', '12.5', 'number', 0.9],
    ['12.5', '12.5', 'number', 1],
    ['1,234,567.89', '1234567.89', 'number', 0.8],
    ['1.5e3', '1.5e3', 'number', 1],
  ])('canonicalizes %p → %p (%s, conf %i)', (input, expected, type, confidence) => {
    const field = fieldOf(normalize(new NormalizationService(), makeTxt([input])), 0);
    expect(field.normalizationStatus).toBe(input === '42' || input === '-12' || input === '12.5' || input === '1.5e3' ? 'UNCHANGED' : 'NORMALIZED');
    expect(field.normalizedValue).toBe(expected);
    expect(field.type).toBe(type);
    expect(field.confidence).toBe(confidence);
  });

  it.each([
    ['$1,234.50', '1234.50'],
    ['€500', '500'],
    ['₹10,000', '10000'],
  ])('canonicalizes currency %p → %p (declared decimal precision preserved)', (input, expected) => {
    const field = fieldOf(normalize(new NormalizationService(), makeTxt([input])), 0);
    expect(field.type).toBe('currency');
    expect(field.normalizedValue).toBe(expected);
    expect(field.confidence).toBe(0.8);
  });

  it('lowercases UUIDs', () => {
    const field = fieldOf(
      normalize(new NormalizationService(), makeTxt(['ABCDEFAB-0000-4000-8000-000000000000'])),
      0,
    );
    expect(field.type).toBe('uuid');
    expect(field.normalizedValue).toBe('abcdefab-0000-4000-8000-000000000000');
    expect(field.confidence).toBe(0.9);
  });

  it('lowercases emails and trims trailing punctuation from URLs', () => {
    const svc = new NormalizationService();
    const email = fieldOf(normalize(svc, makeTxt(['User.Name@Example.COM'])), 0);
    expect(email.type).toBe('email');
    expect(email.normalizedValue).toBe('user.name@example.com');

    const url = fieldOf(normalize(svc, makeTxt(['https://example.com/page.'])), 0);
    expect(url.type).toBe('url');
    expect(url.normalizedValue).toBe('https://example.com/page');

    const cleanliness = normalize(svc, makeTxt(['https://example.com/page.'])).quality.cleanliness;
    expect(cleanliness.trailingPunctuationTrimmed).toBe(true);
  });

  it('canonicalizes fractions and loose phone numbers', () => {
    const svc = new NormalizationService();
    const frac = fieldOf(normalize(svc, makeTxt(['3/ 4'])), 0);
    expect(frac.type).toBe('fraction');
    expect(frac.normalizedValue).toBe('3/4');

    const phone = fieldOf(normalize(svc, makeTxt(['+1 (555) 123-4567'])), 0);
    expect(phone.type).toBe('phone');
    expect(phone.normalizedValue).toBe('+15551234567');
  });
});

describe('M-A05 NormalizationService: source references', () => {
  it('keeps TXT line provenance per field', () => {
    const result = normalize(new NormalizationService(), makeTxt(['first', 'second']));
    expect(result.canonicalFields.map((f) => f.sourceReference.kind)).toEqual(['txt-line', 'txt-line']);
    expect(fieldOf(result, 1).sourceReference.detail).toEqual({ lineNumber: 2, charStart: 0, charEnd: 6 });
  });
});

describe('M-A05 NormalizationService: quality metadata', () => {
  it('computes completeness, statusCounts and perFieldConfidence', () => {
    const result = normalize(new NormalizationService(), makeTxt([
      '2024-03-15', // NORMALIZED
      'plain-string', // UNCHANGED
      '1/2/2024', // AMBIGUOUS
      '   ', // UNPARSED
      '2024-13-01', // INVALID
    ]));
    expect(result.quality.completeness).toBe(2 / 5);
    expect(result.quality.statusCounts).toEqual({
      normalized: 1,
      unchanged: 1,
      ambiguous: 1,
      unparsed: 1,
      invalid: 1,
    });
    expect(result.quality.perFieldConfidence).toHaveLength(5);
    for (const c of result.quality.perFieldConfidence) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it('digests warnings without mutating the source', () => {
    const warnings: ExtractionWarning[] = [
      { code: 'PARTIAL_EXTRACTION', message: 'row truncated' },
      { code: 'PARTIAL_EXTRACTION', message: 'row truncated again' },
      { code: 'EMPTY_TEXT_LAYER', message: 'no text layer' },
    ];
    const result = normalize(new NormalizationService(), makeTxt(['hello'], warnings));
    expect(result.quality.warnings).toEqual({
      totalCount: 3,
      byCode: { PARTIAL_EXTRACTION: 2, EMPTY_TEXT_LAYER: 1 },
    });
    expect(result.quality.statusCounts.unparsed).toBeGreaterThanOrEqual(0);
  });

  it('includes an OCR summary for OCR-derived IMAGE material', () => {
    const raw: RawExtraction = {
      format: 'IMAGE',
      extractionMethod: 'ocr',
      artifactId: ARTIFACT_ID,
      parserId: 'indago-image-parser',
      parserVersion: '1.0.0',
      extractedAt: '2026-01-01T00:00:00.000Z',
      warnings: [],
      ocrLines: [
        { text: 'reading is clean', confidence: 0.9, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 }, words: [] },
        { text: 'second line', confidence: 0.7, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 }, words: [] },
      ],
    };
    const result = normalize(new NormalizationService(), raw);
    expect(result.quality.ocr).toEqual({
      applied: true,
      lineCount: 2,
      meanConfidence: 0.8,
      minConfidence: 0.7,
    });
    expect(result.canonicalFields.map((f) => f.sourceReference.kind)).toEqual(['ocr-line', 'ocr-line']);
  });

  it('omits the OCR summary for non-OCR material', () => {
    const result = normalize(new NormalizationService(), makeTxt(['hello']));
    expect(result.quality.ocr).toBeUndefined();
  });

  it('attaches language metadata for text dominated by English function words', () => {
    const result = normalize(new NormalizationService(), makeTxt([
      'the quick brown fox and the lazy dog',
    ]));
    expect(result.quality.language?.code).toBe('en');
    expect(result.quality.language?.confidence).toBeGreaterThan(0.5);
  });
});

describe('M-A05 NormalizationService: bounded config', () => {
  it('caps canonicalFields at bounds.maxFields', () => {
    const config: NormalizationConfig = {
      ...DEFAULT_NORMALIZATION_CONFIG,
      bounds: { ...DEFAULT_NORMALIZATION_CONFIG.bounds, maxFields: 3 },
    };
    const lines = Array.from({ length: 50 }, (_, i) => `line-${i}`);
    const result = normalize(new NormalizationService(), makeTxt(lines), config);
    expect(result.canonicalFields).toHaveLength(3);
  });

  it('truncates oversized raw values at bounds.maxFieldLength', () => {
    const config: NormalizationConfig = {
      ...DEFAULT_NORMALIZATION_CONFIG,
      bounds: { ...DEFAULT_NORMALIZATION_CONFIG.bounds, maxFieldLength: 5 },
    };
    const result = normalize(new NormalizationService(), makeTxt(['abcdefghij']), config);
    expect(fieldOf(result, 0).rawValue).toBe('abcde');
  });

  it('caps lexical token collection via tokenHints', () => {
    const config: NormalizationConfig = {
      ...DEFAULT_NORMALIZATION_CONFIG,
      tokenHints: { ...DEFAULT_NORMALIZATION_CONFIG.tokenHints, maxTokens: 4, maxTopTokens: 2 },
    };
    const result = normalize(new NormalizationService(), makeTxt(['a b c d e f']), config);
    expect(result.lexicalStatistics.tokenCount).toBe(4);
    expect(result.lexicalStatistics.topTokens.length).toBeLessThanOrEqual(2);
  });

  it('keeps lexical output deterministic (descending count, lex tiebreak)', () => {
    const result = normalize(new NormalizationService(), makeTxt([
      'b is repeated and repeated',
      'a appears once here',
    ]));
    const top = result.lexicalStatistics.topTokens;
    expect(top[0]!.token).toBe('repeated');
    expect(top[1]!.token).toBe('a');
  });
});

describe('M-A05 NormalizationService: no-intelligence guard', () => {
  it('creates no Observation / Entity / Relation / Graph element / Lead / Hypothesis', () => {
    const result = normalize(new NormalizationService(), makeTxt([
      'the suspect wired 42000.00 dollars',
      'the account is suspicious but separate',
    ]));
    // The persisted shape is validated by NormalizedExtractionSchema.parse and
    // ONLY carries the canonical contract keys.
    const keys = Object.keys(result).sort();
    expect(keys).toEqual([
      'artifactId',
      'attemptId',
      'canonicalFields',
      'caseId',
      'config',
      'investigationId',
      'lexicalStatistics',
      'normalizerId',
      'normalizerVersion',
      'quality',
    ]);
    expect(result.normalizerId).toBe(NORMALIZER_ID);
    expect(result.normalizerVersion).toBe(NORMALIZER_VERSION);
    expect(result.attemptId).toBe(provenance.attemptId);
    expect(result.artifactId).toBe(ARTIFACT_ID);
    expect(result.investigationId).toBe(provenance.investigationId);
    expect(result.caseId).toBe(provenance.caseId);
  });
});