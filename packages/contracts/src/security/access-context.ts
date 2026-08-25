import { z } from 'zod';
import { InvestigationIdSchema, CaseIdSchema } from '../common/ids.js';

// ============================================================================
// Access Context
//
// Context for access control decisions.
// ============================================================================

export const AccessLevelSchema = z.enum([
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
  'CLASSIFIED',
]);
export type AccessLevel = z.infer<typeof AccessLevelSchema>;

export const AccessContextSchema = z.object({
  userId: z.string().min(1),
  roles: z.array(z.string()).min(1),
  permissions: z.array(z.string()),
  accessLevel: AccessLevelSchema,
  investigationId: InvestigationIdSchema.optional()
    .describe('Specific investigation context, if any'),
  caseId: CaseIdSchema.optional()
    .describe('Specific case context, if any'),
  sessionId: z.string().uuid().optional()
    .describe('Session for audit trail'),
  ipAddress: z.string().optional()
    .describe('Client IP for audit'),
  userAgent: z.string().optional()
    .describe('Client user agent'),
}).strict();
export type AccessContext = z.infer<typeof AccessContextSchema>;
