// ============================================================================
// INTERNAL PILOT EVALUATION  ·  PROTOTYPE BENCHMARK  ·  SYNTHETIC / DE-IDENTIFIED
// Deterministic metric families over the REAL pipeline + hole-chain outputs.
//
// Nine families:
//   1  Materialization / acquisition
//   2  Entity resolution (alias-level, synthetic-reference-grade)
//   3  Relation resolution (precision / recall vs planted edges)
//   4  Contradiction handling
//   5  Graph construction
//   6  Hole detection & ranking (ERR@K, strict/lenient, FPR TN-proxy)
//   7  Gap classification coverage
//   8  Competing explanation breadth
//   9  Evidence-step utility (PR17→PR18 retention + signal alignment)
//
// Honesty: every fraction is a raw deterministic quotient over regenerated
// output. Nothing here is a claim of calibrated probability or production
// effectiveness. FPR uses detector `pairEvaluations` as a documented
// true-negative proxy.
// ============================================================================

import type { RelationType } from '@indago/contracts';
import { RELATION_PROPOSAL_THRESHOLD } from '@indago/relation-resolution';

import type { CaseCorpus } from './corpus.js';
import { candidateHitsHole } from './holes.js';
import type { HoleChainResult, HoleRunEntry } from './holes.js';
import type { PipelineResult } from './pipeline.js';
import type { EntityResolutionTruth, RobustnessResult } from './robustness.js';

export interface MaterializationMetrics {
  readonly recordsTotal: number;
  readonly recordsObserved: number;
  readonly recordsWithheld: number;
  readonly recordsHeldOut: number;
  readonly observationsMaterialized: number;
  readonly observationCoverage: number;
  readonly withheldRecordsStillMaterialized: number;
}

export interface EntityMetrics {
  readonly truthSurfaces: number;
  readonly materializedEntities: number;
  readonly resolvedTruthKeys: number;
  readonly surfaceRecallAt1: number;
  readonly entityPrecision: number;
  readonly overCollapsedEntities: number;
  readonly mergedTruthPairs: number;
}

export interface RelationMetrics {
  readonly expectedObservedEdges: number;
  readonly expectedWithheldEdges: number;
  readonly resolutions: number;
  readonly resolvableResolutions: number;
  readonly matchedResolutions: number;
  readonly precisionAtThreshold: number;
  readonly recallAtThreshold: number;
  readonly typeAccuracy: number;
  readonly supportThreshold: number;
}

export interface ContradictionMetrics {
  readonly plantedContradictionClaims: number;
  readonly contradictionObservationsMaterialized: number;
  readonly contradictionsFlagged: number;
  readonly recall: number;
}

export interface GraphMetrics {
  readonly entities: number;
  readonly graphNodes: number;
  readonly nodeMaterialization: number;
  readonly graphEdges: number;
  readonly truncated: boolean;
}

export interface HoleMetrics {
  readonly holesPlanted: number;
  readonly holesRegionBuilt: number;
  readonly holesDetected: number;
  readonly holesDetectedStrict: number;
  readonly lenientHitRate: number;
  readonly strictHitRate: number;
  readonly robustness: number;
  readonly errAtK: number;
  readonly k: number;
  readonly qualifiedCandidates: number;
  readonly rawCandidates: number;
  readonly candidatesHittingAnyHole: number;
  readonly candidatePrecision: number;
  readonly totalPairEvaluations: number;
  readonly fprProxy: number;
  readonly hardFailures: number;
  readonly byType: Readonly<Record<string, { planted: number; detected: number }>>;
}

export interface ClassificationMetrics {
  readonly classifiedCandidates: number;
  readonly classificationCoverage: number; // classified / qualified
  readonly typeDistribution: ReadonlyArray<{ type: string; count: number }>;
  readonly statusDistribution: ReadonlyArray<{ status: string; count: number }>;
  readonly holesWithClassifiedHit: number;
}

export interface ExplanationMetrics {
  readonly candidatesWithExplanation: number;
  readonly gapsWithExplanationShare: number;
  readonly explanationTotal: number;
  readonly explanationMeanPerGap: number;
  readonly truncatedExplanationSets: number;
  readonly typeCoverage: ReadonlyArray<{ type: string; count: number }>;
}

export interface EvidenceMetrics {
  readonly gapsWithEvidenceGeneration: number;
  readonly generatedCandidatesTotal: number;
  readonly generatedMeanPerGap: number;
  readonly selectedTotal: number;
  readonly selectedMeanPerGap: number;
  readonly retentionRate: number; // selectedTotal / generatedCandidatesTotal
  readonly truncatedSelections: number;
  readonly evidenceTypeCoverage: ReadonlyArray<{ type: string; count: number }>;
  readonly holesWithSignalAlignment: number;
}

export interface CaseMetrics {
  readonly caseId: string;
  readonly caseKey: string;
  readonly condition: string;
  readonly materialization: MaterializationMetrics;
  readonly entity: EntityMetrics;
  readonly relation: RelationMetrics;
  readonly contradiction: ContradictionMetrics;
  readonly graph: GraphMetrics;
  readonly holes: HoleMetrics;
  readonly classification: ClassificationMetrics;
  readonly explanation: ExplanationMetrics;
  readonly evidence: EvidenceMetrics;
  readonly allTypeDistribution: ReadonlyArray<{ type: string; count: number }>;
  readonly allStatusDistribution: ReadonlyArray<{ status: string; count: number }>;
}

// ---------------------------------------------------------------------------

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function sortedCounts<K extends string>(map: ReadonlyMap<K, number>): ReadonlyArray<{ type: string; count: number }> {
  return [...map.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => (a.type < b.type ? -1 : 1));
}

function sortedStatusCounts(map: ReadonlyMap<string, number>): ReadonlyArray<{ status: string; count: number }> {
  return [...map.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => (a.status < b.status ? -1 : 1));
}

function entriesOf(chain: HoleChainResult): readonly HoleRunEntry[] {
  return chain.entries;
}

export function computeCaseMetrics(
  corpus: CaseCorpus,
  run: PipelineResult,
  chain: HoleChainResult,
  robustness: RobustnessResult,
  entityTruth: EntityResolutionTruth,
): CaseMetrics {
  // ---- 1 materialization ----
  const recordsTotal = corpus.records.length;
  const recordsObserved = corpus.records.filter((r) => !r.withheld).length;
  const recordsWithheld = corpus.records.filter((r) => r.withheld).length;
  const recordsHeldOut = corpus.heldOutRecords.length;
  const observationsMaterialized = run.observations.length;
  const observationCoverage = recordsObserved === 0 ? 0 : observationsMaterialized / recordsObserved;
  const materializedRecordIds = new Set(run.observationToRecord.values());
  const withheldStillMaterialized = corpus.records.filter((r) => r.withheld && materializedRecordIds.has(r.id)).length;

  // ---- 2 entity resolution ----
  const truthSurfaces = entityTruth.truthSurfaces.length;
  const resolvedSurfaces = entityTruth.materializedCanonicals.filter((c) => entityTruth.truthSurfaces.includes(c)).length;
  const overCollapsedEntities = run.entities.filter((e) => {
    const canon = e.canonicalName.toLowerCase();
    const keys = new Set<string>();
    for (const identity of corpus.truth.identities) {
      const m = identity.surfaces.some((s) => s.toLowerCase() === canon);
      if (m) keys.add(identity.key);
    }
    return keys.size > 1;
  }).length;
  let mergedTruthPairs = 0;
  for (const e of run.entities) {
    const canon = e.canonicalName.toLowerCase();
    const keys = new Set<string>();
    for (const identity of corpus.truth.identities) {
      if (identity.surfaces.some((s) => s.toLowerCase() === canon)) keys.add(identity.key);
    }
    if (keys.size > 1) mergedTruthPairs += 1;
  }

  const surfaceRecallAt1 = truthSurfaces === 0 ? 0 : resolvedSurfaces / truthSurfaces;
  const entityPrecision = run.entities.length === 0 ? 0 : resolvedSurfaces / run.entities.length;

  // ---- 3 relation resolution ----
  const observedEdges = corpus.truth.edges.filter((e) => e.witnessRecordIds.length > 0 && !e.withheld);
  const withheldEdges = corpus.truth.edges.filter((e) => e.withheld);
  const expectedKeys = new Set<string>();
  for (const e of observedEdges) {
    expectedKeys.add(relationTruthKey(e.a, e.b, e.type));
  }
  const entityToTruthKey = new Map<string, string>();
  for (const identity of corpus.truth.identities) {
    for (const e of run.entities) {
      if (identity.surfaces.some((s) => e.canonicalName.toLowerCase() === s.toLowerCase())) {
        if (!entityToTruthKey.has(e.id)) entityToTruthKey.set(e.id, identity.key);
      }
    }
  }
  const expectedPairTypes = new Map<string, RelationType>(); // pairKey -> planted type
  for (const e of observedEdges) {
    const pk = pairKey(e.a, e.b);
    if (!expectedPairTypes.has(pk)) expectedPairTypes.set(pk, e.type);
  }
  let matchedResolutions = 0;
  let correctTypeResolutions = 0;
  const resolvableCount = run.relations.resolutions.filter((r) => {
    const a = entityToTruthKey.get(r.sourceEntityId);
    const b = entityToTruthKey.get(r.targetEntityId);
    if (a === undefined || b === undefined) return false;
    const expectedType = expectedPairTypes.get(pairKey(a, b));
    if (expectedType === undefined) return false;
    matchedResolutions += 1;
    if (expectedType === r.relationType) correctTypeResolutions += 1;
    return true;
  }).length;
  const precisionAtThreshold = resolvableCount === 0 ? 0 : matchedResolutions / resolvableCount;
  const recallAtThreshold = expectedKeys.size === 0 ? 0 : matchedResolutions / expectedKeys.size;
  const typeAccuracy = matchedResolutions === 0 ? 0 : correctTypeResolutions / matchedResolutions;

  // ---- 4 contradiction handling ----
  const plantedContradictionClaims = corpus.truth.contradictions.length;
  const contradictionObsMaterialized = corpus.truth.contradictions.filter((c) =>
    c.line.length > 0 && run.observations.some((o) => o.content.length > 0),
  ).length;
  const relationsWithContradiction = run.relations.resolutions.filter((r) => r.contradictions.length > 0).length;
  const contradictionsFlagged = relationsWithContradiction;
  const contradictionRecall =
    plantedContradictionClaims === 0 ? 0 : Math.min(1, contradictionsFlagged / plantedContradictionClaims);
  // NOTE: contradictionsFlagged counts relation pairs carrying explicit
  // contradiction records (deterministic); ties to the planted set is loose —
  // documented as a proxy.

  // ---- 5 graph ----
  const graphNodes = run.graph.nodeCount;
  const graphEdges = run.graph.edgeCount;
  const nodeMaterialization = run.entities.length === 0 ? 0 : graphNodes / run.entities.length;

  // ---- 6 holes ----
  const entries = entriesOf(chain);
  const rawCandidates = entries.reduce((acc, e) => acc + (e.detection?.candidateCount ?? 0), 0);
  const qualifiedCandidates = entries.reduce((acc, e) => acc + (e.qualifiedCandidateCount ?? 0), 0);
  // Candidates whose nodeIds genuinely touch every planted hole endpoint key:
  const holeByHoleId = new Map(corpus.truth.holes.map((h) => [h.id, h]));
  const entryByHole = new Map(entries.map((e) => [e.holeId, e]));
  const hittingIds = new Set<string>();
  for (const v of robustness.verdicts) {
    if (!v.lenientHit) continue;
    const entry = entryByHole.get(v.holeId);
    const planted = holeByHoleId.get(v.holeId);
    if (!entry || !planted) continue;
    for (const c of entry.candidates) {
      if (candidateHitsHole(c.rawCandidate.nodeIds, corpus, run, planted)) hittingIds.add(c.rawCandidate.candidateId);
    }
  }
  const candidatesHitting = hittingIds.size;
  const totalPairEvaluations = entries.reduce((acc, e) => acc + (e.detection?.detectorSummaries.reduce((a, d) => a + d.pairEvaluations, 0) ?? 0), 0);
  const fprProxy = totalPairEvaluations === 0 ? 0 : rawCandidates / totalPairEvaluations;

  const byType: Record<string, { planted: number; detected: number }> = {};
  for (const v of robustness.verdicts) {
    const t = v.holeType;
    const cur = byType[t] ?? { planted: 0, detected: 0 };
    cur.planted += 1;
    if (v.lenientHit) cur.detected += 1;
    byType[t] = cur;
  }

  // ---- 7 classification ----
  const classified = entries.flatMap((e) => e.candidates.filter((c) => c.classification !== null));
  const classificationCoverage = qualifiedCandidates === 0 ? 0 : classified.length / qualifiedCandidates;
  const typeCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  for (const c of classified) {
    if (c.classification) {
      const t = c.classification.type ?? 'UNASSIGNED';
      typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
      statusCounts.set(c.classification.status, (statusCounts.get(c.classification.status) ?? 0) + 1);
    }
  }
  const holesWithClassifiedHit = entries.filter((e) => {
    const v = robustness.verdicts.find((x) => x.holeId === e.holeId);
    return v?.lenientHit === true && e.candidates.some((c) => c.classification !== null);
  }).length;

  // ---- 8 explanations ----
  const candidatesWithExplanation = entries.flatMap((e) => e.candidates).filter((c) => c.explanationSet !== null);
  const explanationTotal = candidatesWithExplanation.reduce((a, c) => a + (c.explanationSet?.explanationCount ?? 0), 0);
  const explanationMeanPerGap = candidatesWithExplanation.length === 0 ? 0 : explanationTotal / candidatesWithExplanation.length;
  const truncatedExplanationSets = candidatesWithExplanation.filter((c) => c.explanationSet?.truncated === true).length;
  const explanationTypeCounts = new Map<string, number>();
  for (const c of candidatesWithExplanation) {
    for (const t of c.explanationSet?.explanationTypes ?? []) {
      explanationTypeCounts.set(t, (explanationTypeCounts.get(t) ?? 0) + 1);
    }
  }
  const gapsWithExplanationShare = qualifiedCandidates === 0 ? 0 : candidatesWithExplanation.length / qualifiedCandidates;

  // ---- 9 evidence ----
  const gapsWithGeneration = entries.flatMap((e) => e.candidates).filter((c) => c.evidenceGeneration !== null);
  const generatedCandidatesTotal = gapsWithGeneration.reduce((a, c) => a + (c.evidenceGeneration?.candidateRequestCount ?? 0), 0);
  const selected = entries.flatMap((e) => e.candidates).filter((c) => c.selection !== null);
  const selectedTotal = selected.reduce((a, c) => a + (c.selection?.rankedRequestCount ?? 0), 0);
  const selectedMeanPerGap = selected.length === 0 ? 0 : selectedTotal / selected.length;
  const generatedMeanPerGap = gapsWithGeneration.length === 0 ? 0 : generatedCandidatesTotal / gapsWithGeneration.length;
  const retentionRate = generatedCandidatesTotal === 0 ? 0 : selectedTotal / generatedCandidatesTotal;
  const truncatedSelections = selected.filter((c) => c.selection?.truncated === true).length;
  const evidenceTypeCounts = new Map<string, number>();
  for (const s of selected) {
    for (const t of s.selection?.rankedEvidenceTypes ?? []) {
      evidenceTypeCounts.set(t, (evidenceTypeCounts.get(t) ?? 0) + 1);
    }
  }

  // Signal alignment: does any ranked request's evidence type intersect the
  // planted hole's decisiveEvidenceTypes? Honest caveat: alignment is NOT a
  // quality endorsement.
  let holesWithSignalAlignment = 0;
  for (const e of entries) {
    const planted = holeByHoleId.get(e.holeId);
    if (!planted) continue;
    const v = robustness.verdicts.find((x) => x.holeId === e.holeId);
    if (!v?.lenientHit) continue;
    const rankedTypes = new Set<string>();
    for (const c of e.candidates) for (const t of c.selection?.rankedEvidenceTypes ?? []) rankedTypes.add(t);
    if (planted.decisiveEvidenceTypes.some((t) => rankedTypes.has(t))) holesWithSignalAlignment += 1;
  }

  return {
    caseId: corpus.caseId,
    caseKey: corpus.caseKey,
    condition: corpus.condition,
    materialization: {
      recordsTotal,
      recordsObserved,
      recordsWithheld,
      recordsHeldOut,
      observationsMaterialized,
      observationCoverage: round6(observationCoverage),
      withheldRecordsStillMaterialized: withheldStillMaterialized,
    },
    entity: {
      truthSurfaces,
      materializedEntities: run.entities.length,
      resolvedTruthKeys: new Set(entityTruth.resolvedIds.values()).size,
      surfaceRecallAt1: round6(surfaceRecallAt1),
      entityPrecision: round6(entityPrecision),
      overCollapsedEntities,
      mergedTruthPairs,
    },
    relation: {
      expectedObservedEdges: observedEdges.length,
      expectedWithheldEdges: withheldEdges.length,
      resolutions: run.relations.resolutions.length,
      resolvableResolutions: resolvableCount,
      matchedResolutions,
      precisionAtThreshold: round6(precisionAtThreshold),
      recallAtThreshold: round6(recallAtThreshold),
      typeAccuracy: round6(Math.min(1, typeAccuracy)),
      supportThreshold: RELATION_PROPOSAL_THRESHOLD,
    },
    contradiction: {
      plantedContradictionClaims,
      contradictionObservationsMaterialized: contradictionObsMaterialized,
      contradictionsFlagged,
      recall: round6(contradictionRecall),
    },
    graph: {
      entities: run.entities.length,
      graphNodes,
      nodeMaterialization: round6(nodeMaterialization),
      graphEdges,
      truncated: run.graph.truncated.nodes || run.graph.truncated.edges,
    },
    holes: {
      holesPlanted: robustness.holesPlanted,
      holesRegionBuilt: robustness.holesRegionBuilt,
      holesDetected: robustness.holesDetected,
      holesDetectedStrict: robustness.holesDetectedStrict,
      lenientHitRate: round6(robustness.lenientHitRate),
      strictHitRate: round6(robustness.strictHitRate),
      robustness: round6(robustness.robustness),
      errAtK: round6(robustness.errAtK),
      k: 3,
      qualifiedCandidates,
      rawCandidates,
      candidatesHittingAnyHole: candidatesHitting,
      candidatePrecision: round6(qualifiedCandidates === 0 ? 0 : candidatesHitting / qualifiedCandidates),
      totalPairEvaluations,
      fprProxy: round6(fprProxy),
      hardFailures: robustness.hardFailures.length,
      byType,
    },
    classification: {
      classifiedCandidates: classified.length,
      classificationCoverage: round6(classificationCoverage),
      typeDistribution: sortedCounts(typeCounts),
      statusDistribution: sortedStatusCounts(statusCounts),
      holesWithClassifiedHit,
    },
    explanation: {
      candidatesWithExplanation: candidatesWithExplanation.length,
      gapsWithExplanationShare: round6(gapsWithExplanationShare),
      explanationTotal,
      explanationMeanPerGap: round6(explanationMeanPerGap),
      truncatedExplanationSets,
      typeCoverage: sortedCounts(explanationTypeCounts),
    },
    evidence: {
      gapsWithEvidenceGeneration: gapsWithGeneration.length,
      generatedCandidatesTotal,
      generatedMeanPerGap: round6(generatedMeanPerGap),
      selectedTotal,
      selectedMeanPerGap: round6(selectedMeanPerGap),
      retentionRate: round6(retentionRate),
      truncatedSelections,
      evidenceTypeCoverage: sortedCounts(evidenceTypeCounts),
      holesWithSignalAlignment,
    },
    allTypeDistribution: sortedCounts(typeCounts),
    allStatusDistribution: sortedStatusCounts(statusCounts),
  };
}

function relationTruthKey(a: string, b: string, type: RelationType | string): string {
  return `${a}\u0000${b}\u0000${type}`;
}

function pairKey(a: string, b: string): string {
  return `${a}\u0000${b}`;
}