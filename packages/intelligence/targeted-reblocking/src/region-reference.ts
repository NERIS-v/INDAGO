// ============================================================================
// Targeted Reblocking — region reference validation (Phase 5A-PR11)
//
// The region reference binds a targeted reblock to a specific persisted
// GraphHoleRegionAnalysis record. The pure core refuses to run when the
// reference's caseId / graphVersionId do not match the operation context —
// this is the first line of the case/graph-version isolation invariant.
// ============================================================================

import {
  TargetedReblockRegionReferenceSchema,
  type TargetedReblockRegionReference,
} from '@indago/contracts';
import { TargetedReblockError } from './errors.js';

/**
 * Validate + coerce a region reference into the canonical shape. Throws
 * INVALID_REGION_REFERENCE on a malformed reference (deterministic reject).
 */
export function parseRegionReference(
  value: unknown,
): TargetedReblockRegionReference {
  const parsed = TargetedReblockRegionReferenceSchema.safeParse(value);
  if (!parsed.success) {
    throw new TargetedReblockError(
      'INVALID_REGION_REFERENCE',
      `Malformed targeted-reblock region reference: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/**
 * Authority guard: the operation-level caseId/graphVersionId must equal the
 * region reference's own caseId/graphVersionId. This prevents a caller from
 * binding a region from another case or another graph version into THIS
 * operation's context.
 */
export function assertRegionReferenceInScope(
  regionReference: TargetedReblockRegionReference,
  context: { readonly caseId: string; readonly graphVersionId: string },
): void {
  if (regionReference.caseId !== context.caseId) {
    throw new TargetedReblockError(
      'AUTHORITY_MISMATCH',
      `Region reference scoped to case ${regionReference.caseId} but operation context is case ${context.caseId}`,
    );
  }
  if (regionReference.graphVersionId !== context.graphVersionId) {
    throw new TargetedReblockError(
      'AUTHORITY_MISMATCH',
      `Region reference scoped to graphVersion ${regionReference.graphVersionId} but operation context is graphVersion ${context.graphVersionId}`,
    );
  }
}