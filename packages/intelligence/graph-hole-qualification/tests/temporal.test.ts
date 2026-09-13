import { describe, expect, it } from 'vitest';
import type { TemporalInterval } from '@indago/contracts';
import {
  intervalsOverlap,
  isStrictlyAfterInterval,
  temporalScopeOf,
  temporalGateIsValid,
} from '../src/temporal.js';
import { CASE_ID, VERSION_ID, mkAtomic, mkCandidate, mkHypothesisContext, mkObservation, mkRegion } from './helpers.js';

function window(from: string, to?: string): TemporalInterval {
  return {
    validFrom: { value: from, precision: 'day' },
    ...(to !== undefined ? { validTo: { value: to, precision: 'day' } } : {}),
    precision: 'day',
    semantics: 'inferred',
  };
}

describe('interval helpers', () => {
  it('overlaps closed intervals inclusively', () => {
    expect(intervalsOverlap(window('2020-01-01', '2020-12-31'), window('2020-03-01', '2020-06-01'))).toBe(true);
    expect(intervalsOverlap(window('2020-01-01', '2020-02-01'), window('2020-02-01', '2020-02-10'))).toBe(true);
    expect(intervalsOverlap(window('2020-01-01', '2020-01-15'), window('2020-02-01', '2020-02-10'))).toBe(false);
    expect(intervalsOverlap(window('2020-01-01'), window('2018-01-01', '2022-01-01'))).toBe(true);
    expect(intervalsOverlap(window('2020-01-01'), window('1999-01-01', '2000-01-01'))).toBe(false);
  });

  it('strictly-after treats missing validTo as +inf', () => {
    expect(isStrictlyAfterInterval('2025-01-01', window('2020-01-01', '2021-01-01'))).toBe(true);
    expect(isStrictlyAfterInterval('2019-01-01', window('2020-01-01'))).toBe(false);
    expect(isStrictlyAfterInterval('2025-01-01', window('2020-01-01'))).toBe(false);
    expect(isStrictlyAfterInterval('2020-06-01', window('2020-01-01', '2020-06-01'))).toBe(false);
  });

  it('temporalScopeOf falls back candidate → region context → null', () => {
    const noScope = mkRegion();
    const candidate = mkCandidate();
    expect(temporalScopeOf(candidate, noScope)).toBeNull();

    const withCandidateScope = mkCandidate({ temporalScope: window('2020-01-01', '2020-06-01') });
    expect(temporalScopeOf(withCandidateScope, noScope)?.validFrom.value).toBe('2020-01-01');

    const withRegionScope = mkRegion({ temporalContext: window('2021-01-01', '2021-06-01') });
    const candidate2 = mkCandidate();
    expect(temporalScopeOf(candidate2, withRegionScope)?.validFrom.value).toBe('2021-01-01');
  });
});

describe('temporalGateIsValid', () => {
  it('passes when no temporal scope is claimed anywhere', () => {
    const ctx = {
      candidate: mkCandidate(),
      region: mkRegion(),
      observations: [mkObservation('O1')],
      hypothesisContext: mkHypothesisContext([]),
    };
    expect(temporalGateIsValid(ctx)).toBe(true);
  });

  it('fails when a supporting observation lies strictly after the scope', () => {
    const obs = mkObservation('O1', { validityInterval: window('2021-03-01', '2021-05-01') });
    const ctx = {
      candidate: mkCandidate({ temporalScope: window('2020-01-01', '2020-06-01') }),
      region: mkRegion(),
      observations: [obs],
      hypothesisContext: mkHypothesisContext([]),
    };
    expect(temporalGateIsValid(ctx)).toBe(false);
  });

  it('passes when supporting observations fall inside the scope', () => {
    const obs = mkObservation('O1', { validityInterval: window('2020-02-01', '2020-04-01') });
    const obs2 = mkObservation('O2', { validityInterval: window('2019-01-01') });
    const ctx = {
      candidate: mkCandidate({
        temporalScope: window('2020-01-01', '2020-06-01'),
        supportingObservationIds: ['O1', 'O2'],
      }),
      region: mkRegion(),
      observations: [obs, obs2],
      hypothesisContext: mkHypothesisContext([]),
    };
    expect(temporalGateIsValid(ctx)).toBe(true);
  });

  it('is neutral when a supporting observation has no interval', () => {
    const ctx = {
      candidate: mkCandidate({ temporalScope: window('2020-01-01', '2020-06-01') }),
      region: mkRegion(),
      observations: [mkObservation('O1')],
      hypothesisContext: mkHypothesisContext([]),
    };
    expect(temporalGateIsValid(ctx)).toBe(true);
  });

  it('fails when a supporting atomic hypothesis is strictly after the scope', () => {
    const ctx = {
      candidate: mkCandidate({ temporalScope: window('2020-01-01', '2020-06-01') }),
      region: mkRegion(),
      observations: [],
      hypothesisContext: mkHypothesisContext([
        mkAtomic('A1', 'N1', { temporalScope: window('2021-01-01', '2021-06-01') }),
      ]),
    };
    expect(temporalGateIsValid(ctx)).toBe(false);
  });

  it('fails when candidate scope and region temporal context do not overlap', () => {
    const ctx = {
      candidate: mkCandidate({ temporalScope: window('2020-01-01', '2020-06-01') }),
      region: mkRegion({ temporalContext: window('2021-01-01', '2021-06-01') }),
      observations: [],
      hypothesisContext: mkHypothesisContext([]),
    };
    expect(temporalGateIsValid(ctx)).toBe(false);
  });

  it('passes when candidate scope and region temporal context overlap', () => {
    const ctx = {
      candidate: mkCandidate({ temporalScope: window('2020-01-01', '2020-12-31') }),
      region: mkRegion({ temporalContext: window('2020-06-01', '2021-01-01') }),
      observations: [],
      hypothesisContext: mkHypothesisContext([]),
    };
    expect(temporalGateIsValid(ctx)).toBe(true);
  });

  it('ignores non-supporting observations outside the scope', () => {
    const obs = mkObservation('O3', { validityInterval: window('2030-01-01', '2031-01-01') });
    const ctx = {
      candidate: mkCandidate({
        temporalScope: window('2020-01-01', '2020-06-01'),
        supportingObservationIds: ['O1'],
      }),
      region: mkRegion(),
      observations: [obs],
      hypothesisContext: mkHypothesisContext([]),
    };
    expect(temporalGateIsValid(ctx)).toBe(true);
  });
});