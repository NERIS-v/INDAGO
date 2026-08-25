import { z } from 'zod';
import {
  HypothesisIdSchema,
  InvestigationIdSchema,
  ObservationIdSchema,
  EntityIdSchema,
  EvidenceIdSchema,
  ClaimIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { AnalyticalConfidenceSchema } from '../common/confidence.js';
import { ProvenanceChainSchema } from '../common/provenance.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Hypothesis
//
// A working hypothesis in an investigation.
// Grounded in observations, claims, and evidence.
// ============================================================================

export const HypothesisStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'SUPPORTED',
  'CONTRADICTED',
  'ABANDONED',
  'SUPERSEDED',
]);
export type HypothesisStatus = z.infer<typeof HypothesisStatusSchema>;

export const HypothesisSchema = z.object({
  id: HypothesisIdSchema,
  investigationId: InvestigationIdSchema,
  title: z.string().min(1).max(500),
  statement: z.string().min(1).max(5000)
    .describe('Formal hypothesis statement'),
  status: HypothesisStatusSchema,
  confidence: AnalyticalConfidenceSchema
    .describe('Overall confidence in this hypothesis'),
  supportingObservationIds: z.array(ObservationIdSchema)
    .describe('Observations supporting this hypothesis'),
  contradictingObservationIds: z.array(ObservationIdSchema)
    .describe('Observations contradicting this hypothesis'),
  supportingEvidenceIds: z.array(EvidenceIdSchema)
    .describe('Evidence packages supporting this hypothesis'),
  contradictingEvidenceIds: z.array(EvidenceIdSchema)
    .describe('Evidence packages contradicting this hypothesis'),
  relatedEntityIds: z.array(EntityIdSchema)
    .describe('Entities involved in this hypothesis'),
  claimIds: z.array(ClaimIdSchema).optional()
    .describe('Claims made by this hypothesis'),
  parentHypothesisId: HypothesisIdSchema.optional()
    .describe('Parent hypothesis, if this is a refinement'),
  provenance: ProvenanceChainSchema,
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type Hypothesis = z.infer<typeof HypothesisSchema>;
