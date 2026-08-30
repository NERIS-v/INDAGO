import { describe, it, expect } from 'vitest';
import {
  mergeSameLineSpans,
  Y_TOLERANCE,
  canonicalizeContent,
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