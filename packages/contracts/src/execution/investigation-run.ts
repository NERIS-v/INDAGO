import { z } from 'zod';
import {
  InvestigationRunIdSchema,
  InvestigationIdSchema,
  CheckpointIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';
import { InvestigationRunStateSchema } from './state-machine.js';

// ============================================================================
// Investigation Run
//
// An execution run of an investigation through the INDAGO pipeline.
//
// status: Runtime execution status (QUEUED/RUNNING/COMPLETED/FAILED/etc.)
// state:  Pipeline stage the run is currently in (CREATED/INGESTING/etc.)
// currentStage: Optional finer-grained stage label within the state.
//               e.g. state=INGESTING, currentStage="extracting financial records"
// ============================================================================

export const InvestigationRunStatusSchema = z.enum([
  'QUEUED',
  'INITIALIZING',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
export type InvestigationRunStatus = z.infer<typeof InvestigationRunStatusSchema>;

export const InvestigationRunSchema = z.object({
  id: InvestigationRunIdSchema,
  investigationId: InvestigationIdSchema,
  status: InvestigationRunStatusSchema
    .describe('Runtime execution status'),
  state: InvestigationRunStateSchema
    .describe('Pipeline stage the run is currently in'),
  currentStage: z.string().optional()
    .describe('Finer-grained stage label within the state (e.g. "extracting financial records" during INGESTING). state is the machine state; currentStage is a human-readable sub-label.'),
  startedAt: ObservedTimeSchema.optional(),
  completedAt: ObservedTimeSchema.optional(),
  lastCheckpointId: CheckpointIdSchema.optional(),
  checkpointCount: z.number().int().nonnegative(),
  totalStages: z.number().int().positive(),
  completedStages: z.number().int().nonnegative(),
  error: z.string().optional()
    .describe('Error message if failed'),
  retryCount: z.number().int().nonnegative().default(0),
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type InvestigationRun = z.infer<typeof InvestigationRunSchema>;
