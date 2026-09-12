// ============================================================================
// Graph-Hole Candidate Contracts (Phase 5A-PR0)
//
// A graph hole is a STRUCTURAL / EVIDENTIARY CANDIDATE about an unexplained
// gap in the investigation graph. It is NOT:
//   - a canonical Relation
//   - proof
//   - criminality
//   - intent
//   - concealment asserted as fact
//
// CANDIDATE IDENTITY ≠ REGION IDENTITY:
//   CandidateIdentity = "what specific unexplained structural gap did we
//                        identify?"
//   RegionIdentity    = "what context did we analyze?"
//
// One region may produce several candidates. Detector paths must converge on
// the same candidate identity for the same logical gap.
//
// This module freezes the candidate identity + analysis metadata contracts.
// It does NOT implement detection, persistence, or qualification.
// ============================================================================

import { z } from 'zod';
import {
  CaseIdSchema,
  GraphVersionIdSchema,
  GraphNodeIdSchema,
} from '../common/ids.js';
import { RelationTypeSchema } from '../domain/relation.js';
import { TemporalIntervalSchema } from '../common/timestamps.js';
import { ExpectedInformationGainSchema } from '../common/confidence.js';
import {
  DETECTION_POLICY_VERSION,
  SupportUnitResolutionSchema,
} from './graph-hole-policy.js';
import { GraphHoleTypeSchema, GraphHoleCandidateIdSchema } from './graph-holes.js';
import { RegionStatusSchema } from './graph-hole-region.js';
import { canonicalizeDeterministic } from './identity-canonicalization.js';

// ============================================================================
// §11 Candidate Identity Contract
//
// candidateId can later be computed as:
//   candidateId = SHA-256(canonicalizeGraphHoleCandidateIdentity(identity))
//
// Canonicalization rules:
//   - canonical node IDs are sorted before serialization
//   - deterministic serialization
//   - NO timestamps of now, no random state
//   - same logical candidate under the same graph/policy → same identity
// ============================================================================

export const GraphHoleCandidateIdentityV1Schema = z.object({
  caseId: CaseIdSchema,
  graphVersionId: GraphVersionIdSchema,
  holeType: GraphHoleTypeSchema
    .describe('Structural detection category (GraphHoleType, NOT GapType).'),
  canonicalNodeIds: z.array(GraphNodeIdSchema).min(1)
    .describe('Canonical graph nodes bounding this gap; sorted before canonicalization.'),
  expectedRelationshipType: RelationTypeSchema.optional()
    .describe('Type of edge expected but missing, when the detector can state one.'),
  temporalScope: TemporalIntervalSchema.optional()
    .describe('Temporal scope claimed for this gap, when applicable.'),
  detectionPolicyVersion: z.literal(DETECTION_POLICY_VERSION)
    .describe('Detection policy version consumed by the producing detector.'),
}).strict();
export type GraphHoleCandidateIdentityV1 = z.infer<typeof GraphHoleCandidateIdentityV1Schema>;

/**
 * Stable, deterministic canonical serialization of a candidate identity.
 * Same logical gap under the same graph/policy yields the same string.
 */
export function canonicalizeGraphHoleCandidateIdentity(
  identity: GraphHoleCandidateIdentityV1,
): string {
  return canonicalizeDeterministic(identity);
}

// ============================================================================
// §13 Structural-Score Profile
//
// Every component is normalized [0, 1].
//
// An ABSENT component means "genuinely not applicable to this detector" — later
// runtime MUST renormalize the applicable weights (see GRAPH_HOLE_POLICY_V1
// .scoring.structuralComponentNotApplicableRenormalizes).
//
// A PRESENT component of 0.0 means "genuinely zero evidence" and counts against
// the score. Absent is NOT the same as zero.
// ============================================================================

export const StructuralScoreProfileSchema = z.object({
  patternStrength: z.number().min(0).max(1).optional()
    .describe('Strength of the structural pattern that produced this candidate.'),
  connectivitySupport: z.number().min(0).max(1).optional()
    .describe('Support from surrounding graph connectivity.'),
  contextualSupport: z.number().min(0).max(1).optional()
    .describe('Support from the analysis context / surrounding evidence.'),
  temporalSupport: z.number().min(0).max(1).optional()
    .describe('Support from temporal consistency, where applicable.'),
  communitySupport: z.number().min(0).max(1).optional()
    .describe('Support from community structure, where applicable.'),
}).strict();
export type StructuralScoreProfile = z.infer<typeof StructuralScoreProfileSchema>;

// ============================================================================
// §E Candidate / Analysis Metadata Contract
//
// The structured analysis inputs + derived V1 scores that later runtime PRs
// (detection, qualification, AI) consume. Derived scores follow the frozen
// formulas in GRAPH_HOLE_POLICY_V1.scoring; this schema only freezes the
// representation.
// ============================================================================

export const GraphHoleCandidateAnalysisSchema = z.object({
  candidateId: GraphHoleCandidateIdSchema
    .describe('Deterministic candidate identifier (later: SHA-256 of the canonical identity).'),
  regionCanonicalIdentity: z.string().min(1)
    .describe('canonicalizeRegionIdentity output of the region that produced this candidate.'),
  regionStatus: RegionStatusSchema
    .describe('Status of the producing region at detection time.'),
  independentSupportUnits: z.number().int().min(0)
    .describe('V1 count of independent support units (distinct resolved support-unit keys).'),
  resolvedSupportUnitKeys: z.array(z.string().min(1)).optional()
    .describe('Resolved support-unit key strings (e.g. "sourceContext:ctx-1"), deduplicated per V1 rule.'),
  supportUnitResolutions: z.array(SupportUnitResolutionSchema).optional()
    .describe('Full V1 resolution records (resolved key + basis), the traceable backing of resolvedSupportUnitKeys.'),
  structuralComponents: StructuralScoreProfileSchema
    .describe('Per-component structural signals. Absent = not applicable (renormalize).'),
  structuralScore: z.number().min(0).max(1)
    .describe('Derived V1 structural score per GRAPH_HOLE_POLICY_V1.scoring.'),
  evidenceSupportScore: z.number().min(0).max(1)
    .describe('Strength of supporting evidence. NOT a probability.'),
  expectedInformationValue: ExpectedInformationGainSchema
    .describe('Expected reduction in uncertainty. NOT calibrated probability.'),
  significance: z.number().min(0).max(1)
    .describe('Investigative prioritization value. NOT probability that the gap exists.'),
  detectionPolicyVersion: z.literal(DETECTION_POLICY_VERSION),
}).strict();
export type GraphHoleCandidateAnalysis = z.infer<typeof GraphHoleCandidateAnalysisSchema>;