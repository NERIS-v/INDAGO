// ============================================================================
// PR17 integration with the REAL PR14->PR15->PR16 chain (policy §5/§14)
//
// Over one closed-world package the real chain yields a non-empty PR15 set and
// a non-empty PR16 set. PR17 grounds against them (re-run equality), then
// emits a deterministic, bounded, identity-correct candidate set.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { canonicalizeNextBestEvidenceRequest } from '@indago/contracts';

import { generateCandidateEvidenceRequests } from '../src/index.js';
import { makePr17Input, GAP_ID } from './helpers.js';

describe('PR17 integration — real certified chain', () => {
  it('produces a non-empty, bounded, grounded candidate set', () => {
    const result = generateCandidateEvidenceRequests(makePr17Input());
    expect(result.candidateRequests.length).toBeGreaterThan(0);
    expect(result.candidateRequests.length).toBeLessThanOrEqual(10);
    expect(result.truncated).toBe(false);
    expect(result.caseId).toBeTruthy();
    expect(result.graphVersionId).toBeTruthy();
    expect(result.graphHoleId).toBeTruthy();
    expect(result.gapId).toBe(GAP_ID);
    expect(result.accounting.candidatesGenerated).toBe(result.candidateRequests.length);
  });

  it('every canonicalRequestKey equals the PR10 canonical identity key', () => {
    const result = generateCandidateEvidenceRequests(makePr17Input());
    for (const c of result.candidateRequests) {
      expect(c.canonicalRequestKey).toBe(
        canonicalizeNextBestEvidenceRequest({
          gapId: c.gapId,
          evidenceType: c.evidenceType,
          discriminatesAmongIds: c.discriminatesAmongIds,
          hypothesisIds: c.hypothesisIds,
        }),
      );
    }
  });

  it('discriminatesAmongIds are REAL explanation ids from the grounded sets', () => {
    const input = makePr17Input();
    const result = generateCandidateEvidenceRequests(input);
    const realIds = new Set<string>();
    for (const e of input.competingExplanationSet.explanations) realIds.add(e.explanationId);
    if (input.erSplit) {
      for (const e of input.erSplit.set.explanations) realIds.add(e.explanationId);
    }
    for (const c of result.candidateRequests) {
      expect(c.discriminatesAmongIds.length).toBeGreaterThan(0);
      for (const id of c.discriminatesAmongIds) expect(realIds.has(id)).toBe(true);
    }
  });

  it('is byte-stable across identical re-runs', () => {
    const a = JSON.stringify(generateCandidateEvidenceRequests(makePr17Input()));
    const b = JSON.stringify(generateCandidateEvidenceRequests(makePr17Input()));
    expect(a).toBe(b);
  });

  it('is bounded by the frozen per-gap ceiling', () => {
    const result = generateCandidateEvidenceRequests(makePr17Input());
    expect(result.candidateRequests.length).toBeLessThanOrEqual(10);
    expect(result.accounting.pairsConsidered).toBeGreaterThan(0);
  });
});