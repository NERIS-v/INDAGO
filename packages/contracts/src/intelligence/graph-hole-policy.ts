// ============================================================================
// Graph-Hole Policy — V1 (Phase 5A-PR0 Freeze)
//
// ONE authoritative, versioned, deterministic policy definition for the
// graph-hole / intelligence-gap core pipeline (§ Phase 5A).
//
// After this PR, later implementers must NOT need to guess:
//   - what "enough evidence" means
//   - what "significant enough" means
//   - how a support unit is determined
//   - what the V1 saturation definition is
//   - which thresholds are hard gates
//   - how grouping is defined
//   - what V1 bounds apply
//
// This module is policy/schema ONLY.
//   DO NOT implement: findGraphHoles, buildRegion, expandRegion,
//   semanticSearch, groupHypotheses, AI calls, persistence, workflow.
//
// Semantic invariants (frozen):
//   - A graph hole is a structural/evidentiary candidate, NOT a fact,
//     NOT proof, NOT criminality, NOT intent.
//   - StructuralSignal ≠ criminal relevance.
//   - Significance = investigative prioritization value, NOT probability.
//   - Community membership ≠ hypothesis grouping.
//   - Absence ≠ concealment.
//   - Truncated projections suppress normal-mode qualification.
// ============================================================================

import { z } from 'zod';

// ============================================================================
// §5 Policy Version
// ============================================================================

export const GRAPH_HOLE_POLICY_VERSION = 'v1' as const;
export type GraphHolePolicyVersion = typeof GRAPH_HOLE_POLICY_VERSION;

/** Semantic retrieval is a separate bounded system; version it independently. */
export const SEMANTIC_RETRIEVAL_POLICY_VERSION = 'v1' as const;
export type SemanticRetrievalPolicyVersion = typeof SEMANTIC_RETRIEVAL_POLICY_VERSION;

/**
 * Embedding policy version — versioned INDEPENDENTLY of the retrieval and
 * detection policies. An embedding's identity includes this value, so a policy
 * bump (e.g. a changed canonicalization rule or similarity semantics)
 * automatically invalidates prior embeddings instead of silently mixing them.
 */
export const EMBEDDING_POLICY_VERSION = 'v1' as const;
export type EmbeddingPolicyVersion = typeof EMBEDDING_POLICY_VERSION;

/**
 * AI-agent-runtime policy version — the shared LLM execution bound contract
 * (@indago/ai-agent-runtime). Versioned INDEPENDENTLY of embedding, retrieval
 * and detection policies: a budget/reliability policy bump re-identifies the
 * execution semantics that produced a given LLM result without touching
 * provider/model/prompt/schema versioning, which stay separate dimensions.
 *
 * v2 = provider-native strict structured output:
 *   - feature zod schema → JSON Schema representation → provider-enforced
 *     structured output (Gemini Interactions response_format.schema, Ollama
 *     format: <schema>), then parse + zod validation
 *   - new maxSchemaBytes schema-conversion bound
 *   - capability model: structuredOutput / nativeJsonSchema, no silent fallback
 *     (a provider that cannot enforce the schema natively → UNSUPPORTED_CAPABILITY)
 */
export const AI_RUNTIME_POLICY_VERSION = 'v2' as const;
export type AiRuntimePolicyVersion = typeof AI_RUNTIME_POLICY_VERSION;

/** Detection policy version (deterministic candidate identity formulation). */
export const DETECTION_POLICY_VERSION = 'v1' as const;
export type DetectionPolicyVersion = typeof DETECTION_POLICY_VERSION;

/**
 * Scoring calibration policy version — versioned INDEPENDENTLY of the
 * detection and graph-hole policy versions. A bump (e.g. formula revision,
 * new scoring components, or calibrated thresholds) automatically
 * identifies the scoring semantics that produced a qualified candidate.
 *
 * v2 = PR5 V1.1 formula revision (geometric-mean evidenceSupportScore,
 *      bounded patternStrength, revised expectedInformationValue).
 */
export const GRAPH_HOLE_SCORING_POLICY_VERSION = 'v2' as const;
export type GraphHoleScoringPolicyVersion = typeof GRAPH_HOLE_SCORING_POLICY_VERSION;

// ============================================================================
// §5 V1 Thresholds & Bounds (single source of truth)
// ============================================================================

/** §16 minimum independent support units required for qualification. */
export const MIN_INDEPENDENT_SUPPORT_UNITS = 2;

/** §15 minimum structural score to enter ordinary AI analysis. */
export const MIN_STRUCTURAL_SCORE = 0.70;

/** §14 minimum significance to enter ordinary AI analysis. */
export const MIN_SIGNIFICANCE = 0.70;

/** §5 / §8 maximum region expansion rounds. */
export const MAX_REGION_EXPANSION_ROUNDS = 3;

/**
 * §8 saturation novelty threshold.
 * Both newUniqueObservations / totalUniqueObservations AND
 * newUniqueNodes / totalUniqueNodes must be ≤ this value for two
 * consecutive rounds before a region is declared SATURATED.
 */
export const SATURATION_NOVELTY_THRESHOLD = 0.10;

/** §8 the number of consecutive satisfying rounds required for saturation. */
export const SATURATION_REQUIRED_CONSECUTIVE_ROUNDS = 2;

/** §5 maximum nodes per expanded region. */
export const MAX_REGION_NODES = 100;

/** §5 maximum edges per expanded region. */
export const MAX_REGION_EDGES = 250;

/** §5 maximum observations in semantic retrieval context window. */
export const MAX_CONTEXT_OBSERVATIONS = 150;

/** §5 maximum semantic search results per expansion round. */
export const MAX_SEMANTIC_RESULTS_PER_ROUND = 20;

/** §5 maximum total semantic search results across all rounds. */
export const MAX_TOTAL_SEMANTIC_RESULTS = 50;

/** §5 maximum canonical graph nodes admitted to a region by semantic expansion. */
export const MAX_SEMANTIC_NODES_ADDED = 50;

/** §5 maximum hypotheses loaded into AI context. */
export const MAX_HYPOTHESES_IN_CONTEXT = 50;

/** §19 maximum atomic hypotheses allowed in a single group component. */
export const MAX_ATOMIC_HYPOTHESES_PER_GROUP = 25;

/** §19 maximum nodes (entities) in the shared-context subgraph of one group. */
export const MAX_GROUP_NODES = 50;

/** §5 maximum graph-hole candidates emitted per region analysis. */
export const MAX_GRAPH_HOLES_PER_REGION = 10;

/** §5 maximum AI analysis calls per region. */
export const MAX_AI_ANALYSES_PER_REGION = 10;

/** §5 maximum evidence requests / AI evidence package size. */
export const MAX_EVIDENCE_PER_AI_PACKAGE = 100;

// ============================================================================
// §13 Structural-Score Component Names & Frozen Weights
//
// Each component is normalized [0, 1].
// If a component is genuinely not applicable to a detector, later runtime code
// MUST renormalize applicable weights rather than treating "not applicable"
// as zero evidence (§13).
// ============================================================================

export const StructuralScoreComponentSchema = z.enum([
  'patternStrength',
  'connectivitySupport',
  'contextualSupport',
  'temporalSupport',
  'communitySupport',
]);
export type StructuralScoreComponent = z.infer<typeof StructuralScoreComponentSchema>;

export const STRUCTURAL_SCORE_WEIGHTS = {
  patternStrength: 0.30,
  connectivitySupport: 0.25,
  contextualSupport: 0.20,
  temporalSupport: 0.15,
  communitySupport: 0.10,
} as const;
export type StructuralScoreWeights = typeof STRUCTURAL_SCORE_WEIGHTS;

// ============================================================================
// §14 Significance Component Names & Frozen Weights
//
// All components normalized [0, 1].
// ============================================================================

export const SignificanceComponentSchema = z.enum([
  'structuralScore',
  'evidenceSupportScore',
  'expectedInformationValue',
]);
export type SignificanceComponent = z.infer<typeof SignificanceComponentSchema>;

export const SIGNIFICANCE_WEIGHTS = {
  structuralScore: 0.60,
  evidenceSupportScore: 0.25,
  expectedInformationValue: 0.15,
} as const;
export type SignificanceWeights = typeof SIGNIFICANCE_WEIGHTS;

// ============================================================================
// §14b Scoring Calibration Constants (PR5 V1.1 Formula Revision)
//
// Frozen geometric-mean weights, pattern-strength influence, and bounded
// saturation constants for the V1.1 scoring calibration. All numbers are
// HEURISTIC DETERMINISTIC SCORES, NOT probabilities.
// ============================================================================

/** Frozen geometric-mean factor weights for evidenceSupportScore (V1.1). */
export const EVIDENCE_SUPPORT_GEOMETRIC_WEIGHTS = {
  supportBreadth: 0.5,
  supportConsistency: 0.3,
  provenanceCompleteness: 0.2,
} as const;
export type EvidenceSupportGeometricWeights = typeof EVIDENCE_SUPPORT_GEOMETRIC_WEIGHTS;

/**
 * patternStrength = basisStrength × (base + evidenceRatio × evidenceRatioSignal),
 * never exceeds basisStrength. Frozen (V1.1).
 */
export const PATTERN_STRENGTH_INFLUENCE_WEIGHTS = {
  base: 0.6,
  evidenceRatio: 0.4,
} as const;
export type PatternStrengthInfluenceWeights = typeof PATTERN_STRENGTH_INFLUENCE_WEIGHTS;

/** Frozen weighted-sum weights for expectedInformationValue (V1.1). */
export const EXPECTED_INFORMATION_VALUE_WEIGHTS = {
  uncertaintyPotential: 0.5,
  hypothesisCoverage: 0.3,
  evidenceDiversity: 0.2,
} as const;
export type ExpectedInformationValueWeights = typeof EXPECTED_INFORMATION_VALUE_WEIGHTS;

/** Support breadth saturation: min(U, SUPPORT_BREADTH_SATURATION) / saturation. */
export const SUPPORT_BREADTH_SATURATION = 4;

/** Hypothesis coverage saturation: min(H, HYPOTHESIS_COVERAGE_SATURATION) / saturation. */
export const HYPOTHESIS_COVERAGE_SATURATION = 3;

/** Evidence diversity saturation: min(U, EVIDENCE_DIVERSITY_SATURATION) / saturation. */
export const EVIDENCE_DIVERSITY_SATURATION = 4;

/**
 * Geometric-mean epsilon: floor for each factor before applying ln, ensuring
 * zero factors clamp to a tiny positive value rather than producing -Infinity.
 */
export const GEOMETRIC_MEAN_EPSILON = 0.000001;

// ============================================================================
// §16 Hard Qualification Gates (the only way a candidate enters AI analysis)
// ============================================================================

export const GraphHoleQualificationGateSchema = z.enum([
  'GRAPH_VERSION_EXISTS',
  'PROJECTION_NOT_TRUNCATED',
  'REGION_SATURATED',
  'CASE_ISOLATION_VALID',
  'MINIMUM_INDEPENDENT_SUPPORT_UNITS',
  'MINIMUM_STRUCTURAL_SCORE',
  'MINIMUM_SIGNIFICANCE',
  'CANDIDATE_NOT_RESOLVED',
  'CANDIDATE_NOT_DUPLICATE',
  'TEMPORAL_CONTEXT_VALID',
  'COMPUTATION_BOUNDS_SATISFIED',
]);
export type GraphHoleQualificationGate = z.infer<typeof GraphHoleQualificationGateSchema>;

// ============================================================================
// §9 Independent Support Unit — V1 Resolution Rule
//
// An observation's support-unit key is determined by the first usable key in
// this priority order:
//   1. sourceContextId
//   2. artifactId  (same-artifact binding)
//   3. contentHash (alternative artifact-level binding, same tier as artifactId)
//   4. sourceId
//
// Two observations count as independent IFF their resolved keys differ.
//
// This is intentionally conservative. The future 5A-9 implementation may
// produce a richer independence model, but V1 is frozen to this rule.
// ============================================================================

export const SupportUnitKeySchema = z.enum([
  'sourceContextId',
  'artifactId',
  'contentHash',
  'sourceId',
]);
export type SupportUnitKey = z.infer<typeof SupportUnitKeySchema>;

export const SUPPORT_UNIT_KEY_PRIORITY = [
  'sourceContextId',
  'artifactId',
  'contentHash',
  'sourceId',
] as const;

export const SupportUnitResolutionSchema = z.object({
  key: z.string().min(1)
    .describe('Resolved support-unit key string (e.g. "sourceContext:ctx-1"), V1 rule.'),
  basis: SupportUnitKeySchema
    .describe('Which key slot produced the resolution (V1 priority order).'),
}).strict();
export type SupportUnitResolution = z.infer<typeof SupportUnitResolutionSchema>;

/** Minimal V1 support-unit key resolution (policy encoding, not a detector). */
export function resolveSupportUnitKey(observation: {
  sourceContextId?: string | undefined;
  artifactId?: string | undefined;
  contentHash?: string | undefined;
  sourceId: string;
}): SupportUnitResolution | null {
  if (observation.sourceContextId !== undefined && observation.sourceContextId.length > 0) {
    return { key: `sourceContext:${observation.sourceContextId}`, basis: 'sourceContextId' };
  }
  if (observation.artifactId !== undefined && observation.artifactId.length > 0) {
    return { key: `artifact:${observation.artifactId}`, basis: 'artifactId' };
  }
  if (observation.contentHash !== undefined && observation.contentHash.length > 0) {
    return { key: `contentHash:${observation.contentHash}`, basis: 'contentHash' };
  }
  return { key: `source:${observation.sourceId}`, basis: 'sourceId' };
}

/** Count the number of distinct support-unit keys (the V1 independence metric). */
export function countIndependentSupportUnits(keys: ReadonlyArray<string | null>): number {
  const present = keys.filter((k): k is string => k !== null && k.length > 0);
  return new Set(present).size;
}

// ============================================================================
// §17 Truncation Semantics
// ============================================================================

export const TruncatedProjectionBehaviorSchema = z
  .literal('SUPPRESS')
  .describe(
    'ProjectedGraph.truncated === true suppresses normal-mode qualification. ' +
    'A future degraded mode may be introduced separately.',
  );
export type TruncatedProjectionBehavior = z.infer<typeof TruncatedProjectionBehaviorSchema>;

// ============================================================================
// §8 Region Saturation Contract (V1 definition, policy/schema only)
//
// A region becomes SATURATED only when:
//   - two consecutive expansion rounds both satisfy:
//       newUniqueObservations / totalUniqueObservations <= 0.10
//       AND newUniqueNodes / totalUniqueNodes <= 0.10
//   AND no hard expansion budget was exhausted during those rounds.
//
// SATURATED means:
//   "retrieval produced sufficiently little new context during the final
//    required expansion rounds."
// It does NOT claim mathematical completeness.
// ============================================================================

export const RegionSaturationDefinitionSchema = z.object({
  requiredConsecutiveRounds: z.literal(SATURATION_REQUIRED_CONSECUTIVE_ROUNDS)
    .describe('Two consecutive satisfying rounds required for saturation.'),
  observationNoveltyThreshold: z.number().min(0).max(1)
    .describe('newUniqueObservations / totalUniqueObservations <= this value.'),
  nodeNoveltyThreshold: z.number().min(0).max(1)
    .describe('newUniqueNodes / totalUniqueNodes <= this value.'),
  hardBudgetExhaustionDisqualifiesSaturation: z.literal(true)
    .describe('A hard bound being hit prevents SATURATED status.'),
  saturationSemanticsNote: z.literal(
    'Retrieval produced sufficiently little new context; NOT mathematical completeness.',
  ),
}).strict();
export type RegionSaturationDefinition = z.infer<typeof RegionSaturationDefinitionSchema>;

// ============================================================================
// §18 Grouping Policy Contract
//
// The hypothesis-overlap graph is built by:
//   - Each atomic relationship hypothesis is a graph node.
//   - An overlap edge connects two hypotheses when they share at least one
//     canonical graph node / entity.
//
// Grouping uses weakly connected components over this overlap graph.
// Directionality does NOT prevent grouping.
//
// §20: Community membership ≠ hypothesis grouping.
//      Louvain communities are an additional graph signal; they do NOT
//      define a Grouped Hypothesis.
// ============================================================================

export const HypothesisOverlapRuleSchema = z
  .literal('SHARED_CANONICAL_GRAPH_NODE_OR_ENTITY')
  .describe(
    'Two hypotheses receive an overlap edge when they share at least one canonical ' +
    'graph node or entity. Directionality does not affect grouping.',
  );
export type HypothesisOverlapRule = z.infer<typeof HypothesisOverlapRuleSchema>;

export const GroupComponentModelSchema = z
  .literal('WEAKLY_CONNECTED_COMPONENTS')
  .describe(
    'Hypothesis groups are weakly connected components of the hypothesis-overlap graph.',
  );
export type GroupComponentModel = z.infer<typeof GroupComponentModelSchema>;

/**
 * §19 V1 deterministic split ordering when a component exceeds its limit:
 *   1. stronger evidence support first
 *   2. higher structural relevance second
 *   3. stable hypothesis ID ascending as final tie-break
 */
export const GroupSplitOrderSchema = z.enum([
  'EVIDENCE_SUPPORT_DESC',
  'STRUCTURAL_RELEVANCE_DESC',
  'HYPOTHESIS_ID_ASC',
]);
export type GroupSplitOrder = z.infer<typeof GroupSplitOrderSchema>;

export const GROUP_SPLIT_ORDER: readonly GroupSplitOrder[] = [
  'EVIDENCE_SUPPORT_DESC',
  'STRUCTURAL_RELEVANCE_DESC',
  'HYPOTHESIS_ID_ASC',
] as const;

export const HypothesisGroupingPolicySchema = z.object({
  version: z.literal(GRAPH_HOLE_POLICY_VERSION),
  overlapRule: HypothesisOverlapRuleSchema,
  componentModel: GroupComponentModelSchema,
  directionalityAware: z.literal(false)
    .describe('Directionality does not prevent grouping.'),
  minimumSharedNodes: z.literal(1)
    .describe('One shared canonical node/entity creates an overlap edge.'),
  maxAtomicHypothesesPerGroup: z.number().int().positive()
    .describe('Maximum atomic hypotheses in a single group component before split.'),
  maxGroupNodes: z.number().int().positive()
    .describe('Maximum canonical nodes in the shared-context subgraph of one group.'),
  splitOrdering: z.array(GroupSplitOrderSchema).length(3)
    .describe('Deterministic ordering for splitting components that exceed limits.'),
}).strict();
export type HypothesisGroupingPolicy = z.infer<typeof HypothesisGroupingPolicySchema>;

// ============================================================================
// Policy Sub-Schemas
// ============================================================================

export const GraphHoleRegionPolicySchema = z.object({
  maxExpansionRounds: z.number().int().positive(),
  saturationRequiredConsecutiveRounds: z.number().int().positive(),
  saturationNoveltyThreshold: z.number().min(0).max(1),
  saturationObservationNoveltyThreshold: z.number().min(0).max(1),
  saturationNodeNoveltyThreshold: z.number().min(0).max(1),
  maxRegionNodes: z.number().int().positive(),
  maxRegionEdges: z.number().int().positive(),
  maxContextObservations: z.number().int().positive(),
  maxSemanticResultsPerRound: z.number().int().positive(),
  maxTotalSemanticResults: z.number().int().positive(),
  maxSemanticNodesAdded: z.number().int().positive(),
  maxGraphHolesPerRegion: z.number().int().positive(),
}).strict();
export type GraphHoleRegionPolicy = z.infer<typeof GraphHoleRegionPolicySchema>;

export const GraphHoleScoringPolicySchema = z.object({
  version: z.literal(GRAPH_HOLE_SCORING_POLICY_VERSION)
    .describe('Scoring calibration policy version. v2 = PR5 V1.1 formula revision.'),
  structuralScoreWeights: z.object({
    patternStrength: z.number().min(0).max(1),
    connectivitySupport: z.number().min(0).max(1),
    contextualSupport: z.number().min(0).max(1),
    temporalSupport: z.number().min(0).max(1),
    communitySupport: z.number().min(0).max(1),
  }).strict()
    .describe('Frozen structural-score weights. Must sum to 1.0.'),
  significanceWeights: z.object({
    structuralScore: z.number().min(0).max(1),
    evidenceSupportScore: z.number().min(0).max(1),
    expectedInformationValue: z.number().min(0).max(1),
  }).strict()
    .describe('Frozen significance weights. Must sum to 1.0.'),
  structuralComponentNotApplicableRenormalizes: z.literal(true)
    .describe(
      'When a structural component is not applicable, runtime must renormalize ' +
      'remaining applicable weights rather than treating the absent component as zero.',
    ),
  significanceMeaning: z.literal('INVESTIGATIVE_PRIORITIZATION_VALUE_NOT_PROBABILITY'),
  evidenceSupportGeometricWeights: z.object({
    supportBreadth: z.number().min(0).max(1),
    supportConsistency: z.number().min(0).max(1),
    provenanceCompleteness: z.number().min(0).max(1),
  }).strict()
    .describe('Frozen geometric-mean weights for evidenceSupportScore (v2). Must sum to 1.0.'),
  patternStrengthInfluence: z.object({
    base: z.number().min(0).max(1),
    evidenceRatio: z.number().min(0).max(1),
  }).strict()
    .describe('Frozen pattern-strength bound: basisStrength × (base + evidenceRatio × evidenceRatioSignal).'),
  expectedInformationValueWeights: z.object({
    uncertaintyPotential: z.number().min(0).max(1),
    hypothesisCoverage: z.number().min(0).max(1),
    evidenceDiversity: z.number().min(0).max(1),
  }).strict()
    .describe('Frozen weighted-sum weights for expectedInformationValue (v2). Must sum to 1.0.'),
  supportBreadthSaturation: z.number().int().positive()
    .describe('Saturation threshold for supportBreadth: min(U, saturation) / saturation.'),
  hypothesisCoverageSaturation: z.number().int().positive()
    .describe('Saturation threshold for hypothesisCoverage: min(H, saturation) / saturation.'),
  evidenceDiversitySaturation: z.number().int().positive()
    .describe('Saturation threshold for evidenceDiversity: min(U, saturation) / saturation.'),
  geometricMeanEpsilon: z.number().min(0).max(1)
    .describe('Epsilon floor inside geometric-mean ln to avoid ln(0).'),
}).strict();
export type GraphHoleScoringPolicy = z.infer<typeof GraphHoleScoringPolicySchema>;

export const GraphHoleQualificationPolicySchema = z.object({
  version: z.literal(GRAPH_HOLE_POLICY_VERSION),
  hardGates: z.array(GraphHoleQualificationGateSchema)
    .describe('All listed gates must be satisfied simultaneously.'),
  requiresAllHardGates: z.literal(true),
  truncatedProjectionBehavior: TruncatedProjectionBehaviorSchema,
  minIndependentSupportUnits: z.number().int().positive(),
  minStructuralScore: z.number().min(0).max(1),
  minSignificance: z.number().min(0).max(1),
  eligibleRegionStatus: z.literal('SATURATED')
    .describe('Only SATURATED regions may enter ordinary qualification.'),
}).strict();
export type GraphHoleQualificationPolicy = z.infer<typeof GraphHoleQualificationPolicySchema>;

export const GraphHoleAiContextPolicySchema = z.object({
  maxHypothesesInContext: z.number().int().positive(),
  maxAiAnalysesPerRegion: z.number().int().positive(),
  maxEvidencePerAiPackage: z.number().int().positive(),
}).strict();
export type GraphHoleAiContextPolicy = z.infer<typeof GraphHoleAiContextPolicySchema>;

// ============================================================================
// §26 Top-Level Policy Object + FROZEN V1 INSTANCE
// ============================================================================

export const GraphHolePolicyV1Schema = z.object({
  version: z.literal(GRAPH_HOLE_POLICY_VERSION),
  qualification: GraphHoleQualificationPolicySchema,
  region: GraphHoleRegionPolicySchema,
  grouping: HypothesisGroupingPolicySchema,
  scoring: GraphHoleScoringPolicySchema,
  aiContext: GraphHoleAiContextPolicySchema,
}).strict();
export type GraphHolePolicyV1 = z.infer<typeof GraphHolePolicyV1Schema>;

/**
 * The single authoritative frozen V1 graph-hole policy.
 *
 * All later runtime implementations (PR1 region builder, PR3 grouping,
 * PR5 qualification, PR7 AI context) must consume this policy object
 * rather than re-discovering thresholds.
 */
export const GRAPH_HOLE_POLICY_V1: GraphHolePolicyV1 = {
  version: GRAPH_HOLE_POLICY_VERSION,
  qualification: {
    version: GRAPH_HOLE_POLICY_VERSION,
    hardGates: [
      'GRAPH_VERSION_EXISTS',
      'PROJECTION_NOT_TRUNCATED',
      'REGION_SATURATED',
      'CASE_ISOLATION_VALID',
      'MINIMUM_INDEPENDENT_SUPPORT_UNITS',
      'MINIMUM_STRUCTURAL_SCORE',
      'MINIMUM_SIGNIFICANCE',
      'CANDIDATE_NOT_RESOLVED',
      'CANDIDATE_NOT_DUPLICATE',
      'TEMPORAL_CONTEXT_VALID',
      'COMPUTATION_BOUNDS_SATISFIED',
    ],
    requiresAllHardGates: true,
    truncatedProjectionBehavior: 'SUPPRESS',
    minIndependentSupportUnits: MIN_INDEPENDENT_SUPPORT_UNITS,
    minStructuralScore: MIN_STRUCTURAL_SCORE,
    minSignificance: MIN_SIGNIFICANCE,
    eligibleRegionStatus: 'SATURATED',
  },
  region: {
    maxExpansionRounds: MAX_REGION_EXPANSION_ROUNDS,
    saturationRequiredConsecutiveRounds: SATURATION_REQUIRED_CONSECUTIVE_ROUNDS,
    saturationNoveltyThreshold: SATURATION_NOVELTY_THRESHOLD,
    saturationObservationNoveltyThreshold: SATURATION_NOVELTY_THRESHOLD,
    saturationNodeNoveltyThreshold: SATURATION_NOVELTY_THRESHOLD,
    maxRegionNodes: MAX_REGION_NODES,
    maxRegionEdges: MAX_REGION_EDGES,
    maxContextObservations: MAX_CONTEXT_OBSERVATIONS,
    maxSemanticResultsPerRound: MAX_SEMANTIC_RESULTS_PER_ROUND,
    maxTotalSemanticResults: MAX_TOTAL_SEMANTIC_RESULTS,
    maxSemanticNodesAdded: MAX_SEMANTIC_NODES_ADDED,
    maxGraphHolesPerRegion: MAX_GRAPH_HOLES_PER_REGION,
  },
  grouping: {
    version: GRAPH_HOLE_POLICY_VERSION,
    overlapRule: 'SHARED_CANONICAL_GRAPH_NODE_OR_ENTITY',
    componentModel: 'WEAKLY_CONNECTED_COMPONENTS',
    directionalityAware: false,
    minimumSharedNodes: 1,
    maxAtomicHypothesesPerGroup: MAX_ATOMIC_HYPOTHESES_PER_GROUP,
    maxGroupNodes: MAX_GROUP_NODES,
    splitOrdering: [...GROUP_SPLIT_ORDER],
  },
  scoring: {
    version: GRAPH_HOLE_SCORING_POLICY_VERSION,
    structuralScoreWeights: { ...STRUCTURAL_SCORE_WEIGHTS },
    significanceWeights: { ...SIGNIFICANCE_WEIGHTS },
    structuralComponentNotApplicableRenormalizes: true,
    significanceMeaning: 'INVESTIGATIVE_PRIORITIZATION_VALUE_NOT_PROBABILITY',
    evidenceSupportGeometricWeights: { ...EVIDENCE_SUPPORT_GEOMETRIC_WEIGHTS },
    patternStrengthInfluence: { ...PATTERN_STRENGTH_INFLUENCE_WEIGHTS },
    expectedInformationValueWeights: { ...EXPECTED_INFORMATION_VALUE_WEIGHTS },
    supportBreadthSaturation: SUPPORT_BREADTH_SATURATION,
    hypothesisCoverageSaturation: HYPOTHESIS_COVERAGE_SATURATION,
    evidenceDiversitySaturation: EVIDENCE_DIVERSITY_SATURATION,
    geometricMeanEpsilon: GEOMETRIC_MEAN_EPSILON,
  },
  aiContext: {
    maxHypothesesInContext: MAX_HYPOTHESES_IN_CONTEXT,
    maxAiAnalysesPerRegion: MAX_AI_ANALYSES_PER_REGION,
    maxEvidencePerAiPackage: MAX_EVIDENCE_PER_AI_PACKAGE,
  },
};
