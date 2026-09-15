// ============================================================================
// Determinism helpers tests (clamp/round discipline)
// ============================================================================

import { describe, expect, it } from 'vitest';
import { clamp01, round6, normalizeScore, mean } from '../src/determinism.js';

describe('clamp01', () => {
  it('bounds and fail-closes', () => {
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('round6', () => {
  it('rounds to exactly 6 decimals', () => {
    expect(round6(1 / 3)).toBe(0.333333);
    expect(round6(0.16666666666666666)).toBe(0.166667);
    expect(round6(-0.166666666)).toBe(-0.166667);
  });
});

describe('normalizeScore', () => {
  it('applies clamp01 then round6', () => {
    expect(normalizeScore(1.234567)).toBe(1);
    expect(normalizeScore(0.65099995)).toBe(0.651);
  });
});

describe('mean', () => {
  it('is stable order-insensitive', () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(mean([3, 1, 2])).toBe(2);
    expect(mean([])).toBe(0);
  });
});