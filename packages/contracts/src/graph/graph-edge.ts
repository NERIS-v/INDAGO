import { z } from 'zod';
import {
  GraphEdgeIdSchema,
  GraphNodeIdSchema,
  GraphVersionIdSchema,
  InvestigationIdSchema,
  RelationHypothesisIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema, TemporalIntervalSchema } from '../common/timestamps.js';
import { StructuralSignalSchema, RelationSupportSchema } from '../common/confidence.js';
import { RelationTypeSchema } from '../domain/relation.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Graph Edge
//
// An edge in the investigation graph. Edges represent relationships
// between nodes.
//
// temporalRange uses TemporalIntervalSchema (not EventTimeSchema).
// A relationship's active period is an interval, not a point event.
// ============================================================================

export const GraphEdgeStatusSchema = z.enum([
  'ACTIVE',
  'CONTRADICTED',
  'ARCHIVED',
]);
export type GraphEdgeStatus = z.infer<typeof GraphEdgeStatusSchema>;

export const GraphEdgeSchema = z.object({
  id: GraphEdgeIdSchema,
  investigationId: InvestigationIdSchema,
  versionId: GraphVersionIdSchema
    .describe('Graph version this edge belongs to'),
  sourceNodeId: GraphNodeIdSchema,
  targetNodeId: GraphNodeIdSchema,
  relationType: RelationTypeSchema,
  relationHypothesisId: RelationHypothesisIdSchema.optional()
    .describe('Underlying relation hypothesis, if applicable'),
  support: RelationSupportSchema
    .describe('Support for this relationship'),
  structuralImportance: StructuralSignalSchema
    .describe('Graph-theoretic importance. NOT criminal relevance.'),
  directed: z.boolean().default(true),
  temporalRange: TemporalIntervalSchema.optional()
    .describe('Interval over which this relationship was active'),
  status: GraphEdgeStatusSchema,
  observationCount: z.number().int().nonnegative(),
  sourceCount: z.number().int().nonnegative(),
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
