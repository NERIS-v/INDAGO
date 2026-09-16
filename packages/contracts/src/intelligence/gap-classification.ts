import { z } from 'zod';
import {
  InvestigativeGapIdSchema,
  InvestigationIdSchema,
  HypothesisIdSchema,
  EntityIdSchema,
  ObservationIdSchema,
  GraphNodeIdSchema,
  CaseIdSchema,
  GraphVersionIdSchema,
} from '../common/ids.js';
import {
  AnalyticalConfidenceSchema,
  ExpectedInformationGainSchema,
  StructuralSignalSchema,
  EvidenceStrengthSchema,
} from '../common/confidence.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';
import { GapPrioritySchema } from '../domain/investigative-gap.js';
import { RelationTypeSchema } from '../domain/relation.js';
import { ObservationTypeSchema } from '../domain/observation.js';
import { GraphHoleTypeSchema, GraphHoleCandidateIdSchema } from './graph-holes.js';
import { RegionStatusSchema } from './graph-hole-region.js';

// ============================================================================
// Gap Classification (Phase 5 + 5A-PR14)
//
// Classifies and prioritizes investigative gaps by type and impact.
//
// Phase 5A-PR14 (deterministic / structured classification) tightening:
//   - The runtime classifier (`@indago/gap-classification`) is a PURE DERIVED
//     layer over already-certified PR1/PR3/PR5/PR13 outputs. It never mutates,
//     persists, or re-discovers upstream state (no InvestigativeGap row, no
//     GraphHole mutation, no evidence creation/acquisition, no LLM).
//   - Result is single-label (one `type`) with an epistemic `status`,
//     deterministic `reasonCodes`, auditable `supportingReferences`, and a
//     `contextSha256` content digest.
//   - `graphHoleId` binds the classification to the deterministic candidate;
//     `gapId` remains optional (legacy investigative-gap linkage).
//   - `type` is REQUIRED for all statuses except `INSUFFICIENT_CONTEXT`
//     (the classifier was not given enough context — distinct from
//     `MISSING_DATA`, which describes the case itself).
//   - Frozen policy: docs/architecture/pr14-gap-classification.md.
// ============================================================================

export const GAP_CLASSIFICATION_POLICY_VERSION = 'v1' as const;
export type GapClassificationPolicyVersion = typeof GAP_CLASSIFICATION_POLICY_VERSION;

/**
 * Phase 5 semantic gap-classification categories.
 *
 * These are EXPLANATION / HYPOTHESIS-ORIENTED categories and intentionally do
 * NOT overload the domain `GapType` (domain/investigative-gap.ts). The domain
 * GapType describes the broad reason something is missing; Phase 5 classifies
 * the KIND of investigative effort implied.
 *
 * IMPORTANT: `CONCEALMENT_CONSISTENT_PATTERN` must NEVER become an assertion of
 * concealment. It is a hypothesis-oriented semantic — "the available pattern
 * is consistent with concealment as ONE possible explanation" — and carries
 * no legal or factual meaning on its own.
 */
export const GapClassificationTypeSchema = z.enum([
  'MISSING_INVESTIGATION',
  'MISSING_DATA',
  'MISSING_COMPARISON',
  'INFRASTRUCTURE_GAP',
  'CONCEALMENT_CONSISTENT_PATTERN',
]).describe(
  'Phase 5 semantic classification category. CONCEALMENT_CONSISTENT_PATTERN is an ' +
  'explanation/hypothesis-oriented semantic, NOT an assertion of concealment.',
);
export type GapClassificationType = z.infer<typeof GapClassificationTypeSchema>;

/**
 * Epistemic status of a classification (Phase 5A-PR14).
 *
 * - CONFIDENT: classification asserted on sufficient bounded context.
 * - SUPPORTED: classification is pattern-compatible but not confirmable
 *   (always used for CONCEALMENT_CONSISTENT_PATTERN — never CONFIDENT).
 * - AMBIGUOUS: contradictions in the bounded context are preserved; the
 *   winning non-forbidden category is reported without collapsing them.
 * - INSUFFICIENT_CONTEXT: the classifier was not given enough context; no
 *   `type` is emitted.
 */
export const GapClassificationStatusSchema = z.enum([
  'CONFIDENT',
  'SUPPORTED',
  'AMBIGUOUS',
  'INSUFFICIENT_CONTEXT',
]);
export type GapClassificationStatus = z.infer<typeof GapClassificationStatusSchema>;

/**
 * Deterministic reason codes emitted on a classification result (PR14 policy §6).
 */
export const GapClassificationReasonCodeSchema = z.enum([
  'QUESTION_IDENTIFIED',
  'INVESTIGATION_NOT_CONCLUDED',
  'REQUIRED_INFORMATION_ABSENT',
  'COMPARISON_BASELINE_ABSENT',
  'REGION_REPRESENTATION_LIMITED',
  'SOURCE_CATEGORY_UNAVAILABLE',
  'STRUCTURAL_EXPECTATION_STRONG',
  'ENDPOINT_EVIDENCE_PRESENT',
  'ABSENT_DIRECT_LINK_EVIDENCE',
  'CONCEALMENT_PATTERN_COMPATIBLE',
  'INSUFFICIENT_CONTEXT',
  'CONTRADICTION_PRESERVED',
]).describe(
  'Closed deterministic reason-code vocabulary. Failure codes (INVALID_INPUT, ' +
  'UNSUPPORTED_POLICY, CONTEXT_MISMATCH, QUALIFIED_CANDIDATE_REQUIRED) are thrown ' +
  'typed errors, not result reasons.',
);
export type GapClassificationReasonCode = z.infer<typeof GapClassificationReasonCodeSchema>;

/**
 * Typed failure codes for the deterministic classifier boundary (PR14 policy §12).
 */
export const GapClassificationFailureCodeSchema = z.enum([
  'INVALID_INPUT',
  'UNSUPPORTED_POLICY',
  'CONTEXT_MISMATCH',
  'QUALIFIED_CANDIDATE_REQUIRED',
]);
export type GapClassificationFailureCode = z.infer<typeof GapClassificationFailureCodeSchema>;

/**
 * Provenance of a classification: every id MUST exist in the supplied bounded
 * context (validated at CONTEXT_MISMATCH time). No ids are invented.
 */
export const GapClassificationReferencesSchema = z.object({
  supportingObservationIds: z.array(ObservationIdSchema)
    .describe('Observed-fact ids the predicates leaned on (all exist in supplied context).'),
  supportingHypothesisIds: z.array(HypothesisIdSchema)
    .describe('Candidate raw grounded-hypothesis ids (PR3), all exist in supplied context.'),
  structuralSignalIds: z.array(GraphNodeIdSchema)
    .describe('Candidate anchor node ids (all exist in supplied context).'),
}).strict();
export type GapClassificationReferences = z.infer<typeof GapClassificationReferencesSchema>;

export const GapClassificationRequestSchema = z.object({
  investigationId: InvestigationIdSchema,
  gapIds: z.array(InvestigativeGapIdSchema).optional()
    .describe('Specific gaps to classify. If empty, classify all gaps.'),
}).strict();
export type GapClassificationRequest = z.infer<typeof GapClassificationRequestSchema>;

export const GapClassificationResultSchema = z.object({
  graphHoleId: GraphHoleCandidateIdSchema
    .describe('Deterministic candidate id whose gap is classified (PR5 identity).'),
  gapId: InvestigativeGapIdSchema.optional()
    .describe('Legacy investigative-gap linkage, if one exists.'),
  type: GapClassificationTypeSchema.optional()
    .describe('Phase 5 semantic classification category (NOT domain GapType). ' +
      'Omitted ONLY when status is INSUFFICIENT_CONTEXT.'),
  status: GapClassificationStatusSchema
    .describe('Epistemic status of the classification (PR14).'),
  reasonCodes: z.array(GapClassificationReasonCodeSchema)
    .describe('Deterministic reason codes. Sorted, deduped.'),
  supportingReferences: GapClassificationReferencesSchema
    .describe('Provenance: ids of the bounded-context facts the classification leans on.'),
  contextSha256: z.string().min(1).max(64)
    .describe('SHA-256(canonicalizeDeterministic(signals + classificationPolicyVersion)). ' +
      'Content digest of the classification context.'),
  classificationPolicyVersion: z.literal(GAP_CLASSIFICATION_POLICY_VERSION)
    .describe('Version of the PR14 classification policy consumed.'),
  priority: GapPrioritySchema,
  impact: AnalyticalConfidenceSchema
    .describe('How much this gap affects investigation confidence'),
  expectedInformationValue: ExpectedInformationGainSchema
    .describe('Expected reduction in uncertainty if addressed'),
  relatedEntityIds: z.array(EntityIdSchema),
  relatedHypothesisIds: z.array(HypothesisIdSchema),
  suggestedActions: z.array(z.string())
    .describe('Suggested actions to address this gap'),
  computedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict().superRefine((result, ctx) => {
  const insufficient = result.status === 'INSUFFICIENT_CONTEXT';
  if (insufficient && result.type !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['type'],
      message: 'type must be omitted when status is INSUFFICIENT_CONTEXT',
    });
  }
  if (!insufficient && result.type === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['type'],
      message: 'type is required when status is not INSUFFICIENT_CONTEXT',
    });
  }
  if (insufficient && !result.reasonCodes.includes('INSUFFICIENT_CONTEXT')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reasonCodes'],
      message: 'INSUFFICIENT_CONTEXT status requires the INSUFFICIENT_CONTEXT reason code',
    });
  }
  if (!insufficient && result.reasonCodes.includes('INSUFFICIENT_CONTEXT')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reasonCodes'],
      message: 'INSUFFICIENT_CONTEXT reason code is only valid under INSUFFICIENT_CONTEXT status',
    });
  }
  if (result.status === 'AMBIGUOUS' && !result.reasonCodes.includes('CONTRADICTION_PRESERVED')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reasonCodes'],
      message: 'AMBIGUOUS status requires the CONTRADICTION_PRESERVED reason code',
    });
  }
  if (result.status !== 'AMBIGUOUS' && result.reasonCodes.includes('CONTRADICTION_PRESERVED')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reasonCodes'],
      message: 'CONTRADICTION_PRESERVED reason code is only valid under AMBIGUOUS status',
    });
  }
  if (result.type === 'CONCEALMENT_CONSISTENT_PATTERN' && result.status !== 'SUPPORTED') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: 'CONCEALMENT_CONSISTENT_PATTERN is pattern-compatible only and must use status SUPPORTED (never CONFIDENT)',
    });
  }
  if (
    result.reasonCodes.includes('CONTRADICTION_PRESERVED') &&
    (result.type === 'CONCEALMENT_CONSISTENT_PATTERN' || result.type === 'MISSING_DATA')
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reasonCodes'],
      message: 'contradictions are preserved and must never collapse into CONCEALMENT_CONSISTENT_PATTERN or MISSING_DATA',
    });
  }
});
export type GapClassificationResult = z.infer<typeof GapClassificationResultSchema>;

/**
 * Normalized, deterministic signal layer (PR14 policy §5).
 *
 * The classifier derives flat, contract-frozen signals from the supplied
 * bounded context; predicates (policy §6) read ONLY these signals. Every value
 * is an observed fact supportable from the supplied input — no fabrication, no
 * content-semantic reading, no hidden retrieval.
 */
export const GapClassificationContextCompletenessSchema = z.object({
  semanticRetrievalTruncated: z.boolean(),
  observationContextLimited: z.boolean(),
  hypothesisContextLimited: z.boolean(),
  hypothesisGroupingTruncated: z.boolean(),
  temporalContextLimited: z.boolean(),
  contextBudgetLimited: z.boolean(),
}).strict();
export type GapClassificationContextCompleteness = z.infer<
  typeof GapClassificationContextCompletenessSchema
>;

export const GapClassificationSignalsSchema = z.object({
  candidateId: GraphHoleCandidateIdSchema,
  caseId: CaseIdSchema,
  graphVersionId: GraphVersionIdSchema,
  regionId: z.string().min(1).max(256)
    .describe('Producing bounded region identity (PR1).'),
  holeType: GraphHoleTypeSchema,
  expectedRelationshipType: RelationTypeSchema.nullable()
    .describe('Expected relationship on the missing/expected edge; null when none was framed.'),
  structuralBasis: z.string()
    .describe('Candidate structural basis (raw, copied).'),
  regionStatus: RegionStatusSchema,
  regionTruncated: z.boolean(),
  regionLimited: z.boolean(),
  nodeIds: z.array(GraphNodeIdSchema),
  temporalScopeDeclared: z.boolean()
    .describe('Candidate declares a temporal scope (M-A12 authority; never updatedAt/createdAt).'),
  temporalContextDeclared: z.boolean()
    .describe('Region declares a temporal context interval.'),
  structuralScore: StructuralSignalSchema
    .describe('PR5 frozen structural score (copied verbatim, never recomputed).'),
  evidenceSupportScore: EvidenceStrengthSchema,
  expectedInformationValue: ExpectedInformationGainSchema,
  significance: StructuralSignalSchema,
  independentSupportUnitCount: z.number().int().nonnegative(),
  supportingObservationCount: z.number().int().nonnegative(),
  contradictingObservationCount: z.number().int().nonnegative(),
  supportingHypothesisCount: z.number().int().nonnegative(),
  inScopeObservationCount: z.number().int().nonnegative(),
  inScopeAtomicHypothesisCount: z.number().int().nonnegative(),
  inScopeGroupCount: z.number().int().nonnegative(),
  contradictionPresence: z.boolean(),
  contradictionCount: z.number().int().nonnegative(),
  comparisonBaselinePresent: z.boolean()
    .describe('Any in-scope competing atomic hypothesis on the candidate actor set.'),
  alternativeCoverage: z.number().min(0).max(1),
  endpointObservationPresence: z.boolean()
    .describe('Every candidate node has >= 1 in-scope observation (endpoint context exists).'),
  inScopeObservationTypes: z.array(ObservationTypeSchema),
  contextCompleteness: GapClassificationContextCompletenessSchema,
}).strict();
export type GapClassificationSignals = z.infer<typeof GapClassificationSignalsSchema>;