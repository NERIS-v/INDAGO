// ============================================================================
// Graph-Hole Semantic Region Expansion (Phase 5A-PR2)
//
// Schema/type COMMITMENTS for the semantic→node expansion boundary that
// bridges the PR1.5 SemanticRetrievalPort (a RECALL layer returning semantic
// text units) into the region builder (a bounded set of canonical graph nodes).
// This module is contract ONLY — the adapter that uses it lives in
// @indago/graph-hole-region.
//
// Frozen invariants:
//   - Semantic retrieval is a RECALL layer, never an authority for entity or
//     node resolution. Mapping to nodes is AUTHORITATIVE ONLY:
//     source object → canonical entity (M-A09/M-A10) → M-A13 graph node.
//     No string/prefix/fuzzy/name matching, no similarity-thresholding of hits,
//     no fabrication of node ids.
//   - Case isolation is enforced at the persistence boundary (SQL) AND
//     re-asserted at the adapter boundary (the mapping context carries exactly
//     one (caseId, graphVersionId)).
//   - Semantic expansion NEVER mutates graph state (M-A13 stays read-only here)
//     and NEVER creates entities, relations, evidence or observations.
//   - Determinism: identical region state → identical query → identical result.
//     Retrieved text / similarities are NEVER fed back into later queries (no
//     semantic feedback loops).
//   - A semantic provider/adapter failure is reported as DEGRADED — never
//     silently replaced by an empty or fake success.
// ============================================================================

import { z } from 'zod';

import { GraphNodeIdSchema } from '../common/ids.js';
import { SemanticQueryHashSchema, SemanticSourceTypeSchema } from './semantic-retrieval.js';

// ============================================================================
// Semantic-expansion status contract
// ============================================================================

export const SemanticExpansionStatusSchema = z.enum([
  'DISABLED',
  'SUCCESS',
  'EMPTY',
  'PARTIAL',
  'DEGRADED',
  'LIMITED',
]).describe(
  'Status of the semantic-expansion pass for one region build. DISABLED = no ' +
  'semantic provider configured (PR1 deterministic expansion, still a valid ' +
  'region). SUCCESS = every hit mapped to at least one graph node. EMPTY = ' +
  'retrieval returned zero hits (honest empty). PARTIAL = some hits mapped, at ' +
  'least one was unresolved/rejected. DEGRADED = a semantic provider failure ' +
  'occurred. LIMITED = a configured semantic bound stopped expansion.',
);
export type SemanticExpansionStatus = z.infer<typeof SemanticExpansionStatusSchema>;

export const SEMANTIC_EXPANSION_STATUS_SEMANTICS = {
  DISABLED:
    'No semantic provider configured; PR1 deterministic expansion only (valid region).',
  SUCCESS:
    'All retrieved hits mapped to at least one canonical graph node; nothing unresolved or rejected.',
  EMPTY:
    'Semantic retrieval returned zero hits — an honest empty, never a downgrade.',
  PARTIAL:
    'Some hits mapped to graph nodes; at least one hit was unresolved or rejected.',
  DEGRADED:
    'A semantic provider/adapter failure occurred; the region was still analyzed despite degraded recall.',
  LIMITED:
    'A configured semantic bound (per-round/total results or node additions) stopped semantic expansion.',
} as const;

// ============================================================================
// Semantic → node mapping report
// ============================================================================

/**
 * Why one retrieval hit did NOT become a graph node. These are the ONLY two
 * acceptable outcomes besides a successful authoritative mapping.
 */
export const SemanticNodeMappingRejectionSchema = z.enum([
  'UNRESOLVED',
  'NON_NODE_SOURCE',
]).describe(
  'UNRESOLVED = the hit source has no canonical entity under M-A09/M-A10. ' +
  'NON_NODE_SOURCE = the entity resolves but is not present as a node in this ' +
  'graph version (M-A13).',
);
export type SemanticNodeMappingRejection = z.infer<typeof SemanticNodeMappingRejectionSchema>;

/** Per-hit mapping outcome, in the exact order the port returned the hits. */
export const SemanticNodeAttributionSchema = z.object({
  semanticTextUnitId: z.string().uuid(),
  sourceType: SemanticSourceTypeSchema,
  /** Canonical id of the original source object (e.g. an ObservationId). */
  sourceId: z.string().uuid(),
  /**
   * Node ids this hit mapped to. Sorted/unique; empty unless
   * outcome === 'MAPPED'.
   */
  mappedNodeIds: z.array(GraphNodeIdSchema),
  outcome: z.enum(['MAPPED', 'UNRESOLVED', 'REJECTED']),
  /** Present exactly when outcome is UNRESOLVED or REJECTED. */
  rejectionReason: SemanticNodeMappingRejectionSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.outcome === 'MAPPED') {
    if (value.mappedNodeIds.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'MAPPED attribution must map at least one node',
        path: ['mappedNodeIds'],
      });
    }
    if (value.rejectionReason !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'MAPPED attribution must not carry a rejection reason',
        path: ['rejectionReason'],
      });
    }
  } else {
    if (value.mappedNodeIds.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: `${value.outcome} attribution must not map nodes`,
        path: ['mappedNodeIds'],
      });
    }
    if (value.rejectionReason === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: `${value.outcome} attribution requires a rejection reason`,
        path: ['rejectionReason'],
      });
    }
  }
});
export type SemanticNodeAttribution = z.infer<typeof SemanticNodeAttributionSchema>;

/**
 * Aggregate result of one authoritative mapping pass. `mappedCount` counts
 * RESULTS (hits) that mapped, not node ids (one hit can map to several nodes);
 * `mappedNodeIds` is the deduplicated, sorted set of node ids produced.
 */
export const SemanticNodeMappingReportSchema = z.object({
  mappedCount: z.number().int().nonnegative(),
  unresolvedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  rejectedReasons: z.array(
    z.object({
      reason: SemanticNodeMappingRejectionSchema,
      count: z.number().int().positive(),
    }).strict(),
  ).describe('Deterministically sorted by reason value; zero counts are omitted.'),
  mappedNodeIds: z.array(GraphNodeIdSchema)
    .describe('Sorted, unique canonical node ids the hits resolved to.'),
  attribution: z.array(SemanticNodeAttributionSchema)
    .describe('Per-hit outcomes in the port result order (deterministic).'),
}).strict();
export type SemanticNodeMappingReport = z.infer<typeof SemanticNodeMappingReportSchema>;

// ============================================================================
// Per-region traceability (deterministic; NOT part of the region identity)
// ============================================================================

export const SemanticExpansionRoundTraceSchema = z.object({
  /** One-based region expansion round in which this semantic query ran. */
  round: z.number().int().positive(),
  /** Canonical, deterministic query text actually submitted to the port. */
  query: z.string().min(1),
  queryHash: SemanticQueryHashSchema,
  /** The limit actually sent (min of per-round and remaining total budget). */
  requestedLimit: z.number().int().positive(),
  /** Hits returned by the port for this query (≤ requestedLimit). */
  retrievedCount: z.number().int().nonnegative(),
  /** true when retrieval hit the requested limit (capped result list). */
  truncated: z.boolean(),
  /** Node ids newly admitted to the region this round; sorted, unique. */
  admittedNodeIds: z.array(GraphNodeIdSchema),
  mappedCount: z.number().int().nonnegative(),
  unresolvedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
}).strict();
export type SemanticExpansionRoundTrace = z.infer<typeof SemanticExpansionRoundTraceSchema>;

export const SemanticExpansionTraceSchema = z.object({
  status: SemanticExpansionStatusSchema,
  /** Executed semantic rounds; empty when DISABLED. */
  rounds: z.array(SemanticExpansionRoundTraceSchema),
  /** Total hits retrieved across all rounds (≤ MAX_TOTAL_SEMANTIC_RESULTS). */
  totalSemanticResults: z.number().int().nonnegative(),
  /** Unique node ids admitted via semantic expansion (≤ MAX_SEMANTIC_NODES_ADDED). */
  totalMappedNodes: z.number().int().nonnegative(),
  totalUnresolved: z.number().int().nonnegative(),
  totalRejected: z.number().int().nonnegative(),
  /** true when the semantic node-addition cap was reached. */
  semanticNodeBoundReached: z.boolean(),
  /** true when the total semantic results cap was reached. */
  totalResultsBoundReached: z.boolean(),
}).strict();
export type SemanticExpansionTrace = z.infer<typeof SemanticExpansionTraceSchema>;