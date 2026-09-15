// ============================================================================
// Existing-evidence exclusion tests (PR10 §7, fail-closed)
// ============================================================================

import { describe, expect, it } from 'vitest';
import { isCoveredByExistingEvidence } from '../src/coverage.js';
import { H1, H2, H3 } from './fixtures.js';

describe('isCoveredByExistingEvidence', () => {
  it('excludes only on exact evidenceType match AND full target coverage', () => {
    expect(isCoveredByExistingEvidence(
      'DOCUMENT', [H1, H2],
      [{ evidenceType: 'DOCUMENT', hypothesisIds: [H1, H2] }],
    )).toEqual({ covered: true, coveredByEvidenceType: 'DOCUMENT' });
  });

  it('keeps when the evidenceType differs (no silent cross-type equivalence)', () => {
    expect(isCoveredByExistingEvidence(
      'TESTIMONY', [H1, H2],
      [{ evidenceType: 'DOCUMENT', hypothesisIds: [H1, H2] }],
    ).covered).toBe(false);
  });

  it('keeps on partial coverage (fail-closed)', () => {
    expect(isCoveredByExistingEvidence(
      'DOCUMENT', [H1, H2],
      [{ evidenceType: 'DOCUMENT', hypothesisIds: [H1] }],
    ).covered).toBe(false);
  });

  it('keeps when no existing evidence is supplied', () => {
    expect(isCoveredByExistingEvidence('DOCUMENT', [H1], undefined).covered).toBe(false);
    expect(isCoveredByExistingEvidence('DOCUMENT', [H1], []).covered).toBe(false);
  });

  it('never excludes a targetless candidate (nothing to be covered)', () => {
    expect(isCoveredByExistingEvidence('DOCUMENT', [], [{ evidenceType: 'DOCUMENT', hypothesisIds: [H1] }]).covered)
      .toBe(false);
  });

  it('finds coverage across multiple summaries', () => {
    expect(isCoveredByExistingEvidence(
      'DOCUMENT', [H1, H2, H3],
      [
        { evidenceType: 'DOCUMENT', hypothesisIds: [H1, H2] },
        { evidenceType: 'DOCUMENT', hypothesisIds: [H2, H3] },
      ],
    ).covered).toBe(false);

    expect(isCoveredByExistingEvidence(
      'DOCUMENT', [H1, H2, H3],
      [
        { evidenceType: 'DOCUMENT', hypothesisIds: [H1, H2, H3] },
      ],
    ).covered).toBe(true);
  });
});