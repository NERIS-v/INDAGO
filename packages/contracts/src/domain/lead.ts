import { z } from 'zod';
import {
  LeadIdSchema,
  InvestigationIdSchema,
  CaseIdSchema,
  EntityIdSchema,
  ObservationIdSchema,
  EvidenceIdSchema,
  InvestigativeGapIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { AnalyticalConfidenceSchema, EvidencePostureSchema } from '../common/confidence.js';
import { ProvenanceChainSchema } from '../common/provenance.js';
import { MetadataSchema } from '../common/metadata.js';
import { AlternativeExplanationSchema } from './alternative-explanation.js';

// ============================================================================
// Lead
//
// An investigative lead — a line of inquiry derived from analysis.
// Leads emerge from hypotheses, observations, and gap analysis.
// ============================================================================

export const LeadStatusSchema = z.enum([
  'NEW',
  'UNDER_REVIEW',
  'ACTIVE',
  'PROMOTED',
  'REJECTED',
  'STALE',
]);
export type LeadStatus = z.infer<typeof LeadStatusSchema>;

export const LeadPrioritySchema = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);
export type LeadPriority = z.infer<typeof LeadPrioritySchema>;

/**
 * Which P4 graph-analytics candidate detector produced this lead
 * (@indago/graphology-projection). Traceable back to the exact analytical
 * signal, never blended into an opaque "AI thinks this is suspicious" score.
 */
export const LeadSourceCandidateTypeSchema = z.enum([
  'BRIDGE',
  'TEMPORAL_BURST',
  'COMMUNITY',
  'CROSS_CASE',
  'MANUAL',
]);
export type LeadSourceCandidateType = z.infer<typeof LeadSourceCandidateTypeSchema>;

export const LeadSchema = z.object({
  id: LeadIdSchema,
  investigationId: InvestigationIdSchema,
  caseId: CaseIdSchema,
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(10000),
  status: LeadStatusSchema,
  priority: LeadPrioritySchema,
  confidence: AnalyticalConfidenceSchema
    .describe('Confidence that this lead is worth pursuing'),
  posture: EvidencePostureSchema
    .describe('Evidence posture tier of the best supporting evidence'),
  relatedEntityIds: z.array(EntityIdSchema)
    .describe('Entities this lead is about'),
  supportingObservationIds: z.array(ObservationIdSchema)
    .describe('Observations giving rise to this lead (evidence FOR)'),
  contradictingObservationIds: z.array(ObservationIdSchema).default([])
    .describe('Observations weighing against this lead (evidence AGAINST)'),
  relatedEvidenceIds: z.array(EvidenceIdSchema)
    .describe('Evidence packages related to this lead'),
  gapIds: z.array(InvestigativeGapIdSchema).optional()
    .describe('Investigative gaps this lead may address'),
  sourceCandidateType: LeadSourceCandidateTypeSchema
    .describe('Which P4 detector produced this lead'),
  sourceCandidateKey: z.string()
    .describe("Deterministic identity key of the originating candidate — re-running the detector reproduces this lead's id"),
  sourceCandidateSnapshot: z.record(z.unknown())
    .describe('The candidate payload at generation time, kept for audit/explainability'),
  alternativeExplanations: z.array(AlternativeExplanationSchema).default([])
    .describe('Non-incriminating alternative readings of the same structural signal'),
  assignedTo: z.string().optional()
    .describe('Person assigned to pursue this lead'),
  provenance: ProvenanceChainSchema,
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  closedAt: ObservedTimeSchema.optional(),
  metadata: MetadataSchema.optional(),
}).strict();
export type Lead = z.infer<typeof LeadSchema>;

/**
 * Legal status transitions for a Lead, enforced by the LeadStore
 * No arbitrary transitions (mirrors GraphVersionStore's lifecycle discipline).
 * Terminal statuses (PROMOTED, REJECTED, STALE) have no outgoing edges.
 */
export const LEAD_STATUS_TRANSITIONS: Readonly<Record<LeadStatus, readonly LeadStatus[]>> = {
  NEW: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['ACTIVE', 'REJECTED', 'STALE'],
  ACTIVE: ['PROMOTED', 'REJECTED', 'STALE'],
  PROMOTED: [],
  REJECTED: [],
  STALE: [],
};