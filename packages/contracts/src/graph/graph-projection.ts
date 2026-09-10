import { z } from 'zod';
import {
  CaseIdSchema,
  GraphNodeIdSchema,
  GraphEdgeIdSchema,
} from '../common/ids.js';
import { TemporalIntervalSchema } from '../common/timestamps.js';
import { RelationTypeSchema } from '../domain/relation.js';

// ============================================================================
// Canonical Graph Projection Response Contract (M-A13)
//
// The single, typed representation of a projected graph surfaced to consumers
// (HTTP / internal services). Every graph query construct must serialize to
// this shape — Graphology is an internal derived structure and must NEVER leak
// across the service boundary.
//
// Truncation is EXPLICIT and never silent:
//   - `nodeCount` / `edgeCount`   — the cardinality RETURNED in this projection
//   - `sourceNodeCount` / `sourceEdgeCount` — the cardinality of the AUTHORITATIVE
//     input BEFORE any projection bound was applied
//   - `nodeLimit` / `edgeLimit`   — the hard projection bounds for this build
//   - `truncated`                 — true when input cardinality exceeded a limit
//
// `temporalRange` (TemporalIntervalSchema) is carried verbatim from the
// authoritative record (never fabricated). `entityType` is a nullable string:
// the authoritative domain does not yet constrain it to an enum, and the read
// model must stay truthful to any persisted value.
// ============================================================================

/**
 * Whether a projection bound truncated the returned node/edge lists.
 */
export const GraphTruncationSchema = z.object({
  nodes: z.boolean()
    .describe('true when the authoritative node input exceeded nodeLimit'),
  edges: z.boolean()
    .describe('true when the authoritative edge input exceeded edgeLimit'),
}).strict();
export type GraphTruncation = z.infer<typeof GraphTruncationSchema>;

/**
 * Canonical projected node. Node identity = canonical EntityId.
 */
export const ProjectedGraphNodeSchema = z.object({
  id: GraphNodeIdSchema,
  entityType: z.string().nullable()
    .describe('Canonical entity type string, or null when unknown'),
  canonicalName: z.string().max(500)
    .describe('Best-known canonical name of the entity'),
  temporalRange: TemporalIntervalSchema.optional()
    .describe('Domain-validity interval attached to this entity for this projection, if any'),
}).strict();
export type ProjectedGraphNode = z.infer<typeof ProjectedGraphNodeSchema>;

/**
 * Canonical projected edge. Edge identity = canonical RelationId.
 *
 * `provenance` is the persisted provenance record carried verbatim. The read
 * model does NOT re-shape it into the strict ProvenanceSchema: authoritative
 * relations were written at times with (validly) looser provenance shapes, and
 * this contract must reflect what is actually persisted. Write paths that
 * require strict provenance apply ProvenanceSchema at THEIR boundary.
 */
export const ProjectedGraphEdgeSchema = z.object({
  id: GraphEdgeIdSchema,
  relationType: RelationTypeSchema
    .describe('Domain relation type label of the canonical relation'),
  source: GraphNodeIdSchema,
  target: GraphNodeIdSchema,
  directed: z.boolean()
    .describe('Structural directionality of the relation edge'),
  provenance: z.record(z.string(), z.unknown()).optional()
    .describe('Persisted provenance record, carried verbatim'),
  temporalRange: TemporalIntervalSchema.optional()
    .describe('Domain-validity interval attached to this relation for this projection, if any'),
}).strict();
export type ProjectedGraphEdge = z.infer<typeof ProjectedGraphEdgeSchema>;

/**
 * The canonical projected graph response. All graph query constructs
 * (current, valid-at, version, legacy case graph) serialize to this shape.
 */
export const ProjectedGraphSchema = z.object({
  caseId: CaseIdSchema,
  nodes: z.array(ProjectedGraphNodeSchema),
  edges: z.array(ProjectedGraphEdgeSchema),
  nodeCount: z.number().int().nonnegative()
    .describe('Nodes returned in this projection'),
  edgeCount: z.number().int().nonnegative()
    .describe('Edges returned in this projection'),
  nodeLimit: z.number().int().positive()
    .describe('Hard projection bound on nodes for this build'),
  edgeLimit: z.number().int().positive()
    .describe('Hard projection bound on edges for this build'),
  sourceNodeCount: z.number().int().nonnegative()
    .describe('Authoritative node input cardinality before bounding'),
  sourceEdgeCount: z.number().int().nonnegative()
    .describe('Authoritative edge input cardinality before bounding'),
  truncated: GraphTruncationSchema,
}).strict();
export type ProjectedGraph = z.infer<typeof ProjectedGraphSchema>;