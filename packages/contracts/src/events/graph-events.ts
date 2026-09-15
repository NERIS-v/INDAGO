import { z } from 'zod';
import {
  GraphNodeIdSchema,
  GraphEdgeIdSchema,
  GraphVersionIdSchema,
  InvestigationIdSchema,
  CaseIdSchema,
  EntityIdSchema,
  RelationHypothesisIdSchema,
  InvestigativeGapIdSchema,
} from '../common/ids.js';
import { BaseEventSchema } from './base-event.js';
import { RelationTypeSchema } from '../domain/relation.js';
import { GraphNodeTypeSchema } from '../graph/graph-node.js';
import { GraphAnalysisTypeSchema } from '../graph/graph-analysis.js';
import { StructuralSignalSchema } from '../common/confidence.js';
import { GraphHoleTypeSchema, GraphHoleCandidateIdSchema } from '../intelligence/graph-holes.js';
import {
  ReassessmentChangeIdSchema,
  REASSESSMENT_POLICY_VERSION,
  ReassessmentOutcomeSchema,
  ReassessmentRegionIdSchema,
} from '../intelligence/reassessment.js';

// ============================================================================
// Graph Events
//
// Typed events for graph lifecycle.
// ============================================================================

export const GraphVersionCreatedPayloadSchema = z.object({
  graphVersionId: GraphVersionIdSchema,
  investigationId: InvestigationIdSchema,
  versionNumber: z.number().int(),
}).strict();
export type GraphVersionCreatedPayload = z.infer<typeof GraphVersionCreatedPayloadSchema>;

export const GraphVersionCreatedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('GRAPH_VERSION_CREATED'),
  payload: GraphVersionCreatedPayloadSchema,
}).strict();

export const GraphNodeAddedPayloadSchema = z.object({
  nodeId: GraphNodeIdSchema,
  graphVersionId: GraphVersionIdSchema,
  type: GraphNodeTypeSchema
    .describe('Node type (strongly typed, not bare string)'),
  entityId: EntityIdSchema.optional(),
  label: z.string(),
}).strict();
export type GraphNodeAddedPayload = z.infer<typeof GraphNodeAddedPayloadSchema>;

export const GraphNodeAddedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('GRAPH_NODE_ADDED'),
  payload: GraphNodeAddedPayloadSchema,
}).strict();

export const GraphNodeRemovedPayloadSchema = z.object({
  nodeId: GraphNodeIdSchema,
  graphVersionId: GraphVersionIdSchema,
  reason: z.string(),
}).strict();
export type GraphNodeRemovedPayload = z.infer<typeof GraphNodeRemovedPayloadSchema>;

export const GraphNodeRemovedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('GRAPH_NODE_REMOVED'),
  payload: GraphNodeRemovedPayloadSchema,
}).strict();

export const GraphEdgeAddedPayloadSchema = z.object({
  edgeId: GraphEdgeIdSchema,
  graphVersionId: GraphVersionIdSchema,
  sourceNodeId: GraphNodeIdSchema,
  targetNodeId: GraphNodeIdSchema,
  relationType: RelationTypeSchema,
  relationHypothesisId: RelationHypothesisIdSchema.optional(),
}).strict();
export type GraphEdgeAddedPayload = z.infer<typeof GraphEdgeAddedPayloadSchema>;

export const GraphEdgeAddedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('GRAPH_EDGE_ADDED'),
  payload: GraphEdgeAddedPayloadSchema,
}).strict();

export const GraphEdgeRemovedPayloadSchema = z.object({
  edgeId: GraphEdgeIdSchema,
  graphVersionId: GraphVersionIdSchema,
  reason: z.string(),
}).strict();
export type GraphEdgeRemovedPayload = z.infer<typeof GraphEdgeRemovedPayloadSchema>;

export const GraphEdgeRemovedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('GRAPH_EDGE_REMOVED'),
  payload: GraphEdgeRemovedPayloadSchema,
}).strict();

export const GraphAnalysisCompletedPayloadSchema = z.object({
  graphVersionId: GraphVersionIdSchema,
  analysisType: GraphAnalysisTypeSchema
    .describe('Category of analysis performed (strongly typed)'),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  computationTimeMs: z.number().int().nonnegative(),
}).strict();
export type GraphAnalysisCompletedPayload = z.infer<typeof GraphAnalysisCompletedPayloadSchema>;

export const GraphAnalysisCompletedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('GRAPH_ANALYSIS_COMPLETED'),
  payload: GraphAnalysisCompletedPayloadSchema,
}).strict();

export const GraphHoleDetectedPayloadSchema = z.object({
  holeId: GraphHoleCandidateIdSchema
    .describe('Deterministic candidate identity of the detected hole.'),
  caseId: CaseIdSchema,
  graphVersionId: GraphVersionIdSchema,
  holeType: GraphHoleTypeSchema
    .describe('Structural detection category (strongly typed, NOT GapType).'),
  investigationGapId: InvestigativeGapIdSchema.optional()
    .describe('Associated InvestigativeGap, if one exists'),
  nodeIds: z.array(GraphNodeIdSchema)
    .describe('Canonical graph nodes involved in this hole'),
  expectedEdgeType: RelationTypeSchema
    .describe('Type of edge expected but missing (strongly typed)'),
  significance: StructuralSignalSchema
    .describe('Graph-theoretic significance of this hole'),
  description: z.string(),
}).strict();
export type GraphHoleDetectedPayload = z.infer<typeof GraphHoleDetectedPayloadSchema>;

export const GraphHoleDetectedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('GRAPH_HOLE_DETECTED'),
  payload: GraphHoleDetectedPayloadSchema,
}).strict();

// ----------------------------------------------------------------------------
// Graph-Hole Reassessed (Phase 5A-PR12)
//
// Represents a COMPLETED incremental reassessment semantic outcome. It never
// implies a canonical graph mutation unless one actually happened through the
// appropriate authority path, and it NEVER retriggers PR12 by itself.
// ----------------------------------------------------------------------------

export const GraphHoleReassessedPayloadSchema = z.object({
  changeId: ReassessmentChangeIdSchema
    .describe('Deterministic id of the authoritative change that drove the reassessment.'),
  caseId: CaseIdSchema,
  graphVersionId: GraphVersionIdSchema
    .describe('Single authoritative version the reassessment was evaluated against.'),
  regionId: ReassessmentRegionIdSchema
    .describe('Content-addressed region reassessed (a graph-affecting reassessment may have derived a new id).'),
  candidateId: GraphHoleCandidateIdSchema.optional()
    .describe('Candidate reassessed, when a candidate was evaluated.'),
  outcome: ReassessmentOutcomeSchema
    .describe('Deterministic lifecycle conclusion (STRENGTHENED / WEAKENED / RESOLVED / CONTRADICTED / SUPERSEDED).'),
  policyVersion: z.literal(REASSESSMENT_POLICY_VERSION),
  assessmentsAppended: z.number().int().nonnegative(),
}).strict();
export type GraphHoleReassessedPayload = z.infer<typeof GraphHoleReassessedPayloadSchema>;

export const GraphHoleReassessedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('GRAPH_HOLE_REASSESSED'),
  payload: GraphHoleReassessedPayloadSchema,
}).strict();

export const GraphEventSchema = z.discriminatedUnion('eventType', [
  GraphVersionCreatedEventSchema,
  GraphNodeAddedEventSchema,
  GraphNodeRemovedEventSchema,
  GraphEdgeAddedEventSchema,
  GraphEdgeRemovedEventSchema,
  GraphAnalysisCompletedEventSchema,
  GraphHoleDetectedEventSchema,
  GraphHoleReassessedEventSchema,
]);
export type GraphEvent = z.infer<typeof GraphEventSchema>;
