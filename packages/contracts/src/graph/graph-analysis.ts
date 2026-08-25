import { z } from 'zod';
import {
  GraphNodeIdSchema,
  GraphEdgeIdSchema,
  GraphVersionIdSchema,
  InvestigationIdSchema,
} from '../common/ids.js';
import { StructuralSignalSchema } from '../common/confidence.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { RelationTypeSchema } from '../domain/relation.js';

// ============================================================================
// Graph Analysis
//
// Analysis results computed over the investigation graph.
//
// SEPARATION OF CONCERNS:
//   GraphAnalysisType = the CATEGORY of analysis being performed
//   StructuralMetricType = the specific METRIC computed within that category
//
// Example valid combinations:
//   CENTRALITY + betweenness
//   CENTRALITY + pagerank
//   COMMUNITY + community_membership
//   BRIDGE + bridge_impact
//   PATH + path_score
//
// The two enums must not semantically overlap.
// GraphAnalysisType answers WHAT question we're asking.
// StructuralMetricType answers HOW we're measuring the answer.
// ============================================================================

export const GraphAnalysisTypeSchema = z.enum([
  'CENTRALITY',
  'COMMUNITY',
  'PATH',
  'CLUSTER',
  'BRIDGE',
  'ANOMALY',
  'HOLE',
  'CONNECTIVITY',
]);
export type GraphAnalysisType = z.infer<typeof GraphAnalysisTypeSchema>;

/**
 * StructuralMetricType = the specific metric computed within an analysis category.
 *
 * This enum is intentionally restricted to graph-theoretic metrics.
 * It must NOT include values that encode:
 *   - criminality
 *   - guilt
 *   - culpability
 *   - suspect probability
 *   - legal status
 *
 * Structural metrics are graph-theoretic importance / analytical signal ONLY.
 */
export const StructuralMetricTypeSchema = z.enum([
  'degree',
  'weighted_degree',
  'betweenness',
  'closeness',
  'pagerank',
  'bridge_impact',
  'community_membership',
  'connectivity',
  'anomaly',
  'path_score',
]).describe(
  'Graph-theoretic metric type. Must NOT include criminality/guilt/suspect values.'
);
export type StructuralMetricType = z.infer<typeof StructuralMetricTypeSchema>;

export const GraphAnalysisResultSchema = z.object({
  investigationId: InvestigationIdSchema,
  graphVersionId: GraphVersionIdSchema,
  analysisType: GraphAnalysisTypeSchema
    .describe('Category of analysis performed'),
  nodeScores: z.array(z.object({
    nodeId: GraphNodeIdSchema,
    score: StructuralSignalSchema,
    metric: StructuralMetricTypeSchema
      .describe('Which metric produced this score'),
  })),
  edgeScores: z.array(z.object({
    edgeId: GraphEdgeIdSchema,
    score: StructuralSignalSchema,
    metric: StructuralMetricTypeSchema,
  })).optional(),
  communities: z.array(z.object({
    id: z.string(),
    nodeIds: z.array(GraphNodeIdSchema),
    label: z.string().optional(),
    cohesion: z.number().min(0).max(1)
      .describe('Community cohesion score [0,1]'),
  })).optional(),
  paths: z.array(z.object({
    sourceNodeId: GraphNodeIdSchema,
    targetNodeId: GraphNodeIdSchema,
    nodeIds: z.array(GraphNodeIdSchema),
    edgeIds: z.array(GraphEdgeIdSchema),
    length: z.number().int().positive()
      .describe('Number of edges in this path'),
  })).optional(),
  holes: z.array(z.object({
    nodeIds: z.array(GraphNodeIdSchema),
    expectedEdgeType: RelationTypeSchema
      .describe('Type of edge expected but missing'),
    significance: StructuralSignalSchema
      .describe('Graph-theoretic significance of this hole'),
    description: z.string(),
  })).optional(),
  computedAt: ObservedTimeSchema,
  computationTimeMs: z.number().int().nonnegative(),
}).strict();
export type GraphAnalysisResult = z.infer<typeof GraphAnalysisResultSchema>;
