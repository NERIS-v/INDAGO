import { z } from 'zod';
import {
  InvestigationRunIdSchema,
  InvestigationIdSchema,
  CheckpointIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Recovery
//
// Recovery procedures for failed or interrupted investigation runs.
// ============================================================================

export const RecoveryStrategySchema = z.enum([
  'RETRY_FROM_CHECKPOINT',
  'RETRY_FAILED_STAGE',
  'RESTART_RUN',
  'SKIP_FAILED_STAGE',
  'MANUAL_INTERVENTION',
]);
export type RecoveryStrategy = z.infer<typeof RecoveryStrategySchema>;

export const RecoveryPlanSchema = z.object({
  runId: InvestigationRunIdSchema,
  investigationId: InvestigationIdSchema,
  strategy: RecoveryStrategySchema,
  checkpointId: CheckpointIdSchema.optional()
    .describe('Checkpoint to resume from'),
  failedStage: z.string().optional()
    .describe('Stage that failed'),
  retryCount: z.number().int().nonnegative()
    .describe('Number of retries attempted'),
  maxRetries: z.number().int().positive().default(3),
  estimatedRecoveryTimeMs: z.number().int().nonnegative().optional(),
  createdAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type RecoveryPlan = z.infer<typeof RecoveryPlanSchema>;

export const RecoveryResultSchema = z.object({
  plan: RecoveryPlanSchema,
  success: z.boolean(),
  newRunId: InvestigationRunIdSchema.optional()
    .describe('New run ID if recovery created a new run'),
  message: z.string(),
  completedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type RecoveryResult = z.infer<typeof RecoveryResultSchema>;
