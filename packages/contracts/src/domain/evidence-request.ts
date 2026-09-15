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
import { EvidenceTypeSchema } from './evidence.js';

// ============================================================================
// Evidence Request
//
// A request for evidence to address an investigative gap.
// Created by the investigation workflow — NOT ingested.
// Uses ObservedTime for createdAt, not IngestionTime.
//
// PR10 NAMING (frozen):
//   expectedInformationGain  = request-level heuristic: how much this specific
//                              additional evidence request is expected to
//                              discriminate among the EXPLICITLY CONSIDERED
//                              competing explanations (bounded context).
//   expectedInformationValue (PR5) = candidate/GraphHole-level deterministic
//                              decision-value signal computed by the frozen
//                              PR5 formula (scoring.ts). These are RELATED but
//                              NOT identical quantities. EvidenceRequest DOES
//                              NOT carry an `expectedInformationValue` field.
//
// UTILITY (PR10 freeze):
//   EvidenceUtilitySchema.score composition is defined by
//   EVIDENCE_UTILITY_POLICY_V1 (intelligence/evidence-utility-policy.ts).
//   `lambda` is DEPRECATED (optional, ignored by the frozen policy).
//
// SELECTION (PR10 freeze):
//   The selection-level candidate/result contracts live in
//   intelligence/next-best-evidence.ts. An EvidenceRequest is the REQUEST
//   ENVELOPE; a NextBestEvidenceSelectionResult is the ranking of candidate
//   requests BEFORE acquisition and authorization.
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

/**
 * Normalized utility record for one evidence request (PR10 freeze).
 *
 * Every component is a NORMALIZED HEURISTIC in [0,1], NOT a calibrated
 * probability and NOT a calibrated information-theoretic quantity.
 *
 * Semantics (frozen by EVIDENCE_UTILITY_POLICY_V1):
 *   expectedInformationGain : greater = greater expected reduction of
 *      uncertainty among the explicitly considered competing explanations
 *      (hypotheses/explanations actually represented in the supplied bounded
 *      context — never an unconstrained global-world interpretation).
 *   relevance                : greater = stronger direct connection to the
 *      GraphHole and the hypotheses being discriminated.
 *   feasibility              : greater = easier/more realistically obtainable
 *      within the investigation's authorized scope.
 *   cost                     : greater = more expensive/burdensome to obtain.
 *      Cost is directionally INVERTED in utility scoring: effectiveCost = 1 - cost.
 *   score                    : combined utility score per EVIDENCE_UTILITY_POLICY_V1
 *      (weighted composition over expectedInformationGain, relevance,
 *      feasibility, effectiveCost). DOES NOT include `lambda`.
 */
export const EvidenceUtilitySchema = z.object({
  expectedInformationGain: ExpectedInformationGainSchema
    .describe(
      'Request-level expected information gain (normalized heuristic, NOT a probability). ' +
      'Expected reduction of uncertainty among the EXPLICITLY CONSIDERED competing explanations.',
    ),
  eig: ExpectedInformationGainSchema
    .describe(
      'Alias for expectedInformationGain (frozen PR10 alias). ' +
      'EVIDENCE_UTILITY_POLICY_V1 requires eig === expectedInformationGain; ' +
      'a divergent value is schema-invalid.',
    ),
  relevance: z.number().min(0).max(1)
    .describe(
      'Relevance (normalized heuristic, NOT a probability). ' +
      'Higher = stronger direct connection to the GraphHole and the hypotheses being discriminated.',
    ),
  feasibility: z.number().min(0).max(1)
    .describe(
      'Feasibility (normalized heuristic, NOT a probability). ' +
      'Higher = easier/more realistically obtainable within the investigation\'s authorized scope.',
    ),
  cost: z.number().min(0).max(1)
    .describe(
      'Cost (normalized heuristic, NOT a probability, NOT a monetary value). ' +
      'Higher = more expensive/burdensome to obtain. ' +
      'Directionally inverted in utility scoring (effectiveCost = 1 - cost).',
    ),
  lambda: z.number().min(0).max(1).optional()
    .describe(
      'DEPRECATED. Formerly "weighting factor for utility calculation". ' +
      'The frozen EVIDENCE_UTILITY_POLICY_V1 composition uses fixed policy weights and does NOT ' +
      'consume lambda. Retained ONLY as an optional compatibility field and ignored by the frozen ' +
      'formula; a future policy version may remove it.',
    ),
  score: z.number().min(0).max(1)
    .describe(
      'Combined utility score per EVIDENCE_UTILITY_POLICY_V1. Deterministic weighted composition of ' +
      'expectedInformationGain, relevance, feasibility and effectiveCost (= 1 - cost).',
    ),
}).strict().superRefine((utility, ctx) => {
  if (utility.eig !== utility.expectedInformationGain) {
    ctx.addIssue({
      code: 'custom',
      message: 'eig must equal expectedInformationGain (frozen PR10 alias).',
    });
  }
});
export type EvidenceUtility = z.infer<typeof EvidenceUtilitySchema>;

export const EvidenceRequestSchema = z.object({
  id: EvidenceRequestIdSchema,
  gapId: InvestigativeGapIdSchema
    .describe('The investigative gap this request aims to address'),
  hypothesisIds: z.array(HypothesisIdSchema)
    .describe('Hypotheses this evidence would inform'),
  evidenceType: EvidenceTypeSchema
    .describe('Canonical evidence type (EvidenceTypeSchema) of the requested evidence. Authoritative PR10 vocabulary.'),
  description: z.string().min(1).max(5000)
    .describe('Detailed description of what is needed'),
  utility: EvidenceUtilitySchema
    .describe('Utility analysis for this evidence request (composition per EVIDENCE_UTILITY_POLICY_V1)'),
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
