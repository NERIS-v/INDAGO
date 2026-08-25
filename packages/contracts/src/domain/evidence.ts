import { z } from 'zod';
import {
  EvidenceIdSchema,
  SourceIdSchema,
  CaseIdSchema,
  InvestigationIdSchema,
  ArtifactIdSchema,
  ObservationIdSchema,
  EntityIdSchema,
  HypothesisIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema, IngestionTimeSchema, EventTimeSchema } from '../common/timestamps.js';
import { ProvenanceSchema } from '../common/provenance.js';
import { EvidenceStrengthSchema, EvidencePostureSchema } from '../common/confidence.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Evidence
//
// Evidence is what INDAGO ingests and reasons about.
// Evidence ≠ Observation. Evidence is a data package; observations are
// extracted assertions about the world.
// ============================================================================

export const EvidenceTypeSchema = z.enum([
  'DOCUMENT',
  'RECORD',
  'TESTIMONY',
  'PHYSICAL',
  'DIGITAL',
  'FINANCIAL',
  'COMMUNICATION',
  'OTHER',
]);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

export const EvidenceStatusSchema = z.enum([
  'INGESTED',
  'PROCESSING',
  'PROCESSED',
  'UNDER_REVIEW',
  'VERIFIED',
  'REJECTED',
  'ARCHIVED',
]);
export type EvidenceStatus = z.infer<typeof EvidenceStatusSchema>;

export const EvidenceSchema = z.object({
  id: EvidenceIdSchema,
  caseId: CaseIdSchema,
  investigationId: InvestigationIdSchema.optional(),
  sourceId: SourceIdSchema,
  type: EvidenceTypeSchema,
  status: EvidenceStatusSchema,
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  artifactIds: z.array(ArtifactIdSchema)
    .describe('Files/documents that constitute this evidence'),
  observationIds: z.array(ObservationIdSchema)
    .describe('Observations extracted from this evidence'),
  entityIds: z.array(EntityIdSchema)
    .describe('Entities referenced by this evidence'),
  hypothesisIds: z.array(HypothesisIdSchema)
    .describe('Hypotheses this evidence supports or contradicts'),
  strength: EvidenceStrengthSchema
    .describe('Quality and strength of the evidence'),
  posture: EvidencePostureSchema
    .describe('Evidence posture tier'),
  provenance: ProvenanceSchema,
  ingestionTime: IngestionTimeSchema,
  observedAt: EventTimeSchema.optional()
    .describe('When the evidence event occurred in the real world'),
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type Evidence = z.infer<typeof EvidenceSchema>;
