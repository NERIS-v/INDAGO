import { z } from 'zod';
import {
  GraphVersionIdSchema,
  InvestigationIdSchema,
  CheckpointIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Graph Version
//
// Versioned snapshots of the investigation graph.
// Supports projection status and parent version tracking.
// ============================================================================

export const GraphVersionStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'SUPERSEDED',
  'ARCHIVED',
]);
export type GraphVersionStatus = z.infer<typeof GraphVersionStatusSchema>;

export const ProjectionStatusSchema = z.enum([
  'COMPLETE',
  'PARTIAL',
  'STALE',
  'ERROR',
]);
export type ProjectionStatus = z.infer<typeof ProjectionStatusSchema>;

export const GraphVersionSchema = z.object({
  id: GraphVersionIdSchema,
  investigationId: InvestigationIdSchema,
  versionNumber: z.number().int().positive(),
  status: GraphVersionStatusSchema,
  parentGraphVersionId: GraphVersionIdSchema.optional()
    .describe('Previous version this was derived from'),
  projectionStatus: ProjectionStatusSchema
    .describe('Whether this version is a complete projection'),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  checkpointId: CheckpointIdSchema.optional()
    .describe('Checkpoint this version was created at'),
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type GraphVersion = z.infer<typeof GraphVersionSchema>;
