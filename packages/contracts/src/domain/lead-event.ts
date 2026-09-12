import { z } from 'zod';
import { LeadIdSchema, CaseIdSchema } from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';

// ============================================================================
// LeadEvent
//
// Append-only record of a Lead's own lifecycle (creation, evidence attach,
// status transition, alternative-explanation addition) — the "Persist lead
// provenance" P4 deliverable. Distinct from Lead.provenance
// (ProvenanceChainSchema), which traces EVIDENTIARY lineage back to source
// material; LeadEvent traces the RECORD's own history, mirroring
// TemporalStateChange's append-only discipline (D6) applied to leads.
// ============================================================================

export const LeadEventTypeSchema = z.enum([
  'LEAD_CREATED',
  'EVIDENCE_ATTACHED',
  'STATUS_CHANGED',
  'ALTERNATIVE_EXPLANATION_ADDED',
]);
export type LeadEventType = z.infer<typeof LeadEventTypeSchema>;

export const LeadEventSchema = z.object({
  id: z.string().uuid(),
  leadId: LeadIdSchema,
  caseId: CaseIdSchema,
  eventType: LeadEventTypeSchema,
  actor: z.string(),
  payload: z.record(z.unknown())
    .describe('Event-specific detail (e.g. { from, to } for STATUS_CHANGED)'),
  sequence: z.number().int().nonnegative()
    .describe('Monotonic per leadId — deterministic replay order'),
  createdAt: ObservedTimeSchema,
}).strict();
export type LeadEvent = z.infer<typeof LeadEventSchema>;
