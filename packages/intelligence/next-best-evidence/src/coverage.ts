// ============================================================================
// Next-Best-Evidence Runtime — Existing-Evidence Exclusion (Phase 5A-PR10, §7)
//
// Deterministic fail-closed semantics: a candidate request is EXCLUDED only
// when there exists a caller-supplied summary of evidence already represented
// in the case that (a) has the EXACT same canonical evidenceType AND
// (b) fully covers the candidate's validated discrimination target.
//
// PR10 never infers equivalence from prose or partial overlap: without the
// exact type match AND full target coverage, the candidate is KEPT (fail-closed
// — the selector prefers to consider evidence it cannot rule out over silently
// discarding it). A candidate with no discrimination target is never "covered"
// (nothing to be covered by), so it is kept and simply scores EIG = 0.
//
// Callers supply ExistingEvidenceSummary ONLY from canonical Evidence records;
// PR10 never constructs such summaries itself.
// ============================================================================

import type { EvidenceType } from '@indago/contracts';
import type { ExistingEvidenceSummary } from './types.js';

export interface ExistingEvidenceCoverage {
  readonly covered: boolean;
  readonly coveredByEvidenceType: EvidenceType | null;
}

/**
 * Decide whether an existing represented evidence summary already covers this
 * candidate's discrimination target. Deterministic and fail-closed.
 */
export function isCoveredByExistingEvidence(
  evidenceType: EvidenceType,
  targetUuids: readonly string[],
  existingEvidence: readonly ExistingEvidenceSummary[] | undefined,
): ExistingEvidenceCoverage {
  if (existingEvidence === undefined || existingEvidence.length === 0) {
    return { covered: false, coveredByEvidenceType: null };
  }
  if (targetUuids.length === 0) {
    return { covered: false, coveredByEvidenceType: null };
  }
  for (const summary of existingEvidence) {
    if (summary.evidenceType !== evidenceType) continue;
    const coveredIds = new Set(summary.hypothesisIds);
    const fullyCovered = targetUuids.every((uuid) => coveredIds.has(uuid));
    if (fullyCovered) {
      return { covered: true, coveredByEvidenceType: evidenceType };
    }
  }
  return { covered: false, coveredByEvidenceType: null };
}