import { describe, it, expect } from 'vitest';
import { generateAlternativeExplanations } from '../src/alternative-explanations.js';
import type { LeadSourceCandidateType } from '@indago/contracts';

describe('generateAlternativeExplanations', () => {
  const ctx = { relatedEntityIds: ['e1', 'e2'], relatedObservationIds: ['o1'] };

  const detectorTypes: LeadSourceCandidateType[] = ['BRIDGE', 'TEMPORAL_BURST', 'COMMUNITY', 'CROSS_CASE'];

  it.each(detectorTypes)('returns at least one alternative for %s', (type) => {
    const alts = generateAlternativeExplanations(type, ctx);
    expect(alts.length).toBeGreaterThanOrEqual(1);
  });

  it.each(detectorTypes)('every alternative for %s has a bounded plausibility and non-empty statement', (type) => {
    const alts = generateAlternativeExplanations(type, ctx);
    for (const alt of alts) {
      expect(alt.plausibility).toBeGreaterThanOrEqual(0);
      expect(alt.plausibility).toBeLessThanOrEqual(1);
      expect(alt.statement.length).toBeGreaterThan(0);
      expect(alt.wouldBeConsistentWithEntityIds).toEqual(ctx.relatedEntityIds);
    }
  });

  it('returns no alternatives for MANUAL leads (human-authored, no auto-generation)', () => {
    expect(generateAlternativeExplanations('MANUAL', ctx)).toEqual([]);
  });

  it('is deterministic — same input always produces the same output', () => {
    const a = generateAlternativeExplanations('BRIDGE', ctx);
    const b = generateAlternativeExplanations('BRIDGE', ctx);
    expect(a).toEqual(b);
  });

  it('never claims a probability outside [0,1] and never mentions guilt/culpability', () => {
    for (const type of detectorTypes) {
      const alts = generateAlternativeExplanations(type, ctx);
      for (const alt of alts) {
        expect(alt.statement.toLowerCase()).not.toMatch(/\bguilt|\bculpab/);
      }
    }
  });
});
