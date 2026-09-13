// ============================================================================
// Graph-Hole Qualification Contracts (Phase 5A-PR5)
//
// PR5 converts PR4 raw structural GraphHoleCandidates into qualified,
// scored, deterministically ranked candidates suitable for later
// persistence (PR6) and AI analysis (PR7).
//
// PR5 is DETERMINISTIC and PERSISTENCE-FREE:
//   - No LLM, no Ollama, no embeddings, no semantic similarity.
//   - No canonical entity/relation creation.
//   - No persistence, no DB migrations, no queue jobs.
//   - No second hypothesis lifecycle.
//   - No criminality, intent, concealment, or wrongdoing inference.
//
// The PR4 raw candidate is preserved INTACT (provenance, traceability).
// PR5 only adds deterministic qualification metadata, scores, and ranking.
//
// These contracts freeze the qualification result representation. The
// scoring/qualification logic lives in @indago/graph-hole-qualification.
// ============================================================================

import { z } from 'zod';
import { CaseIdSchema, GraphVersionIdSchema } from '../common/ids.js';
import { ExpectedInformationGainSchema } from '../common/confidence.js';
import { DETECTION_POLICY_VERSION, GRAPH_HOLE_SCORING_POLICY_VERSION } from './graph-hole-policy.js';
import { RawGraphHoleCandidateSchema } from './graph-hole-detection.js';
import { StructuralScoreProfileSchema } from './graph-hole-candidate.js';
import { RegionStatusSchema } from './graph-hole-region.js';

// ============================================================================
// §1 Qualification Failure Reasons
//
// Closed, deterministic reason enum. Every rejected candidate carries one
// or more reasons. The downstream UI/AI layer can answer:
//   "Why did this candidate fail?"
//
// A candidate may carry MULTIPLE reasons (e.g. INSUFFICIENT_SUPPORT AND
// LOW_STRUCTURAL_SCORE). Reason ordering in the array is deterministic
// (sorted by enum value).
// ============================================================================

export const QualificationFailureReasonSchema = z.enum([
  'REGION_TRUNCATED',
  'REGION_NOT_SATURATED',
  'INSUFFICIENT_SUPPORT',
  'LOW_STRUCTURAL_SCORE',
  'LOW_SIGNIFICANCE',
  'TEMPORAL_INCONSISTENCY',
  'ALREADY_RESOLVED',
  'DUPLICATE',
  'MISSING_AUTHORITY',
]).describe('Deterministic qualification failure reason.');
export type QualificationFailureReason = z.infer<typeof QualificationFailureReasonSchema>;

export const QUALIFICATION_FAILURE_REASONS: readonly QualificationFailureReason[] = [
  'REGION_TRUNCATED',
  'REGION_NOT_SATURATED',
  'INSUFFICIENT_SUPPORT',
  'LOW_STRUCTURAL_SCORE',
  'LOW_SIGNIFICANCE',
  'TEMPORAL_INCONSISTENCY',
  'ALREADY_RESOLVED',
  'DUPLICATE',
  'MISSING_AUTHORITY',
] as const;

// ============================================================================
// §4 Score Component Trace
//
// The raw component derivations that feed the frozen formulas, exposed for
// inspection and verification. All numbers in [0,1].
//
// These are HEURISTIC DETERMINISTIC SCORES, NOT probabilities:
//   - structuralScore    = weighted structural signal strength
//   - evidenceSupportScore = independent evidence backing strength
//   - expectedInformationValue = opportunity for useful resolution or
//     discrimination among competing explanations (NOT a calibrated
//     information-theoretic quantity)
//   - significance = investigative prioritization value
//
// Do NOT interpret these as "70% confidence" or "probability that the
// relationship existed."
// ============================================================================

export const EvidenceSupportScoreComponentsSchema = z.object({
  supportBreadth: z.number().min(0).max(1)
    .describe('min(1, independentSupportUnits / 4). Independence of provenance sources (saturates at 4).'),
  supportConsistency: z.number().min(0).max(1)
    .describe('supporting / (supporting + contradicting); 0.5 when no observations at all.'),
  provenanceCompleteness: z.number().min(0).max(1)
    .describe('traceableSupporting / totalSupporting for present observations. 0 when none.'),
}).strict();
export type EvidenceSupportScoreComponents = z.infer<typeof EvidenceSupportScoreComponentsSchema>;

export const ExpectedInformationValueComponentsSchema = z.object({
  uncertaintyPotential: z.number().min(0).max(1)
    .describe('1 - |2*supportBalance - 1|. Maximal when supporting/contradicting evidence is balanced.'),
  hypothesisCoverage: z.number().min(0).max(1)
    .describe('min(1, distinctSupportingHypotheses / 3). Unresolved explanatory paths.'),
  evidenceDiversity: z.number().min(0).max(1)
    .describe('min(1, independentSupportUnits / 4). Provenance-spread of the defined evidence set.'),
}).strict();
export type ExpectedInformationValueComponents = z.infer<typeof ExpectedInformationValueComponentsSchema>;

export const ScoreComponentsSchema = z.object({
  evidenceSupport: EvidenceSupportScoreComponentsSchema,
  expectedInformationValue: ExpectedInformationValueComponentsSchema,
}).strict();
export type ScoreComponents = z.infer<typeof ScoreComponentsSchema>;

// ============================================================================
// §2 Qualified Graph-Hole Candidate
//
// The PR5 output representation for one candidate.
// ============================================================================

export const QualifiedGraphHoleCandidateSchema = z.object({
  /** The intact PR4 raw candidate (identity + provenance preserved). */
  rawCandidate: RawGraphHoleCandidateSchema,
  /** Whether this candidate passed all hard qualification gates. */
  qualified: z.boolean(),
  /** Deterministic failure reasons (empty when qualified). Sorted by enum value. */
  failureReasons: z.array(QualificationFailureReasonSchema),
  /** Weighted structural score [0,1]. NOT a probability. */
  structuralScore: z.number().min(0).max(1),
  /** Evidence support score [0,1]. NOT a probability. */
  evidenceSupportScore: z.number().min(0).max(1),
  /** Expected information value [0,1]. NOT calibrated probability. */
  expectedInformationValue: ExpectedInformationGainSchema,
  /** Investigative prioritization value [0,1]. NOT probability the gap exists. */
  significance: z.number().min(0).max(1),
  /** Deterministic independent support unit keys (sorted unique, e.g. "sourceContext:ctx-1"). */
  independentSupportUnitIds: z.array(z.string().min(1)),
  /** Per-component structural score breakdown. Absent component = NOT applicable (renormalized). */
  structuralComponents: StructuralScoreProfileSchema,
  /** Raw component derivations feeding the frozen formulas (inspection/verification). */
  scoreComponents: ScoreComponentsSchema,
  /** Canonical, deterministic ranking key (composite, byte-stable). */
  rankingKey: z.string().min(1),
  /** Region status of the producing region (authoritative). */
  regionStatus: RegionStatusSchema,
  /** Scoring calibration policy version consumed (identifies the formula semantics). */
  scoringPolicyVersion: z.literal(GRAPH_HOLE_SCORING_POLICY_VERSION),
}).strict();
export type QualifiedGraphHoleCandidate = z.infer<typeof QualifiedGraphHoleCandidateSchema>;

// ============================================================================
// §3 Qualification Accounting
//
// Deterministic accounting for the qualification pass. Every input candidate
// is accounted for exactly once. Failure reasons are counted deterministically.
// ============================================================================

export const QualificationAccountingSchema = z.object({
  totalInputCandidates: z.number().int().nonnegative(),
  qualifiedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  /** Per-reason counts; reasons with zero count are omitted. Sorted by reason enum value. */
  failureReasonCounts: z.array(z.object({
    reason: QualificationFailureReasonSchema,
    count: z.number().int().nonnegative(),
  }).strict()),
  /** Candidates rejected because the producing region was truncated. */
  truncationRejections: z.number().int().nonnegative(),
  /** Candidates rejected as DUPLICATE. */
  deduplicationRejections: z.number().int().nonnegative(),
}).strict();
export type QualificationAccounting = z.infer<typeof QualificationAccountingSchema>;

// ============================================================================
// §5 Qualification Result
//
// The complete PR5 output. Preserves ALL candidates (qualified and
// rejected) in deterministic order. No candidate disappears.
// ============================================================================

export const GraphHoleQualificationResultSchema = z.object({
  caseId: CaseIdSchema,
  graphVersionId: GraphVersionIdSchema,
  /** All candidates with qualification metadata, sorted by rankingKey. */
  candidates: z.array(QualifiedGraphHoleCandidateSchema),
  /** Qualified candidates only, in final ranking order. */
  qualifiedCandidates: z.array(QualifiedGraphHoleCandidateSchema),
  /** Rejected candidates, sorted by rankingKey. */
  rejectedCandidates: z.array(QualifiedGraphHoleCandidateSchema),
  /** Deterministic qualification accounting. */
  accounting: QualificationAccountingSchema,
  /** Detection policy version consumed (unmodified from the raw candidate pass). */
  detectionPolicyVersion: z.literal(DETECTION_POLICY_VERSION),
  /** Scoring calibration policy version consumed (v2 = V1.1 formula revision). */
  scoringPolicyVersion: z.literal(GRAPH_HOLE_SCORING_POLICY_VERSION),
}).strict();
export type GraphHoleQualificationResult = z.infer<typeof GraphHoleQualificationResultSchema>;