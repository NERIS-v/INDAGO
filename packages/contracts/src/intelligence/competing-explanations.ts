import { z } from 'zod';
import {
  CaseIdSchema,
  GraphVersionIdSchema,
  ObservationIdSchema,
  GraphNodeIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema, TemporalIntervalSchema } from '../common/timestamps.js';
import { AnalyticalConfidenceSchema } from '../common/confidence.js';
import { MetadataSchema } from '../common/metadata.js';
import { RelationTypeSchema } from '../domain/relation.js';
import { GraphHoleCandidateIdSchema, GraphHoleTypeSchema } from './graph-holes.js';
import { GapClassificationTypeSchema, GapClassificationStatusSchema } from './gap-classification.js';

// ============================================================================
// Competing Explanations (Phase 5 + 5A-PR15)
//
// Competing explanations are STRUCTURED, PROVENANCE-AWARE, BOUNDED alternative
// explanations of WHY a qualified GraphHole exists, generated deterministically
// from the same closed-world package PR14 classified and evaluated against the
// real PR14 `GapClassificationResult`.
//
// ATTRIBUTION (frozen V1):
//   - Explanations are DERIVED ANALYTICAL OBJECTS — NOT canonical hypotheses,
//     NOT facts, NOT Leads. They carry no accept/reject/merge authority.
//   - "pattern-compatible" / "structurally plausible" language is never an
//     assertion of fact. CONCEALMENT_CONSISTENT_EXPLANATION is pattern-
//     compatible only and must not imply intent/criminality/guilt.
//   - No LLM in V1: generation is a pure deterministic function (frozen
//     templates, derived signals, content-addressed identity).
//   - No persistence by default; persistence is a caller concern.
//
// Phase 5A-PR15 boundary: PR16 (ER-split/relationship-split detail), PR17
// (evidence candidates), PR18 (evidence utility), PR19 (evidence independence),
// and PR20 (Resolution Rate@K) are NOT implemented here.
//
// Frozen policy: docs/architecture/pr15-competing-explanations.md.
// ============================================================================

export const COMPETING_EXPLANATION_POLICY_VERSION = 'v1' as const;
export type CompetingExplanationPolicyVersion = typeof COMPETING_EXPLANATION_POLICY_VERSION;

/** Hard bound on the number of competing explanations emitted for one hole (policy §14). */
export const MAX_COMPETING_EXPLANATIONS = 5;

/**
 * Explanation families (frozen V1, policy §4).
 *
 * Primary families explain the same deficit the PR14 classification selected;
 * alternative families are structural/representation alternatives emitted only
 * when their grounded signal is present (policy §10). No family is manufactured.
 */
export const CompetingExplanationTypeSchema = z.enum([
  'MISSING_INVESTIGATION_EXPLANATION',
  'MISSING_DATA_EXPLANATION',
  'MISSING_COMPARISON_EXPLANATION',
  'INFRASTRUCTURE_EXPLANATION',
  'CONCEALMENT_CONSISTENT_EXPLANATION',
  'ENTITY_FRAGMENTATION_EXPLANATION',
  'RELATION_REPRESENTATION_EXPLANATION',
  'TEMPORAL_EXPLANATION',
  'INNOCENT_ALTERNATIVE_EXPLANATION',
]).describe(
  'Frozen V1 explanation families. CONCEALMENT_CONSISTENT_EXPLANATION is a ' +
  'pattern-compatible semantic, never an assertion of concealment.',
);
export type CompetingExplanationType = z.infer<typeof CompetingExplanationTypeSchema>;

/**
 * Frozen basis codes (policy §12). Codes reuse PR14 reason-code semantics by
 * reference; they must never drift from the signalled cause they represent.
 */
export const CompetingExplanationBasisSchema = z.enum([
  'QUESTION_IDENTIFIED_NOT_EVALUATED',
  'INVESTIGATION_NOT_CONCLUDED',
  'REQUIRED_INFORMATION_ABSENT',
  'COMPARISON_BASELINE_ABSENT',
  'REGION_REPRESENTATION_LIMITED',
  'SOURCE_CATEGORY_UNAVAILABLE',
  'RELATIONSHIP_TYPE_UNREPRESENTED',
  'TEMPORAL_SCOPE_MISMATCH',
  'ENTITY_IDENTITY_UNRESOLVED',
  'LEGITIMATE_STRUCTURAL_ALTERNATIVE',
  'PATTERN_COMPATIBLE_ABSENCE',
]).describe(
  'Frozen V1 basis codes: the deterministic, signalled reason a family is emitted.',
);
export type CompetingExplanationBasis = z.infer<typeof CompetingExplanationBasisSchema>;

/**
 * Epistemic support level of an explanation (frozen V1, policy §16).
 *
 * - SUPPORTED: strongly grounded structurally and consistent with the frozen
 *   classification. NOT "confirmed fact" — it is a heuristic characterization.
 * - PLAUSIBLE: a grounded alternative consistent with the bounded context.
 * - WEAKLY_SUPPORTED: grounded but with little/no direct reference backing.
 * - CONTRADICTED: contradictory evidence is preserved on this explanation
 *   (listing an explanation is not endorsing it).
 * - INSUFFICIENT_CONTEXT: never emitted as a row in V1; reserved for the enum.
 *
 * Deliberately DISTINCT vocabulary from `GapClassificationStatusSchema`
 * (CONFIDENT/SUPPORTED/AMBIGUOUS/INSUFFICIENT_CONTEXT): classification
 * describes the classifier's confidence; support level describes the
 * explanation's grounding within that classification.
 */
export const CompetingExplanationSupportLevelSchema = z.enum([
  'SUPPORTED',
  'PLAUSIBLE',
  'WEAKLY_SUPPORTED',
  'CONTRADICTED',
  'INSUFFICIENT_CONTEXT',
]);
export type CompetingExplanationSupportLevel = z.infer<
  typeof CompetingExplanationSupportLevelSchema
>;

/**
 * Typed failure codes for the deterministic generator boundary (policy §7).
 * `INSUFFICIENT_CONTEXT` as a RESULT is an empty set, not an error.
 */
export const CompetingExplanationFailureCodeSchema = z.enum([
  'INVALID_INPUT',
  'UNSUPPORTED_POLICY',
  'CONTEXT_MISMATCH',
  'INVALID_REFERENCE',
]);
export type CompetingExplanationFailureCode = z.infer<
  typeof CompetingExplanationFailureCodeSchema
>;

/**
 * Content-addressed identity tuple (policy §8).
 *
 * `explanationId = sha256Hex(canonicalizeDeterministic(identityTuple))`.
 * A tuple whose type + core claim + support/contradiction set are identical
 * collapses to ONE explanation (dedupe, policy §15).
 */
export const CompetingExplanationIdentityV1Schema = z.object({
  caseId: CaseIdSchema,
  graphVersionId: GraphVersionIdSchema,
  graphHoleId: GraphHoleCandidateIdSchema,
  classificationType: GapClassificationTypeSchema.nullable()
    .describe('The PR14 classification type this explanation competes under (null => no set).'),
  explanationType: CompetingExplanationTypeSchema,
  basis: CompetingExplanationBasisSchema,
  expectedRelationshipType: RelationTypeSchema.nullable(),
  supportingObservationIds: z.array(ObservationIdSchema)
    .describe('Sorted-unique observed-fact ids (all exist in the supplied context).'),
  supportingHypothesisIds: z.array(z.string().min(1))
    .describe('Sorted-unique PR3 atomic derivedIds (e.g. atomic:RELATION_HYPOTHESIS:<id>).'),
  contradictingObservationIds: z.array(ObservationIdSchema),
  contradictingHypothesisIds: z.array(z.string().min(1)),
  structuralSignalIds: z.array(GraphNodeIdSchema),
  policyVersion: z.literal(COMPETING_EXPLANATION_POLICY_VERSION),
}).strict();
export type CompetingExplanationIdentityV1 = z.infer<
  typeof CompetingExplanationIdentityV1Schema
>;

/**
 * A single competing explanation (frozen V1, policy §2/§10).
 */
export const CompetingExplanationSchema = z.object({
  explanationId: z.string().regex(/^[0-9a-f]{64}$/)
    .describe('SHA-256 content-addressed id (order/execution independent, policy §8).'),
  type: CompetingExplanationTypeSchema,
  basis: CompetingExplanationBasisSchema
    .describe('The deterministic signalled reason this family is emitted (policy §12).'),
  statement: z.string().min(1).max(2000)
    .describe('Frozen canonical wording — pattern-compatible, never an assertion of fact.'),
  graphHoleId: GraphHoleCandidateIdSchema,
  gapClassificationType: GapClassificationTypeSchema.nullable()
    .describe("The set's PR14 type this explanation competes under."),
  supportingObservationIds: z.array(ObservationIdSchema),
  contradictingObservationIds: z.array(ObservationIdSchema)
    .describe('Contradictory evidence PRESERVED, never resolved (policy §30).'),
  supportingHypothesisIds: z.array(z.string().min(1))
    .describe('PR3 atomic derivedIds supporting this explanation.'),
  contradictingHypothesisIds: z.array(z.string().min(1)),
  structuralSignalIds: z.array(GraphNodeIdSchema),
  temporalScope: TemporalIntervalSchema.nullable()
    .describe('Domain validity window this explanation pertains to (M-A12); never updatedAt.'),
  supportLevel: CompetingExplanationSupportLevelSchema
    .describe('Deterministic support level. SUPPORTED ≠ CONFIRMED FACT (policy §16).'),
  uncertainty: AnalyticalConfidenceSchema
    .describe('Deterministic heuristic of grounding strength; NOT a probability (policy §20).'),
  assumptions: z.array(z.string().min(1).max(500)).max(3)
    .describe('Explicitly-labeled assumptions; assumptions are not evidence.'),
  rankingKey: z.string().min(1)
    .describe('Deterministic ranking key; lexicographic ascending order = rank (policy §14).'),
  policyVersion: z.literal(COMPETING_EXPLANATION_POLICY_VERSION),
}).strict();
export type CompetingExplanation = z.infer<typeof CompetingExplanationSchema>;

/**
 * The bounded, ranked, deduplicated set of competing explanations for one
 * qualified GraphHole, derived from one real PR14 classification (frozen V1).
 */
export const CompetingExplanationSetSchema = z.object({
  caseId: CaseIdSchema,
  graphVersionId: GraphVersionIdSchema,
  graphHoleId: GraphHoleCandidateIdSchema,
  /** Real PR14 output this set is derived from (echoed for provenance). */
  classification: z.object({
    type: GapClassificationTypeSchema.nullable(),
    status: GapClassificationStatusSchema,
    contextSha256: z.string().min(1).max(64),
    classificationPolicyVersion: z.literal('v1'),
  }).strict()
    .describe('The PR14 GapClassificationResult projection the set is derived from.'),
  /** Ranked, deduped, bounded [0..MAX_COMPETING_EXPLANATIONS]. */
  explanations: z.array(CompetingExplanationSchema)
    .max(MAX_COMPETING_EXPLANATIONS),
  /** Number of distinct explanations emitted (always equals explanations.length). */
  explanationCount: z.number().int().nonnegative(),
  /** true when more distinct candidates existed than the bound; top-N retained by rank. */
  truncated: z.boolean(),
  /** SHA-256(canonicalizeDeterministic(explanation signals + policyVersion)). */
  contextSha256: z.string().min(1).max(64)
    .describe('Content digest of the explanation context (derived signals + policy version).'),
  policyVersion: z.literal(COMPETING_EXPLANATION_POLICY_VERSION),
  computedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict().superRefine((set, ctx) => {
  const { type } = set.classification;
  if (type === null) {
    if (set.explanations.length !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['explanations'],
        message: 'INSUFFICIENT_CONTEXT classifications yield an empty explanation set',
      });
    }
  } else {
    for (let i = 0; i < set.explanations.length; i++) {
      const e = set.explanations[i]!;
      if (e.gapClassificationType !== type) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['explanations', i, 'gapClassificationType'],
          message: 'each explanation must cite the set classification type it competes under',
        });
      }
    }
  }
  const ids = new Set<string>();
  for (let i = 0; i < set.explanations.length; i++) {
    const id = set.explanations[i]!.explanationId;
    if (ids.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['explanations', i, 'explanationId'],
        message: 'duplicate explanationId — distinct explanations must have distinct content-addressed ids',
      });
    }
    ids.add(id);
  }
}).superRefine((set, ctx) => {
  if (set.explanationCount !== set.explanations.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['explanationCount'],
      message: 'explanationCount must equal the number of emitted explanations',
    });
  }
  if (set.truncated && set.explanations.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['truncated'],
      message: 'truncated cannot be true for an empty set',
    });
  }
  if (set.explanations.length < MAX_COMPETING_EXPLANATIONS && set.truncated) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['truncated'],
      message: 'truncated is only legal when the bound was actually reached',
    });
  }
});
export type CompetingExplanationSet = z.infer<typeof CompetingExplanationSetSchema>;

/**
 * Reference-surface projection used by identity/ranking (policy §8/§14).
 * Every id MUST exist in the supplied closed-world context.
 */
export const CompetingExplanationHoleSchema = z.object({
  graphHoleId: GraphHoleCandidateIdSchema,
  holeType: GraphHoleTypeSchema,
  expectedRelationshipType: RelationTypeSchema.nullable(),
}).strict();
export type CompetingExplanationHole = z.infer<typeof CompetingExplanationHoleSchema>;