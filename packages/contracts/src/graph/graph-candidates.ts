import { z } from 'zod';
import { GraphNodeIdSchema, GraphEdgeIdSchema } from '../common/ids.js';

// ============================================================================
// P4 Graph Analytics Candidate Response Contracts
//
// Response shapes for the Phase-4 candidate detectors built on top of the
// M-A10/M-A13 graph projection primitives (@indago/graphology-projection):
// bridge/connector candidates, temporal burst candidates, cohesion-scored
// community candidates, and connecting-path queries between two entities.
//
// Discipline (same as graph-analysis.ts / graph-projection.ts):
//   - Every field here is a STRUCTURAL/TEMPORAL signal only. None of these
//     schemas may encode criminality, guilt, culpability, or legal status.
//   - Every candidate is bounded server-side; these schemas do not themselves
//     impose the bound (that lives in @indago/graphology-projection's *_BOUNDS
//     constants) — they only describe the shape of a bounded result.
// ============================================================================

export const BridgeCandidateSchema = z.object({
  edgeId: GraphEdgeIdSchema,
  nodeIds: z.tuple([GraphNodeIdSchema, GraphNodeIdSchema]),
  relationType: z.string().nullable()
    .describe('Domain RelationType label on the bridge edge, or null if unavailable'),
  bridgeImpact: z.number().int().nonnegative()
    .describe('Size of the smaller side of the graph if this edge were removed'),
  componentSize: z.number().int().positive()
    .describe('Total size of the connected component containing this bridge'),
}).strict();
export type BridgeCandidateDTO = z.infer<typeof BridgeCandidateSchema>;

export const TemporalBurstCandidateSchema = z.object({
  nodeId: GraphNodeIdSchema,
  windowStart: z.string().describe('ISO instant of the bucket lower bound'),
  windowEnd: z.string().describe('ISO instant of the bucket upper bound (exclusive)'),
  eventCount: z.number().int().nonnegative(),
  baselineRate: z.number().nonnegative()
    .describe("Mean edge count over this node's own active buckets (self-baseline)"),
  burstScore: z.number().nonnegative()
    .describe('eventCount / max(baselineRate, epsilon) — higher = more anomalous'),
  edgeIds: z.array(GraphEdgeIdSchema),
}).strict();
export type TemporalBurstCandidateDTO = z.infer<typeof TemporalBurstCandidateSchema>;

export const CommunityCandidateSchema = z.object({
  communityId: z.number().int(),
  memberNodeIds: z.array(GraphNodeIdSchema),
  size: z.number().int().positive()
    .describe('Actual community size before any member-list bound was applied'),
  truncated: z.boolean(),
  cohesion: z.number().min(0).max(1)
    .describe('Internal edge density in [0,1]; 1.0 = fully connected clique'),
  internalEdgeCount: z.number().int().nonnegative(),
}).strict();
export type CommunityCandidateDTO = z.infer<typeof CommunityCandidateSchema>;

export const ConnectingPathHopSchema = z.object({
  nodeId: GraphNodeIdSchema,
  entityType: z.string().nullable(),
  canonicalName: z.string(),
}).strict();

export const ConnectingPathStepSchema = z.object({
  relationType: z.string(),
  edgeId: GraphEdgeIdSchema,
  nodeId: GraphNodeIdSchema,
  directed: z.boolean(),
}).strict();

export const ConnectingPathCandidateSchema = z.object({
  startNodeId: GraphNodeIdSchema,
  targetNodeId: GraphNodeIdSchema,
  nodes: z.array(ConnectingPathHopSchema),
  steps: z.array(ConnectingPathStepSchema),
  hopCount: z.number().int().nonnegative(),
}).strict();
export type ConnectingPathCandidateDTO = z.infer<typeof ConnectingPathCandidateSchema>;
