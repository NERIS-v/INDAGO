import { z } from 'zod';
import { LeadIdSchema, ObservationIdSchema } from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';

// ============================================================================
// LeadEvidenceLink
//
// Dedicated evidence FOR/AGAINST attach surface for a Lead (P4). One row per
// (leadId, observationId, verdict). This is an EVIDENTIARY RELEVANCE verdict
// — FOR means "this observation supports pursuing the lead", AGAINST means
// "this observation weighs against it" — never a truth/guilt verdict.
// ============================================================================

export const LeadEvidenceVerdictSchema = z.enum(['FOR', 'AGAINST']);
export type LeadEvidenceVerdict = z.infer<typeof LeadEvidenceVerdictSchema>;

export const LeadEvidenceLinkSchema = z.object({
  id: z.string().uuid(),
  leadId: LeadIdSchema,
  observationId: ObservationIdSchema,
  verdict: LeadEvidenceVerdictSchema,
  rationale: z.string().max(2000).optional()
    .describe('Why this observation was attached with this verdict'),
  addedBy: z.string()
    .describe('Principal (human or system actor) who attached this evidence'),
  createdAt: ObservedTimeSchema,
}).strict();
export type LeadEvidenceLink = z.infer<typeof LeadEvidenceLinkSchema>;

export const AttachLeadEvidenceRequestSchema = z.object({
  observationId: ObservationIdSchema,
  verdict: LeadEvidenceVerdictSchema,
  rationale: z.string().max(2000).optional(),
}).strict();
export type AttachLeadEvidenceRequest = z.infer<typeof AttachLeadEvidenceRequestSchema>;
