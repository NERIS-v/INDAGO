import { z } from 'zod';
import {
  ObservationIdSchema,
  EvidenceIdSchema,
  SourceIdSchema,
  CaseIdSchema,
} from '../common/ids.js';
import { EvidenceStrengthSchema } from '../common/confidence.js';
import { ObservationTypeSchema } from '../domain/observation.js';
import { BaseEventSchema } from './base-event.js';

// ============================================================================
// Observation Events
//
// Typed events for the observation lifecycle (M-A06).
//
// ONLY OBSERVATION_EXTRACTED is implemented in M-A06. OBSERVATION_VALIDATED
// and OBSERVATION_CONTRADICTED belong to later validation/corroboration work
// and MUST NOT be produced here.
//
// Payload guidance: the payload deliberately does NOT carry unbounded
// Observation.content or candidateMentions — bounded metadata only, so the
// event channel never floods with free text. Full content is read back from
// the durable store via the observation id.
// ============================================================================

export const ObservationExtractedPayloadSchema = z.object({
  observationId: ObservationIdSchema,
  evidenceId: EvidenceIdSchema,
  sourceId: SourceIdSchema,
  caseId: CaseIdSchema,
  type: ObservationTypeSchema,
  strength: EvidenceStrengthSchema,
  candidateMentionCount: z.number().int().min(0)
    .describe('Number of candidate mentions (bounded metadata; content intentionally excluded)'),
}).strict();
export type ObservationExtractedPayload = z.infer<typeof ObservationExtractedPayloadSchema>;

export const ObservationExtractedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('OBSERVATION_EXTRACTED'),
  payload: ObservationExtractedPayloadSchema,
}).strict();
export type ObservationExtractedEvent = z.infer<typeof ObservationExtractedEventSchema>;

export const ObservationEventSchema = z.discriminatedUnion('eventType', [
  ObservationExtractedEventSchema,
]);
export type ObservationEvent = z.infer<typeof ObservationEventSchema>;