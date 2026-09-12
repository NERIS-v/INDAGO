import { describe, it, expect } from 'vitest';
import { applyBudget } from '../src/index.js';

describe('applyBudget', () => {
  it('admits the deterministic prefix within the budget', () => {
    const { kept, dropped, boundReached } = applyBudget(['a', 'b', 'c', 'd'], 1, 3);
    expect(kept).toEqual(['a', 'b']);
    expect(dropped).toEqual(['c', 'd']);
    expect(boundReached).toBe(true);
  });

  it('no bound when everything fits', () => {
    const { kept, dropped, boundReached } = applyBudget(['a', 'b'], 1, 5);
    expect(kept).toEqual(['a', 'b']);
    expect(dropped).toEqual([]);
    expect(boundReached).toBe(false);
  });

  it('already at budget admits nothing and reports the bound', () => {
    const { kept, dropped, boundReached } = applyBudget(['a'], 3, 3);
    expect(kept).toEqual([]);
    expect(dropped).toEqual(['a']);
    expect(boundReached).toBe(true);
  });

  it('over budget admits nothing and reports the bound', () => {
    const { kept, dropped, boundReached } = applyBudget(['a', 'b'], 4, 3);
    expect(kept).toEqual([]);
    expect(dropped).toEqual(['a', 'b']);
    expect(boundReached).toBe(true);
  });

  it('empty candidates keep nothing', () => {
    const { kept, dropped, boundReached } = applyBudget([], 0, 10);
    expect(kept).toEqual([]);
    expect(dropped).toEqual([]);
    expect(boundReached).toBe(false);
  });
});