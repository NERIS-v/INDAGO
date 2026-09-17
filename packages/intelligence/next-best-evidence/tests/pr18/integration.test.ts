// ============================================================================
// PR18 integration — real PR14->PR15->PR16->PR17->PR18 chain
//
// Uses the actual production generators (classifyGap, generateCompetingExplanations,
// generateErSplitExplanations, generateCandidateEvidenceRequests) so PR18 is
// exercised against the real PR17 candidate output — never a fixture-only
// candidate representation.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { EVIDENCE_UTILITY_POLICY_VERSION, MAX_EVIDENCE_REQUESTS_PER_GAP } from '@indago/contracts';

import { selectBestEvidenceFromCandidates } from '../../src/index.js';
import { makePr18Input, makeChain, GAP_ID, INVESTIGATION_ID, OBSERVED_AT } from './fixtures.js';

describe('PR18 integration — real chain', () => {
  it('scores and selects the real PR17 candidate output', () => {
    const result = selectBestEvidenceFromCandidates(makePr18Input());
    expect(result.gapId).toBe(GAP_ID);
    expect(result.investigationId).toBe(INVESTIGATION_ID);
    expect(result.utilityPolicyVersion).toBe(EVIDENCE_UTILITY_POLICY_VERSION);
    expect(result.rankedRequests.length).toBeGreaterThan(0);
    expect(result.rankedRequests.length).toBeLessThanOrEqual(MAX_EVIDENCE_REQUESTS_PER_GAP);
    expect(result.computedAt.value).toBe(OBSERVED_AT.value);
  });

  it('every ranked request carries a valid PR10 utility record', () => {
    const result = selectBestEvidenceFromCandidates(makePr18Input());
    for (const r of result.rankedRequests) {
      const u = r.utility;
      expect(u.eig).toBe(u.expectedInformationGain);
      expect(u.score).toBeGreaterThanOrEqual(0);
      expect(u.score).toBeLessThanOrEqual(1);
      expect(u.relevance).toBeGreaterThanOrEqual(0);
      expect(u.relevance).toBeLessThanOrEqual(1);
      expect(u.feasibility).toBeGreaterThanOrEqual(0);
      expect(u.feasibility).toBeLessThanOrEqual(1);
      expect(u.cost).toBeGreaterThanOrEqual(0);
      expect(u.cost).toBeLessThanOrEqual(1);
    }
  });

  it('canonicalRequestKey is preserved (single source of truth, no re-hash)', () => {
    const chain = makeChain();
    const result = selectBestEvidenceFromCandidates(makePr18Input());
    const pr17Keys = new Set(chain.candidates.map((c) => c.canonicalRequestKey));
    for (const r of result.rankedRequests) {
      expect(pr17Keys.has(r.canonicalRequestKey)).toBe(true);
    }
  });

  it('is deterministic across re-runs (byte-identical)', () => {
    const a = JSON.stringify(selectBestEvidenceFromCandidates(makePr18Input()));
    const b = JSON.stringify(selectBestEvidenceFromCandidates(makePr18Input()));
    expect(a).toBe(b);
  });

  it('is idempotent (same invocation twice => identical selected set)', () => {
    const input = makePr18Input();
    const first = selectBestEvidenceFromCandidates(input);
    const second = selectBestEvidenceFromCandidates(input);
    expect(JSON.stringify(first.rankedRequests)).toBe(JSON.stringify(second.rankedRequests));
  });

  it('an empty PR17 candidate set yields an empty (non-error) result', () => {
    const input = makePr18Input();
    const result = selectBestEvidenceFromCandidates({ ...input, candidateRequests: [] });
    expect(result.rankedRequests).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});