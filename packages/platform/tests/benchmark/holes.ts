// ============================================================================
// INTERNAL PILOT EVALUATION  ·  PROTOTYPE BENCHMARK  ·  SYNTHETIC / DE-IDENTIFIED
// Phase 5A hole chain — runs the REAL deterministic engines over each planted
// hole's bounded region:
//
//   PR1   buildRegion            (seed observations → bounded region)
//   PR3   buildHypothesisContext (relation hypotheses → atomic/grouped)
//   PR4   detectGraphHoleCandidates
//   PR5   qualifyAndRankGraphHoleCandidates
//   PR14  classifyGap
//   PR15  generateCompetingExplanations
//   PR17  generateCandidateEvidenceRequests
//   PR18  selectBestEvidenceFromCandidates
//
// PURE and database-free. No timestamps-of-now, no random ids, no wall clock.
// Failures are captured per stage (typed) so one bad region never aborts the
// run — every planted hole gets an honest record.
//
// Honesty notes:
//   • `entityIdsByObservation` comes from the pipeline's REAL materialization
//     boundary (never fabricated for seeding).
//   • hypotheses are built ONLY from source-grounded relation resolutions; a
//     below-threshold co-occurrence is NOT dressed up as an expectation.
//   • the canonical graph materializes ONLY documented relations (per
//     buildGraph's contract) — so an expectation asserted by observed
//     co-mention with no documented edge is exactly the gap the detectors are
//     authorized to surface, computed by the REAL engines.
//   • a planted hole is "detected" by whatever detector + candidate surfaces it
//     in the REAL engine — never by looking the hole up in the truth table.
//   • community membership for the COMMUNITY_BOUNDARY detector comes from the
//     REAL deterministic M-A10/M-A13 Louvain pass over the projection.
// ============================================================================

import type {
  EntityHypothesis,
  GraphEdge,
  GraphNode,
  GraphHoleType,
  Observation,
  ObservedTime,
  Provenance,
  QualifiedGraphHoleCandidate,
  RawGraphHoleCandidate,
  RelationHypothesis,
  RelationType,
  TemporalInterval,
} from '@indago/contracts';
import { buildRegion, ProjectedGraphExpansionProvider } from '@indago/graph-hole-region';
import { detectGraphHoleCandidates } from '@indago/graph-hole-detection';
import type { DetectionInput } from '@indago/graph-hole-detection';
import { detectCommunities } from '@indago/graphology-projection';
import {
  qualifyAndRankGraphHoleCandidates,
  type QualificationInput,
} from '@indago/graph-hole-qualification';
import { buildHypothesisContext } from '@indago/hypothesis-context';
import type { HypothesisContext } from '@indago/hypothesis-context';
import {
  classifyGap,
  type GapClassificationInput,
} from '@indago/gap-classification';
import {
  generateCompetingExplanations,
} from '@indago/competing-explanations';
import {
  EVIDENCE_REQUEST_GENERATION_POLICY_VERSION,
  generateCandidateEvidenceRequests,
} from '@indago/evidence-request-generation';
import {
  selectBestEvidenceFromCandidates,
  type CandidateEvidenceSelectionInput,
} from '@indago/next-best-evidence';
import {
  deriveRelationHypothesisStatus,
  deterministicRelationHypothesisId,
  RELATION_PROPOSAL_THRESHOLD,
} from '@indago/relation-resolution';
import { deriveValidityInterval } from '../../src/temporal/interval-aggregation.js';
import type { CaseCorpus, HoleType, PlantedHole } from './corpus.js';
import type { PipelineResult } from './pipeline.js';
import { checked, checkedAsync, isDiagEnabled, sha256Hex, uuidFrom } from './util.js';

type Writable<T> = { -readonly [P in keyof T]: T[P] };

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface HoleChainOptions {
  readonly nowIso?: string;
}

// ---------------------------------------------------------------------------
// Result records
// ---------------------------------------------------------------------------

export interface ChainError {
  readonly stage: string;
  readonly message: string;
}

export interface RegionSummary {
  readonly regionId: string;
  readonly status: string;
  readonly truncated: boolean;
  readonly limitations: readonly string[];
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly seedObservationIds: readonly string[];
  readonly resolvedSeedNodeIds: readonly string[];
  readonly unresolvedSeedEntityIds: readonly string[];
}

export interface DetectionSummary {
  readonly candidateCount: number;
  readonly rawCandidates: readonly RawGraphHoleCandidate[];
  readonly detectorSummaries: readonly {
    detectorType: GraphHoleType;
    candidates: number;
    pairEvaluations: number;
  }[];
}

export interface HandledCandidate {
  readonly rawCandidate: RawGraphHoleCandidate;
  /** Rank within the hole's qualified candidate list (1 = top PR5 ranking key). */
  readonly rank: number;
  readonly structuralScore: number;
  readonly evidenceSupportScore: number;
  readonly significance: number;
  readonly classification: {
    readonly type: string | null;
    readonly status: string;
    readonly priority: string;
    readonly reasonCodes: readonly string[];
    readonly suggestedActions: readonly string[];
  } | null;
  readonly classificationError: ChainError | null;
  readonly explanationSet: {
    readonly explanationCount: number;
    readonly truncated: boolean;
    readonly explanationTypes: readonly string[];
  } | null;
  readonly explanationError: ChainError | null;
  readonly evidenceGeneration: {
    readonly candidateRequestCount: number;
    readonly truncated: boolean;
    readonly evidenceTypes: readonly string[];
  } | null;
  readonly evidenceGenerationError: ChainError | null;
  readonly selection: {
    readonly rankedRequestCount: number;
    readonly consideredCount: number;
    readonly truncated: boolean;
    readonly rankedEvidenceTypes: readonly string[];
    readonly rankedRequestKeys: readonly string[];
  } | null;
  readonly selectionError: ChainError | null;
}

export interface HoleRunEntry {
  readonly holeId: string;
  readonly holeType: HoleType;
  readonly expectedType: RelationType | null;
  readonly region: RegionSummary | null;
  readonly regionError: ChainError | null;
  readonly detection: DetectionSummary | null;
  readonly detectionError: ChainError | null;
  readonly qualificationError: ChainError | null;
  /** Rejection reasons observed at PR5 (closed enum; absent when qualified). */
  readonly qualificationFailureReasons: readonly string[];
  readonly qualifiedCandidateCount: number;
  readonly rejectedCandidateCount: number;
  readonly candidates: readonly HandledCandidate[];
}

export interface HoleChainResult {
  readonly caseId: string;
  readonly investigationId: string;
  readonly caseKey: string;
  readonly condition: string;
  readonly graphVersionId: string;
  readonly nowIso: string;
  readonly temporalContext: TemporalInterval;
  readonly relationHypotheses: readonly RelationHypothesis[];
  readonly entries: readonly HoleRunEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OBSERVED = (value: string): ObservedTime => ({ value, precision: 'exact' });

/** Deterministic graph-version id (per case + condition + seed). */
export function graphVersionIdOf(corpus: Pick<CaseCorpus, 'caseKey' | 'condition' | 'seed'>): string {
  return uuidFrom(`${corpus.caseKey}/${corpus.condition}/${corpus.seed}`);
}

/** Deterministic case-wide analysis window from the observed corpus records. */
export function temporalContextOf(corpus: CaseCorpus, nowIso: string): TemporalInterval {
  const stamps = corpus.records
    .filter((r) => r.kind !== 'HELDOUT' && r.timeIso !== null)
    .map((r) => Date.parse(r.timeIso ?? ''));
  const min = stamps.length > 0 ? Math.min(...stamps) : Date.parse(nowIso);
  const max = stamps.length > 0 ? Math.max(...stamps) : Date.parse(nowIso) + 60_000;
  const stamp = (ms: number): string => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
  return {
    validFrom: { value: stamp(min), precision: 'exact' },
    validTo: { value: stamp(max), precision: 'exact' },
    precision: 'minute',
    semantics: 'observed',
  };
}

/**
 * Owner truth-key → canonical entity ids (via the REAL materialized entities).
 * A truth identity maps to every entity whose canonical name equals ANY of its
 * surface strings — entity fragmentation surfaces as multiple ids.
 */
export function ownerEntityIds(
  corpus: CaseCorpus,
  run: PipelineResult,
): ReadonlyMap<string, readonly string[]> {
  const entitiesByCanonical = new Map<string, string[]>();
  for (const e of run.entities) {
    const norm = e.canonicalName.toLowerCase();
    const list = entitiesByCanonical.get(norm) ?? [];
    list.push(e.id);
    entitiesByCanonical.set(norm, list);
  }
  const out = new Map<string, string[]>();
  for (const identity of corpus.truth.identities) {
    const acc: string[] = [];
    const addAll = (ids: readonly string[] | undefined): void => {
      for (const id of ids ?? []) if (!acc.includes(id)) acc.push(id);
    };
    for (const surface of identity.surfaces) addAll(entitiesByCanonical.get(surface.toLowerCase()));
    addAll(entitiesByCanonical.get(identity.canonical.toLowerCase()));
    out.set(identity.key, acc.sort());
  }
  return out;
}

/** Canonical entity ids spanning ALL of a planted hole's endpoint keys. */
export function holeEndpointEntityIds(corpus: CaseCorpus, run: PipelineResult, hole: PlantedHole): readonly string[] {
  const map = ownerEntityIds(corpus, run);
  const acc: string[] = [];
  for (const key of hole.nodes) for (const id of map.get(key) ?? []) if (!acc.includes(id)) acc.push(id);
  return acc.sort();
}

/** True when a candidate's nodeIds touch every hole endpoint key (entity-level). */
export function candidateHitsHole(
  candidateNodeIds: readonly string[],
  corpus: CaseCorpus,
  run: PipelineResult,
  hole: PlantedHole,
): boolean {
  const set = new Set(candidateNodeIds);
  const map = ownerEntityIds(corpus, run);
  for (const key of hole.nodes) {
    const ids = map.get(key) ?? [];
    if (ids.length === 0) continue;
    if (!ids.some((id) => set.has(id))) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Chain
// ---------------------------------------------------------------------------

const DEFAULT_NOW = '2026-01-01T00:00:00.000Z';

export async function runHoleChain(
  corpus: CaseCorpus,
  run: PipelineResult,
  options: HoleChainOptions = {},
): Promise<HoleChainResult> {
  const nowIso = options.nowIso ?? DEFAULT_NOW;
  const graphVersionId = graphVersionIdOf(corpus);
  const temporalContext = temporalContextOf(corpus, nowIso);
  const obsById = new Map(run.observations.map((o) => [o.id, o]));

  const resolutionByEdge = new Map<string, (typeof run.relations.resolutions)[number]>();
  for (const r of run.relations.resolutions) {
    resolutionByEdge.set(uuidFrom(`${r.sourceEntityId}|${r.targetEntityId}|${r.relationType}`), r);
  }

  const proposable = run.relations.resolutions.filter(
    (r) => r.support >= RELATION_PROPOSAL_THRESHOLD && r.evidenceCount > 0,
  );

  const graph = run.graph.graph;
  const graphCaseId = run.graph.caseId;
  const provider = new ProjectedGraphExpansionProvider(run.graph, graphVersionId);

  const resolveObservations = async (
    ids: readonly string[],
  ): Promise<readonly { id: string; entityIds: readonly string[] }[]> =>
    ids.map((id) => ({ id, entityIds: run.entityIdsByObservation.get(id) ?? [] }));

  // ---- Hypothesis context (PR3) from REAL source-grounded relation hypotheses ----
  const buildHypotheses = async (): Promise<RelationHypothesis[]> => {
    const hypotheses: RelationHypothesis[] = [];
    for (const relation of proposable) {
      const supporting = relation.evidenceBasis
        .map((obsId) => obsById.get(obsId))
        .filter((o): o is Observation => o !== undefined);
      const validityInterval = deriveValidityInterval(supporting);
      const firstSource = supporting.find((o) => o.sourceId !== undefined)?.sourceId;
      const id = await deterministicRelationHypothesisId({
        sourceEntityId: relation.sourceEntityId,
        targetEntityId: relation.targetEntityId,
        relationType: relation.relationType,
        directed: relation.directed,
        scoreModelVersion: relation.scoreModelVersion,
      });
      const hypothesis: RelationHypothesis = {
        id,
        sourceEntityId: relation.sourceEntityId,
        targetEntityId: relation.targetEntityId,
        relationType: relation.relationType,
        support: relation.support,
        evidenceBasis: [...relation.evidenceBasis],
        directed: relation.directed,
        status: deriveRelationHypothesisStatus(
          relation.support,
          relation.contradictions.length > 0,
          relation.evidenceCount,
        ),
        provenance: {
          sourceId: firstSource ?? 'benchmark-source',
          extractor: 'benchmark-pipeline',
          ...(relation.evidenceBasis.length > 0
            ? { derivedFrom: [...relation.evidenceBasis] }
            : {}),
        },
        createdAt: OBSERVED(nowIso),
        updatedAt: OBSERVED(nowIso),
      };
      if (relation.contradictions.length > 0) {
        hypothesis.contradictions = [...relation.contradictions];
      }
      if (validityInterval !== undefined) {
        hypothesis.temporalInterval = validityInterval as TemporalInterval;
      }
      hypotheses.push(hypothesis);
    }
    return hypotheses;
  };
  const relationHypotheses = await buildHypotheses();

  const hypothesisContext: HypothesisContext = buildHypothesisContext({
    caseId: corpus.caseId,
    graphVersionId,
    relationHypotheses,
    entityHypotheses: undefined as readonly EntityHypothesis[] | undefined,
  });

  const observationsForDetection = run.observations.map((o) => ({ id: o.id, sourceId: o.sourceId }));

  // Deterministic M-A10/M-A13 community membership (Louvain, seeded rng) — the
  // communities map the COMMUNITY_BOUNDARY detector requires; the caller is the
  // one authorized to compute it (detection never re-clusters). The FULL
  // assignment is used (not the cohesion-filtered candidate view) so every
  // canonical node has exactly one community.
  const communityMap = new Map<string, string>();
  for (const community of detectCommunities(run.graph.graph)) {
    for (const nodeId of community.memberNodeIds) {
      communityMap.set(nodeId, String(community.communityId));
    }
  }

  const qualificationObservations: QualificationInput['observations'] = run.observations.map((o) => ({
    id: o.id,
    sourceId: o.sourceId,
    ...(o.sourceContextId !== undefined ? { sourceContextId: o.sourceContextId } : {}),
    ...(o.provenance.artifactId !== undefined ? { artifactId: o.provenance.artifactId } : {}),
    contentHash: sha256Hex([`${o.id}:${o.content}`]),
    strength: o.strength,
    validityInterval: o.validityInterval ?? null,
  }));

  const nodesOf = (nodeIds: readonly string[]): GraphNode[] =>
    nodeIds
      .filter((id) => graph.hasNode(id))
      .map((id) => {
        const attrs = graph.getNodeAttributes(id) as { entityType?: string; canonicalName?: string; temporalRange?: TemporalInterval };
        const entity = run.entities.find((e) => e.id === id);
        const obs = entity?.observationIds
          .map((obsId) => obsById.get(obsId))
          .filter((o): o is Observation => o !== undefined) ?? [];
        const sources = new Set(obs.map((o) => o.sourceId));
        return {
          id,
          investigationId: corpus.investigationId,
          versionId: graphVersionId,
          type: 'ENTITY' as const,
          entityId: id,
          label: attrs.canonicalName ?? entity?.canonicalName ?? id,
          structuralImportance: 0,
          observationCount: obs.length,
          sourceCount: sources.size,
          ...(attrs.temporalRange !== undefined ? { temporalRange: attrs.temporalRange } : {}),
          createdAt: OBSERVED(nowIso),
          updatedAt: OBSERVED(nowIso),
        };
      });

  const edgesOf = (edgeIds: readonly string[]): GraphEdge[] =>
    edgeIds
      .filter((id) => graph.hasEdge(id))
      .map((id) => {
        const attrs = graph.getEdgeAttributes(id) as { relationType?: string; temporalRange?: TemporalInterval; provenance?: Provenance };
        const [sourceNodeId, targetNodeId] = graph.extremities(id);
        const resolution = resolutionByEdge.get(id);
        const supporting = resolution?.evidenceBasis
          .map((obsId) => obsById.get(obsId))
          .filter((o): o is Observation => o !== undefined) ?? [];
        const sources = new Set(supporting.map((o) => o.sourceId));
        return {
          id,
          investigationId: corpus.investigationId,
          versionId: graphVersionId,
          sourceNodeId,
          targetNodeId,
          relationType: (attrs.relationType ?? 'other') as RelationType,
          support: resolution?.support ?? 0,
          structuralImportance: 0,
          directed: graph.isDirected(id),
          ...(attrs.temporalRange !== undefined ? { temporalRange: attrs.temporalRange } : {}),
          status: 'ACTIVE' as const,
          observationCount: supporting.length,
          sourceCount: sources.size,
          createdAt: OBSERVED(nowIso),
          updatedAt: OBSERVED(nowIso),
        };
      });

  const entries: HoleRunEntry[] = [];
  for (const hole of corpus.truth.holes) {
    entries.push(await runHole(corpus, run, hole, {
      caseId: corpus.caseId,
      investigationId: corpus.investigationId,
      graphVersionId,
      temporalContext,
      hypothesisContext,
      relationHypotheses,
      observations: run.observations,
      observationsForDetection,
      qualificationObservations,
      communities: communityMap,
      graphCaseId,
      provider,
      resolveObservations,
      nodesOf,
      edgesOf,
      nowIso,
    }));
  }

  return {
    caseId: corpus.caseId,
    investigationId: corpus.investigationId,
    caseKey: corpus.caseKey,
    condition: corpus.condition,
    graphVersionId,
    nowIso,
    temporalContext,
    relationHypotheses,
    entries,
  };
}

interface HoleDeps {
  readonly caseId: string;
  readonly investigationId: string;
  readonly graphVersionId: string;
  readonly temporalContext: TemporalInterval;
  readonly hypothesisContext: HypothesisContext;
  readonly relationHypotheses: readonly RelationHypothesis[];
  readonly observations: readonly Observation[];
  readonly observationsForDetection: readonly { id: string; sourceId: string }[];
  readonly qualificationObservations: QualificationInput['observations'];
  readonly communities: ReadonlyMap<string, string>;
  readonly graphCaseId: string;
  readonly provider: ProjectedGraphExpansionProvider;
  readonly resolveObservations: (ids: readonly string[]) => Promise<readonly { id: string; entityIds: readonly string[] }[]>;
  readonly nodesOf: (nodeIds: readonly string[]) => GraphNode[];
  readonly edgesOf: (edgeIds: readonly string[]) => GraphEdge[];
  readonly nowIso: string;
}

function holeSeedObservationIds(corpus: CaseCorpus, run: PipelineResult, hole: PlantedHole): readonly string[] {
  const owners = new Set(hole.nodes);
  const ids: string[] = [];
  for (const rec of corpus.records) {
    if (rec.kind === 'HELDOUT' || rec.withheld) continue;
    if (!rec.owners.some((o) => owners.has(o))) continue;
    for (const obsId of run.recordToObservations.get(rec.id) ?? []) {
      if (!ids.includes(obsId)) ids.push(obsId);
    }
  }
  return ids.sort();
}

async function runHole(
  corpus: CaseCorpus,
  run: PipelineResult,
  hole: PlantedHole,
  deps: HoleDeps,
): Promise<HoleRunEntry> {
  const seedObservationIds = holeSeedObservationIds(corpus, run, hole);
  if (seedObservationIds.length === 0) {
    return {
      holeId: hole.id,
      holeType: hole.holeType,
      expectedType: hole.expectedType,
      region: null,
      regionError: { stage: 'PR1-buildRegion', message: 'no observed seed observation for any hole endpoint' },
      detection: null,
      detectionError: null,
      qualificationError: null,
      qualificationFailureReasons: [],
      qualifiedCandidateCount: 0,
      rejectedCandidateCount: 0,
      candidates: [],
    };
  }

  // ---- PR1 region ----------------------------------------------------------
  const regionAttempt = await checkedAsync(() =>
    buildRegion(
      { caseId: deps.caseId, graphVersionId: deps.graphVersionId, seedObservationIds, temporalContext: deps.temporalContext },
      { context: deps.provider, resolveObservations: deps.resolveObservations },
    ),
  );
  if (!regionAttempt.ok) {
    return {
      holeId: hole.id,
      holeType: hole.holeType,
      expectedType: hole.expectedType,
      region: null,
      regionError: { stage: 'PR1-buildRegion', message: regionAttempt.error },
      detection: null,
      detectionError: null,
      qualificationError: null,
      qualificationFailureReasons: [],
      qualifiedCandidateCount: 0,
      rejectedCandidateCount: 0,
      candidates: [],
    };
  }
  const region = regionAttempt.value;
  const regionSummary: RegionSummary = {
    regionId: region.regionId,
    status: region.status,
    truncated: region.truncated,
    limitations: [...region.limitations],
    nodeCount: region.nodeIds.length,
    edgeCount: region.edgeIds.length,
    seedObservationIds: [...region.seedObservationIds],
    resolvedSeedNodeIds: [...region.resolvedSeedNodeIds],
    unresolvedSeedEntityIds: [...region.unresolvedSeedEntityIds],
  };

  const nodes = deps.nodesOf(region.nodeIds);
  const edges = deps.edgesOf(region.edgeIds);

  // ---- PR4 detection -------------------------------------------------------
  const baseDetection: DetectionInput = {
    caseId: deps.caseId,
    graphVersionId: deps.graphVersionId,
    temporalContext: deps.temporalContext,
    region,
    nodes,
    edges,
    hypothesisContext: deps.hypothesisContext,
    observations: deps.observationsForDetection,
    communities: deps.communities,
  };
  const detectionAttempt = checked(() => detectGraphHoleCandidates(baseDetection));
  if (!detectionAttempt.ok) {
    return {
      holeId: hole.id,
      holeType: hole.holeType,
      expectedType: hole.expectedType,
      region: regionSummary,
      regionError: null,
      detection: null,
      detectionError: { stage: 'PR4-detectGraphHoleCandidates', message: detectionAttempt.error },
      qualificationError: null,
      qualificationFailureReasons: [],
      qualifiedCandidateCount: 0,
      rejectedCandidateCount: 0,
      candidates: [],
    };
  }
  const detection = detectionAttempt.value;
  const detectionSummary: DetectionSummary = {
    candidateCount: detection.candidates.length,
    rawCandidates: [...detection.candidates],
    detectorSummaries: detection.summary.detectors.map((d) => ({
      detectorType: d.detectorType,
      candidates: d.candidates,
      pairEvaluations: d.pairEvaluations,
    })),
  };
  if (detection.candidates.length === 0) {
    return {
      holeId: hole.id,
      holeType: hole.holeType,
      expectedType: hole.expectedType,
      region: regionSummary,
      regionError: null,
      detection: detectionSummary,
      detectionError: null,
      qualificationError: null,
      qualificationFailureReasons: [],
      qualifiedCandidateCount: 0,
      rejectedCandidateCount: 0,
      candidates: [],
    };
  }

  // ---- PR5 qualification ----------------------------------------------------
  const qualificationAttempt = checked(() =>
    qualifyAndRankGraphHoleCandidates({
      caseId: deps.caseId,
      graphVersionId: deps.graphVersionId,
      region,
      nodes,
      edges,
      hypothesisContext: deps.hypothesisContext,
      candidates: detection.candidates,
      observations: deps.qualificationObservations,
      communities: deps.communities,
    } satisfies QualificationInput),
  );
  if (!qualificationAttempt.ok) {
    return {
      holeId: hole.id,
      holeType: hole.holeType,
      expectedType: hole.expectedType,
      region: regionSummary,
      regionError: null,
      detection: detectionSummary,
      detectionError: null,
      qualificationError: { stage: 'PR5-qualifyAndRankGraphHoleCandidates', message: qualificationAttempt.error },
      qualificationFailureReasons: [],
      qualifiedCandidateCount: 0,
      rejectedCandidateCount: 0,
      candidates: [],
    };
  }
  const qualified = qualificationAttempt.value;

  if (isDiagEnabled()) {
    for (const rc of qualified.qualifiedCandidates) {
      console.log(
        `    [PR5-qual] ${hole.id} det=${rc.rawCandidate.detectorType}` +
          ` basis=${rc.rawCandidate.structuralBasis}` +
          ` support=${rc.rawCandidate.supportingObservationIds.length}` +
          ` structural=${rc.structuralScore} sig=${rc.significance}` +
          ` comps=${JSON.stringify(rc.structuralComponents)}` +
          ` region=${regionSummary.nodeCount}/n=${nodes.length}` +
          ` cand=${JSON.stringify(rc.rawCandidate.nodeIds)}`,
      );
    }
    for (const rc of qualified.rejectedCandidates) {
      console.log(
        `    [PR5-diag] ${hole.id} det=${rc.rawCandidate.detectorType}` +
          ` basis=${rc.rawCandidate.structuralBasis}` +
          ` support=${rc.rawCandidate.supportingObservationIds.length}` +
          ` structural=${rc.structuralScore} sig=${rc.significance}` +
          ` comps=${JSON.stringify(rc.structuralComponents)}` +
          ` scoreComps=${JSON.stringify(rc.scoreComponents)}` +
          ` region=${regionSummary.nodeCount}/n=${nodes.length}` +
          ` cand=${JSON.stringify(rc.rawCandidate.nodeIds)}` +
          ` failures=[${rc.failureReasons.join(',')}]`,
      );
    }
  }

  // The EXACT region/nodes/edges/observations package is reused verbatim for
  // every chain call (PR14/PR15/PR17) so the deterministic re-run grounding
  // (CONTEXT_MISMATCH guard) sees identical inputs.
  const gapPackageBase: Omit<GapClassificationInput, 'qualifiedCandidate' | 'computedAt'> = {
    caseId: deps.caseId,
    graphVersionId: deps.graphVersionId,
    region,
    nodes,
    edges,
    observations: deps.observations,
    hypothesisContext: deps.hypothesisContext,
    classificationPolicyVersion: 'v1',
  };

  // ---- Per-candidate gap chain (PR14 / PR15 / PR17 / PR18) -------------------
  const candidates: HandledCandidate[] = [];
  for (let i = 0; i < qualified.qualifiedCandidates.length; i++) {
    candidates.push(
      await handleQualifiedCandidate(qualified.qualifiedCandidates[i]!, i + 1, deps, gapPackageBase),
    );
  }

  return {
    holeId: hole.id,
    holeType: hole.holeType,
    expectedType: hole.expectedType,
    region: regionSummary,
    regionError: null,
    detection: detectionSummary,
    detectionError: null,
    qualificationError: null,
    qualifiedCandidateCount: qualified.qualifiedCandidates.length,
    rejectedCandidateCount: qualified.rejectedCandidates.length,
    qualificationFailureReasons: [...new Set(qualified.rejectedCandidates.flatMap((rc) => rc.failureReasons))],
    candidates,
  };
}

/**
 * PR14 → PR15 → PR17 → PR18 for ONE qualified candidate. Each stage is a typed
 * checked call; a failure in one stage never aborts the remaining candidates.
 */
async function handleQualifiedCandidate(
  qc: QualifiedGraphHoleCandidate,
  rank: number,
  deps: HoleDeps,
  gapPackageBase: Omit<GapClassificationInput, 'qualifiedCandidate' | 'computedAt'>,
): Promise<HandledCandidate> {
  const computedAt = OBSERVED(deps.nowIso);
  const gapId = uuidFrom(qc.rawCandidate.candidateId);

  const candidateResult: Writable<HandledCandidate> = {
    rawCandidate: qc.rawCandidate,
    rank,
    structuralScore: qc.structuralScore,
    evidenceSupportScore: qc.evidenceSupportScore,
    significance: qc.significance,
    classification: null,
    classificationError: null,
    explanationSet: null,
    explanationError: null,
    evidenceGeneration: null,
    evidenceGenerationError: null,
    selection: null,
    selectionError: null,
  };

  // ---- PR14 gap classification ----------------------------------------------
  const gapPackage: GapClassificationInput = {
    ...gapPackageBase,
    qualifiedCandidate: qc,
    computedAt,
  };
  const cls = checked(() => classifyGap(gapPackage));
  candidateResult.classificationError = cls.ok ? null : { stage: 'PR14-classifyGap', message: cls.error };
  if (!cls.ok) return candidateResult;
  candidateResult.classification = {
    type: cls.value.type ?? null,
    status: cls.value.status,
    priority: cls.value.priority,
    reasonCodes: [...cls.value.reasonCodes],
    suggestedActions: [...cls.value.suggestedActions],
  };

  // ---- PR15 competing explanations (re-runs PR14 on the SAME package) --------
  const expl = checked(() =>
    generateCompetingExplanations({
      context: gapPackage,
      gapClassification: cls.value,
      competingExplanationPolicyVersion: 'v1',
      computedAt,
    }),
  );
  candidateResult.explanationError = expl.ok ? null : { stage: 'PR15-generateCompetingExplanations', message: expl.error };
  if (!expl.ok) return candidateResult;
  candidateResult.explanationSet = {
    explanationCount: expl.value.explanationCount,
    truncated: expl.value.truncated,
    explanationTypes: [...new Set(expl.value.explanations.map((e) => e.type))].sort(),
  };

  // ---- PR17 candidate evidence request generation ----------------------------
  const gen = checked(() =>
    generateCandidateEvidenceRequests({
      context: gapPackage,
      gapClassification: cls.value,
      competingExplanationSet: expl.value,
      gapId,
      policyVersion: EVIDENCE_REQUEST_GENERATION_POLICY_VERSION,
      computedAt,
    }),
  );
  candidateResult.evidenceGenerationError = gen.ok ? null : { stage: 'PR17-generateCandidateEvidenceRequests', message: gen.error };
  if (!gen.ok) return candidateResult;
  candidateResult.evidenceGeneration = {
    candidateRequestCount: gen.value.candidateRequests.length,
    truncated: gen.value.truncated,
    evidenceTypes: [...new Set(gen.value.candidateRequests.map((c) => c.evidenceType))].sort(),
  };

  // ---- PR18 best-evidence selection -------------------------------------------
  const sel = checked(() =>
    selectBestEvidenceFromCandidates({
      investigationId: deps.investigationId,
      gapId,
      candidateRequests: gen.value.candidateRequests,
      context: {
        gapTemporalScope: qc.rawCandidate.temporalScope ?? null,
        gapExpectationDerivedIds: qc.rawCandidate.supportingHypothesisIds,
        representedExplanations: expl.value.explanations.map((e) => ({
          supportingHypothesisIds: e.supportingHypothesisIds,
          contradictingHypothesisIds: e.contradictingHypothesisIds ?? [],
          ...(e.temporalScope !== undefined && e.temporalScope !== null
            ? { temporalScope: e.temporalScope }
            : {}),
        })),
        representedExplanationIds: expl.value.explanations.map((e) => e.explanationId),
        observations: deps.observations.map((o) => ({ id: o.id })),
      },
      policyVersion: 'v1',
      computedAt,
    } satisfies CandidateEvidenceSelectionInput),
  );
  candidateResult.selectionError = sel.ok
    ? null
    : { stage: 'PR18-selectBestEvidenceFromCandidates', message: sel.error };
  if (!sel.ok) return candidateResult;
  candidateResult.selection = {
    rankedRequestCount: sel.value.rankedRequests.length,
    consideredCount: sel.value.consideredCount,
    truncated: sel.value.truncated,
    rankedEvidenceTypes: [...new Set(sel.value.rankedRequests.map((r) => r.evidenceType))].sort(),
    rankedRequestKeys: sel.value.rankedRequests.map((r) => r.canonicalRequestKey),
  };

  return candidateResult;
}