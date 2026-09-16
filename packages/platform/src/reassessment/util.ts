// ============================================================================
// PR12 deterministic utilities
// ============================================================================

import { sha256Hex } from '@indago/graph-hole-reassessment';

export function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * Deterministic RFC-4122 version-5-flavoured UUID from a canonical name —
 * the ReassessmentRun row id (contract schema is `z.string().uuid()`). Same
 * (caseId, changeId, sequence) ⇒ same runId, so a crash-then-rerun converges
 * rather than minting a new audit row per attempt.
 */
export function deterministicRunId(
  caseId: string,
  changeId: string,
  sequence: number,
): string {
  const digest = sha256Hex(`indago:pr12:run:${caseId}:${changeId}:${sequence}`);
  const window = digest.slice(0, 32);
  const versioned = `${window.slice(0, 12)}5${window.slice(13, 16)}8${window.slice(17, 32)}`;
  return (
    `${versioned.slice(0, 8)}-` +
    `${versioned.slice(8, 12)}-` +
    `${versioned.slice(12, 16)}-` +
    `${versioned.slice(16, 20)}-` +
    `${versioned.slice(20, 32)}`
  );
}