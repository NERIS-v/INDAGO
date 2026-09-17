// ============================================================================
// PR18 — output contract (policy §23/24/30/31)
//
// The ranked/selected requests carry the PR10 NextBestEvidenceCandidate fields
// + PR17 provenance. Projecting to the 7 PR10 fields yields a valid
// NextBestEvidenceCandidate (the representation PR10's runtime consumes), and
// every request exposes the structured utility components needed to manually
// reproduce the score.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { selectBestEvidenceFromCandidates } from '../../src/index.js';
import { makePr18Input } from './fixtures.js';
import { mkCandidate, mkInput, H1 } from './controlled.js';

describe('PR18 output contract', () => {
  it('exposes the required result fields', () => {
    const result = selectBestEvidenceFromCandidates(makePr18Input());
    expect(typeof result.investigationId).toBe('string');
    expect(typeof result.gapId).toBe('string');
    expect(Array.isArray(result.rankedRequests)).toBe(true);
    expect(typeof result.consideredCount).toBe('number');
    expect(typeof result.truncated).toBe('boolean');
    expect(result.utilityPolicyVersion).toBe('v1');
    expect(result.computedAt.value.length).toBeGreaterThan(0);
    expect(result.accounting).toBeTruthy();
  });

  it('PR10-seam core fields align with NextBestEvidenceCandidateSchema', () => {
    const result = selectBestEvidenceFromCandidates(makePr18Input());
    expect(result.rankedRequests.length).toBeGreaterThan(0);
    for (const r of result.rankedRequests) {
      // Documented adapter seam (§37): PR18 keeps `discriminatesAmongIds` as the
      // PR17/PR15/PR16 EXPLANATION ids (identity integrity, §38), whereas PR10's
      // NextBestEvidenceCandidateSchema types that field as hypothesis UUIDs. The
      // remaining fields align byte-for-byte with PR10's candidate schema.
      expect(typeof r.canonicalRequestKey).toBe('string');
      expect(r.canonicalRequestKey.length).toBeGreaterThan(0);
      expect(r.gapId.length).toBeGreaterThan(0);
      expect(Array.isArray(r.hypothesisIds)).toBe(true);
      expect(['DOCUMENT', 'RECORD', 'TESTIMONY', 'PHYSICAL', 'DIGITAL', 'FINANCIAL', 'COMMUNICATION', 'OTHER']).toContain(r.evidenceType);
      expect(typeof r.rationale).toBe('string');
      expect(typeof r.utility.score).toBe('number');
    }
  });

  it('preserves explanation-id discrimination targets (documented adapter seam)', () => {
    const result = selectBestEvidenceFromCandidates(makePr18Input());
    for (const r of result.rankedRequests) {
      for (const id of r.discriminatesAmongIds) {
        // Explanation ids are content-addressed 64-hex (PR15/PR16), NOT hypothesis UUIDs.
        expect(id).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });

  it('exposes structured utility components for manual reproduction', () => {
    const result = selectBestEvidenceFromCandidates(makePr18Input());
    for (const r of result.rankedRequests) {
      expect(typeof r.utility.expectedInformationGain).toBe('number');
      expect(r.utility.eig).toBe(r.utility.expectedInformationGain);
      expect(typeof r.utility.relevance).toBe('number');
      expect(typeof r.utility.feasibility).toBe('number');
      expect(typeof r.utility.cost).toBe('number');
      expect(typeof r.utility.score).toBe('number');
    }
  });

  it('rank is 1-based and sequential', () => {
    const result = selectBestEvidenceFromCandidates(mkInput([mkCandidate('a', { hypothesisIds: [H1] }), mkCandidate('b', { hypothesisIds: [H1] })]));
    result.rankedRequests.forEach((r, i) => expect(r.rank).toBe(i + 1));
  });
});