import { describe, expect, it } from 'vitest';
import { detectTemporalGap } from '../src/detectors/temporal-gap.js';
import { buildDetectionContext } from '../src/context.js';
import { mkNode, mkRelationHypothesis, obs, baseInput, uuid } from './helpers.js';

const DAY = (value: string) => ({ value, precision: 'day' as const });

describe('TEMPORAL_GAP detector', () => {
  it('emits candidate for strictly disjoint authoritative windows', () => {
    const A = uuid();
    const B = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        nodes: [
          mkNode(A, {
            temporalRange: {
              validFrom: DAY('2020-01-01'),
              validTo: DAY('2020-01-05'),
              precision: 'day',
              semantics: 'observed',
            },
          }),
          mkNode(B, {
            temporalRange: {
              validFrom: DAY('2020-02-01'),
              validTo: DAY('2020-02-28'),
              precision: 'day',
              semantics: 'observed',
            },
          }),
        ],
        edges: [],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, A, B, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
        enabledDetectors: ['TEMPORAL_GAP'],
      }),
    );
    const run = detectTemporalGap(ctx);
    expect(run.candidates).toHaveLength(1);
    const c = run.candidates[0]!;
    expect(c.structuralBasis).toBe('TEMPORAL_DISCONTINUITY');
    expect(c.temporalScope).toMatchObject({ precision: 'day', semantics: 'inferred' });
    expect(c.temporalScope!.validFrom!.value).toBe('2020-01-05');
    expect(c.temporalScope!.validTo!.value).toBe('2020-02-01');
  });

  it('does not emit when windows overlap (no gap)', () => {
    const A = uuid();
    const B = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        nodes: [
          mkNode(A, {
            temporalRange: {
              validFrom: DAY('2020-01-01'),
              validTo: DAY('2020-02-01'),
              precision: 'day',
              semantics: 'observed',
            },
          }),
          mkNode(B, {
            temporalRange: {
              validFrom: DAY('2020-01-15'),
              validTo: DAY('2020-02-15'),
              precision: 'day',
              semantics: 'observed',
            },
          }),
        ],
        edges: [],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, A, B, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
        enabledDetectors: ['TEMPORAL_GAP'],
      }),
    );
    const run = detectTemporalGap(ctx);
    expect(run.candidates).toHaveLength(0);
  });

  it('does not emit with open-ended bounds (NULL semantics, never a guess)', () => {
    const A = uuid();
    const B = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        nodes: [
          mkNode(A, {
            temporalRange: {
              validFrom: DAY('2020-01-01'),
              precision: 'day',
              semantics: 'observed',
            },
          }),
          mkNode(B, {
            temporalRange: {
              validFrom: DAY('2020-02-01'),
              precision: 'day',
              semantics: 'observed',
            },
          }),
        ],
        edges: [],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, A, B, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
        enabledDetectors: ['TEMPORAL_GAP'],
      }),
    );
    const run = detectTemporalGap(ctx);
    expect(run.candidates).toHaveLength(0);
  });

  it('skips nodes with no authoritative temporal range', () => {
    const A = uuid();
    const B = uuid();
    const O1 = uuid();
    const S1 = uuid();
    const H1 = uuid();
    const ctx = buildDetectionContext(
      baseInput({
        nodes: [mkNode(A), mkNode(B)],
        edges: [],
        observations: [obs(O1, S1)],
        relationHypotheses: [
          mkRelationHypothesis(H1, A, B, {
            relationType: 'communication',
            evidenceBasis: [O1],
          }),
        ],
        enabledDetectors: ['TEMPORAL_GAP'],
      }),
    );
    const run = detectTemporalGap(ctx);
    expect(run.candidates).toHaveLength(0);
  });
});