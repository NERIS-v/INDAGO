import { z } from 'zod';
import {
  LeadIdSchema,
  CaseIdSchema,
  EntityIdSchema,
  ObservationIdSchema,
  EvidenceIdSchema,
} from '../common/ids.js';
import { AnalyticalConfidenceSchema, EvidencePostureSchema } from '../common/confidence.js';
import { ProvenanceChainSchema } from '../common/provenance.js';
import { AlternativeExplanationSchema } from './alternative-explanation.js';
import { LeadPrioritySchema, LeadSourceCandidateTypeSchema } from './lead.js';

// ============================================================================
// LeadDraft
//
// The pure, deterministic output of @indago/lead-generation BEFORE it is
// persisted — no createdAt/updatedAt/status (those are assigned by the
// LeadStore at write time; status always starts NEW). `id` IS already
// deterministic (derived from caseId + sourceCandidateType +
// sourceCandidateKey), so building the same draft twice from an unchanged
// candidate always yields the same id — LeadStore.upsert relies on this for
// idempotent re-generation.
// ============================================================================

export const LeadDraftSchema = z.object({
  id: LeadIdSchema,
  caseId: CaseIdSchema,
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(10000),
  priority: LeadPrioritySchema,
  confidence: AnalyticalConfidenceSchema,
  posture: EvidencePostureSchema,
  relatedEntityIds: z.array(EntityIdSchema),
  supportingObservationIds: z.array(ObservationIdSchema),
  contradictingObservationIds: z.array(ObservationIdSchema).default([]),
  relatedEvidenceIds: z.array(EvidenceIdSchema).default([]),
  sourceCandidateType: LeadSourceCandidateTypeSchema,
  sourceCandidateKey: z.string(),
  sourceCandidateSnapshot: z.record(z.unknown()),
  alternativeExplanations: z.array(AlternativeExplanationSchema).default([]),
  provenance: ProvenanceChainSchema,
}).strict();
export type LeadDraft = z.infer<typeof LeadDraftSchema>;
