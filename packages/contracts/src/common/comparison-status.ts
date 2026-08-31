import { z } from 'zod';

// ============================================================================
// Entity Comparison Status
//
// Tracks the ER audit/recovery pipeline state for entity pairs.
//
// EntityComparisonStatus is the COMPARISON RESULT — what the scoring
// engine determined. It is NOT the hypothesis lifecycle status.
// ============================================================================

export const EntityComparisonStatusSchema = z.enum([
  'NOT_COMPARED',
  'COMPARED_AND_UNRESOLVED',
  'RESOLVED_MATCH',
  'RESOLVED_NON_MATCH',
  'REJECTED_CANDIDATE',
]);
export type EntityComparisonStatus = z.infer<typeof EntityComparisonStatusSchema>;

// ============================================================================
// Entity Resolution Status
//
// Tracks the HYPOTHESIS LIFECYCLE — the durable state of an identity
// proposition through its review journey.
//
// Lifecycle:
//   PROPOSED → ACCEPTED
//   PROPOSED → REJECTED
//   ACCEPTED → REVERSED
//   REJECTED → REVERSED
//
// REVERSED is hypothesis lifecycle reversal — it does NOT erase the original
// hypothesis. It changes lifecycle state and creates audit history.
//
// REVERSED ≠ MERGED. MERGED is canonical-entity merge semantics (future scope).
// REVERSED is identity-proposition lifecycle reversal (current scope).
// ============================================================================

export const EntityResolutionStatusSchema = z.enum([
  'UNRESOLVED',
  'PARTIALLY_RESOLVED',
  'RESOLVED',
  'SPLIT',
  'MERGED',
  'CONTRADICTED',
  'PROPOSED',
  'ACCEPTED',
  'REJECTED',
  'REVERSED',
]);
export type EntityResolutionStatus = z.infer<typeof EntityResolutionStatusSchema>;
