import { z } from 'zod';

// ============================================================================
// Sensitivity
//
// Data sensitivity classification for evidence and observations.
// ============================================================================

export const SensitivityLevelSchema = z.enum([
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
  'CLASSIFIED',
]);
export type SensitivityLevel = z.infer<typeof SensitivityLevelSchema>;

export const SensitivityClassificationSchema = z.object({
  level: SensitivityLevelSchema,
  reason: z.string().min(1).max(500)
    .describe('Why this classification was applied'),
  classifiedBy: z.string().min(1)
    .describe('Who classified this data'),
  expiresAt: z.string().optional()
    .describe('ISO 8601 timestamp when classification expires'),
  reviewRequired: z.boolean().default(false)
    .describe('Whether periodic review is required'),
}).strict();
export type SensitivityClassification = z.infer<typeof SensitivityClassificationSchema>;

export const DataClassificationSchema = z.object({
  entityData: SensitivityLevelSchema.default('CONFIDENTIAL'),
  evidenceData: SensitivityLevelSchema.default('CONFIDENTIAL'),
  observationData: SensitivityLevelSchema.default('CONFIDENTIAL'),
  investigationData: SensitivityLevelSchema.default('CONFIDENTIAL'),
  auditData: SensitivityLevelSchema.default('RESTRICTED'),
  systemData: SensitivityLevelSchema.default('INTERNAL'),
}).strict();
export type DataClassification = z.infer<typeof DataClassificationSchema>;
