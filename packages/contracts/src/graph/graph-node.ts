import { z } from 'zod';
import {
  GraphNodeIdSchema,
  EntityIdSchema,
  InvestigationIdSchema,
  GraphVersionIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema, TemporalIntervalSchema } from '../common/timestamps.js';
import { StructuralSignalSchema } from '../common/confidence.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Graph Node
//
// A node in the investigation graph. Nodes represent entities, evidence,
// observations, or other domain objects.
//
// NOTE: GraphNode does NOT contain a generic confidence field.
// Structural importance is captured by structuralImportance (StructuralSignal).
// If node-level analytical confidence is needed later, it should be introduced
// as a named semantic contract after a specific definition is agreed.
// ============================================================================

export const GraphNodeTypeSchema = z.enum([
  'ENTITY',
  'EVIDENCE',
  'OBSERVATION',
  'SOURCE',
  'HYPOTHESIS',
  'LEAD',
  'ARTIFACT',
  'OTHER',
]);
export type GraphNodeType = z.infer<typeof GraphNodeTypeSchema>;

export const GraphNodeSchema = z.object({
  id: GraphNodeIdSchema,
  investigationId: InvestigationIdSchema,
  versionId: GraphVersionIdSchema
    .describe('Graph version this node belongs to'),
  type: GraphNodeTypeSchema,
  entityId: EntityIdSchema.optional()
    .describe('Canonical entity ID if this node represents an entity'),
  label: z.string().min(1).max(500)
    .describe('Human-readable label'),
  structuralImportance: StructuralSignalSchema
    .describe('Graph-theoretic importance. NOT criminal relevance.'),
  observationCount: z.number().int().nonnegative()
    .describe('Number of observations supporting this node'),
  sourceCount: z.number().int().nonnegative()
    .describe('Number of independent sources'),
  temporalRange: TemporalIntervalSchema.optional()
    .describe('Time range this node covers'),
  createdAt: ObservedTimeSchema,
  updatedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type GraphNode = z.infer<typeof GraphNodeSchema>;
