import { z } from 'zod';
import {
  ClaimIdSchema,
  InvestigationIdSchema,
  HypothesisIdSchema,
  ObservationIdSchema,
  EvidenceIdSchema,
} from '../common/ids.js';
import { AnalyticalConfidenceSchema, EvidenceStrengthSchema } from '../common/confidence.js';
import { ProvenanceChainSchema } from '../common/provenance.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Claim Grounding
//
// A claim is a concrete assertion made by the agent.
// Claims must be grounded in observations and evidence.
// ============================================================================

export const ClaimTypeSchema = z.enum([
  'IDENTITY',
  'RELATIONSHIP',
  'TEMPORAL',
  'SPATIAL',
  'BEHAVIORAL',
  'FINANCIAL',
  'COMMUNICATION',
  'INFERENCE',
  'OTHER',
]);
export type ClaimType = z.infer<typeof ClaimTypeSchema>;

export const ClaimStatusSchema = z.enum([
  'PROPOSED',
  'SUPPORTED',
  'CONTRADICTED',
  'REFUTED',
  'WITHDRAWN',
]);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;

export const ClaimGroundingSchema = z.object({
  id: ClaimIdSchema,
  investigationId: InvestigationIdSchema,
  hypothesisId: HypothesisIdSchema.optional()
    .describe('Hypothesis this claim belongs to'),
  type: ClaimTypeSchema,
  status: ClaimStatusSchema,
  statement: z.string().min(1).max(10000)
    .describe('The claim being made'),
  confidence: AnalyticalConfidenceSchema
    .describe('Confidence in this claim'),
  supportingObservationIds: z.array(ObservationIdSchema)
    .describe('Observations that ground this claim'),
  contradictingObservationIds: z.array(ObservationIdSchema)
    .describe('Observations that contradict this claim'),
  supportingEvidenceIds: z.array(EvidenceIdSchema)
    .describe('Evidence packages supporting this claim'),
  contradictingEvidenceIds: z.array(EvidenceIdSchema)
    .describe('Evidence packages contradicting this claim'),
  evidenceStrength: EvidenceStrengthSchema
    .describe('Overall strength of supporting evidence'),
  provenance: ProvenanceChainSchema
    .describe('Full chain of reasoning to source observations'),
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type ClaimGrounding = z.infer<typeof ClaimGroundingSchema>;
