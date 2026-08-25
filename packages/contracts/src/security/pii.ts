import { z } from 'zod';

// ============================================================================
// PII (Personally Identifiable Information)
//
// Contracts for detecting, classifying, and protecting PII in evidence.
// ============================================================================

export const PIIPatternTypeSchema = z.enum([
  'NAME',
  'EMAIL',
  'PHONE',
  'ADDRESS',
  'SSN',
  'DOB',
  'CREDIT_CARD',
  'BANK_ACCOUNT',
  'LICENSE_PLATE',
  'PASSPORT',
  'OTHER',
]);
export type PIIPatternType = z.infer<typeof PIIPatternTypeSchema>;

export const PIIDetectionSchema = z.object({
  type: PIIPatternTypeSchema,
  value: z.string()
    .describe('The detected PII value (may be masked)'),
  startIndex: z.number().int().nonnegative()
    .describe('Start index in the source text'),
  endIndex: z.number().int().nonnegative()
    .describe('End index in the source text'),
  confidence: z.number().min(0).max(1)
    .describe('Detection confidence'),
  masked: z.boolean()
    .describe('Whether the value has been masked'),
}).strict();
export type PIIDetection = z.infer<typeof PIIDetectionSchema>;

export const PIIMaskingStrategySchema = z.enum([
  'REDACT',
  'HASH',
  'TOKENIZE',
  'PARTIAL_MASK',
  'NONE',
]);
export type PIIMaskingStrategy = z.infer<typeof PIIMaskingStrategySchema>;

export const PIIPolicySchema = z.object({
  patterns: z.array(z.object({
    type: PIIPatternTypeSchema,
    strategy: PIIMaskingStrategySchema,
    required: z.boolean().default(true)
      .describe('Whether this pattern must be masked'),
  })),
  defaultStrategy: PIIMaskingStrategySchema.default('REDACT'),
  auditDetection: z.boolean().default(true)
    .describe('Whether to audit PII detections'),
}).strict();
export type PIIPolicy = z.infer<typeof PIIPolicySchema>;
