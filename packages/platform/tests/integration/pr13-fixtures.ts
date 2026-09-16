// ============================================================================
// PR13 shared fixtures — production-chain seeding + helpers
//
// Builds a deterministic A–B–C graph with ACCEPTED rAC/rBC, a PROPOSED A–B
// gap hypothesis, and graph versions V1 (rAC) / V2 (rBC) so that production
// region build, recompute, qualification, and persistence can be exercised
// against a REAL Postgres database with the exact same wiring the runner uses.
//
// All entity/relation hypothesis/relation ids are deterministic via the
// identity packages — same caseId + canonicalName + relationType → same ids
// across retries.
// ============================================================================

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type {
  Observation,
  RelationHypothesisStatus,
  SourceCatalog,
  EvidenceType,
  EventTime,
  RegionIdentityV1,
} from '@indago/contracts';
import {
  buildObservationIdentityKey,
  serializeSourceLocation,
} from '@indago/ingestion';
import {
  deterministicEntityId,
  buildEntityIdentityKey,
} from '@indago/entity-resolution';
import {
  buildRelationHypothesisIdentityKey,
  deterministicRelationHypothesisId,
  RELATION_SCORE_MODEL_VERSION,
} from '@indago/relation-resolution';
import {
  buildRegion,
  ProjectedGraphExpansionProvider,
  type GraphHoleRegion,
} from '@indago/graph-hole-region';
import {
  buildRegionIdentity,
  hashRegionIdentity,
} from '@indago/graph-hole-region';
import { ObservationStore } from '../../src/persistence/observation-store.js';
import { EntityStore } from '../../src/persistence/entity-store.js';
import { EntityHypothesisStore } from '../../src/persistence/entity-hypothesis-store.js';
import { RelationHypothesisStore } from '../../src/persistence/relation-hypothesis-store.js';
import {
  RelationStore,
  buildRelationKey,
  deterministicRelationId,
} from '../../src/persistence/relation-store.js';
import { GraphVersionStore } from '../../src/persistence/graph-version-store.js';
import {
  GraphProjectionService,
  toGraphRevisionMetadata,
  GRAPH_CHANGE_ACCEPTED,
} from '../../src/relations/graph-version-service.js';
import { GraphHoleRegionAnalysisStore } from '../../src/persistence/graph-hole-region-analysis-store.js';
import { GraphHoleStore } from '../../src/persistence/graph-hole-store.js';
import {
  buildRegionRecomputeContext,
  type RegionRecomputeContext,
} from '../../src/reassessment/region-context.js';
import {
  recomputeRegion,
  type RegionRecomputeOutput,
} from '../../src/reassessment/region-recompute.js';

// ---------------------------------------------------------------------------
// Relation type used across all fixtures
// ---------------------------------------------------------------------------

export const RELATION_TYPE = 'association' as const;

// ---------------------------------------------------------------------------
// Stores bound to an injected PrismaClient
// ---------------------------------------------------------------------------

export interface Phase5AStores {
  readonly prisma: PrismaClient;
  readonly observations: ObservationStore;
  readonly entities: EntityStore;
  readonly entityHypotheses: EntityHypothesisStore;
  readonly relationHypotheses: RelationHypothesisStore;
  readonly relations: RelationStore;
  readonly graphVersions: GraphVersionStore;
  readonly regions: GraphHoleRegionAnalysisStore;
  readonly holes: GraphHoleStore;
}

export function makePhase5AStores(prisma: PrismaClient): Phase5AStores {
  return {
    prisma,
    observations: new ObservationStore(prisma),
    entities: new EntityStore(prisma),
    entityHypotheses: new EntityHypothesisStore(prisma),
    relationHypotheses: new RelationHypothesisStore(prisma),
    relations: new RelationStore(prisma),
    graphVersions: new GraphVersionStore(prisma),
    regions: new GraphHoleRegionAnalysisStore(prisma),
    holes: new GraphHoleStore(prisma),
  };
}

// ---------------------------------------------------------------------------
// Deterministic id set for the A–B–C fixture
// ---------------------------------------------------------------------------

export interface Phase5AIdSet {
  readonly caseId: string;
  readonly investigationId: string;
  readonly sourceId: string;
  readonly artifactId: string;
  readonly operationA: string;
  readonly operationB: string;
  readonly operationC: string;
  readonly evidenceA: string;
  readonly evidenceB: string;
  readonly evidenceC: string;
  readonly obsA1: string;
  readonly obsA2: string;
  readonly obsB1: string;
  readonly obsB2: string;
  readonly obsC1: string;
  readonly entityAId: string;
  readonly entityAKey: string;
  readonly entityBId: string;
  readonly entityBKey: string;
  readonly entityCId: string;
  readonly entityCKey: string;
  readonly hyGapId: string;
  readonly hyGapKey: string;
  readonly hyACId: string;
  readonly hyACKey: string;
  readonly hyBCId: string;
  readonly hyBCKey: string;
  readonly rACId: string;
  readonly rACKey: string;
  readonly rBCId: string;
  readonly rBCKey: string;
  readonly v1Id: string;
  readonly v2Id: string;
}

export async function makePhase5AIdSet(
  caseId: string,
  investigationId: string,
): Promise<Phase5AIdSet> {
  const sourceId = randomUUID();
  const artifactId = randomUUID();
  const operationA = randomUUID();
  const operationB = randomUUID();
  const operationC = randomUUID();
  const evidenceA = randomUUID();
  const evidenceB = randomUUID();
  const evidenceC = randomUUID();
  const obsA1 = randomUUID();
  const obsA2 = randomUUID();
  const obsB1 = randomUUID();
  const obsB2 = randomUUID();
  const obsC1 = randomUUID();

  const entityAId = await deterministicEntityId({
    caseId,
    canonicalName: 'EntityA',
    entityType: 'PERSON',
  });
  const entityAKey = buildEntityIdentityKey({
    caseId,
    canonicalName: 'EntityA',
    entityType: 'PERSON',
  });
  const entityBId = await deterministicEntityId({
    caseId,
    canonicalName: 'EntityB',
    entityType: 'PERSON',
  });
  const entityBKey = buildEntityIdentityKey({
    caseId,
    canonicalName: 'EntityB',
    entityType: 'PERSON',
  });
  const entityCId = await deterministicEntityId({
    caseId,
    canonicalName: 'EntityC',
    entityType: 'PERSON',
  });
  const entityCKey = buildEntityIdentityKey({
    caseId,
    canonicalName: 'EntityC',
    entityType: 'PERSON',
  });

  const hyGapKey = buildRelationHypothesisIdentityKey({
    sourceEntityId: entityAId,
    targetEntityId: entityBId,
    relationType: RELATION_TYPE,
    directed: false,
  });
  const hyGapId = await deterministicRelationHypothesisId({
    sourceEntityId: entityAId,
    targetEntityId: entityBId,
    relationType: RELATION_TYPE,
    directed: false,
  });
  const hyACKey = buildRelationHypothesisIdentityKey({
    sourceEntityId: entityAId,
    targetEntityId: entityCId,
    relationType: RELATION_TYPE,
    directed: false,
  });
  const hyACId = await deterministicRelationHypothesisId({
    sourceEntityId: entityAId,
    targetEntityId: entityCId,
    relationType: RELATION_TYPE,
    directed: false,
  });
  const hyBCKey = buildRelationHypothesisIdentityKey({
    sourceEntityId: entityBId,
    targetEntityId: entityCId,
    relationType: RELATION_TYPE,
    directed: false,
  });
  const hyBCId = await deterministicRelationHypothesisId({
    sourceEntityId: entityBId,
    targetEntityId: entityCId,
    relationType: RELATION_TYPE,
    directed: false,
  });

  const rACKey = buildRelationKey({
    sourceEntityId: entityAId,
    targetEntityId: entityCId,
    relationType: RELATION_TYPE,
    directed: false,
    scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
  });
  const rACId = await deterministicRelationId({
    sourceEntityId: entityAId,
    targetEntityId: entityCId,
    relationType: RELATION_TYPE,
    directed: false,
    scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
  });
  const rBCKey = buildRelationKey({
    sourceEntityId: entityBId,
    targetEntityId: entityCId,
    relationType: RELATION_TYPE,
    directed: false,
    scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
  });
  const rBCId = await deterministicRelationId({
    sourceEntityId: entityBId,
    targetEntityId: entityCId,
    relationType: RELATION_TYPE,
    directed: false,
    scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
  });

  return {
    caseId,
    investigationId,
    sourceId,
    artifactId,
    operationA,
    operationB,
    operationC,
    evidenceA,
    evidenceB,
    evidenceC,
    obsA1,
    obsA2,
    obsB1,
    obsB2,
    obsC1,
    entityAId,
    entityAKey,
    entityBId,
    entityBKey,
    entityCId,
    entityCKey,
    hyGapId,
    hyGapKey,
    hyACId,
    hyACKey,
    hyBCId,
    hyBCKey,
    rACId,
    rACKey,
    rBCId,
    rBCKey,
    v1Id: '', // filled after graph version creation
    v2Id: '',
  } as Phase5AIdSet; // v1Id/v2Id filled in seedPhase5ACase
}

// ---------------------------------------------------------------------------
// Observation row builder (contracts Observation + separate identity key)
// ---------------------------------------------------------------------------

function buildObservation(obs: {
  id: string;
  evidenceId: string;
  sourceId: string;
  entityIds: readonly string[];
  content: string;
  strength: number;
  artifactId: string;
}): {
  identityKey: string;
  observation: Observation;
} {
  const now = new Date().toISOString();
  const observation: Observation = {
    id: obs.id,
    evidenceId: obs.evidenceId,
    sourceId: obs.sourceId,
    type: 'FINANCIAL',
    content: obs.content,
    entityIds: [...obs.entityIds],
    candidateMentions: [],
    strength: obs.strength,
    provenance: {
      sourceId: obs.sourceId,
      artifactId: obs.artifactId,
      extractor: 'pr13-fixture@1.0.0',
    },
    createdAt: { value: now, precision: 'exact' },
    updatedAt: { value: now, precision: 'exact' },
  };
  const identityKey = buildObservationIdentityKey({
    evidenceId: obs.evidenceId,
    sourceId: obs.sourceId,
    locationKey: serializeSourceLocation('line', { line: 1 }),
    type: observation.type,
    canonicalContent: obs.content,
  });
  return { identityKey, observation };
}

// ---------------------------------------------------------------------------
// Seed the full A–B–C fixture: source → evidence → observations → entities →
// relation hypotheses → canonical relations → graph versions V1, V2.
// Returns the finalised Phase5AIdSet with v1Id / v2Id filled.
// ---------------------------------------------------------------------------

export async function seedPhase5ACase(
  stores: Phase5AStores,
  opts: {
    caseId?: string;
    investigationId?: string;
    seedIds?: Phase5AIdSet;
  } = {},
): Promise<Phase5AIdSet> {
  const caseId = opts.caseId ?? randomUUID();
  const investigationId = opts.investigationId ?? randomUUID();
  const ids = opts.seedIds ?? (await makePhase5AIdSet(caseId, investigationId));

  // --- Source ---------------------------------------------------------------
  await stores.observations.upsertSource({
    id: ids.sourceId,
    caseId,
    investigationId,
    catalog: 'MANUAL' as SourceCatalog,
    declaredCatalog: 'fixture',
    name: 'PR13 Fixture Source',
    description: 'PR13 integration fixture',
  });

  // --- Evidences ------------------------------------------------------------
  for (const ev of [
    { id: ids.evidenceA, operationId: ids.operationA, title: 'EvidenceA' },
    { id: ids.evidenceB, operationId: ids.operationB, title: 'EvidenceB' },
    { id: ids.evidenceC, operationId: ids.operationC, title: 'EvidenceC' },
  ]) {
    await stores.observations.upsertEvidence({
      id: ev.id,
      investigationId,
      caseId,
      operationId: ev.operationId,
      sourceId: ids.sourceId,
      sourceName: 'PR13 Fixture Source',
      sourceDescription: 'PR13 integration fixture',
      evidenceType: 'INVESTIGATION' as EvidenceType,
      title: ev.title,
      description: `Fixture evidence ${ev.title}`,
      observedAt: { value: '2026-09-01T00:00:00.000Z', precision: 'day' } as EventTime,
      artifactId: ids.artifactId,
    });
  }

  // --- Observations ---------------------------------------------------------
  const obsStrength = 0.9;
  const obsPairs = [
    buildObservation({
      id: ids.obsA1,
      evidenceId: ids.evidenceA,
      sourceId: ids.sourceId,
      entityIds: [ids.entityAId],
      content: 'obsA1-link',
      strength: obsStrength,
      artifactId: ids.artifactId,
    }),
    buildObservation({
      id: ids.obsA2,
      evidenceId: ids.evidenceA,
      sourceId: ids.sourceId,
      entityIds: [ids.entityAId],
      content: 'obsA2-link',
      strength: obsStrength,
      artifactId: ids.artifactId,
    }),
    buildObservation({
      id: ids.obsB1,
      evidenceId: ids.evidenceB,
      sourceId: ids.sourceId,
      entityIds: [ids.entityBId],
      content: 'obsB1-link',
      strength: obsStrength,
      artifactId: ids.artifactId,
    }),
    buildObservation({
      id: ids.obsB2,
      evidenceId: ids.evidenceB,
      sourceId: ids.sourceId,
      entityIds: [ids.entityBId],
      content: 'obsB2-link',
      strength: obsStrength,
      artifactId: ids.artifactId,
    }),
    buildObservation({
      id: ids.obsC1,
      evidenceId: ids.evidenceC,
      sourceId: ids.sourceId,
      entityIds: [ids.entityCId],
      content: 'obsC1-link',
      strength: obsStrength,
      artifactId: ids.artifactId,
    }),
  ];
  await stores.observations.ensureObservations(obsPairs, {
    investigationId,
    caseId,
  });

  // --- Entities -------------------------------------------------------------
  const entityProvenance = {
    sourceId: ids.sourceId,
    artifactId: ids.artifactId,
    extractor: 'pr13-fixture',
    extractionMethod: 'seed',
  };
  for (const e of [
    { id: ids.entityAId, key: ids.entityAKey, canonicalName: 'EntityA', obs: [ids.obsA1, ids.obsA2] },
    { id: ids.entityBId, key: ids.entityBKey, canonicalName: 'EntityB', obs: [ids.obsB1, ids.obsB2] },
    { id: ids.entityCId, key: ids.entityCKey, canonicalName: 'EntityC', obs: [ids.obsC1] },
  ]) {
    await stores.entities.materializeEntity({
      identityKey: e.key,
      entity: {
        id: e.id,
        caseId,
        investigationId,
        canonicalName: e.canonicalName,
        entityType: 'PERSON',
        status: 'ACTIVE',
        observationIds: e.obs,
        hypothesisIds: [],
        provenance: entityProvenance,
      },
    });
  }

  // --- Relation hypotheses --------------------------------------------------
  const hypoProvenance = {
    sourceId: ids.sourceId,
    artifactId: ids.artifactId,
  };
  const hypoMetrics = {
    evidenceCount: 0,
    evidenceStrength: 0.9,
    sourceCoverage: 1.0,
    temporalCoverage: 0,
  };
  const directed = false;

  // hyGap: A–B PROPOSED (the gap hypothesis)
  await stores.relationHypotheses.upsertHypothesis({
    id: ids.hyGapId,
    identityKey: ids.hyGapKey,
    caseId,
    investigationId,
    sourceEntityId: ids.entityAId,
    targetEntityId: ids.entityBId,
    relationType: RELATION_TYPE,
    directed,
    support: 1.0,
    evidenceBasis: [ids.obsA1, ids.obsB1, ids.obsC1],
    contradictions: [],
    status: 'PROPOSED' as RelationHypothesisStatus,
    scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
    ...hypoMetrics,
    provenance: hypoProvenance,
  });

  // hyAC: A–C ACCEPTED
  await stores.relationHypotheses.upsertHypothesis({
    id: ids.hyACId,
    identityKey: ids.hyACKey,
    caseId,
    investigationId,
    sourceEntityId: ids.entityAId,
    targetEntityId: ids.entityCId,
    relationType: RELATION_TYPE,
    directed,
    support: 0.9,
    evidenceBasis: [ids.obsA1, ids.obsC1],
    contradictions: [],
    status: 'ACCEPTED' as RelationHypothesisStatus,
    scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
    ...hypoMetrics,
    provenance: hypoProvenance,
  });

  // hyBC: B–C ACCEPTED
  await stores.relationHypotheses.upsertHypothesis({
    id: ids.hyBCId,
    identityKey: ids.hyBCKey,
    caseId,
    investigationId,
    sourceEntityId: ids.entityBId,
    targetEntityId: ids.entityCId,
    relationType: RELATION_TYPE,
    directed,
    support: 0.9,
    evidenceBasis: [ids.obsB1, ids.obsC1],
    contradictions: [],
    status: 'ACCEPTED' as RelationHypothesisStatus,
    scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
    ...hypoMetrics,
    provenance: hypoProvenance,
  });

  // --- Canonical relations --------------------------------------------------
  const relProvenance = {
    sourceId: ids.sourceId,
    artifactId: ids.artifactId,
  };

  // rAC (A→C)
  await stores.relations.materializeRelation({
    id: ids.rACId,
    relationKey: ids.rACKey,
    caseId,
    investigationId,
    sourceEntityId: ids.entityAId,
    targetEntityId: ids.entityCId,
    relationType: RELATION_TYPE,
    directed,
    support: 0.9,
    evidenceBasis: [ids.obsA1, ids.obsC1],
    contradictions: [],
    scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
    evidenceCount: 2,
    provenance: relProvenance,
    hypothesisId: ids.hyACId,
  });

  // rBC (B→C)
  await stores.relations.materializeRelation({
    id: ids.rBCId,
    relationKey: ids.rBCKey,
    caseId,
    investigationId,
    sourceEntityId: ids.entityBId,
    targetEntityId: ids.entityCId,
    relationType: RELATION_TYPE,
    directed,
    support: 0.9,
    evidenceBasis: [ids.obsB1, ids.obsC1],
    contradictions: [],
    scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
    evidenceCount: 2,
    provenance: relProvenance,
    hypothesisId: ids.hyBCId,
  });

  // --- Graph versions -------------------------------------------------------
  // V1: RELATION_ACCEPTED for rAC
  const v1 = await stores.graphVersions.createVersion({
    caseId,
    investigationId,
    activate: true,
    reason: 'pr13-seed-v1',
    metadata: toGraphRevisionMetadata({
      type: GRAPH_CHANGE_ACCEPTED,
      relationId: ids.rACId,
    }),
  });

  // V2: RELATION_ACCEPTED for rBC (activate)
  const v2 = await stores.graphVersions.createVersion({
    caseId,
    investigationId,
    parentGraphVersionId: v1.id,
    activate: true,
    reason: 'pr13-seed-v2',
    metadata: toGraphRevisionMetadata({
      type: GRAPH_CHANGE_ACCEPTED,
      relationId: ids.rBCId,
    }),
  });

  // Return ids with version ids filled
  return { ...ids, v1Id: v1.id, v2Id: v2.id };
}

// ---------------------------------------------------------------------------
// Incremental V3 extension — entity D, ACCEPTED hyAD/rAD (A→D), graph V3.
// The entity-lifecycle map stays EMPTY (V1/V2 carry no entity revisions), so
// projectGraphVersion keeps the full non-ARCHIVED universe (legacy
// reconstruction) and D is present from V3 onward.
// ---------------------------------------------------------------------------

export interface Phase5ADV3Ids {
  readonly entityDId: string;
  readonly entityDKey: string;
  readonly hyADId: string;
  readonly hyADKey: string;
  readonly rADId: string;
  readonly rADKey: string;
  readonly v3Id: string;
}

export async function seedPhase5ADV3(
  stores: Phase5AStores,
  args: { caseId: string; investigationId: string; ids: Phase5AIdSet },
): Promise<Phase5ADV3Ids> {
  const { caseId, investigationId, ids } = args;

  const entityDId = await deterministicEntityId({
    caseId,
    canonicalName: 'EntityD',
    entityType: 'PERSON',
  });
  const entityDKey = buildEntityIdentityKey({
    caseId,
    canonicalName: 'EntityD',
    entityType: 'PERSON',
  });
  await stores.entities.materializeEntity({
    identityKey: entityDKey,
    entity: {
      id: entityDId,
      caseId,
      investigationId,
      canonicalName: 'EntityD',
      entityType: 'PERSON',
      status: 'ACTIVE',
      observationIds: [],
      hypothesisIds: [],
      provenance: {
        sourceId: ids.sourceId,
        artifactId: ids.artifactId,
      },
    },
  });

  const hyADKey = buildRelationHypothesisIdentityKey({
    sourceEntityId: ids.entityAId,
    targetEntityId: entityDId,
    relationType: RELATION_TYPE,
    directed: false,
  });
  const hyADId = await deterministicRelationHypothesisId({
    sourceEntityId: ids.entityAId,
    targetEntityId: entityDId,
    relationType: RELATION_TYPE,
    directed: false,
  });

  const hyADMetrics = {
    evidenceCount: 1,
    evidenceStrength: 0.9,
    sourceCoverage: 1,
    temporalCoverage: 1,
  };
  const hyADProvenance = {
    sourceId: ids.sourceId,
    artifactId: ids.artifactId,
  };
  await stores.relationHypotheses.upsertHypothesis({
    id: hyADId,
    identityKey: hyADKey,
    caseId,
    investigationId,
    sourceEntityId: ids.entityAId,
    targetEntityId: entityDId,
    relationType: RELATION_TYPE,
    directed: false,
    support: 0.9,
    evidenceBasis: [ids.obsA1],
    contradictions: [],
    status: 'ACCEPTED' as RelationHypothesisStatus,
    scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
    ...hyADMetrics,
    provenance: hyADProvenance,
  });

  const rADKey = buildRelationKey({
    sourceEntityId: ids.entityAId,
    targetEntityId: entityDId,
    relationType: RELATION_TYPE,
    directed: false,
    scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
  });
  const rADId = await deterministicRelationId({
    caseId,
    sourceEntityId: ids.entityAId,
    targetEntityId: entityDId,
    relationType: RELATION_TYPE,
    directed: false,
    scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
  });
  await stores.relations.materializeRelation({
    id: rADId,
    relationKey: rADKey,
    caseId,
    investigationId,
    sourceEntityId: ids.entityAId,
    targetEntityId: entityDId,
    relationType: RELATION_TYPE,
    directed: false,
    support: 0.9,
    evidenceBasis: [ids.obsA1],
    contradictions: [],
    scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
    evidenceCount: 1,
    provenance: { sourceId: ids.sourceId, artifactId: ids.artifactId },
    hypothesisId: hyADId,
  });

  const v3 = await stores.graphVersions.createVersion({
    caseId,
    investigationId,
    parentGraphVersionId: ids.v2Id,
    activate: true,
    reason: 'pr13-seed-v3',
    metadata: toGraphRevisionMetadata({
      type: GRAPH_CHANGE_ACCEPTED,
      relationId: rADId,
    }),
  });

  return {
    entityDId,
    entityDKey,
    hyADId,
    hyADKey,
    rADId,
    rADKey,
    v3Id: v3.id,
  };
}

// ---------------------------------------------------------------------------
// Production region build — mirrors exactly what ReassessmentRunner.buildPipeline
// does: projectGraphVersion → ProjectedGraphExpansionProvider → buildRegion
// ---------------------------------------------------------------------------

export async function buildProductionRegion(
  args: {
    graphProjectionService: GraphProjectionService;
    observations: ObservationStore;
    caseId: string;
    investigationId: string;
    graphVersionId: string;
    seedObservationIds: readonly string[];
  },
): Promise<GraphHoleRegion> {
  const built = await args.graphProjectionService.projectGraphVersion(
    args.caseId,
    { graphVersionId: args.graphVersionId },
  );
  const provider = new ProjectedGraphExpansionProvider(
    built,
    args.graphVersionId,
  );
  return buildRegion(
    {
      caseId: args.caseId,
      graphVersionId: args.graphVersionId,
      seedObservationIds: [...args.seedObservationIds],
      temporalContext: null,
    },
    {
      context: provider,
      resolveObservations: async (ids: readonly string[]) => {
        const obs = await args.observations.listByIds(ids, {
          investigationId: args.investigationId,
          caseId: args.caseId,
        });
        return obs.map((o) => ({ id: o.id, entityIds: [...o.entityIds] }));
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Production recompute — buildRegionRecomputeContext → recomputeRegion,
// mirroring the runner's exact wiring.
// ---------------------------------------------------------------------------

export interface RegionRecomputeBundle {
  readonly context: RegionRecomputeContext;
  readonly output: RegionRecomputeOutput;
}

export async function recomputeViaProduction(
  args: {
    graphProjectionService: GraphProjectionService;
    observations: ObservationStore;
    entityHypotheses: EntityHypothesisStore;
    relationHypotheses: RelationHypothesisStore;
    caseId: string;
    investigationId: string;
    graphVersionId: string;
    region: GraphHoleRegion;
    computedAt: Date;
  },
): Promise<RegionRecomputeBundle> {
  const built = await args.graphProjectionService.projectGraphVersion(
    args.caseId,
    { graphVersionId: args.graphVersionId },
  );
  const context = await buildRegionRecomputeContext(
    {
      scope: {
        caseId: args.caseId,
        investigationId: args.investigationId,
        graphVersionId: args.graphVersionId,
        computedAt: args.computedAt,
      },
      region: args.region,
      graph: built,
    },
    {
      observations: args.observations,
      entityHypotheses: args.entityHypotheses,
      relationHypotheses: args.relationHypotheses,
    },
  );
  const output = recomputeRegion(context);
  return { context, output };
}

// ---------------------------------------------------------------------------
// GraphProjectionService factory
// ---------------------------------------------------------------------------

export function makeProjectionService(
  stores: Phase5AStores,
): GraphProjectionService {
  return new GraphProjectionService({
    graphVersions: stores.graphVersions,
    entities: stores.entities,
    relations: stores.relations,
  });
}

// ---------------------------------------------------------------------------
// Region identity helpers (mirrors PR12 pattern)
// ---------------------------------------------------------------------------

export function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function buildRegionId(
  params: {
    caseId: string;
    graphVersionId: string;
    seedObservationIds: readonly string[];
    nodeIds: readonly string[];
    edgeIds: readonly string[];
    temporalContext?: unknown;
    regionPolicyVersion?: string;
    semanticRetrievalPolicyVersion?: string;
  },
): { identity: RegionIdentityV1; regionId: string } {
  const identity = buildRegionIdentity({
    caseId: params.caseId,
    graphVersionId: params.graphVersionId,
    seedObservationIds: sortedUnique(params.seedObservationIds),
    nodeIds: sortedUnique(params.nodeIds),
    edgeIds: sortedUnique(params.edgeIds),
    ...(params.temporalContext
      ? { temporalContext: params.temporalContext }
      : {}),
    regionPolicyVersion: params.regionPolicyVersion ?? 'v1',
    semanticRetrievalPolicyVersion:
      params.semanticRetrievalPolicyVersion ?? 'v1',
  });
  return { identity, regionId: hashRegionIdentity(identity) };
}
