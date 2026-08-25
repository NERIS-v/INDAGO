import { z } from 'zod';
import { InvestigationRunIdSchema, ToolExecutionIdSchema } from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Execution Errors
//
// Typed error contracts for execution failures.
// ============================================================================

export const ExecutionErrorCategorySchema = z.enum([
  'TOOL_FAILURE',
  'TIMEOUT',
  'RESOURCE_EXHAUSTED',
  'VALIDATION_ERROR',
  'DEPENDENCY_MISSING',
  'EXTERNAL_SERVICE_ERROR',
  'CORRUPTED_STATE',
  'USER_CANCELLED',
  'UNKNOWN',
]);
export type ExecutionErrorCategory = z.infer<typeof ExecutionErrorCategorySchema>;

export const ExecutionErrorSchema = z.object({
  category: ExecutionErrorCategorySchema,
  code: z.string().min(1)
    .describe('Machine-readable error code'),
  message: z.string().min(1)
    .describe('Human-readable error message'),
  runId: InvestigationRunIdSchema.optional(),
  toolExecutionId: ToolExecutionIdSchema.optional()
    .describe('Tool execution that failed, if applicable'),
  details: z.record(z.string(), z.unknown()).optional()
    .describe('Structured error context'),
  stackTrace: z.string().optional()
    .describe('Stack trace for debugging'),
  retryable: z.boolean().default(false),
  suggestedAction: z.string().optional()
    .describe('Suggested action to resolve this error'),
  timestamp: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type ExecutionError = z.infer<typeof ExecutionErrorSchema>;

export const ToolFailureErrorSchema = ExecutionErrorSchema.extend({
  category: z.literal('TOOL_FAILURE'),
  toolId: z.string().uuid(),
  toolName: z.string(),
  toolVersion: z.string(),
}).strict();
export type ToolFailureError = z.infer<typeof ToolFailureErrorSchema>;

export const TimeoutErrorSchema = ExecutionErrorSchema.extend({
  category: z.literal('TIMEOUT'),
  timeoutMs: z.number().int().positive(),
  elapsedMs: z.number().int().nonnegative(),
}).strict();
export type TimeoutError = z.infer<typeof TimeoutErrorSchema>;
