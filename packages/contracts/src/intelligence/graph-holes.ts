import { z } from 'zod';
import {
  InvestigationIdSchema,
  GraphNodeIdSchema,
  GraphVersionIdSchema,
  InvestigativeGapIdSchema,
} from '../common/ids.js';
import { StructuralSignalSchema } from '../common/confidence.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { RelationTypeSchema } from '../domain/relation.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Graph Holes
//
// Detects missing edges/paths in the investigation graph — structural gaps
// that may indicate missing evidence, unresolved entities, or investigation
// blind spots.
//
// SEPARATION FROM INVESTIGATIVE GAPS:
//   GraphHoleType (this file): STRUCTURAL detection category in the graph
//     MISSING_EDGE, MISSING_PATH, ISOLATED_NODE, etc.
//
//   GapType (domain/investigative-gap.ts): BROAD DOMAIN reason/classification
//     MISSING_EVIDENCE, UNRESOLVED_IDENTITY, etc.
//
// Flow: GRAPH HOLE → candidate missing edge → possible explanations
//       → gap classification → evidence request
//
// A graph hole is NOT itself a fact.
// It is a candidate missing relationship / analytical gap.
// It must NOT include isCriminal, isHiddenByCriminal, or intentional fields.
// ============================================================================

export const GraphHoleTypeSchema = z.enum([
  'MISSING_EDGE',
  'MISSING_PATH',
  'ISOLATED_NODE',
  'BROKEN_CHAIN',
  'TEMPORAL_GAP',
  'COMMUNITY_BOUNDARY',
]).describe(
  'Structural detection category in the graph. Distinct from GapType (domain/investigative-gap.ts) ' +
  'which describes the broad domain reason/classification.'
);
export type GraphHoleType = z.infer<typeof GraphHoleTypeSchema>;

export const GraphHoleSchema = z.object({
  investigationId: InvestigationIdSchema,
  graphVersionId: GraphVersionIdSchema,
  type: GraphHoleTypeSchema
    .describe('Structural detection category (NOT GapType)'),
  investigationGapId: InvestigativeGapIdSchema.optional()
    .describe('Associated InvestigativeGap, if one has been classified from this hole'),
  nodeIds: z.array(GraphNodeIdSchema)
    .describe('Nodes involved in this hole'),
  expectedEdgeType: RelationTypeSchema
    .describe('Type of edge expected but missing'),
  significance: StructuralSignalSchema
    .describe('How significant this hole is in the graph topology'),
  description: z.string()
    .describe('Human-readable description of the hole'),
  suggestedEvidenceTypes: z.array(z.string()).optional()
    .describe('Evidence types that might fill this hole'),
  detectedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict();
export type GraphHole = z.infer<typeof GraphHoleSchema>;

export const GraphHoleDetectionRequestSchema = z.object({
  investigationId: InvestigationIdSchema,
  graphVersionId: GraphVersionIdSchema,
  minSignificance: StructuralSignalSchema.optional()
    .describe('Minimum significance threshold'),
  holeTypes: z.array(GraphHoleTypeSchema).optional()
    .describe('Filter by hole type'),
}).strict();
export type GraphHoleDetectionRequest = z.infer<typeof GraphHoleDetectionRequestSchema>;
