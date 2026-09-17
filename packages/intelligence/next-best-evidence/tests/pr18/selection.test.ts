// ============================================================================
// PR18 — selection bounds, existing-evidence exclusion, truncation (policy §20/21)
// ============================================================================

import { describe, it, expect } from 'vitest';
import { MAX_EVIDENCE_REQUESTS_PER_GAP } from '@indago/contracts';
import { selectBestEvidenceFromCandidates } from '../../src/index.js';
import { mkCandidate, mkInput, H1, H2 } from './controlled.js';

function many(prefix: string, count: number) {
  return Array.from({ length: count }, (_, i) =>
    mkCandidate(`${prefix}-${i}`, { hypothesisIds: [H1], discriminatesAmongIds: [`exp-${i}`] }),
  );
}

describe('PR18 selection bounds', () => {
  it('never emits more than MAX_EVIDENCE_REQUESTS_PER_GAP selected candidates', () => {
    const result = selectBestEvidenceFromCandidates(mkInput(many('k', MAX_EVIDENCE_REQUESTS_PER_GAP + 4)));
    expect(result.rankedRequests.length).toBeLessThanOrEqual(MAX_EVIDENCE_REQUESTS_PER_GAP);
    expect(result.truncated).toBe(true);
    expect(result.accounting.truncated).toBe(true);
  });

  it('separates consideredCount from rankedRequests (candidate vs selected)', () => {
    const result = selectBestEvidenceFromCandidates(mkInput(many('k', MAX_EVIDENCE_REQUESTS_PER_GAP + 2)));
    expect(result.consideredCount).toBeGreaterThanOrEqual(result.rankedRequests.length);
    expect(result.accounting.candidatesConsidered).toBe(result.consideredCount);
  });
});

describe('PR18 existing-evidence exclusion', () => {
  it('excludes a candidate whose evidence type + hypothesis target is fully covered', () => {
    const a = mkCandidate('key-a', { evidenceType: 'RECORD', hypothesisIds: [H1], discriminatesAmongIds: ['exp-1'] });
    const b = mkCandidate('key-b', { evidenceType: 'DOCUMENT', hypothesisIds: [H1, H2], discriminatesAmongIds: ['exp-2'] });
    const result = selectBestEvidenceFromCandidates(mkInput([a, b], {
      existingEvidence: [{ evidenceType: 'RECORD', hypothesisIds: [H1] }],
    }));
    expect(result.accounting.existingEvidenceExclusions).toBe(1);
    expect(result.rankedRequests.find((r) => r.evidenceType === 'RECORD')).toBeUndefined();
    expect(result.rankedRequests.find((r) => r.evidenceType === 'DOCUMENT')).toBeDefined();
  });

  it('keeps a candidate when existing evidence covers only part of the target (fail-closed)', () => {
    const a = mkCandidate('key-a', { evidenceType: 'RECORD', hypothesisIds: [H1, H2], discriminatesAmongIds: ['exp-1'] });
    const result = selectBestEvidenceFromCandidates(mkInput([a], {
      existingEvidence: [{ evidenceType: 'RECORD', hypothesisIds: [H1] }],
    }));
    expect(result.accounting.existingEvidenceExclusions).toBe(0);
    expect(result.rankedRequests.find((r) => r.canonicalRequestKey === 'key-a')).toBeDefined();
  });
});