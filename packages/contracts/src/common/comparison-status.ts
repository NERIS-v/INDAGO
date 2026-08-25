import { z } from 'zod';

// ============================================================================
// Entity Comparison Status
//
// Tracks the ER audit/recovery pipeline state for entity pairs.
// ============================================================================

export const EntityComparisonStatusSchema = z.enum([
  'NOT_COMPARED',
  'COMPARED_AND_UNRESOLVED',
  'RESOLVED_MATCH',
  'RESOLVED_NON_MATCH',
  'REJECTED_CANDIDATE',
]);
export type EntityComparisonStatus = z.infer<typeof EntityComparisonStatusSchema>;

export const EntityResolutionStatusSchema = z.enum([
  'UNRESOLVED',
  'PARTIALLY_RESOLVED',
  'RESOLVED',
  'SPLIT',
  'MERGED',
  'CONTRADICTED',
]);
export type EntityResolutionStatus = z.infer<typeof EntityResolutionStatusSchema>;
