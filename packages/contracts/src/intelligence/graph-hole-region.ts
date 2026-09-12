// ============================================================================
// Graph-Hole Region Contracts (Phase 5A-PR0)
//
// The REGION is the bounded analysis context: the set of nodes/edges/seed
// observations a graph-hole detection pass was run over.
//
// REGION IDENTITY ≠ CANDIDATE IDENTITY:
//   RegionIdentity  = "what context did we analyze?"
//   CandidateIdentity = "what specific unexplained structural gap did we identify?"
//
// One region may produce several candidate identities. Multiple detector paths
// must be able to converge on the same candidate identity.
//
// This module freezes the region identity contract, region statuses, and the
// saturation semantics. It does NOT implement region building or expansion.
// ============================================================================

import { z } from 'zod';
import {
  CaseIdSchema,
  GraphVersionIdSchema,
  GraphNodeIdSchema,
  GraphEdgeIdSchema,
  ObservationIdSchema,
} from '../common/ids.js';
import { TemporalIntervalSchema } from '../common/timestamps.js';
import {
  GRAPH_HOLE_POLICY_VERSION,
  SEMANTIC_RETRIEVAL_POLICY_VERSION,
} from './graph-hole-policy.js';
import { canonicalizeDeterministic } from './identity-canonicalization.js';

// ============================================================================
// §7 Region Status Contract
// ============================================================================

export const RegionStatusSchema = z.enum([
  'SATURATED',
  'LIMITED',
  'DEGRADED',
]).describe(
  'Region analysis status. SATURATED does NOT claim mathematical completeness — ' +
  'it means retrieval produced sufficiently little new context during the final ' +
  'required expansion rounds. LIMITED means a configured bound stopped the ' +
  'process. DEGRADED means the region was analyzed despite known ' +
  'incompleteness/degraded context.',
);
export type RegionStatus = z.infer<typeof RegionStatusSchema>;

export const REGION_STATUS_SEMANTICS = {
  SATURATED:
    'The bounded expansion process reached its configured stopping condition ' +
    'without exhausting a hard budget and met the novelty threshold. ' +
    'NOT mathematical completeness.',
  LIMITED:
    'The expansion process stopped because a configured bound was reached.',
  DEGRADED:
    'The region was intentionally analyzed despite known incompleteness or ' +
    'degraded context.',
} as const;

// ============================================================================
// §10 Region Identity Contract
//
// regionId can later be computed as:
//   regionId = SHA-256(canonicalizeRegionIdentity(identity))
//
// Canonicalization rules:
//   - all ID arrays are sorted before serialization (deterministic ordering)
//   - canonical serialization is stable (see identity-canonicalization)
//   - NO timestamps of now, no random IDs, no object-key iteration dependence,
//     no environment-specific values
// ============================================================================

export const RegionIdentityV1Schema = z.object({
  caseId: CaseIdSchema,
  graphVersionId: GraphVersionIdSchema,
  temporalContext: TemporalIntervalSchema.optional()
    .describe('Domain temporal scope used for this analysis context (deterministic input).'),
  seedObservationIds: z.array(ObservationIdSchema)
    .describe('Observations that seeded the expansion; sorted before canonicalization.'),
  nodeIds: z.array(GraphNodeIdSchema)
    .describe('Unique graph nodes in the analyzed region; sorted before canonicalization.'),
  edgeIds: z.array(GraphEdgeIdSchema)
    .describe('Unique graph edges in the analyzed region; sorted before canonicalization.'),
  regionPolicyVersion: z.literal(GRAPH_HOLE_POLICY_VERSION)
    .describe('Version of GRAPH_HOLE_POLICY_* consumed by region analysis.'),
  semanticRetrievalPolicyVersion: z.literal(SEMANTIC_RETRIEVAL_POLICY_VERSION)
    .describe('Version of the semantic-retrieval boundary policy (V1 boundary only).'),
}).strict();
export type RegionIdentityV1 = z.infer<typeof RegionIdentityV1Schema>;

/**
 * Stable, deterministic canonical serialization of a region identity.
 * Same logical region under the same graph/policy yields the same string.
 */
export function canonicalizeRegionIdentity(identity: RegionIdentityV1): string {
  return canonicalizeDeterministic(identity);
}