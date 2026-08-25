import { z } from 'zod';
import {
  ObservationIdSchema,
  EvidenceIdSchema,
  EntityIdSchema,
  EntityHypothesisIdSchema,
  SourceIdSchema,
  HypothesisIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema, EventTimeSchema } from '../common/timestamps.js';
import { ProvenanceSchema } from '../common/provenance.js';
import { EvidenceStrengthSchema } from '../common/confidence.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Observation
//
// An observation is a discrete assertion about the world extracted from evidence.
// Observation ≠ Evidence. Evidence is the data package; observations are the
// claims extracted from it.
//
// Entity reference semantics:
//   entityIds: entities that this observation is already linked to (canonical)
//   candidateEntityHypothesisIds: identity-resolution hypotheses that could
//     explain an unresolved entity mention (NOT canonical EntityIds)
//
// Score semantics:
//   strength: EvidenceStrengthSchema — quality and strength of this observation.
//   NOT called "confidence" because that term is reserved for analytical
//   confidence in model output.
// ============================================================================

export const ObservationTypeSchema = z.enum([
  'FACTUAL',
  'TEMPORAL',
  'SPATIAL',
  'RELATIONAL',
  'IDENTITY',
  'BEHAVIORAL',
  'FINANCIAL',
  'COMMUNICATION',
  'OTHER',
]);
export type ObservationType = z.infer<typeof ObservationTypeSchema>;

export const ObservationSchema = z.object({
  id: ObservationIdSchema,
  evidenceId: EvidenceIdSchema
    .describe('The evidence package this observation was extracted from'),
  sourceId: SourceIdSchema
    .describe('Source system of origin'),
  type: ObservationTypeSchema,
  content: z.string().min(1).max(10000)
    .describe('The assertion extracted from evidence'),
  entityIds: z.array(EntityIdSchema)
    .describe('Canonical entities this observation is already linked to'),
  candidateEntityHypothesisIds: z.array(EntityHypothesisIdSchema).optional()
    .describe('Identity-resolution hypotheses that could explain an unresolved entity mention. NOT canonical EntityIds.'),
  hypothesisIds: z.array(HypothesisIdSchema).optional()
    .describe('Hypotheses this observation relates to'),
  strength: EvidenceStrengthSchema
    .describe('Quality and strength of this observation'),
  provenance: ProvenanceSchema,
  observedAt: EventTimeSchema.optional()
    .describe('When this observation occurred in the real world'),
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type Observation = z.infer<typeof ObservationSchema>;
