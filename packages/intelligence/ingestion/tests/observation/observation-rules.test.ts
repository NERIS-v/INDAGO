import { describe, it, expect } from 'vitest';
import {
  mergeSameLineSpans,
  Y_TOLERANCE,
  canonicalizeContent,
  repairKnownMojibake,
  isAssertiveContent,
  isMeaningfulStructuredToken,
  detectObservedAt,
  inferObservationType,
} from '../../src/observation/index.js';

// ============================================================================
// M-A06 hardening (Option A) — mergeSameLineSpans
//
// PURE, deterministic visual-line reconstruction. Input order is authoritative
// (the parser guarantees reading order); only ADJACENT spans are compared.
// Two adjacent spans share a visual line when
//     abs(yA - yB) <= max(hA, hB) * Y_TOLERANCE
// ============================================================================

function span(
  text: string,
  y: number,
  h: number,
  start: number,
  end: number,
) {
  return { text, y, h, start, end };
}

describe('mergeSameLineSpans', () => {
  it('merges two spans on the same baseline into one unit', () => {
    const merged = mergeSameLineSpans(
      [span('Address:', 100, 12, 0, 8), span('123 Main St,', 102, 12, 9, 21)],
      Y_TOLERANCE,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.text).toBe('Address: 123 Main St,');
    expect(merged[0]!.start).toBe(0);
    expect(merged[0]!.end).toBe(21);
  });

  it('keeps spans on different baselines as separate units', () => {
    const merged = mergeSameLineSpans(
      [span('Row one.', 100, 12, 0, 9), span('Row two.', 200, 12, 10, 19)],
      Y_TOLERANCE,
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]!.text).toBe('Row one.');
    expect(merged[1]!.text).toBe('Row two.');
  });

  it('merges when drift is exactly at the tolerance boundary', () => {
    // max(hA,hB)=12 → tolerance = 6; drift = 6 is inclusive.
    const merged = mergeSameLineSpans(
      [span('A', 100, 12, 0, 1), span('B', 106, 10, 2, 3)],
      Y_TOLERANCE,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.text).toBe('A B');
  });

  it('keeps spans separate just outside the tolerance', () => {
    // max(hA,hB)=12 → tolerance = 6; drift = 6.1 > 6.
    const merged = mergeSameLineSpans(
      [span('A', 100, 12, 0, 1), span('B', 106.1, 10, 2, 3)],
      Y_TOLERANCE,
    );
    expect(merged).toHaveLength(2);
  });

  it('merges three contiguous same-line spans into one unit', () => {
    const merged = mergeSameLineSpans(
      [
        span('Address:', 100, 12, 0, 8),
        span('123 Main St,', 101, 12, 9, 21),
        span('Mumbai', 103, 12, 22, 28),
      ],
      Y_TOLERANCE,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.text).toBe('Address: 123 Main St, Mumbai');
    expect(merged[0]!.start).toBe(0);
    expect(merged[0]!.end).toBe(28);
  });

  it('does not leapfrog across a span on a different line', () => {
    const merged = mergeSameLineSpans(
      [
        span('First line left.', 100, 12, 0, 16),
        span('Second line.', 200, 12, 17, 29),
        span('First line right.', 100, 12, 30, 47),
      ],
      Y_TOLERANCE,
    );
    expect(merged).toHaveLength(3);
    expect(merged.map((m) => m.text)).toEqual([
      'First line left.',
      'Second line.',
      'First line right.',
    ]);
  });

  it('preserves reading order in the merged output', () => {
    const merged = mergeSameLineSpans(
      [span('z', 100, 12, 0, 1), span('a', 100, 12, 2, 3), span('m', 200, 12, 4, 5)],
      Y_TOLERANCE,
    );
    expect(merged.map((m) => m.text)).toEqual(['z a', 'm']);
  });

  it('joins spans with a single space and leaves canonicalization to the caller', () => {
    const merged = mergeSameLineSpans(
      [span('Field:', 100, 12, 0, 6), span('   spaced  value', 101, 12, 7, 23)],
      Y_TOLERANCE,
    );
    expect(merged).toHaveLength(1);
    expect(canonicalizeContent(merged[0]!.text, 10000)).toBe('Field: spaced value');
  });

  it('reports the merged range as first.start to last.end', () => {
    const merged = mergeSameLineSpans(
      [span('a', 100, 12, 10, 11), span('b', 100, 12, 12, 13), span('c', 100, 12, 14, 15)],
      Y_TOLERANCE,
    );
    expect(merged[0]!.start).toBe(10);
    expect(merged[0]!.end).toBe(15);
  });

  it('keeps blank spans inside a merged unit rather than dropping them early', () => {
    const merged = mergeSameLineSpans(
      [span('', 100, 12, 0, 0), span('Meaningful text.', 101, 12, 1, 17)],
      Y_TOLERANCE,
    );
    expect(merged).toHaveLength(1);
    expect(canonicalizeContent(merged[0]!.text, 10000)).toBe('Meaningful text');
  });

  it('is deterministic for identical input', () => {
    const input = [span('Address:', 100, 12, 0, 8), span('123 Main St,', 101, 12, 9, 21)];
    const a = mergeSameLineSpans(input, Y_TOLERANCE);
    const b = mergeSameLineSpans(input, Y_TOLERANCE);
    expect(a).toEqual(b);
  });

  it('returns no units for an empty input', () => {
    expect(mergeSameLineSpans([], Y_TOLERANCE)).toEqual([]);
  });
});

// ============================================================================
// M-A06 hardening (PR-24, PART 1/3/4/5/11) — canonicalization retention,
// mojibake repair, boilerplate exclusion, timestamp precision, type inference
// ============================================================================

describe('repairKnownMojibake (PART 4)', () => {
  it('repairs the exact known 3-code-point mojibake sequences', () => {
    expect(repairKnownMojibake('A \u0393\u00E5\u00C6 B')).toBe('A \u2192 B');
    expect(repairKnownMojibake('\u0393\u00C7\u00A3quoted\u0393\u00C7\u00A5')).toBe(
      '\u201Cquoted\u201D',
    );
    expect(repairKnownMojibake("Neha\u0393\u00C7\u00D6s")).toBe('Neha\u2019s');
  });

  it('is idempotent and leaves clean text untouched', () => {
    const clean = 'Normal text → with real unicode — and “quotes”.';
    expect(repairKnownMojibake(repairKnownMojibake(clean))).toBe(clean);
  });

  it('is applied at the canonicalization boundary', () => {
    expect(canonicalizeContent('Paid \u0393\u00E5\u00C6 onward', 200)).toBe('Paid → onward');
  });
});

describe('isAssertiveContent / retention (PART 1, PART 5)', () => {
  it('rejects the synthetic-test-evidence banner boilerplate', () => {
    expect(
      isAssertiveContent(
        'SYNTHETIC TEST EVIDENCE - FICTIONAL DATA CREATED FOR INDAGO SOFTWARE TESTING. NOT A REAL PERSON, COMPANY, ACCO Page 1',
      ),
    ).toBe(false);
  });

  it('retains short units that are meaningful structured tokens', () => {
    for (const token of [
      'ORX-102',
      'MT-883',
      'MT-SET-119',
      'BLD-551',
      'NW-882',
      'AX-4471',
      'Invoice 7842',
      'INR 615,000 BLD-551',
    ]) {
      expect(isMeaningfulStructuredToken(token)).toBe(true);
      expect(isAssertiveContent(token)).toBe(true);
    }
  });

  it('still drops short non-structured formatting noise', () => {
    for (const noise of ['OK', 'Nr.', '—', '#', '12', 'Page 1']) {
      expect(isAssertiveContent(noise)).toBe(false);
    }
  });
});

describe('detectObservedAt (PART 3)', () => {
  it('preserves minute precision for "at HH:MM"', () => {
    expect(detectObservedAt('On 2026-08-12 at 08:30 the meeting began.')).toEqual({
      value: '2026-08-12T08:30',
      precision: 'minute',
    });
  });

  it('preserves full ISO timestamps and day-only precision', () => {
    expect(detectObservedAt('Logged 2026-08-12T08:30:00Z.')).toEqual({
      value: '2026-08-12T08:30:00Z',
      precision: 'exact',
    });
    expect(detectObservedAt('Dated 2026-08-12 and filed.')).toEqual({
      value: '2026-08-12T00:00:00Z',
      precision: 'day',
    });
  });
});

describe('inferObservationType (PART 11)', () => {
  it('does not treat the verb "coordinates" as a spatial cue', () => {
    expect(inferObservationType('Rohan Singh coordinates Northstar Warehousing.')).not.toBe(
      'SPATIAL',
    );
  });

  it('still classifies genuine spatial content as SPATIAL', () => {
    expect(inferObservationType('The bag was located at the station.')).toBe('SPATIAL');
  });
});