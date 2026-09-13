import { describe, expect, it } from 'vitest';
import {
  resolveIndependentSupportUnits,
  independentSupportUnitCount,
} from '../src/support-units.js';
import { mkCandidate, mkObservation } from './helpers.js';

describe('resolveIndependentSupportUnits', () => {
  it('counts distinct keys, not distinct observation ids', () => {
    const result = resolveIndependentSupportUnits(
      mkCandidate({ supportingObservationIds: ['O1', 'O2', 'O3'] }),
      [
        mkObservation('O1', { sourceContextId: 'ctx-1' }),
        mkObservation('O2', { sourceContextId: 'ctx-1' }), // same unit as O1
        mkObservation('O3', { sourceContextId: 'ctx-2' }),
      ],
    );
    expect(independentSupportUnitCount(result)).toBe(2);
    expect(result.keys).toEqual(['sourceContext:ctx-1', 'sourceContext:ctx-2']);
    expect(result.missingObservationIds).toEqual([]);
  });

  it('applies V1 priority: sourceContextId > artifactId > contentHash > sourceId', () => {
    const result = resolveIndependentSupportUnits(
      mkCandidate({ supportingObservationIds: ['A', 'B', 'C', 'D'] }),
      [
        mkObservation('A', { sourceContextId: 'ctx', artifactId: 'art', contentHash: 'hash', sourceId: 'src' }),
        mkObservation('B', { artifactId: 'art', contentHash: 'hash', sourceId: 'src' }),
        mkObservation('C', { contentHash: 'hash', sourceId: 'src' }),
        mkObservation('D', { sourceId: 'src' }),
      ],
    );
    expect(result.keys.sort()).toEqual(['artifact:art', 'contentHash:hash', 'source:src', 'sourceContext:ctx']);
  });

  it('only supporting observations contribute (contradicting never do)', () => {
    const result = resolveIndependentSupportUnits(
      mkCandidate({
        supportingObservationIds: ['O1'],
        contradictingObservationIds: ['X1', 'X2'],
      }),
      [
        mkObservation('O1', { sourceContextId: 'ctx-1' }),
        mkObservation('X1', { sourceContextId: 'ctx-x' }),
        mkObservation('X2', { sourceContextId: 'ctx-x' }),
      ],
    );
    expect(result.keys).toEqual(['sourceContext:ctx-1']);
  });

  it('fails closed when a supporting observation is absent or unresolvable', () => {
    const result = resolveIndependentSupportUnits(
      mkCandidate({ supportingObservationIds: ['O1', 'O2'] }),
      [mkObservation('O1', { sourceContextId: 'ctx-1' })],
    );
    expect(result.keys).toEqual(['sourceContext:ctx-1']);
    expect(result.missingObservationIds).toEqual(['O2']);
  });

  it('is byte-stable regardless of observation input order', () => {
    const obs1 = mkObservation('O1', { sourceContextId: 'ctx-1' });
    const obs2 = mkObservation('O2', { sourceContextId: 'ctx-2' });
    const a = resolveIndependentSupportUnits(
      mkCandidate({ supportingObservationIds: ['O1', 'O2'] }),
      [obs1, obs2],
    );
    const b = resolveIndependentSupportUnits(
      mkCandidate({ supportingObservationIds: ['O2', 'O1'] }),
      [obs2, obs1],
    );
    expect(a).toEqual(b);
  });

  it('never counts repeated mentions of one source as multiple units', () => {
    const result = resolveIndependentSupportUnits(
      mkCandidate({ supportingObservationIds: ['O1', 'O2', 'O3', 'O4'] }),
      ['O1', 'O2', 'O3', 'O4'].map((id) => mkObservation(id, { sourceId: 'src-single' })),
    );
    expect(result.keys).toEqual(['source:src-single']);
  });
});