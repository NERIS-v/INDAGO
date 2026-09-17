// ============================================================================
// PR17 contract tests (policy §3/§4)
//
// The frozen generation bounds live in @indago/contracts and are re-exported by
// the runtime. PR17's candidate identity is the PR10 frozen key — byte-identical
// to what PR10's NextBestEvidenceCandidateSchema expects.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  canonicalizeNextBestEvidenceRequest,
  MAX_GENERATED_CANDIDATE_REQUESTS_PER_GAP,
  MAX_GENERATED_CANDIDATE_REQUESTS_PER_EXPLANATION_PAIR,
  MAX_GENERATED_CANDIDATE_REQUESTS_PER_RUN,
  MAX_P10_CONSIDER_CEILING,
  EVIDENCE_REQUEST_GENERATION_POLICY_VERSION,
  EVIDENCE_REQUEST_GENERATION_POLICY_V1,
} from '@indago/contracts';

import {
  canonicalRequestKey,
  generateCandidateEvidenceRequests,
} from '../src/index.js';
import { makePr17Input } from './helpers.js';

describe('PR17 frozen bounds (contracts)', () => {
  it('exposes the frozen V1 policy', () => {
    expect(EVIDENCE_REQUEST_GENERATION_POLICY_VERSION).toBe('v1');
    expect(EVIDENCE_REQUEST_GENERATION_POLICY_V1.version).toBe('v1');
    expect(EVIDENCE_REQUEST_GENERATION_POLICY_V1.truncatedWhenBoundHit).toBe(true);
  });

  it('keeps generation per-gap strictly under the PR10 consider ceiling', () => {
    expect(MAX_GENERATED_CANDIDATE_REQUESTS_PER_GAP).toBeLessThan(MAX_P10_CONSIDER_CEILING);
  });

  it('freezes the three canonical bounds', () => {
    expect(MAX_GENERATED_CANDIDATE_REQUESTS_PER_GAP).toBe(10);
    expect(MAX_GENERATED_CANDIDATE_REQUESTS_PER_EXPLANATION_PAIR).toBe(5);
    expect(MAX_GENERATED_CANDIDATE_REQUESTS_PER_RUN).toBe(50);
  });
});

describe('PR17 identity — PR10 parity', () => {
  it('uses exactly the PR10 frozen canonical key', () => {
    const c = generateCandidateEvidenceRequests(makePr17Input()).candidateRequests[0]!;
    expect(c.canonicalRequestKey).toBe(
      canonicalizeNextBestEvidenceRequest({
        gapId: c.gapId,
        evidenceType: c.evidenceType,
        discriminatesAmongIds: c.discriminatesAmongIds,
        hypothesisIds: c.hypothesisIds,
      }),
    );
  });

  it('canonicalRequestKey is order-independent across discriminatesAmongIds', () => {
    const input = makePr17Input();
    const result = generateCandidateEvidenceRequests(input).candidateRequests;
    const c = result.find((r) => r.discriminatesAmongIds.length >= 2)!;
    const reversed = canonicalRequestKey({
      gapId: c.gapId,
      evidenceType: c.evidenceType,
      discriminatesAmongIds: [...c.discriminatesAmongIds].reverse(),
      hypothesisIds: c.hypothesisIds,
    });
    expect(reversed).toBe(c.canonicalRequestKey);
  });
});

describe('PR17 result contract shape', () => {
  it('every emitted candidate carries the required identity fields', () => {
    const result = generateCandidateEvidenceRequests(makePr17Input());
    for (const c of result.candidateRequests) {
      expect(typeof c.canonicalRequestKey).toBe('string');
      expect(c.canonicalRequestKey.length).toBeGreaterThan(0);
      expect(c.evidenceType).toBeTruthy();
      expect(c.discriminatesAmongIds.length).toBeGreaterThan(0);
      expect(Array.isArray(c.hypothesisIds)).toBe(true);
      expect(typeof c.rationale).toBe('string');
      expect(c.rationale.length).toBeGreaterThan(0);
    }
  });

  it('uses only the frozen EvidenceType vocabulary', () => {
    const valid = new Set([
      'DOCUMENT', 'RECORD', 'TESTIMONY', 'PHYSICAL', 'DIGITAL', 'FINANCIAL', 'COMMUNICATION', 'OTHER',
    ]);
    const result = generateCandidateEvidenceRequests(makePr17Input());
    for (const c of result.candidateRequests) {
      expect(valid.has(c.evidenceType)).toBe(true);
    }
  });
});