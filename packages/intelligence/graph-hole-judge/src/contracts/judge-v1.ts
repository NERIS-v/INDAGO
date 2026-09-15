// ============================================================================
// Graph-Hole Judge Output Schema (Phase 5A-PR9)
//
// GraphHoleJudgeV1 — the feature-owned, machine-usable structured judgment of
// ONE validated GraphHoleAnalysis (PR7) over its PR8 validation verdict and
// PR5 qualified candidate.
//
// Design rules:
//   - The judge is a PURE ASSESSOR, not an investigator. The model-authorable
//     surface is a categorical verdict + scored dimensions + a rationale. The
//     judge does NOT introduce evidence, create references, mutate the graph,
//     or decide persistence.
//   - The verdict is a closed enum (ACCEPT / NON_ACCEPTING), NOT a free-text
//     "decision" blob — the deterministic decision-state must be able to map
//     the verdict to a PR6 status transition unambiguously.
//   - Every dimension score is [0,1] and every dimension carries a rationale.
//     Scores are NOT probabilities and there is NO weighted aggregate: the
//     verdict is the model's categorical assessment informed by the
//     dimensions, which exist for human review + auditability + dimension-
//     level determinism checks, not for threshold-based verdict derivation.
//   - The schema is zod-strict (unknown fields are REJECTED — the repository
//     schema policy).
//   - Epistemic discipline: inherited from PR7/PR8. The judge NEVER asserts
//     criminality, intent, guilt, or wrongdoing; it assesses whether the
//     analysis is well-grounded over the supplied, validated context.
//
// Schema-conversion constraint (PR7A shared provider subset): this schema is
// converted by @indago/ai-agent-runtime into provider-native JSON Schema. It
// must stay in the shared provider subset: no top-level unions, no pattern /
// minLength / maxLength / regex on strings, no tuples. All constructs used
// below (object + strict, enum, number min/max, array + minItems, boolean)
// convert deterministically.
// ============================================================================

import { z } from 'zod';

import { GRAPH_HOLE_JUDGE_SCHEMA_VERSION } from './judge-policy.js';

// ============================================================================
// Verdict
// ============================================================================

/**
 * Categorical judgment of ONE validated graph-hole analysis over its supplied
 * context. Two values only — deliberately no spectrum. The dimensions array
 * carries the nuance; the verdict drives the deterministic decision-state.
 */
export const GraphHoleJudgeVerdictSchema = z.enum([
  'ACCEPT',
  'NON_ACCEPTING',
]).describe(
  'Categorical judgment. ACCEPT = the analysis is well-grounded over the ' +
  'supplied validated context and no PR8 ERROR is present; the candidate may ' +
  'proceed toward ACTIVE status. NON_ACCEPTING = the judge does not ground ' +
  'the analysis sufficiently; the candidate must not proceed toward ACTIVE ' +
  'without human review.',
);
export type GraphHoleJudgeVerdict = z.infer<typeof GraphHoleJudgeVerdictSchema>;

/**
 * Closed vocabulary of scored dimensions. The judge MUST NOT invent new
 * dimensions; every dimension constrains one aspect of analytic grounding.
 */
export const GraphHoleJudgeDimensionNameSchema = z.enum([
  'EVIDENCE_GROUNDING',
  'REASONING_COHERENCE',
  'EPISTEMIC_DISCIPLINE',
  'UNCERTAINTY_CALIBRATION',
  'GAP_ASSESSMENT_QUALITY',
  'ALTERNATIVE_COVERAGE',
]).describe(
  'Closed scoring dimension vocabulary. EVIDENCE_GROUNDING = cited ' +
  'observations/hypotheses are present and relevant in the supplied context. ' +
  'REASONING_COHERENCE = reasoning steps follow from the evidence. ' +
  'EPISTEMIC_DISCIPLINE = no forbidden epistemic claims; inference is labeled ' +
  'as inference. UNCERTAINTY_CALIBRATION = stated uncertainty matches the ' +
  'supplied evidence. GAP_ASSESSMENT_QUALITY = candidateAssessment / ' +
  'missingRelationship assessment is grounded. ALTERNATIVE_COVERAGE = competing ' +
  'explanations are considered where evidence is ambiguous.',
);
export type GraphHoleJudgeDimensionName = z.infer<
  typeof GraphHoleJudgeDimensionNameSchema
>;

// ============================================================================
// Dimension
// ============================================================================

/** One scored dimension of the judge's assessment. */
export const GraphHoleJudgeDimensionSchema = z.object({
  dimension: GraphHoleJudgeDimensionNameSchema
    .describe('Which dimension is being scored (closed vocabulary).'),
  score: z.number().min(0).max(1)
    .describe('Judge score for this dimension, [0,1]. Not a probability; no threshold semantics.'),
  rationale: z.string()
    .describe('Short rationale grounding this score in the supplied evidence.'),
}).strict();
export type GraphHoleJudgeDimension = z.infer<typeof GraphHoleJudgeDimensionSchema>;

// ============================================================================
// GraphHoleJudgeV1
// ============================================================================

/**
 * Strict, machine-usable judgment of one validated graph-hole analysis
 * (Phase 5A-PR9). Two-value verdict + scored dimensions + free rationale.
 * The judge model-authorable surface has NO free-form "decision" blob and NO
 * evidence/reference fields — the judge references nothing it was not given.
 */
export const GraphHoleJudgeV1Schema = z
  .object({
    verdict: GraphHoleJudgeVerdictSchema,
    dimensions: z.array(GraphHoleJudgeDimensionSchema)
      .min(1)
      .describe('At least one scored, rationaled dimension. Sorted by dimension name for determinism.'),
    rationale: z.string()
      .describe('Concise rationale for the verdict, grounded only in the supplied validated context.'),
  })
  .strict();

export type GraphHoleJudgeV1 = z.infer<typeof GraphHoleJudgeV1Schema>;

/** Identifies the exact schema version that produced/gates a judge record. */
export const GraphHoleJudgeSchemaStampSchema = z.object({
  schemaVersion: z.literal(GRAPH_HOLE_JUDGE_SCHEMA_VERSION),
  judgeType: z.literal('GraphHoleJudgeV1'),
}).strict();
export type GraphHoleJudgeSchemaStamp = z.infer<
  typeof GraphHoleJudgeSchemaStampSchema
>;