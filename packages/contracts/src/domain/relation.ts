import { z } from 'zod';
import {
  RelationHypothesisIdSchema,
  EntityIdSchema,
  ObservationIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema, TemporalIntervalSchema } from '../common/timestamps.js';
import { RelationSupportSchema, StructuralSignalSchema } from '../common/confidence.js';
import { ProvenanceSchema } from '../common/provenance.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Relation
//
// Relations describe connections between entities.
// A relation type describes the observed/inferred relationship category,
// NOT criminality.
//
// RelationHypothesis uses RelationSupport (not StructuralSignal).
// StructuralSignal is graph-theoretic importance, NOT relationship support.
//
// temporalInterval uses TemporalIntervalSchema (not EventTimeSchema).
// A relationship's active period is an interval, not a point event.
// ============================================================================

export const RelationTypeSchema = z.enum([
  'communication',
  'financial',
  'ownership',
  'co-location',
  'association',
  'organizational',
  'transport',
  'family',
  'vehicle',
  'case-link',
  'other',
]).describe(
  'Relationship category, NOT criminality. Association means the evidence supports ' +
  'an association claim — not merely that two entities appear in the same record.'
);
export type RelationType = z.infer<typeof RelationTypeSchema>;

export const RelationStatusSchema = z.enum([
  'HYPOTHESIZED',
  'SUPPORTED',
  'CONTRADICTED',
  'RESOLVED',
  'ARCHIVED',
]);
export type RelationStatus = z.infer<typeof RelationStatusSchema>;

/**
 * RelationHypothesis — proposes that a relationship exists between two entities.
 * Uses RelationSupport, NOT StructuralSignal.
 */
export const RelationHypothesisSchema = z.object({
  id: RelationHypothesisIdSchema,
  sourceEntityId: EntityIdSchema,
  targetEntityId: EntityIdSchema,
  relationType: RelationTypeSchema,
  support: RelationSupportSchema
    .describe('Support for the existence/type of this relationship given available evidence'),
  evidenceBasis: z.array(ObservationIdSchema)
    .describe('Observations supporting this relationship'),
  contradictions: z.array(ObservationIdSchema).optional()
    .describe('Observations contradicting this relationship'),
  temporalInterval: TemporalIntervalSchema.optional()
    .describe('Interval over which this relationship was active'),
  directed: z.boolean().default(true)
    .describe('Whether this relationship is directional'),
  strength: StructuralSignalSchema.optional()
    .describe('Graph-theoretic importance of this edge, NOT relationship quality'),
  status: RelationStatusSchema,
  provenance: ProvenanceSchema,
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type RelationHypothesis = z.infer<typeof RelationHypothesisSchema>;
