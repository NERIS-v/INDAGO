import { z } from 'zod';

// ============================================================================
// Error Contracts
//
// Discriminated error union for typed error handling.
// ============================================================================

export const ErrorCategorySchema = z.enum([
  'VALIDATION',
  'NOT_FOUND',
  'CONFLICT',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'RATE_LIMITED',
  'EXTERNAL_SERVICE',
  'INTERNAL',
]);
export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

export const ContractErrorSchema = z.object({
  category: ErrorCategorySchema,
  code: z.string().min(1)
    .describe('Machine-readable error code'),
  message: z.string().min(1)
    .describe('Human-readable error message'),
  details: z.record(z.string(), z.unknown()).optional()
    .describe('Structured error context'),
  correlationId: z.string().uuid().optional()
    .describe('Correlation ID for request tracing'),
  retryable: z.boolean().default(false),
  timestamp: z.string().describe('ISO 8601 timestamp'),
}).strict();
export type ContractError = z.infer<typeof ContractErrorSchema>;

export const ValidationErrorSchema = z.object({
  category: z.literal('VALIDATION'),
  code: z.literal('SCHEMA_VALIDATION_FAILED'),
  field: z.string()
    .describe('Dot-notation path to the failing field'),
  message: z.string(),
  received: z.string().optional()
    .describe('Stringified received value'),
  expected: z.string().optional()
    .describe('Expected type or pattern'),
}).strict();
export type ValidationError = z.infer<typeof ValidationErrorSchema>;
