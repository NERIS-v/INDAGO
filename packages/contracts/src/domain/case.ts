import { z } from 'zod';
import {
  CaseIdSchema,
  InvestigationIdSchema,
  SourceIdSchema,
  EntityIdSchema,
  EvidenceIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema, TemporalIntervalSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';
import { LabelSchema, TagSchema } from '../common/metadata.js';

// ============================================================================
// Case
//
// The top-level container for all investigative work in INDAGO.
// A case may contain multiple investigations.
// ============================================================================

export const CaseStatusSchema = z.enum([
  'OPEN',
  'ACTIVE',
  'CLOSED',
  'ARCHIVED',
]);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;

export const CaseSchema = z.object({
  id: CaseIdSchema,
  title: z.string().min(1).max(500),
  description: z.string().max(10000),
  status: CaseStatusSchema,
  assignedTo: z.string().min(1).describe('Primary investigator'),
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  closedAt: ObservedTimeSchema.optional(),
  investigationIds: z.array(InvestigationIdSchema),
  sourceIds: z.array(SourceIdSchema)
    .describe('Data sources associated with this case'),
  entityIds: z.array(EntityIdSchema)
    .describe('All entities known to this case'),
  evidenceIds: z.array(EvidenceIdSchema)
    .describe('All evidence associated with this case'),
  jurisdiction: z.string().optional(),
  incidentDateRange: TemporalIntervalSchema.optional()
    .describe('Time range of the underlying incident'),
  labels: z.array(LabelSchema).optional(),
  tags: z.array(TagSchema).optional(),
  metadata: MetadataSchema.optional(),
}).strict();
export type Case = z.infer<typeof CaseSchema>;
