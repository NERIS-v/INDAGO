import { z } from 'zod';
import {
  InvestigationIdSchema,
  CaseIdSchema,
  GraphNodeIdSchema,
  GraphVersionIdSchema,
  InvestigativeGapIdSchema,
} from '../common/ids.js';
import { StructuralSignalSchema } from '../common/confidence.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { RelationTypeSchema } from '../domain/relation.js';
import { EvidenceTypeSchema } from '../domain/evidence.js';
import { MetadataSchema } from '../common/metadata.js';
import { DETECTION_POLICY_VERSION } from './graph-hole-policy.js';

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
//
// IDENTITY (Phase 5A-PR0):
//   A graph hole carries an explicit candidate identity (`id`).
//   The candidate identity itself (caseId, graphVersionId, holeType,
//   canonicalNodeIds, ...) is frozen in GraphHoleCandidateIdentityV1
//   (intelligence/graph-hole-candidate.ts) and later hashed to produce
//   `candidateId`. `id` is that deterministic candidate identifier.
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

/**
 * Deterministic candidate identifier for a graph hole.
 *
 * In the Phase 5A V1 pipeline this is the content hash
 * (candidateId = SHA-256(canonicalizeGraphHoleCandidateIdentity(identity)))
 * computed by later PRs. Demo/legacy data may carry any stable non-empty
 * identifier. This schema intentionally does NOT constrain the digest format:
 * the hashing step is defined by the later implementation, not by PR0.
 */
export const GraphHoleCandidateIdSchema = z.string().min(1).max(256)
  .describe('Deterministic candidate identifier (V1 pipeline: SHA-256 digest of the canonical candidate identity).');
export type GraphHoleCandidateId = z.infer<typeof GraphHoleCandidateIdSchema>;

export const GraphHoleSchema = z.object({
  id: GraphHoleCandidateIdSchema
    .describe('Candidate identity of this hole. Same logical gap under the same graph/policy → same id.'),
  investigationId: InvestigationIdSchema,
  caseId: CaseIdSchema,
  graphVersionId: GraphVersionIdSchema,
  type: GraphHoleTypeSchema
    .describe('Structural detection category (NOT GapType). Candidate identity uses `holeType`.'),
  investigationGapId: InvestigativeGapIdSchema.optional()
    .describe('Associated InvestigativeGap, if one has been classified from this hole'),
  nodeIds: z.array(GraphNodeIdSchema)
    .describe('Nodes involved in this hole (canonical graph nodes; candidate identity uses `canonicalNodeIds`).'),
  expectedEdgeType: RelationTypeSchema
    .describe('Type of edge expected but missing (candidate identity uses `expectedRelationshipType`).'),
  significance: StructuralSignalSchema
    .describe('How significant this hole is in the graph topology'),
  description: z.string()
    .describe('Human-readable description of the hole'),
  suggestedEvidenceTypes: z.array(EvidenceTypeSchema).optional()
    .describe('Canonical evidence types (EvidenceTypeSchema) that might fill this hole — authoritative PR10 vocabulary.'),
  detectionPolicyVersion: z.literal(DETECTION_POLICY_VERSION)
    .optional()
    .describe('Detection policy version consumed to produce this candidate'),
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
