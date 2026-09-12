import { describe, it, expect } from 'vitest';
import {
  SATURATION_DEFINITION_V1,
  isRoundSatisfying,
  noveltyRatio,
  saturationStatusOf,
  SaturationTracker,
} from '../src/index.js';
import type { RoundNoveltyInput } from '../src/index.js';

const definition = SATURATION_DEFINITION_V1;

function round(round: Partial<RoundNoveltyInput> = {}): RoundNoveltyInput {
  return {
    addedObservations: 0,
    totalObservations: 1,
    addedNodes: 0,
    totalNodes: 1,
    budgetBoundReached: false,
    ...round,
  };
}

describe('noveltyRatio', () => {
  it('is null when the total is zero (indeterminate)', () => {
    expect(noveltyRatio(0, 0)).toBeNull();
    expect(noveltyRatio(3, 0)).toBeNull();
  });

  it('Zero added → zero (same as an observed low-novelty round)', () => {
    expect(noveltyRatio(0, 4)).toBe(0);
    expect(noveltyRatio(0, 1)).toBe(0);
  });

  it('fractional novelty', () => {
    expect(noveltyRatio(2, 4)).toBeCloseTo(0.5, 10);
    expect(noveltyRatio(0, 1)).toBeCloseTo(0, 10);
  });
});

describe('isRoundSatisfying', () => {
  it('respects the frozen 0.10 threshold on both axes', () => {
    expect(
      isRoundSatisfying(round({ addedNodes: 15, totalNodes: 100 }), definition),
    ).toBe(false);
    expect(
      isRoundSatisfying(round({ addedNodes: 5, totalNodes: 100, addedObservations: 1, totalObservations: 100 }), definition),
    ).toBe(true);
  });

  it('never counts a budget-bound round', () => {
    expect(isRoundSatisfying(round({ budgetBoundReached: true }), definition)).toBe(false);
  });

  it('a zero-denominator axis makes the round unsatisfying (never low-novelty grace)', () => {
    expect(
      isRoundSatisfying({ addedObservations: 0, totalObservations: 0, addedNodes: 0, totalNodes: 4, budgetBoundReached: false }, definition),
    ).toBe(false);
  });

  it('an untouched node axis can satisfy when the entity-less region has no nodes', () => {
    expect(
      isRoundSatisfying(round({ addedObservations: 0, totalObservations: 5, addedNodes: 0, totalNodes: 0 }), definition),
    ).toBe(false);
  });
});

describe('saturationStatusOf', () => {
  it('is not saturated with fewer than 2 consecutive satisfying rounds', () => {
    const status = saturationStatusOf(
      [
        round({ addedNodes: 3, totalNodes: 4 }),
        round(), // first satisfying round
      ],
      definition,
    );
    expect(status.saturated).toBe(false);
    expect(status.consecutiveSatisfyingRounds).toBe(1);
  });

  it('reports saturated after two consecutive satisfying rounds', () => {
    const status = saturationStatusOf(
      [
        round({ addedNodes: 3, totalNodes: 4 }),
        round(),
        round(),
      ],
      definition,
    );
    expect(status.saturated).toBe(true);
    expect(status.consecutiveSatisfyingRounds).toBe(2);
  });

  it('a non-satisfying round resets the streak', () => {
    const status = saturationStatusOf(
      [
        round(),
        round({ addedNodes: 9, totalNodes: 10 }),
        round(),
      ],
      definition,
    );
    expect(status.saturated).toBe(false);
    expect(status.consecutiveSatisfyingRounds).toBe(1);
  });

  it('a budget-bound round never shifts the window', () => {
    const status = saturationStatusOf(
      [round({ budgetBoundReached: true }), round({ budgetBoundReached: true })],
      definition,
    );
    expect(status.saturated).toBe(false);
    expect(status.consecutiveSatisfyingRounds).toBe(0);
  });
});

describe('SaturationTracker', () => {
  it('flips to true exactly at the second consecutive satisfying round', () => {
    const tracker = new SaturationTracker(definition);
    expect(tracker.observe(round({ addedNodes: 3, totalNodes: 4 }))).toBe(false);
    expect(tracker.consecutiveSatisfyingRounds).toBe(0);
    expect(tracker.observe(round())).toBe(false);
    expect(tracker.consecutiveSatisfyingRounds).toBe(1);
    expect(tracker.observe(round())).toBe(true);
    expect(tracker.consecutiveSatisfyingRounds).toBe(2);
  });

  it('a novel round between satisfying rounds resets the streak', () => {
    const tracker = new SaturationTracker(definition);
    tracker.observe(round());
    tracker.observe(round({ addedObservations: 8, totalObservations: 10 }));
    expect(tracker.consecutiveSatisfyingRounds).toBe(0);
    tracker.observe(round());
    expect(tracker.consecutiveSatisfyingRounds).toBe(1);
  });
});