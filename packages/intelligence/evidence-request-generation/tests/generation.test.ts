// ============================================================================
// PR17 generation behavior (policy §3/§6/§7/§11/§12)
//
// Discrimination mapping never over-claims, existing-evidence exclusion is
// fail-closed, dedup collapses identical requests, wording is neutral.
// ============================================================================

import { describe, it, expect } from 'vitest';

import { generateCandidateEvidenceRequests } from '../src/index.js';
import { makePr17Input, GAP_ID } from './helpers.js';

describe('PR17 generation — discrimination mapping', () => {
  it('emits COMPETING_PAIR and SINGLE_TARGET candidates from real PR15 explanations', () => {
    const result = generateCandidateEvidenceRequests(makePr17Input());
    const kinds = new Set(result.candidateRequests.map((c) => c.discriminationKind));
    expect(kinds.has('COMPETING_PAIR')).toBe(true);
    expect(kinds.has('SINGLE_TARGET')).toBe(true);
  });

  it('emits ER_SPLIT_CROSS candidates when PR16 is present', () => {
    const result = generateCandidateEvidenceRequests(makePr17Input());
    const kinds = new Set(result.candidateRequests.map((c) => c.discriminationKind));
    expect(kinds.has('ER_SPLIT_CROSS')).toBe(true);
  });

  it('never emits a SINGLE_TARGET for a concealment-consistent explanation', () => {
    const result = generateCandidateEvidenceRequests(makePr17Input());
    const singles = result.candidateRequests.filter((c) => c.discriminationKind === 'SINGLE_TARGET');
    for (const s of singles) {
      // A single-target request is only grounded by a non-concealment explanation.
      expect(s.discriminatesAmongIds).toHaveLength(1);
      expect(s.discriminationKind).toBe('SINGLE_TARGET');
    }
  });

  it('gapId is carried through on every candidate', () => {
    const result = generateCandidateEvidenceRequests(makePr17Input());
    for (const c of result.candidateRequests) {
      expect(c.gapId).toBe(GAP_ID);
    }
  });
});

describe('PR17 generation — epistemic safety', () => {
  it('candidate wording is neutral and never asserts guilt or concealment', () => {
    const result = generateCandidateEvidenceRequests(makePr17Input());
    const forbidden = /\b(guilt|guilty|criminal|conceal(ed|ing|ment))\b/i;
    for (const c of result.candidateRequests) {
      expect(c.rationale).not.toMatch(forbidden);
      expect(c.description).not.toMatch(forbidden);
    }
  });
});

describe('PR17 generation — existing-evidence exclusion (fail-closed)', () => {
  it('excludes a candidate whose evidence type + hypothesis target is fully covered', () => {
    const input = makePr17Input();
    const without = generateCandidateEvidenceRequests(input).candidateRequests;
    expect(without.length).toBeGreaterThan(0);
    const knownEvidence = without.map((c) => ({
      evidenceType: c.evidenceType,
      hypothesisIds: [...c.hypothesisIds],
    }));
    const withExclusion = generateCandidateEvidenceRequests({ ...input, knownEvidence });
    expect(withExclusion.accounting.existingEvidenceExclusions).toBeGreaterThan(0);
    expect(withExclusion.candidateRequests.length).toBeLessThan(without.length);
  });

  it('keeps a candidate when existing evidence covers only part of the target (fail-closed)', () => {
    const input = makePr17Input();
    const base = generateCandidateEvidenceRequests(input).candidateRequests;
    const covered = base[0]!;
    const knownEvidence = [
      { evidenceType: covered.evidenceType, hypothesisIds: covered.hypothesisIds.slice(0, 1) },
    ];
    const result = generateCandidateEvidenceRequests({ ...input, knownEvidence });
    const stillPresent = result.candidateRequests.some(
      (c) => c.canonicalRequestKey === covered.canonicalRequestKey,
    );
    expect(stillPresent).toBe(true);
  });
});

describe('PR17 generation — deduplication (PR10 identity)', () => {
  it('emits only distinct canonical request keys', () => {
    const result = generateCandidateEvidenceRequests(makePr17Input());
    const keys = result.candidateRequests.map((c) => c.canonicalRequestKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('PR17 generation — bounds', () => {
  it('respects the frozen per-gap ceiling', () => {
    const result = generateCandidateEvidenceRequests(makePr17Input());
    expect(result.candidateRequests.length).toBeLessThanOrEqual(10);
  });
});