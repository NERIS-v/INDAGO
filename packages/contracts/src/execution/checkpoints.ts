import { z } from 'zod';
import {
  CheckpointIdSchema,
  InvestigationRunIdSchema,
  InvestigationIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Checkpoints
//
// Execution checkpoints for resumability and recovery.
// ============================================================================

export const CheckpointStatusSchema = z.enum([
  'CREATED',
  'VERIFIED',
  'SUPERSEDED',
  'CORRUPTED',
]);
export type CheckpointStatus = z.infer<typeof CheckpointStatusSchema>;

export const CheckpointSchema = z.object({
  id: CheckpointIdSchema,
  runId: InvestigationRunIdSchema,
  investigationId: InvestigationIdSchema,
  status: CheckpointStatusSchema,
  stage: z.string()
    .describe('Pipeline stage at this checkpoint'),
  stageIndex: z.number().int().nonnegative()
    .describe('Numeric index of the stage'),
  snapshot: z.record(z.string(), z.unknown())
    .describe('Serialized state snapshot for resumability'),
  previousCheckpointId: CheckpointIdSchema.optional()
    .describe('Previous checkpoint in this run'),
  entityCount: z.number().int().nonnegative(),
  evidenceCount: z.number().int().nonnegative(),
  hypothesisCount: z.number().int().nonnegative(),
  createdAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type Checkpoint = z.infer<typeof CheckpointSchema>;
