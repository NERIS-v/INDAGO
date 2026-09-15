import { describe, it, expect } from 'vitest';
import {
  observationOverlapsTemporalContext,
  resolveRegionMemberObservations,
} from '../src/member-observations.js';
import { LONG_UUID, makeObservation } from './fixtures.js';

// ============================================================================
// PR11 member-observations — region membership resolution + temporal overlap
//
// HARD RULES:
//   § seeds always retained (authoritative region inputs)
//   § node observations retained ONLY when overlapping region temporalContext
//   § closed-interval endpoint logic; missing endpoint = unbounded
//   § no resolvable domain time = RETAINED (never silently dropped)
//   § eventTime value may be an ISO range "A/B"
//   § output sorted + deduplicated; bounded with surfaced flag
// ============================================================================

const CTX_START = { value: '2026-03-01T00:00:00.000Z', precision: 'exact' as const };
const CTX_END = { value: '2026-03-31T23:59:59.999Z', precision: 'exact' as const };
const CONTEXT = { validFrom: CTX_START, validTo: CTX_END };

describe('observationOverlapsTemporalContext', () => {
  it('retains when no temporal context is present', () => {
    const obs = makeObservation(1, { eventTime: '2026-01-01T00:00:00.000Z' });
    expect(observationOverlapsTemporalContext(obs, null)).toBe(true);
    expect(observationOverlapsTemporalContext(obs, undefined)).toBe(true);
  });

  it('retains an observation with NO resolvable domain time', () => {
    const obs = makeObservation(1);
    expect(observationOverlapsTemporalContext(obs, CONTEXT)).toBe(true);
  });

  it('retains an observation inside the closed context window', () => {
    const obs = makeObservation(1, { eventTime: '2026-03-15T00:00:00.000Z' });
    expect(observationOverlapsTemporalContext(obs, CONTEXT)).toBe(true);
  });

  it('retains observations exactly on either context endpoint (closed interval)', () => {
    const start = makeObservation(1, { eventTime: '2026-03-01T00:00:00.000Z' });
    const end = makeObservation(2, { eventTime: '2026-03-31T23:59:59.999Z' });
    expect(observationOverlapsTemporalContext(start, CONTEXT)).toBe(true);
    expect(observationOverlapsTemporalContext(end, CONTEXT)).toBe(true);
  });

  it('rejects an observation strictly before the context window', () => {
    const obs = makeObservation(1, { eventTime: '2026-02-28T23:59:59.999Z' });
    expect(observationOverlapsTemporalContext(obs, CONTEXT)).toBe(false);
  });

  it('rejects an observation strictly after the context window', () => {
    const obs = makeObservation(1, { eventTime: '2026-04-01T00:00:00.000Z' });
    expect(observationOverlapsTemporalContext(obs, CONTEXT)).toBe(false);
  });

  it('prefers validityInterval over eventTime and observedAt', () => {
    const obs = makeObservation(1, {
      eventTime: '2026-03-15T00:00:00.000Z',
      observedAt: '2026-03-15T00:00:00.000Z',
      validityStart: '2025-01-01T00:00:00.000Z',
      validityEnd: '2025-12-31T00:00:00.000Z',
    });
    expect(observationOverlapsTemporalContext(obs, CONTEXT)).toBe(false);
  });

  it('treats a missing validityInterval end as unbounded (retained)', () => {
    const obs = makeObservation(1, { validityStart: '2026-03-15T00:00:00.000Z' });
    expect(observationOverlapsTemporalContext(obs, CONTEXT)).toBe(true);
  });

  it('handles an eventTime ISO range value (A/B)', () => {
    const within = makeObservation(1, {
      eventTime: '2026-03-10T00:00:00.000Z/2026-03-20T00:00:00.000Z',
    });
    const outside = makeObservation(2, {
      eventTime: '2026-06-01T00:00:00.000Z/2026-06-10T00:00:00.000Z',
    });
    expect(observationOverlapsTemporalContext(within, CONTEXT)).toBe(true);
    expect(observationOverlapsTemporalContext(outside, CONTEXT)).toBe(false);
  });

  it('retains when a context side is open (no validTo)', () => {
    const openEnd = { validFrom: CTX_START };
    const late = makeObservation(1, { eventTime: '2026-12-01T00:00:00.000Z' });
    expect(observationOverlapsTemporalContext(late, openEnd)).toBe(true);
  });
});

describe('resolveRegionMemberObservations', () => {
  it('returns seeds + node observations (sorted, deduped)', () => {
    const seedA = LONG_UUID(250);
    const seedB = LONG_UUID(260);
    const res = resolveRegionMemberObservations({
      seedObservationIds: [seedA, seedB],
      nodeObservations: [
        makeObservation(251, { eventTime: '2026-03-15T00:00:00.000Z' }),
        makeObservation(252, { eventTime: '2026-03-16T00:00:00.000Z' }),
      ],
      maxRegionObservations: 100,
    });
    expect(res.memberObservationIds).toEqual(
      [seedA, seedB, LONG_UUID(251), LONG_UUID(252)].sort(),
    );
    expect(res.boundReached).toBe(false);
  });

  it('keeps seeds even when they fall outside the temporal context', () => {
    const seed = LONG_UUID(270);
    const res = resolveRegionMemberObservations({
      seedObservationIds: [seed],
      nodeObservations: [],
      temporalContext: CONTEXT,
      maxRegionObservations: 100,
    });
    expect(res.memberObservationIds).toEqual([seed]);
  });

  it('filters node observations outside the temporal context', () => {
    const inside = LONG_UUID(281);
    const res = resolveRegionMemberObservations({
      seedObservationIds: [],
      nodeObservations: [
        makeObservation(281, { eventTime: '2026-03-15T00:00:00.000Z' }),
        makeObservation(282, { eventTime: '2026-04-15T00:00:00.000Z' }),
      ],
      temporalContext: CONTEXT,
      maxRegionObservations: 100,
    });
    expect(res.memberObservationIds).toEqual([inside]);
  });

  it('truncates deterministically and surfaces the bound flag', () => {
    const res = resolveRegionMemberObservations({
      seedObservationIds: [LONG_UUID(290), LONG_UUID(291), LONG_UUID(292)],
      nodeObservations: [],
      maxRegionObservations: 2,
    });
    expect(res.boundReached).toBe(true);
    expect(res.memberObservationIds).toHaveLength(2);
  });
});