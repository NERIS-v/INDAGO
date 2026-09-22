import { z } from "zod";
import {
  BenchmarkConditionLabelSchema,
  BenchmarkRunMetaSchema,
} from "./benchmark-common.js";

// ============================================================================
// Benchmark artifact contracts — projection layer for the committed benchmark
// corpus.
//
// Rule enforced across this file: a field that the artifact does not carry must
// parse to `null` (and render NOT AVAILABLE) — never to a fabricated value.
// Every schema here is `.passthrough()` so that honest keys present in a real
// artifact are never stripped.
// ============================================================================

/** Loose identity of one per-case document (unions observed key variants). */
export const BenchmarkCaseKeySchema = z.object({
  caseId: z.string().default(""),
  caseKey: z.string().default(""),
});

export type BenchmarkCaseKey = z.infer<typeof BenchmarkCaseKeySchema>;

/** True/Honorific capacity flags, tolerating either nesting shape. */
export const BenchmarkTruthFlagsSchema = z
  .object({
    isGroundTruth: z.boolean().default(false),
    hasGroundTruthTruth: z.boolean().default(false),
    groundTruthName: z.string().nullable().default(null),
    groundTruthDesc: z.string().nullable().default(null),
  })
  .default({});

export type BenchmarkTruthFlags = z.infer<typeof BenchmarkTruthFlagsSchema>;

/** Candidate proposed for a planted hole (union of observed rank/meta keys). */
export const BenchmarkCandidateSchema = z
  .object({
    rank: z.number().default(-1),
    detectorType: z.string().nullable().default(null),
    nodeIds: z.array(z.string()).default([]),
    structuralScore: z.number().nullable().default(null),
    significance: z.number().nullable().default(null),
    classification: z.string().nullable().default(null),
    classificationStatus: z.string().nullable().default(null),
    explanationCount: z.number().nullable().default(null),
    generatedRequests: z.number().nullable().default(null),
    rankedRequests: z.number().nullable().default(null),
  })
  .passthrough();

export type BenchmarkCandidate = z.infer<typeof BenchmarkCandidateSchema>;

/** Hole record from holes.json entries[] (planted ground truth + detection). */
export const BenchmarkHoleEntrySchema = z
  .object({
    caseKey: z.string().default(""),
    caseId: z.string().default(""),
    condition: BenchmarkConditionLabelSchema.nullable().default(null),
    holeId: z.string().default(""),
    holeType: z.string().nullable().default(null),
    expectedType: z.string().nullable().default(null),
    regionStatus: z.string().nullable().default(null),
    regionError: z.string().nullable().default(null),
    detectionError: z.string().nullable().default(null),
    qualificationError: z.string().nullable().default(null),
    rawCandidateCount: z.number().nullable().default(null),
    qualifiedCount: z.number().nullable().default(null),
    qualificationFailureReasons: z.array(z.string()).default([]),
    candidates: z.array(BenchmarkCandidateSchema).default([]),
  })
  .passthrough();

export type BenchmarkHoleEntry = z.infer<typeof BenchmarkHoleEntrySchema>;

/** Hit/verdict row from holes.json verdicts[]. */
export const BenchmarkVerdictEntrySchema = z
  .object({
    caseKey: z.string().default(""),
    caseId: z.string().default(""),
    condition: BenchmarkConditionLabelSchema.nullable().default(null),
    holeId: z.string().default(""),
    holeType: z.string().nullable().default(null),
    lenientHit: z.boolean().nullable().default(null),
    strictHit: z.boolean().nullable().default(null),
    firstHitRank: z.number().nullable().default(null),
    regionStatus: z.string().nullable().default(null),
    seedObservationCount: z.number().nullable().default(null),
  })
  .passthrough();

export type BenchmarkVerdictEntry = z.infer<typeof BenchmarkVerdictEntrySchema>;

export const BenchmarkHolesDocSchema = z
  .object({
    labels: z
      .object({
        banner: z.string().default(""),
        corpus: z.string().default(""),
        mode: z.string().default(""),
        disclaimer: z.string().nullable().default(null),
        nonEndorsement: z.string().nullable().default(null),
      })
      .default({}),
    entries: z.array(BenchmarkHoleEntrySchema).default([]),
    verdicts: z.array(BenchmarkVerdictEntrySchema).default([]),
  })
  .passthrough();

export type BenchmarkHolesDoc = z.infer<typeof BenchmarkHolesDocSchema>;

/** Editorial baseline commentary attached to a run view (never numbers). */
export const BaselineCommentarySchema = z
  .object({
    label: z.string().nullable().default(null),
    title: z.string().nullable().default(null),
    subheading: z.string().nullable().default(null),
    disclaimer: z.string().nullable().default(null),
  })
  .default({});

export type BaselineCommentary = z.infer<typeof BaselineCommentarySchema>;

// ─── Per-case metric families ───────────────────────────────────────────────

const BenchmarkDistributionEntrySchema = z.object({
  type: z.string().default(""),
  count: z.number().default(0),
});

const BenchmarkStatusEntrySchema = z.object({
  status: z.string().default(""),
  count: z.number().default(0),
});

export const BenchmarkMaterializationMetricsSchema = z
  .object({
    recordsTotal: z.number().nullable().default(null),
    recordsObserved: z.number().nullable().default(null),
    recordsWithheld: z.number().nullable().default(null),
    recordsHeldOut: z.number().nullable().default(null),
    observationsMaterialized: z.number().nullable().default(null),
    observationCoverage: z.number().nullable().default(null),
    withheldRecordsStillMaterialized: z.number().nullable().default(null),
  })
  .passthrough();

export const BenchmarkEntityMetricsSchema = z
  .object({
    truthSurfaces: z.number().nullable().default(null),
    materializedEntities: z.number().nullable().default(null),
    resolvedTruthKeys: z.number().nullable().default(null),
    surfaceRecallAt1: z.number().nullable().default(null),
    entityPrecision: z.number().nullable().default(null),
    overCollapsedEntities: z.number().nullable().default(null),
    mergedTruthPairs: z.number().nullable().default(null),
  })
  .passthrough();

export const BenchmarkRelationMetricsSchema = z
  .object({
    expectedObservedEdges: z.number().nullable().default(null),
    expectedWithheldEdges: z.number().nullable().default(null),
    resolutions: z.number().nullable().default(null),
    resolvableResolutions: z.number().nullable().default(null),
    matchedResolutions: z.number().nullable().default(null),
    precisionAtThreshold: z.number().nullable().default(null),
    recallAtThreshold: z.number().nullable().default(null),
    typeAccuracy: z.number().nullable().default(null),
    supportThreshold: z.number().nullable().default(null),
  })
  .passthrough();

export const BenchmarkContradictionMetricsSchema = z
  .object({
    plantedContradictionClaims: z.number().nullable().default(null),
    contradictionObservationsMaterialized: z.number().nullable().default(null),
    contradictionsFlagged: z.number().nullable().default(null),
    recall: z.number().nullable().default(null),
  })
  .passthrough();

export const BenchmarkGraphMetricsSchema = z
  .object({
    entities: z.number().nullable().default(null),
    graphNodes: z.number().nullable().default(null),
    nodeMaterialization: z.number().nullable().default(null),
    graphEdges: z.number().nullable().default(null),
    truncated: z.boolean().nullable().default(null),
  })
  .passthrough();

export const BenchmarkHolesMetricsSchema = z
  .object({
    holesPlanted: z.number().nullable().default(null),
    holesRegionBuilt: z.number().nullable().default(null),
    holesDetected: z.number().nullable().default(null),
    holesDetectedStrict: z.number().nullable().default(null),
    lenientHitRate: z.number().nullable().default(null),
    strictHitRate: z.number().nullable().default(null),
    robustness: z.number().nullable().default(null),
    errAtK: z.number().nullable().default(null),
    k: z.number().nullable().default(null),
    qualifiedCandidates: z.number().nullable().default(null),
    rawCandidates: z.number().nullable().default(null),
    candidatesHittingAnyHole: z.number().nullable().default(null),
    candidatePrecision: z.number().nullable().default(null),
    totalPairEvaluations: z.number().nullable().default(null),
    fprProxy: z.number().nullable().default(null),
    hardFailures: z.number().nullable().default(null),
    byType: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();

export const BenchmarkClassificationMetricsSchema = z
  .object({
    classifiedCandidates: z.number().nullable().default(null),
    classificationCoverage: z.number().nullable().default(null),
    typeDistribution: z.array(BenchmarkDistributionEntrySchema).default([]),
    statusDistribution: z.array(BenchmarkStatusEntrySchema).default([]),
    holesWithClassifiedHit: z.number().nullable().default(null),
  })
  .passthrough();

export const BenchmarkExplanationMetricsSchema = z
  .object({
    candidatesWithExplanation: z.number().nullable().default(null),
    gapsWithExplanationShare: z.number().nullable().default(null),
    explanationTotal: z.number().nullable().default(null),
    explanationMeanPerGap: z.number().nullable().default(null),
    truncatedExplanationSets: z.number().nullable().default(null),
    typeCoverage: z.array(BenchmarkDistributionEntrySchema).default([]),
  })
  .passthrough();

export const BenchmarkEvidenceMetricsSchema = z
  .object({
    gapsWithEvidenceGeneration: z.number().nullable().default(null),
    generatedCandidatesTotal: z.number().nullable().default(null),
    generatedMeanPerGap: z.number().nullable().default(null),
    selectedTotal: z.number().nullable().default(null),
    selectedMeanPerGap: z.number().nullable().default(null),
    retentionRate: z.number().nullable().default(null),
    truncatedSelections: z.number().nullable().default(null),
    evidenceTypeCoverage: z.array(BenchmarkDistributionEntrySchema).default([]),
    holesWithSignalAlignment: z.number().nullable().default(null),
  })
  .passthrough();

/** One per-case metric document (per-case/<caseKey>.<CONDITION>.json). */
export const BenchmarkPerCaseDocSchema = z
  .object({
    caseId: z.string().default(""),
    caseKey: z.string().default(""),
    condition: BenchmarkConditionLabelSchema.nullable().default(null),
    materialization: BenchmarkMaterializationMetricsSchema.default({}),
    entity: BenchmarkEntityMetricsSchema.default({}),
    relation: BenchmarkRelationMetricsSchema.default({}),
    contradiction: BenchmarkContradictionMetricsSchema.default({}),
    graph: BenchmarkGraphMetricsSchema.default({}),
    holes: BenchmarkHolesMetricsSchema.default({}),
    classification: BenchmarkClassificationMetricsSchema.default({}),
    explanation: BenchmarkExplanationMetricsSchema.default({}),
    evidence: BenchmarkEvidenceMetricsSchema.default({}),
    allTypeDistribution: z.array(BenchmarkDistributionEntrySchema).default([]),
    allStatusDistribution: z.array(BenchmarkStatusEntrySchema).default([]),
  })
  .passthrough();

export type BenchmarkPerCaseDoc = z.infer<typeof BenchmarkPerCaseDocSchema>;

/** One condition's aggregate row from summary.json conditions[]. */
export const BenchmarkConditionAggregateSchema = z
  .object({
    condition: BenchmarkConditionLabelSchema,
    label: z.string().nullable().default(null),
    cases: z.number().default(0),
    // suite-level counts
    totalHoles: z.number().nullable().default(null),
    holesDetected: z.number().nullable().default(null),
    holesDetectedStrict: z.number().nullable().default(null),
    // rates
    hookHitRate: z.number().nullable().default(null),
    strictHitRate: z.number().nullable().default(null),
    robustness: z.number().nullable().default(null),
    errAtK: z.number().nullable().default(null),
    candidatePrecision: z.number().nullable().default(null),
    fprProxy: z.number().nullable().default(null),
    surfaceRecallAt1: z.number().nullable().default(null),
    // entity / relation
    entityPrecision: z.number().nullable().default(null),
    entityRecall: z.number().nullable().default(null),
    relationPrecision: z.number().nullable().default(null),
    relationRecall: z.number().nullable().default(null),
    // coverage
    observationCoverage: z.number().nullable().default(null),
    classificationCoverage: z.number().nullable().default(null),
    signalAlignmentCoverage: z.number().nullable().default(null),
    // materialization
    materializedEntities: z.number().nullable().default(null),
    graphNodes: z.number().nullable().default(null),
    graphEdges: z.number().nullable().default(null),
    // degradation
    hardFailures: z.number().nullable().default(null),
    degradedRecords: z.number().nullable().default(null),
    holesWithSignalAlignment: z.number().nullable().default(null),
  })
  .passthrough();

export type BenchmarkConditionAggregate = z.infer<typeof BenchmarkConditionAggregateSchema>;

export const BenchmarkSummaryDocSchema = z
  .object({
    runId: z.string().nullable().default(null),
    nowIso: z.string().nullable().default(null),
    generatedAt: z.string().nullable().default(null),
    benchmarkVersion: z.string().nullable().default(null),
    conditions: z.array(BenchmarkConditionAggregateSchema).default([]),
  })
  .passthrough();

export type BenchmarkSummaryDoc = z.infer<typeof BenchmarkSummaryDocSchema>;

export const BenchmarkManifestDocSchema = BenchmarkRunMetaSchema.passthrough();
export type BenchmarkManifestDoc = z.infer<typeof BenchmarkManifestDocSchema>;

/**
 * Normalized web-facing projection of one saved benchmark run. The web surface
 * renders ONLY from this projection — no server code fabricates numbers.
 * Fields absent from the artifact are explicitly null (rendered NOT AVAILABLE),
 * never synthesized.
 */
export const BenchmarkRunViewSchema = z
  .object({
    runId: z.string(),
    label: z.string().default(""),
    generatedAt: z.string().default(""),
    benchmarkVersion: z.string().default(""),
    state: z.enum(["PRE_ANALYSIS", "CORRECTED_OBSERVATION_ONLY", "COUNTERFACTUAL"])
      .nullable()
      .default(null),
    groundTruthAccessed: z.boolean().nullable().default(null),
    gitSha: z.string().nullable().default(null),
    seed: z.number().nullable().default(null),
    corpus: z.string().default("SYNTHETIC / DE-IDENTIFIED"),
    provider: z.string().default("NON_PROD"),
    model: z.string().nullable().default(null),
    durationMs: z.number().nullable().default(null),
    commentary: BaselineCommentarySchema,
    conditions: z.array(BenchmarkConditionAggregateSchema).default([]),
    holes: z.array(BenchmarkHoleEntrySchema).default([]),
    verdicts: z.array(BenchmarkVerdictEntrySchema).default([]),
    perCase: z.record(z.string(), BenchmarkPerCaseDocSchema).default({}),
    missing: z
      .object({
        manifest: z.boolean().default(false),
        summary: z.boolean().default(false),
        holes: z.boolean().default(false),
        perCase: z.boolean().default(false),
      })
      .default({}),
  })
  .passthrough();

export type BenchmarkRunView = z.infer<typeof BenchmarkRunViewSchema>;

/** Lightweight entry for the benchmark index (one line per known run). */
export const BenchmarkRunSummarySchema = z
  .object({
    runId: z.string(),
    label: z.string().default(""),
    dir: z.string().default(""),
    generatedAt: z.string().default(""),
    benchmarkVersion: z.string().default(""),
    state: z
      .enum(["PRE_ANALYSIS", "CORRECTED_OBSERVATION_ONLY", "COUNTERFACTUAL"])
      .nullable()
      .default(null),
    groundTruthAccessed: z.boolean().nullable().default(null),
  })
  .passthrough();

export type BenchmarkRunSummary = z.infer<typeof BenchmarkRunSummarySchema>;

/** Catalog of every benchmark run the web surface can resolve. */
export const BenchmarkCatalogSchema = z.object({
  runs: z.array(BenchmarkRunSummarySchema).default([]),
});

export type BenchmarkCatalog = z.infer<typeof BenchmarkCatalogSchema>;