import { describe, expect, it } from 'vitest';
import { clamp01, round6, normalizeScore, mean, scoreRankToken } from '../src/determinism.js';

describe('determinism helpers', () => {
  it('clamp01 bounds values to [0,1] and rejects non-finite', () => {
    expect(clamp01(-0.1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('round6 rounds to exactly 6 decimals', () => {
    expect(round6(0.7693333333)).toBe(0.769333);
    expect(round6(0.4066666666)).toBe(0.406667);
    expect(round6(1)).toBe(1);
  });

  it('normalizeScore is clamp + round in one deterministic step', () => {
    expect(normalizeScore(-5)).toBe(0);
    expect(normalizeScore(0.7693333333)).toBe(0.769333);
    expect(normalizeScore(7)).toBe(1);
  });

  it('mean is stable and returns 0 for empty input', () => {
    expect(mean([])).toBe(0);
    expect(mean([0.5, 0.5])).toBe(0.5);
    expect(mean([2, 4, 6])).toBe(4);
  });

  it('scoreRankToken embeds descending order as ascending tokens', () => {
    const high = scoreRankToken(0.9);
    const low = scoreRankToken(0.2);
    expect(high).toBe('0.100000');
    expect(low).toBe('0.800000');
    expect(high < low).toBe(true);
    expect(scoreRankToken(0.7)).toBe('0.300000');
  });
});