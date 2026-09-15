// ============================================================================
// Graph-Hole Analysis Output Schema (Phase 5A-PR7)
//
// GraphHoleAnalysisV1 — the feature-owned, machine-usable structured analysis
// of ONE qualified GraphHole candidate over a bounded AI context package.
//
// Design rules:
//   - Every reference field is an ID into the SUPPLIED context (observation
//     UUIDs, atomic-hypothesis derivedIds, groupId, candidateId), never an
//     invented natural-language identifier. PR8 adds deterministic claim
//     validation; PR7 performs only basic reference-shape validation (every
//     reference exists in the supplied context).
//   - Prefer enums / constrained values where semantics are known; keep
//     genuinely open-ended explanatory text free-form.
//   - The schema is zod-strict (unknown fields are REJECTED — the repository
//     schema policy). Tight enough for PR8 to validate later.
//   - Epistemic discipline: this is an INVESTIGATIVE UNCERTAINTY CANDIDATE
//     assessment, NOT a verdict, NOT criminality, NOT intent, NOT guilt.
//
// Schema-conversion constraint (PR7A): this schema is converted by
// @indago/ai-agent-runtime into provider-native JSON Schema. It must stay in
// the shared provider subset: no top-level unions, no pattern/minLength/
// maxLength/regex on strings, no tuples. All constructs used below (object +
// strict, enum, boolean, number min/max, string+format uuid, array+minItems,
// nullable) convert deterministically.
// ============================================================================

import { z } from 'zod';

import { GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION } from './analysis-policy.js';
import { EvidenceTypeSchema } from '@indago/contracts';

// ============================================================================
// Reference id shapes (into the supplied context)
// ============================================================================

/**
 * Observation UUID reference. FACTORY: returns a fresh schema instance so that
 * zod-to-json-schema never deduplicates reused instances into `$ref` (the
 * provider subset forbids `$ref`). Reference shapes are validated at schema
 * level; membership in the supplied context is enforced by reference integrity
 * validation in the analyst.
 */
export function analysisObservationIdRef() {
  return z
    .string()
    .uuid()
    .describe('Id of an observation supplied in the bounded analysis context.');
}
export type AnalysisObservationIdRef = z.infer<ReturnType<typeof analysisObservationIdRef>>;

/**
 * Atomic-hypothesis derivedId reference (shape `atomic:<TYPE>:<id>`). Plain
 * string by design: derivedIds are not UUIDs and the provider subset forbids
 * pattern/minLength. Factory (see analysisObservationIdRef).
 */
export function analysisHypothesisIdRef() {
  return z
    .string()
    .describe('Derived id of an atomic hypothesis supplied in the bounded analysis context.');
}
export type AnalysisHypothesisIdRef = z.infer<ReturnType<typeof analysisHypothesisIdRef>>;

/**
 * Hypothesis-group id (SHA-256 hex of sorted member derivedIds). Factory.
 */
export function analysisGroupIdRef() {
  return z
    .string()
    .describe('Group id (content-addressed SHA-256) of a supplied hypothesis group.');
}
export type AnalysisGroupIdRef = z.infer<ReturnType<typeof analysisGroupIdRef>>;

// ============================================================================
// Constrained epistemic classifications
// ============================================================================

/**
 * Overall assessment of the candidate given the supplied context. These are
 * epistemic positions, NOT verdicts of fact.
 */
export const CandidateAssessmentSchema = z.enum([
  'STRUCTURALLY_PLAUSIBLE',
  'WEAKLY_SUPPORTED',
  'CONTRADICTED',
  'INSUFFICIENT_EVIDENCE',
  'INSUFFICIENT_CONTEXT',
]).describe(
  'Overall epistemic assessment of the gap candidate over the supplied context. ' +
  'STRUCTURALLY_PLAUSIBLE = structural/qualification signals align with the supplied observations and no contradiction is referenced. ' +
  'WEAKLY_SUPPORTED = qualified but the supplied supporting evidence is thin. ' +
  'CONTRADICTED = supplied contradictions are referenced against the gap expectation. ' +
  'INSUFFICIENT_EVIDENCE = context present but not enough to assess. ' +
  'INSUFFICIENT_CONTEXT = the supplied context package was itself incomplete. ' +
  'Never a statement of fact, intent, criminality, or guilt.',
);
export type CandidateAssessment = z.infer<typeof CandidateAssessmentSchema>;

/**
 * Assessment of the missing relationship/structure the candidate hypothesizes.
 */
export const MissingRelationshipAssessmentSchema = z.enum([
  'CONSISTENT_WITH_GAP',
  'AMBIGUOUS',
  'CONTRADICTS_GAP',
  'INSUFFICIENT_EVIDENCE',
]).describe(
  'Whether the supplied evidence is consistent with the structural gap being real, ' +
  'contradicts it, is ambiguous, or is insufficient to decide. ' +
  'Never a claim that the missing relationship is a fact.',
);
export type MissingRelationshipAssessment = z.infer<
  typeof MissingRelationshipAssessmentSchema
>;

/** Directional expectation of the missing relation (constrained, not invented). */
export const MissingRelationDirectionSchema = z.enum([
  'UNKNOWN',
  'SOURCE_TO_TARGET',
  'TARGET_TO_SOURCE',
  'BIDIRECTIONAL',
]).describe(
  'Expected direction of the missing relation, if expressible; UNKNOWN when the candidate or context cannot state one.',
);
export type MissingRelationDirection = z.infer<typeof MissingRelationDirectionSchema>;

/** Epistemic kind of an ANATOMIC LINE OF REASONING. */
export const ReasoningStepKindSchema = z.enum([
  'OBSERVED_FACT',
  'HYPOTHESIS',
  'CONTRADICTION',
  'STRUCTURAL_SIGNAL',
  'TEMPORAL',
  'INFERENCE',
]).describe(
  'Kind of a reasoning step. INFERENCE is the analyst\u2019s own interpretation and ' +
  'must be labeled as such, never dressed as an observed fact.',
);
export type ReasoningStepKind = z.infer<typeof ReasoningStepKindSchema>;

/** Degree of epistemic uncertainty of the whole analysis. */
export const UncertaintyRatingSchema = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]).describe(
  'Overall uncertainty of this analysis given the supplied (possibly incomplete) context. ' +
  'CRITICAL = the analysis should not be treated as a firm basis for a consequential step.',
);
export type UncertaintyRating = z.infer<typeof UncertaintyRatingSchema>;

/** Closed warning vocabulary — the analyst cannot emit arbitrary alarm labels. */
export const AnalysisWarningCodeSchema = z.enum([
  'CONTEXT_INCOMPLETE',
  'TEMPORAL_CONFLICT',
  'TEMPORAL_PRECISION_LOW',
  'EVIDENCE_SPARSE',
  'CONTRADICTIONS_PRESENT',
  'NO_STRONG_EVIDENCE',
  'INFERENCE_ONLY',
]).describe(
  'Closed warning vocabulary. CONTEXT_INCOMPLETE = a completeness flag on the supplied context was true. ' +
  'TEMPORAL_CONFLICT = supplied evidence crosses incompatible time windows. ' +
  'TEMPORAL_PRECISION_LOW = interval precision would not support the claim. ' +
  'EVIDENCE_SPARSE = very few independent observations. ' +
  'CONTRADICTIONS_PRESENT = opposing references exist. ' +
  'NO_STRONG_EVIDENCE = no observation materially supports the assessment. ' +
  'INFERENCE_ONLY = the assessment rests on analyst interpretation without direct support.',
);
export type AnalysisWarningCode = z.infer<typeof AnalysisWarningCodeSchema>;

// ============================================================================
// Nested output structures
// ============================================================================

/** Assessment of the candidate's hypothesized missing relationship/structure. */
export const MissingRelationshipSchema = z.object({
  expectedRelationshipType: z
    .string()
    .nullable()
    .describe(
      'Expected-but-missing relation type as supplied in the candidate context; null when the candidate cannot state one. Never invented.',
    ),
  direction: MissingRelationDirectionSchema
    .describe('Expected direction of the missing relation (constrained enum; UNKNOWN when inexpressible).'),
  assessment: MissingRelationshipAssessmentSchema
    .describe('Epistemic assessment of the gap hypothesis over the supplied context.'),
  supportingObservationIds: z.array(analysisObservationIdRef())
    .describe('Observations from the supplied context supporting the gap expectation (sorted).'),
  contradictingObservationIds: z.array(analysisObservationIdRef())
    .describe('Observations from the supplied context contradicting the gap expectation (sorted).'),
  supportingHypothesisIds: z.array(analysisHypothesisIdRef())
    .describe('Atomic hypotheses (derivedIds) from the supplied context supporting the expectation (sorted).'),
  groupedHypothesisId: analysisGroupIdRef().nullable()
    .describe('Group id from the supplied context whose members ground this expectation, when one applies.'),
}).strict();
export type MissingRelationship = z.infer<typeof MissingRelationshipSchema>;

/** One alternative explanation considered by the analyst. */
export const AlternativeExplanationSchema = z.object({
  title: z.string()
    .describe('Short title of the alternative explanation (≤ 200 chars).'),
  description: z.string()
    .describe('Plain description of the alternative explanation (open-ended).'),
  supportingObservationIds: z.array(analysisObservationIdRef())
    .describe('Observations from the supplied context that support this alternative (sorted).'),
  contradictingObservationIds: z.array(analysisObservationIdRef())
    .describe('Observations from the supplied context that contradict this alternative (sorted).'),
  referencedHypothesisIds: z.array(analysisHypothesisIdRef())
    .describe('Atomic hypotheses referenced by this alternative (sorted).'),
  uncertainty: z.number().min(0).max(1)
    .describe('Analyst uncertainty in this alternative explanation, [0,1]. Not a probability of fact.'),
}).strict();
export type AlternativeExplanation = z.infer<typeof AlternativeExplanationSchema>;

/** One atomized line of reasoning with explicit reference grounding. */
export const ReasoningStepSchema = z.object({
  id: z.string()
    .describe(
      'Stable, unique id for this step within the analysis output (e.g. "R1", "R2"). ' +
      'These are output-record ids, NOT references into the supplied context.',
    ),
  kind: ReasoningStepKindSchema
    .describe('Epistemic kind of this step (constrained enum).'),
  statement: z.string()
    .describe('The step statement (open-ended, bounded to a single claim).'),
  supportingObservationIds: z.array(analysisObservationIdRef())
    .describe('Observations from the supplied context supporting this step (sorted).'),
  contradictingObservationIds: z.array(analysisObservationIdRef())
    .describe('Observations from the supplied context contradicting this step (sorted).'),
  referencedHypothesisIds: z.array(analysisHypothesisIdRef())
    .describe('Atomic hypotheses referenced by this step (sorted).'),
}).strict();
export type ReasoningStep = z.infer<typeof ReasoningStepSchema>;

/**
 * One recommended evidence request grounded in the supplied context.
 *
 * PR10 FREEZE (F1, F3):
 *   - `evidenceType` uses the authoritative canonical EvidenceTypeSchema
 *     vocabulary (domain/evidence.ts). A free-form descriptive subtype is NOT
 *     an evidence type; specificity lives in `rationale`.
 *   - `discriminatesAmongIds` names the explicitly considered competing
 *     explanations this request would help distinguish. References are
 *     atomic-hypothesis derivedIds into the supplied bounded context
 *     (never free text). The recommendation is LLM-PROPOSED and NOT
 *     authoritative; PR8 reference-validates the analysis references, and the
 *     PR10 selector decides deterministically.
 */
export const RecommendedEvidenceSchema = z.object({
  evidenceType: EvidenceTypeSchema
    .describe('Canonical evidence/artifact type (EvidenceTypeSchema — authoritative PR10 vocabulary).'),
  rationale: z.string()
    .describe('Short rationale for the recommendation.'),
  supportingObservationIds: z.array(analysisObservationIdRef())
    .describe('Observations from the supplied context that motivate this recommendation (sorted).'),
  discriminatesAmongIds: z.array(analysisHypothesisIdRef()).optional()
    .describe('Atomic-hypothesis derivedIds (from the supplied context) this recommendation would help distinguish — the discrimination target (sorted, deduped). PR10 freeze.'),
}).strict();
export type RecommendedEvidence = z.infer<typeof RecommendedEvidenceSchema>;

/** Uncertainty summary for the whole analysis. */
export const AnalysisUncertaintySchema = z.object({
  rating: UncertaintyRatingSchema,
  note: z.string().nullable()
    .describe('Short note explaining the rating; null when nothing further to say.'),
}).strict();
export type AnalysisUncertainty = z.infer<typeof AnalysisUncertaintySchema>;

/** One closed-vocabulary warning. */
export const AnalysisWarningSchema = z.object({
  code: AnalysisWarningCodeSchema,
  message: z.string()
    .describe('Short human-readable message tied to the closed code.'),
}).strict();
export type AnalysisWarning = z.infer<typeof AnalysisWarningSchema>;

// ============================================================================
// GraphHoleAnalysisV1
// ============================================================================

/**
 * Strict, machine-usable structured analysis of one qualified GraphHole
 * candidate over a bounded context package (Phase 5A-PR7).
 *
 * The model-authorable surface has NO free-form primary "analysis" blob: every
 * claim is an atomized reasoning step with explicit references, and the
 * assessment is a closed enum. Unknown fields are rejected (zod strict —
 * repository schema policy).
 */
export const GraphHoleAnalysisV1Schema = z
  .object({
    candidateAssessment: CandidateAssessmentSchema,
    missingRelationship: MissingRelationshipSchema,
    supportingObservationIds: z.array(analysisObservationIdRef())
      .describe('Top-level union of observation ids (from the supplied context) that support the assessment (sorted, deduped).'),
    contradictingObservationIds: z.array(analysisObservationIdRef())
      .describe('Observations (from the supplied context) that contradict the assessment (sorted, deduped).'),
    supportingHypothesisIds: z.array(analysisHypothesisIdRef())
      .describe('Atomic hypotheses (derivedIds) from the supplied context that support the assessment (sorted, deduped).'),
    groupedHypothesisId: analysisGroupIdRef().nullable()
      .describe('Primary grouped-hypothesis context id from the supplied context, when one applies.'),
    alternativeExplanations: z.array(AlternativeExplanationSchema)
      .describe('Competing plausible interpretations. Encouraged when evidence is genuinely ambiguous.'),
    reasoning: z
      .array(ReasoningStepSchema)
      .refine((steps) => steps.length > 0, {
        message: 'reasoning must contain at least one step',
      })
      .describe('Atomized, grounded reasoning steps — the machine-usable justification.'),
    recommendedEvidence: z.array(RecommendedEvidenceSchema)
      .describe('Evidence that would help resolve the gap, grounded in the supplied context.'),
    uncertainty: AnalysisUncertaintySchema,
    warnings: z.array(AnalysisWarningSchema)
      .describe('Closed-vocabulary warnings, including any completeness flags on the supplied context.'),
  })
  .strict();

export type GraphHoleAnalysisV1 = z.infer<typeof GraphHoleAnalysisV1Schema>;

/** Identifies the exact schema version that produced/gates an analysis record. */
export const GraphHoleAnalysisSchemaStampSchema = z.object({
  schemaVersion: z.literal(GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION),
  analysisType: z.literal('GraphHoleAnalysisV1'),
}).strict();
export type GraphHoleAnalysisSchemaStamp = z.infer<
  typeof GraphHoleAnalysisSchemaStampSchema
>;
