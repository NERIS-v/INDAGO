import { z } from 'zod';
import {
  EvidenceRequestIdSchema,
  InvestigativeGapIdSchema,
  HypothesisIdSchema,
  EvidenceIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { ExpectedInformationGainSchema } from '../common/confidence.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Evidence Request
//
// A request for evidence to address an investigative gap.
// Created by the investigation workflow — NOT ingested.
// Uses ObservedTime for createdAt, not IngestionTime.
// ============================================================================

export const EvidenceRequestStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'AUTHORIZED',
  'IN_PROGRESS',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
]);
export type EvidenceRequestStatus = z.infer<typeof EvidenceRequestStatusSchema>;

export const EvidenceUtilitySchema = z.object({
  expectedInformationGain: ExpectedInformationGainSchema
    .describe('Expected reduction in uncertainty'),
  eig: ExpectedInformationGainSchema
    .describe('Alias for expectedInformationGain in EIG framework'),
  relevance: z.number().min(0).max(1)
    .describe('How relevant this evidence is to the investigation'),
  feasibility: z.number().min(0).max(1)
    .describe('How feasible it is to obtain this evidence'),
  cost: z.number().min(0).max(1)
    .describe('Relative cost of obtaining this evidence (0 = low, 1 = high)'),
  lambda: z.number().min(0).max(1).optional()
    .describe('Weighting factor for utility calculation'),
  score: z.number().min(0).max(1)
    .describe('Combined utility score'),
}).strict();
export type EvidenceUtility = z.infer<typeof EvidenceUtilitySchema>;

export const EvidenceRequestSchema = z.object({
  id: EvidenceRequestIdSchema,
  gapId: InvestigativeGapIdSchema
    .describe('The investigative gap this request aims to address'),
  hypothesisIds: z.array(HypothesisIdSchema)
    .describe('Hypotheses this evidence would inform'),
  evidenceType: z.string().min(1)
    .describe('Type of evidence being requested'),
  description: z.string().min(1).max(5000)
    .describe('Detailed description of what is needed'),
  utility: EvidenceUtilitySchema
    .describe('Utility analysis for this evidence request'),
  rationale: z.string().min(1).max(5000)
    .describe('Why this evidence is needed'),
  status: EvidenceRequestStatusSchema,
  authorizedBy: z.string().optional()
    .describe('Who authorized this request'),
  resultingEvidenceIds: z.array(EvidenceIdSchema)
    .describe('Evidence produced in response to this request'),
  createdBy: z.string().min(1)
    .describe('Who created this request'),
  createdAt: ObservedTimeSchema
    .describe('When this request was created by the investigation workflow'),
  updatedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type EvidenceRequest = z.infer<typeof EvidenceRequestSchema>;
