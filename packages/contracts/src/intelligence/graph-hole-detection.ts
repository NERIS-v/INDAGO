// ============================================================================
// Graph-Hole Detection Contracts (Phase 5A-PR4)
//
// PR4 produces DETERMINISTIC, RAW graph-hole CANDIDATES from a bounded
// analysis region + its grouped hypothesis context (PR3). The raw candidate
// is the output record of detection ONLY. It deliberately carries:
//   - NO significance / confidence / score (PR5 owns qualification/scoring)
//   - NO criminality / intent / concealment fields
//   - NO persisted state (detection is pure in-process analysis)
//
// Every candidate must be traceable: it preserves the region id, the
// canonical nodes/edges that establish the expectation, the hypothesis
// context id(s) that grounded the expectation, the supporting and
// contradicting observation ids (never resolved here), the structural basis
// enum key that justifies the expectation, and full provenance.
//
// CONTRACT MODEL:
//   GraphHoleCandidate (intelligence/graph-hole-candidate.ts)
//       = identity (frozen, hashed to candidateId) + analysis metadata.
//   RawGraphHoleCandidate (this file)
//       = PR4 detection OUTPUT (pre-qualification). Later PRs map it into the
//         broader GraphHole / GraphHoleDetected flow and compute scores.
//
// This module freezes the raw detection output representation + supporting
// enums. It does NOT implement detection, persistence, or qualification.
// ============================================================================

import { z } from 'zod';
import {
  CaseIdSchema,
  GraphVersionIdSchema,
  GraphNodeIdSchema,
  GraphEdgeIdSchema,
  ObservationIdSchema,
} from '../common/ids.js';
import { RelationTypeSchema } from '../domain/relation.js';
import { TemporalIntervalSchema } from '../common/timestamps.js';
import { ProvenanceSchema } from '../common/provenance.js';
import { GraphHoleTypeSchema, GraphHoleCandidateIdSchema } from './graph-holes.js';
import { DETECTION_POLICY_VERSION } from './graph-hole-policy.js';

// ============================================================================
// §13 Detector Basis
//
// The STRUCTURAL expectation that justifies flagging a raw candidate. A
// candidate needs "structural expectation + supporting context + unexplained
// absence" — the basis records which of the allowed expectation sources
// (existing grouped hypotheses, neighboring observed relationships, explicit
// graph structure) fired. Detectors never invent expectation: `SHARED_*` /
// `*_REFERENCED` bases are always grounded in PR3 hypothesis context or
// region seeds.
// ============================================================================

export const StructuralBasisSchema = z.enum([
  'SHARED_HYPOTHESIS_CONTEXT',
  'OBSERVED_NEIGHBOR_CONTEXT',
  'HYPOTHESIS_REFERENCED_NODE',
  'SEED_REFERENCED_NODE',
  'CHAIN_EXPECTED_CONTINUATION',
  'TEMPORAL_DISCONTINUITY',
  'CROSS_COMMUNITY_HYPOTHESIS_CONTEXT',
  'EXPECTED_PATH_BROKEN',
])
  .describe('The structural expectation that justifies this raw candidate.');
export type StructuralBasis = z.infer<typeof StructuralBasisSchema>;

// ============================================================================
// Detector metadata
//
// Deterministic accounting of how the detector ran, exposed on every
// candidate AND rolled up per detector in the detection result. `boundKind`
// is present only when `boundReached` is true: it names WHICH detector-local
// computation bound stopped the detector (distinct from the region/context
// budget semantics exposed on the region itself).
// ============================================================================

export const DetectorBoundKindSchema = z.enum([
  'PAIR_EVALUATIONS',
  'TRAVERSAL_QUERIES',
  'CANDIDATES',
  'COMMUNITIES_ABSENT',
]).describe('Which detector-local bound halted a detector run.');
export type DetectorBoundKind = z.infer<typeof DetectorBoundKindSchema>;

export const GraphHoleDetectorMetadataSchema = z.object({
  detectorType: GraphHoleTypeSchema,
  pairEvaluations: z.number().int().min(0)
    .describe('Structural pair/unit evaluations performed by this detector run.'),
  boundReached: z.boolean()
    .describe('Whether a detector-local computation/output bound halted this run.'),
  boundKind: DetectorBoundKindSchema.optional()
    .describe('Which detector-local bound halted this run, when boundReached.'),
}).strict();
export type GraphHoleDetectorMetadata = z.infer<typeof GraphHoleDetectorMetadataSchema>;

// ============================================================================
// §13 Raw Graph-Hole Candidate
//
// The PR4 detection output. candidateId = SHA-256 of the frozen candidate
// identity (same logical gap under the same graph/policy re-hashes to the
// same id). Probe references (supporting/contradicting) are id arrays only —
// never resolved here. All id arrays are emitted sorted-unique.
// ============================================================================

export const RawGraphHoleCandidateSchema = z.object({
  candidateId: GraphHoleCandidateIdSchema
    .describe('SHA-256 of the canonical candidate identity (detector path converged).'),
  caseId: CaseIdSchema,
  graphVersionId: GraphVersionIdSchema,
  regionId: z.string().min(1)
    .describe('region.regionId of the bounded analysis region that produced this candidate.'),
  detectionPolicyVersion: z.literal(DETECTION_POLICY_VERSION)
    .describe('Detection policy version consumed by the producing detector.'),
  detectorType: GraphHoleTypeSchema
    .describe('Structural detection category (GraphHoleType).'),
  nodeIds: z.array(GraphNodeIdSchema).min(1)
    .describe('Canonical graph nodes anchoring this gap (sorted unique).'),
  observedEdgeIds: z.array(GraphEdgeIdSchema)
    .describe('Canonical edges observed that participate in the expectation expectation (sorted unique).'),
  expectedRelationshipType: RelationTypeSchema.nullable()
    .describe('Type of relation expected but not materialized; null when the detector cannot state one.'),
  temporalScope: TemporalIntervalSchema.optional()
    .describe('Temporal scope claimed for this gap, when applicable.'),
  supportingHypothesisIds: z.array(z.string().min(1))
    .describe('PR3 atomic hypothesis derivedIds that grounded the expectation (sorted unique).'),
  supportingObservationIds: z.array(ObservationIdSchema)
    .describe('Observations that SUPPORT the expectation (kept raw, never resolved).'),
  contradictingObservationIds: z.array(ObservationIdSchema)
    .describe('Observations that CONTRADICT the expectation (kept raw, never resolved).'),
  structuralBasis: StructuralBasisSchema,
  detectorMetadata: GraphHoleDetectorMetadataSchema,
  provenance: ProvenanceSchema
    .describe('Trace to source material that supports this candidate (extractor graph-hole-detection.v1).'),
}).strict();
export type RawGraphHoleCandidate = z.infer<typeof RawGraphHoleCandidateSchema>;