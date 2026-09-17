import { z } from 'zod';
import {
  CaseIdSchema,
  GraphVersionIdSchema,
  ObservationIdSchema,
  GraphNodeIdSchema,
  CandidatePairIdSchema,
  EntityMentionCandidateIdSchema,
  EntityIdSchema,
  EntityHypothesisIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { AnalyticalConfidenceSchema, ResolutionScoreSchema } from '../common/confidence.js';
import { MetadataSchema } from '../common/metadata.js';
import { EntityComparisonStatusSchema } from '../common/comparison-status.js';
import { GraphHoleCandidateIdSchema } from './graph-holes.js';
import { GapClassificationStatusSchema, GapClassificationTypeSchema } from './gap-classification.js';
import { CompetingExplanationSupportLevelSchema } from './competing-explanations.js';

// ============================================================================
// Entity-Split Explanations (Phase 5A-PR16)
//
// MR-split explanations are STRUCTURED, PROVENANCE-AWARE, BOUNDED statements of
// one distinct, plausible way entity-resolution fragmentation could explain a
// QUALIFIED GraphHole: the hole's expected relationship appears missing because
// the real-world actor may be represented by two (or more) distinct canonical
// entities that were never unified.
//
// ATTRIBUTION (frozen V1):
//   - PR16 is an ANALYTICAL AID. It never asserts "a split occurred", never
//     second-guesses an accepted identity, and carries NO accept/reject/
//     reverse/merge/split authority (M-A09 owns identity authority).
//   - Output is worded split-compatible / structurally-compatible, never a
//     factual assertion of fragmentation.
//   - A pair whose mentions already resolve to the SAME canonical entity is
//     unified and is EXCLUDED before scoring (no ER-split explanation).
//   - No LLM in V1: generation is a pure deterministic function (frozen
//     templates, derived signals, content-addressed identity).
//   - No persistence by default; persistence is a caller concern.
//
// Reuse (by reference, never re-declared): M-A08 CandidatePair ids and
// blocking passes, M-A09 EntityHypothesis score/comparisonStatus/status and
// supporting/contradicting observation collections, M-A07 EntityMentionCandidate
// ids, PR14 GapClassificationResult, PR15 CompetingExplanationSupportLevel.
//
// Frozen policy: docs/architecture/pr16-er-split-graph-hole.md.
// ============================================================================

export const ER_SPLIT_EXPLANATION_POLICY_VERSION = 'v1' as const;
export type ErSplitExplanationPolicyVersion = typeof ER_SPLIT_EXPLANATION_POLICY_VERSION;

/** Hard bound on the number of ER-split explanations emitted for one hole (policy §14). */
export const MAX_ER_SPLIT_EXPLANATIONS = 5;

/** Hard bound on the M-A08 candidate-pair slice PR16 will consider (policy §5). */
export const MAX_CANDIDATE_PAIRS_PER_QUERY = 250;

/** Hard bound on the M-A09 hypothesis slice PR16 will consider (policy §5). */
export const MAX_ENTITY_HYPOTHESES_PER_QUERY = 500;

/** M-A09 score at/above which a RESOLVED_MATCH hypothesis counts as direct identity evidence (policy §12). */
export const RESOLUTION_MATCH_SCORE_THRESHOLD = 0.5;

/**
 * Typed failure codes for the deterministic generator boundary (policy §7).
 * `INSUFFICIENT_CONTEXT` as a RESULT is an empty set, not an error.
 */
export const ErSplitExplanationFailureCodeSchema = z.enum([
  'INVALID_INPUT',
  'UNSUPPORTED_POLICY',
  'CONTEXT_MISMATCH',
  'INVALID_REFERENCE',
]);
export type ErSplitExplanationFailureCode = z.infer<typeof ErSplitExplanationFailureCodeSchema>;

/**
 * Epistemic support status of an ER-split explanation (frozen V1, policy §10.2).
 *
 * Reuses the PR15 support-level vocabulary BY REFERENCE, excluding the
 * INSUFFICIENT_CONTEXT level: PR16 emits only emitted rows, never the empty
 * epistemic state. SUPPORTED ≠ "confirmed fact" — it is a heuristic
 * characterization that direct identity evidence bridges the hole boundary.
 */
export const ErSplitExplanationStatusSchema = CompetingExplanationSupportLevelSchema.exclude([
  'INSUFFICIENT_CONTEXT',
]);
export type ErSplitExplanationStatus = z.infer<typeof ErSplitExplanationStatusSchema>;

/**
 * Deterministic temporal compatibility between the two mentions' observations
 * (frozen V1, policy §16). Derived ONLY from M-A12 domain validity
 * (`validityInterval`) with `eventTime` as a point anchor — never
 * createdAt/updatedAt/system time.
 */
export const TemporalCompatibilitySchema = z.enum([
  'COMPATIBLE',
  'PARTIALLY_COMPATIBLE',
  'INCOMPATIBLE',
  'INSUFFICIENT',
]);
export type TemporalCompatibility = z.infer<typeof TemporalCompatibilitySchema>;

/**
 * Identity/shared signal codes (frozen V1, policy §6). Positive codes
 * (SHARED_*, HYPOTHESIS_COMPARED_MATCH, HYPOTHESIS_SCORE_STRONG,
 * SUPPORTING_OBSERVATION) drive `identitySupportScore > 0`; contradiction and
 * contextual codes document negatives/authority decisions without becoming
 * positive identity evidence.
 */
export const SharedSignalCodeSchema = z.enum([
  'EXACT_STRONG_IDENTIFIER_SHARED',
  'EXACT_CANONICAL_VALUE_SHARED',
  'NAME_INITIAL_BLOCK_SHARED',
  'HYPOTHESIS_COMPARED_MATCH',
  'HYPOTHESIS_SCORE_STRONG',
  'SUPPORTING_OBSERVATION',
  'CONTRADICTING_OBSERVATION',
  'HYPOTHESIS_NON_MATCH',
  'HYPOTHESIS_REJECTED',
  'HYPOTHESIS_REVERSED',
]);
export type SharedSignalCode = z.infer<typeof SharedSignalCodeSchema>;

/**
 * PR17-facing dimension codes: where additional evidence would disambiguate
 * (frozen V1, policy §18). PR16 computes the list; PR17 owns acquisition.
 * Absence codes are never contradictions (M-A09 `ABSENT ≠ DIFFERENT`).
 */
export const DiscriminatingGapCodeSchema = z.enum([
  'STRONG_IDENTIFIER_ABSENT',
  'CANONICAL_VALUE_ABSENT',
  'TEMPORAL_EVIDENCE_ABSENT',
  'CONTRADICTION_FREE_EVIDENCE_ABSENT',
  'OBSERVATION_OVERLAP_ABSENT',
]);
export type DiscriminatingGapCode = z.infer<typeof DiscriminatingGapCodeSchema>;

/**
 * Structural fit evidence for one explanation (frozen V1, policy §13):
 * the hole's boundary node set and which sides each canonical entity covers.
 * `GraphNode.id` IS the canonical `EntityId`, so side membership is a pure set
 * check over `observation.entityIds` within the closed package. No graph is
 * simulated or mutated.
 */
export const ErSplitExplanationStructuralFitSchema = z.object({
  /** Sorted-unique boundary node ids: Q.nodeIds ∪ neighbors via context edges (policy §13). */
  holeBoundaryNodeIds: z.array(GraphNodeIdSchema).min(1),
  /** Sorted-unique boundary node ids covered by candidate A's canonical entity. */
  coveredNodeIdsA: z.array(GraphNodeIdSchema),
  /** Sorted-unique boundary node ids covered by candidate B's canonical entity. */
  coveredNodeIdsB: z.array(GraphNodeIdSchema),
  /** Both sides non-empty AND no boundary-subgraph path connects them (policy §13). */
  borderBridging: z.boolean(),
}).strict().superRefine((fit, ctx) => {
  const inBoundary = (ids: readonly string[]): boolean =>
    ids.every((id) => fit.holeBoundaryNodeIds.includes(id));
  if (!inBoundary(fit.coveredNodeIdsA)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['coveredNodeIdsA'],
      message: 'every covered node id must be a member of holeBoundaryNodeIds',
    });
  }
  if (!inBoundary(fit.coveredNodeIdsB)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['coveredNodeIdsB'],
      message: 'every covered node id must be a member of holeBoundaryNodeIds',
    });
  }
  if (fit.borderBridging && (fit.coveredNodeIdsA.length === 0 || fit.coveredNodeIdsB.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['borderBridging'],
      message: 'borderBridging requires a non-empty covered side on each end',
    });
  }
});
export type ErSplitExplanationStructuralFit = z.infer<
  typeof ErSplitExplanationStructuralFitSchema
>;

/**
 * Targeted-reblocking handoff (frozen V1, policy §18/§27). PR11 owns executing
 * it (`@indago/targeted-reblocking`); PR16 never invokes reblocking. Emitted
 * only when `requiresTargetedReblocking` is true.
 */
export const TargetedReblockingHandoffSchema = z.object({
  targetCandidateIds: z.tuple([EntityMentionCandidateIdSchema, EntityMentionCandidateIdSchema]),
  targetRegionId: z.string().min(1).max(256)
    .describe('context.region.regionId of the producing region (PR1).'),
  reason: z.literal('ENTITY_FRAGMENTATION_POSSIBILITY'),
}).strict();
export type TargetedReblockingHandoff = z.infer<typeof TargetedReblockingHandoffSchema>;

/**
 * A single ER-split explanation (frozen V1, policy §2/§10).
 */
export const ErSplitExplanationSchema = z.object({
  /** SHA-256 content-addressed id == sha256(canonicalizeDeterministic({caseId, graphVersionId, graphHoleId, candidatePairId, policyVersion})) (policy §8). */
  explanationId: z.string().regex(/^[0-9a-f]{64}$/),
  graphHoleId: GraphHoleCandidateIdSchema,
  /** Reused M-A08 pair id (deterministic, case-scoped, canonical left<right ordering). */
  candidatePairId: CandidatePairIdSchema,
  /** Reused M-A07 entity-mention ids of the pair (canonical ordering = pair ordering). */
  candidateAId: EntityMentionCandidateIdSchema,
  candidateBId: EntityMentionCandidateIdSchema,
  /** Canonical entities each mention is currently linked to; null when not resolvable. Non-null + equal => pair would be unified and excluded (policy §9.5). */
  canonicalEntityAId: EntityIdSchema.nullable(),
  canonicalEntityBId: EntityIdSchema.nullable(),
  /** Sorted-unique shared identity signals (policy §6/§12). */
  sharedSignals: z.array(SharedSignalCodeSchema).min(1).max(10),
  /** Highest-scoring M-A09 hypothesis on the pair, when present (reused). */
  hypothesisId: EntityHypothesisIdSchema.nullable(),
  hypothesisComparisonStatus: EntityComparisonStatusSchema.nullable(),
  hypothesisScore: ResolutionScoreSchema.nullable(),
  /** Genuine positive identity evidence observation ids (validated in context; policy §6). */
  supportingObservationIds: z.array(ObservationIdSchema).max(30),
  /** Explicit mutually-exclusive counter-evidence ids — PRESERVED, never resolved (policy §17). */
  contradictingObservationIds: z.array(ObservationIdSchema).max(30),
  structuralFit: ErSplitExplanationStructuralFitSchema,
  /** Deterministic structural score in [0,1] (policy §13). Not a probability. */
  structuralFitScore: z.number().min(0).max(1),
  /** Deterministic identity evidence score in [0,1] (policy §12). Not a probability. */
  identitySupportScore: z.number().min(0).max(1),
  /** M-A12 domain-validity judgement between the two mentions (policy §16). Never updatedAt. */
  temporalCompatibility: TemporalCompatibilitySchema,
  /** Deterministic support status (policy §10.2). SUPPORTED ≠ CONFIRMED FACT. */
  explanationStatus: ErSplitExplanationStatusSchema,
  /** Deterministic grounding heuristic; NOT a probability (policy §19). */
  uncertainty: AnalyticalConfidenceSchema,
  /** true unless CONTRADICTED: confirming the split needs M-A09 authority (future REJECT/MERGE/SPLIT). */
  requiresAuthorityDecision: z.boolean(),
  /** true only when SUPPORTED: worth a targeted-reblocking probe. */
  requiresTargetedReblocking: z.boolean(),
  targetedReblockingHandoff: TargetedReblockingHandoffSchema.optional(),
  /** PR17-facing sorted dimension codes where more evidence would disambiguate. */
  missingDiscriminatingSignals: z.array(DiscriminatingGapCodeSchema),
  /** Frozen pattern-compatible statement — never an assertion that a split occurred. */
  statement: z.string().min(1).max(2000),
  /** Explicitly-labeled assumptions; assumptions are not evidence (≤3). */
  assumptions: z.array(z.string().min(1).max(500)).max(3),
  /** Deterministic ranking key; lexicographic ascending order = rank (policy §14). */
  rankingKey: z.string().min(1),
  /** SHA-256(canonicalizeDeterministic(context)) of the closed package (policy §9). */
  contextSha256: z.string().regex(/^[0-9a-f]{64}$/),
  policyVersion: z.literal(ER_SPLIT_EXPLANATION_POLICY_VERSION),
}).strict().superRefine((e, ctx) => {
  if (e.candidateAId === e.candidateBId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['candidateBId'],
      message: 'an explanation must reference two distinct entity mentions (no self-pair)',
    });
  }
  if (e.requiresAuthorityDecision === false && e.explanationStatus !== 'CONTRADICTED') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['requiresAuthorityDecision'],
      message: 'requiresAuthorityDecision may be false only for CONTRADICTED explanations',
    });
  }
  if (e.requiresTargetedReblocking !== (e.targetedReblockingHandoff !== undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['requiresTargetedReblocking'],
      message: 'requiresTargetedReblocking must match presence of targetedReblockingHandoff',
    });
  }
  if (e.requiresTargetedReblocking && e.explanationStatus !== 'SUPPORTED') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['requiresTargetedReblocking'],
      message: 'targeted reblocking is offered only for SUPPORTED explanations',
    });
  }
});
export type ErSplitExplanation = z.infer<typeof ErSplitExplanationSchema>;

/**
 * The bounded, ranked, deduplicated set of ER-split explanations for one
 * qualified GraphHole (frozen V1, policy §10.3).
 */
export const ErSplitExplanationSetSchema = z.object({
  caseId: CaseIdSchema,
  graphVersionId: GraphVersionIdSchema,
  graphHoleId: GraphHoleCandidateIdSchema,
  policyVersion: z.literal(ER_SPLIT_EXPLANATION_POLICY_VERSION),
  /** Real PR14 classification the set is derived from (echoed for provenance). */
  classification: z.object({
    type: GapClassificationTypeSchema.nullable(),
    status: GapClassificationStatusSchema,
    classificationPolicyVersion: z.literal('v1'),
  }).strict(),
  /** SHA-256(canonicalizeDeterministic(context)) of the closed package (policy §9). */
  contextSha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** PR15 set-level digest echoed verbatim when a competingExplanationSet was supplied; absent otherwise (policy §7). */
  competingExplanationSetContextSha256: z.string().min(1).max(64).optional(),
  /** Ranked, deduped, bounded [0..MAX_ER_SPLIT_EXPLANATIONS]. */
  explanations: z.array(ErSplitExplanationSchema)
    .max(MAX_ER_SPLIT_EXPLANATIONS),
  /** Number of distinct explanations emitted (always equals explanations.length). */
  explanationCount: z.number().int().nonnegative(),
  /** true when more distinct candidates existed than the bound; top-N retained by rank. */
  truncated: z.boolean(),
  /** Audit counters for supplied pairs that produced no explanation (policy §9.5/§18). */
  excludedPairCounts: z.object({
    unified: z.number().int().nonnegative()
      .describe('Pairs whose mentions already share a canonical entity — excluded before scoring.'),
    nonSplit: z.number().int().nonnegative()
      .describe('Pairs that were not unified but lacked identity evidence and/or structural fit for emission.'),
  }).strict(),
  /** = input.computedAt (no clock inside the generator). */
  generatedAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict().superRefine((set, ctx) => {
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
  if (set.explanations.length < MAX_ER_SPLIT_EXPLANATIONS && set.truncated) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['truncated'],
      message: 'truncated is only legal when the bound was actually reached',
    });
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
});
export type ErSplitExplanationSet = z.infer<typeof ErSplitExplanationSetSchema>;