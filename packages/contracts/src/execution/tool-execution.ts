import { z } from 'zod';
import {
  ToolExecutionIdSchema,
  ToolIdSchema,
  InvestigationRunIdSchema,
  InvestigationIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Tool Execution
//
// Record of a tool being executed within an investigation run.
// ============================================================================

export const ToolExecutionStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'TIMEOUT',
  'CANCELLED',
]);
export type ToolExecutionStatus = z.infer<typeof ToolExecutionStatusSchema>;

export const ToolExecutionSchema = z.object({
  id: ToolExecutionIdSchema,
  toolId: ToolIdSchema,
  runId: InvestigationRunIdSchema,
  investigationId: InvestigationIdSchema,
  status: ToolExecutionStatusSchema,
  parameters: z.record(z.string(), z.unknown())
    .describe('Input parameters used'),
  output: z.record(z.string(), z.unknown()).optional()
    .describe('Tool output'),
  error: z.string().optional()
    .describe('Error message if failed'),
  startedAt: ObservedTimeSchema.optional(),
  completedAt: ObservedTimeSchema.optional(),
  durationMs: z.number().int().nonnegative().optional(),
  retryCount: z.number().int().nonnegative().default(0),
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type ToolExecution = z.infer<typeof ToolExecutionSchema>;

export const ToolResultSchema = z.object({
  id: z.string().optional(),
  data: z.array(z.any()).optional().describe("Raw tool output data"),
  extractedIds: z.array(z.string()).optional().describe("Deterministic IDs used for claim grounding"),
}).strict();

export type ToolResult = z.infer<typeof ToolResultSchema>;