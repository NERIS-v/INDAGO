import { z } from 'zod';
import {
  EvidenceIdSchema,
  SourceIdSchema,
  CaseIdSchema,
} from '../common/ids.js';
import { EvidencePostureSchema, EvidenceStrengthSchema } from '../common/confidence.js';
import { BaseEventSchema } from './base-event.js';

// ============================================================================
// Evidence Events
//
// Typed events for evidence lifecycle.
// ============================================================================

export const EvidenceIngestedPayloadSchema = z.object({
  evidenceId: EvidenceIdSchema,
  sourceId: SourceIdSchema,
  caseId: CaseIdSchema,
  type: z.string(),
  title: z.string(),
  observationCount: z.number().int(),
  entityCount: z.number().int(),
}).strict();
export type EvidenceIngestedPayload = z.infer<typeof EvidenceIngestedPayloadSchema>;

export const EvidenceIngestedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('EVIDENCE_INGESTED'),
  payload: EvidenceIngestedPayloadSchema,
}).strict();

export const EvidenceProcessedPayloadSchema = z.object({
  evidenceId: EvidenceIdSchema,
  observationCount: z.number().int(),
  entityCount: z.number().int(),
  processingTimeMs: z.number().int(),
}).strict();
export type EvidenceProcessedPayload = z.infer<typeof EvidenceProcessedPayloadSchema>;

export const EvidenceProcessedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('EVIDENCE_PROCESSED'),
  payload: EvidenceProcessedPayloadSchema,
}).strict();

export const EvidenceReviewedPayloadSchema = z.object({
  evidenceId: EvidenceIdSchema,
  reviewer: z.string(),
  decision: z.enum(['APPROVED', 'REJECTED', 'NEEDS_MORE_INFO']),
  posture: EvidencePostureSchema,
  strength: EvidenceStrengthSchema,
}).strict();
export type EvidenceReviewedPayload = z.infer<typeof EvidenceReviewedPayloadSchema>;

export const EvidenceReviewedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('EVIDENCE_REVIEWED'),
  payload: EvidenceReviewedPayloadSchema,
}).strict();

export const EvidenceVerifiedPayloadSchema = z.object({
  evidenceId: EvidenceIdSchema,
  verifiedBy: z.string(),
  strength: EvidenceStrengthSchema,
  posture: EvidencePostureSchema,
}).strict();
export type EvidenceVerifiedPayload = z.infer<typeof EvidenceVerifiedPayloadSchema>;

export const EvidenceVerifiedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('EVIDENCE_VERIFIED'),
  payload: EvidenceVerifiedPayloadSchema,
}).strict();

export const EvidenceRejectedPayloadSchema = z.object({
  evidenceId: EvidenceIdSchema,
  rejectedBy: z.string(),
  reason: z.string(),
}).strict();
export type EvidenceRejectedPayload = z.infer<typeof EvidenceRejectedPayloadSchema>;

export const EvidenceRejectedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('EVIDENCE_REJECTED'),
  payload: EvidenceRejectedPayloadSchema,
}).strict();

export const EvidenceEventSchema = z.discriminatedUnion('eventType', [
  EvidenceIngestedEventSchema,
  EvidenceProcessedEventSchema,
  EvidenceReviewedEventSchema,
  EvidenceVerifiedEventSchema,
  EvidenceRejectedEventSchema,
]);
export type EvidenceEvent = z.infer<typeof EvidenceEventSchema>;
