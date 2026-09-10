import { describe, expect, beforeAll, afterAll, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  buildRelationHypothesisIdentityKey,
  deterministicRelationHypothesisId,
  RELATION_SCORE_MODEL_VERSION,
} from "@indago/relation-resolution";
import {
  buildEntityIdentityKey,
  deterministicEntityId,
  buildEntityHypothesisIdentityKey,
  deterministicEntityHypothesisId,
  RESOLUTION_SCORE_MODEL_VERSION,
} from "@indago/entity-resolution";
import {
  buildObservationIdentityKey,
  buildEntityMentionIdentityKey,
  buildCandidatePairIdentityKey,
  serializeSourceLocation,
  blockCandidates,
  finalizeCandidatePair,
} from "@indago/ingestion";
import type {
  EntityMentionCandidate,
  CandidatePair,
  Observation,
  EntityHypothesis,
} from "@indago/contracts";
import { EntityStore } from "../../src/persistence/entity-store.js";
import { EntityHypothesisStore } from "../../src/persistence/entity-hypothesis-store.js";
import { EntityMentionStore } from "../../src/persistence/entity-mention-store.js";
import { CandidatePairStore } from "../../src/persistence/candidate-pair-store.js";
import { ObservationStore } from "../../src/persistence/observation-store.js";
import { RelationHypothesisStore } from "../../src/persistence/relation-hypothesis-store.js";
import { RelationStore } from "../../src/persistence/relation-store.js";
import { TemporalStateChangeStore } from "../../src/persistence/temporal-state-change-store.js";
import {
  materializeCanonicalRelationFromAcceptedHypothesis,
  amendRelationValidity,
  type AmendRelationResult,
} from "../../src/relations/relation-materialization.js";
import {
  materializeCanonicalEntityFromAcceptedHypothesis,
  transitionEntityStatus,
} from "../../src/entities/entity-materialization.js";
import {
  GraphProjectionService,
  normalizeBuiltGraph,
  replayEntityLifecycle,
} from "../../src/relations/graph-version-service.js";
import {
  GraphVersionStore,
  type DurableGraphVersion,
} from "../../src/persistence/graph-version-store.js";

// ============================================================================
// M-A12 WSHARDEN hardening — REAL round-trips against TEST_DATABASE_URL.
//
// Covers the M-A12 second-pass hardening workstreams:
//   - item A: amendment authority (RELATION_AMENDED version + TSC AMENDED +
//     ORIGINAL→AMENDMENT assertion family; historical projection keeps the
//     correct interval as-of each version; never "latest evidence wins").
//   - item B: entity mutation versioning (ENTITY_CREATED / ENTITY_ARCHIVED
//     versions + TSC same-tx; projection filters node universe by lifecycle).
//   - item D: DB-level unique ACTIVE GraphVersion per case (partial unique
//     index rejects a second ACTIVE row for the same case).
//   - item E: concurrent version creation yields unique versionNumbers and a
//     single ACTIVE version per case.
//   - item F: concurrent idempotent TSC writes converge to one row.
//   - item G: append-only trigger audit (UPDATE/DELETE rejected; INSERT allowed).
//   - item A-as-of: graph-projection amendment resolution is version-correct.
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "M-A12 hardening — amendments + entity versioning + concurrency (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let entityStore: EntityStore;
    let hypStore: EntityHypothesisStore;
    let candStore: EntityMentionStore;
    let pairStore: CandidatePairStore;
    let obsStore: ObservationStore;
    let hypothesisStore: RelationHypothesisStore;
    let relationStore: RelationStore;
    let graphVersionStore: GraphVersionStore;
    let temporalStateChangeStore: TemporalStateChangeStore;
    let projectionService: GraphProjectionService;

    const investigationId = randomUUID();

    const JAN10_INTERVAL = {
      validFrom: { value: "2026-01-10T12:00:00.000Z", precision: "exact" as const },
      precision: "exact" as const,
      semantics: "observed" as const,
    };
    const FEB20_INTERVAL = {
      validFrom: { value: "2026-01-10T12:00:00.000Z", precision: "exact" as const },
      validTo: { value: "2026-02-20T18:00:00.000Z", precision: "exact" as const },
      precision: "exact" as const,
      semantics: "observed" as const,
    };

    async function materializeEntityViaStore(
      caseId: string,
      canonicalName: string,
      entityType = "PERSON",
    ) {
      const id = await deterministicEntityId({ caseId, canonicalName, entityType });
      const result = await entityStore.materializeEntity({
        identityKey: buildEntityIdentityKey({ caseId, canonicalName, entityType }),
        entity: {
          id,
          caseId,
          investigationId,
          canonicalName,
          entityType,
          status: "ACTIVE",
          observationIds: [],
          hypothesisIds: [],
          provenance: { extractor: "m-a12-hardening:test" },
        },
      });
      return result.entity;
    }

    interface AuthIds {
      sourceId: string;
      evidenceId: string;
      artifactId: string;
    }

    function freshAuthorityIds(): AuthIds {
      return {
        sourceId: randomUUID(),
        evidenceId: randomUUID(),
        artifactId: randomUUID(),
      };
    }

    function makeSource(caseId: string, ids: AuthIds) {
      return {
        id: ids.sourceId,
        caseId,
        investigationId,
        catalog: "MANUAL" as const,
        declaredCatalog: "ledger",
        name: "Ledger",
        description: "Ledger export",
      };
    }

    function makeEvidence(caseId: string, ids: AuthIds) {
      return {
        id: ids.evidenceId,
        investigationId,
        caseId,
        operationId: randomUUID(),
        sourceId: ids.sourceId,
        sourceName: "Ledger",
        sourceDescription: "Ledger export",
        evidenceType: "FINANCIAL" as const,
        title: "Ledger",
        description: "Monthly ledger",
        observedAt: { value: "2026-08-01T00:00:00.000Z", precision: "day" as const },
        artifactId: ids.artifactId,
      };
    }

    function makeObservationRow(obsId: string, content: string, ids: AuthIds): Observation {
      const now = new Date().toISOString();
      return {
        id: obsId,
        evidenceId: ids.evidenceId,
        sourceId: ids.sourceId,
        type: "FINANCIAL",
        content,
        entityIds: [],
        candidateMentions: [],
        strength: 0.7,
        provenance: {
          sourceId: ids.sourceId,
          artifactId: ids.artifactId,
          extractor: "observation-extractor@1.0.0",
        },
        createdAt: { value: now, precision: "exact" },
        updatedAt: { value: now, precision: "exact" },
      };
    }

    function makeCandidate(
      obsId: string,
      canonicalValue: string,
      ids: AuthIds,
    ): EntityMentionCandidate {
      const now = new Date().toISOString();
      return {
        id: randomUUID(),
        observationId: obsId,
        text: canonicalValue,
        start: 0,
        end: 22,
        entityType: "PERSON",
        extractionMethod: "PATTERN_MATCH",
        canonicalMatchValue: canonicalValue,
        provenance: { sourceId: ids.sourceId, artifactId: ids.artifactId, extractor: "obs@1.0.0" },
        createdAt: { value: now, precision: "exact" },
        updatedAt: { value: now, precision: "exact" },
      };
    }

    async function seedCandidate(
      obsId: string,
      canonicalValue: string,
      caseId: string,
      ids: AuthIds,
    ): Promise<EntityMentionCandidate> {
      const cand = makeCandidate(obsId, canonicalValue, ids);
      await candStore.ensureEntityMentions(
        [
          {
            identityKey: buildEntityMentionIdentityKey({
              observationId: cand.observationId,
              start: cand.start,
              end: cand.end,
              entityType: cand.entityType,
              canonicalMatchValue: cand.canonicalMatchValue,
            }),
            candidate: cand,
          },
        ],
        { investigationId, caseId },
      );
      return cand;
    }

    async function buildPair(
      left: EntityMentionCandidate,
      right: EntityMentionCandidate,
      caseId: string,
    ): Promise<{ pair: CandidatePair; identityKey: string }> {
      const { drafts } = blockCandidates(
        { candidates: [left, right], caseId, investigationId },
        {},
      );
      const pair = await finalizeCandidatePair({
        draft: drafts[0]!,
        nowIso: new Date().toISOString(),
      });
      const identityKey = buildCandidatePairIdentityKey({
        caseId: pair.caseId,
        leftCandidateId: pair.leftCandidateId,
        rightCandidateId: pair.rightCandidateId,
      });
      return { pair, identityKey };
    }

    async function materializeEntityViaAuthority(
      caseId: string,
      canonicalName: string,
    ): Promise<string> {
      // Drive the FULL authority boundary (M-A09.5): candidate mentions →
      // candidate pair → PROPOSED EntityHypothesis → explicit acceptance via
      // materializeCanonicalEntityFromAcceptedHypothesis. The stores include
      // graphVersionStore + temporalStateChange so the ENTITY_CREATED version
      // and TSC are recorded in the SAME transaction (item B). Each invocation
      // gets its own source/evidence/artifact ids so parallel authority chains
      // stay case-isolated (the deterministic candidate ids are case-scoped).
      const ids = freshAuthorityIds();
      const obsA = randomUUID();
      const obsB = randomUUID();
      await obsStore.upsertSource(makeSource(caseId, ids));
      await obsStore.upsertEvidence(makeEvidence(caseId, ids));
      await obsStore.ensureObservations(
        [
          {
            identityKey: buildObservationIdentityKey({
              evidenceId: ids.evidenceId,
              sourceId: ids.sourceId,
              locationKey: serializeSourceLocation("line", { line: 1 }),
              type: "FINANCIAL",
              canonicalContent: canonicalName,
            }),
            observation: makeObservationRow(obsA, canonicalName, ids),
          },
          {
            identityKey: buildObservationIdentityKey({
              evidenceId: ids.evidenceId,
              sourceId: ids.sourceId,
              locationKey: serializeSourceLocation("line", { line: 2 }),
              type: "FINANCIAL",
              canonicalContent: canonicalName,
            }),
            observation: makeObservationRow(obsB, canonicalName, ids),
          },
        ],
        { investigationId, caseId },
      );

      const left = await seedCandidate(obsA, canonicalName, caseId, ids);
      const right = await seedCandidate(obsB, canonicalName, caseId, ids);
      const { pair, identityKey } = await buildPair(left, right, caseId);
      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const hypothesisId = await deterministicEntityHypothesisId({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const hypIdentityKey = buildEntityHypothesisIdentityKey({
        candidatePairId: pair.id,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
      });
      const now = new Date().toISOString();
      const hypothesis: EntityHypothesis = {
        id: hypothesisId,
        caseId,
        investigationId,
        candidatePairId: pair.id,
        supportingCandidateIds: [left.id, right.id],
        status: "PROPOSED",
        comparisonStatus: "COMPARED_AND_UNRESOLVED",
        score: 0.35,
        scoreModelVersion: RESOLUTION_SCORE_MODEL_VERSION,
        supportingObservationIds: [obsA, obsB],
        contradictingObservationIds: [],
        provenance: {
          sourceId: ids.sourceId,
          artifactId: ids.artifactId,
          extractor: "indago:resolution:engine",
          extractionMethod: RESOLUTION_SCORE_MODEL_VERSION,
        },
        createdAt: { value: now, precision: "exact" },
        updatedAt: { value: now, precision: "exact" },
      };
      await hypStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis });

      const result = await materializeCanonicalEntityFromAcceptedHypothesis(
        { caseId, investigationId, hypothesisId, actor: "test@indago" },
        {
          entityHypothesisStore: hypStore,
          entityMentionStore: candStore,
          entityStore,
          graphVersionStore,
          temporalStateChange: temporalStateChangeStore,
        },
      );
      return result.entityId;
    }

    async function upsertHypothesis(params: {
      caseId: string;
      sourceEntityId: string;
      targetEntityId: string;
      relationType: string;
      validityInterval?: unknown;
    }): Promise<string> {
      const relationId = await deterministicRelationHypothesisId({
        sourceEntityId: params.sourceEntityId,
        targetEntityId: params.targetEntityId,
        relationType: params.relationType,
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
      });
      await hypothesisStore.upsertHypothesis({
        id: relationId,
        identityKey: buildRelationHypothesisIdentityKey({
          sourceEntityId: params.sourceEntityId,
          targetEntityId: params.targetEntityId,
          relationType: params.relationType,
          scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        }),
        caseId: params.caseId,
        investigationId,
        sourceEntityId: params.sourceEntityId,
        targetEntityId: params.targetEntityId,
        relationType: params.relationType,
        support: 0.7,
        evidenceBasis: [randomUUID()],
        contradictions: [],
        status: "PROPOSED",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        evidenceCount: 1,
        evidenceStrength: 0.7,
        sourceCoverage: 1,
        temporalCoverage: 1,
        directed: false,
        provenance: { extractor: "indago:relation-resolution:engine" },
        ...(params.validityInterval !== undefined
          ? { validityInterval: params.validityInterval }
          : {}),
      });
      return relationId;
    }

    const materializationStores = () => ({
      relationHypothesisStore: hypothesisStore,
      relationStore,
      graphVersionStore,
      temporalStateChange: temporalStateChangeStore,
    });

    function versionChain(caseId: string): Promise<DurableGraphVersion[]> {
      return graphVersionStore.listByCase(caseId);
    }

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
      entityStore = new EntityStore(prisma);
      hypStore = new EntityHypothesisStore(prisma);
      candStore = new EntityMentionStore(prisma);
      pairStore = new CandidatePairStore(prisma);
      obsStore = new ObservationStore(prisma);
      hypothesisStore = new RelationHypothesisStore(prisma);
      relationStore = new RelationStore(prisma);
      graphVersionStore = new GraphVersionStore(prisma);
      temporalStateChangeStore = new TemporalStateChangeStore(prisma);
      projectionService = new GraphProjectionService({
        graphVersions: graphVersionStore,
        entities: entityStore,
        relations: relationStore,
      });

      await prisma.graphVersion.deleteMany({});
      await prisma.relation.deleteMany({});
      await prisma.relationHypothesis.deleteMany({});
      await prisma.entity.deleteMany({});
      await prisma.entityHypothesis.deleteMany({});
      await prisma.candidatePair.deleteMany({});
      await prisma.entityMentionCandidate.deleteMany({});
      await prisma.observation.deleteMany({});
      await prisma.evidence.deleteMany({});
      await prisma.source.deleteMany({});
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "TemporalStateChange"');
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    // -----------------------------------------------------------------------
    // item A: amendment authority + assertion family + as-of projection.
    // -----------------------------------------------------------------------
    it("amends validity via RELATION_AMENDED (ORIGINAL+AMENDMENT assertions, version, TSC)", async () => {
      const caseId = randomUUID();
      const e1 = await materializeEntityViaStore(caseId, "hardening-a@example.org");
      const e2 = await materializeEntityViaStore(caseId, "hardening-b@example.org");

      const hyp = await upsertHypothesis({
        caseId,
        sourceEntityId: e1.id,
        targetEntityId: e2.id,
        relationType: "association",
        validityInterval: JAN10_INTERVAL,
      });
      const accepted = await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: hyp, actor: "test@indago" },
        materializationStores(),
      );
      expect(accepted.materialized).toBe(true);
      const relationId = accepted.relationId;

      // ORIGINAL assertion seeded with the accept version number.
      const before = await relationStore.findById(relationId, { caseId });
      expect(before).not.toBeNull();
      expect(before!.temporalAssertions).toHaveLength(1);
      expect(before!.temporalAssertions[0]!.kind).toBe("ORIGINAL");
      expect(before!.temporalAssertions[0]!.validityInterval).toEqual(JAN10_INTERVAL);
      expect(before!.temporalAssertions[0]!.revisionAtVersionNumber).toBe(1);

      // Amend → RELATION_AMENDED version 2 + AMENDMENT assertion + TSC.
      const originalAssertionId = before!.temporalAssertions[0]!.id;
      const amended = await amendRelationValidity(
        {
          caseId,
          relationId,
          newInterval: FEB20_INTERVAL,
          supersedesAssertionId: originalAssertionId,
          actor: "test@indago",
        },
        materializationStores(),
      );
      expect(amended.versionCreated).toBe(true);

      const after = await relationStore.findById(relationId, { caseId });
      expect(after!.validityInterval).toEqual(FEB20_INTERVAL);
      expect(after!.temporalAssertions).toHaveLength(2);
      expect(after!.temporalAssertions.map((a) => a.kind)).toEqual(["ORIGINAL", "AMENDMENT"]);
      expect(after!.temporalAssertions[1]!.supersedesAssertionId).toBe(originalAssertionId);
      expect(after!.temporalAssertions[1]!.validityInterval).toEqual(FEB20_INTERVAL);
      expect(after!.temporalAssertions[1]!.revisionAtVersionNumber).toBe(2);
      // Never overwrites the original.
      expect(after!.temporalAssertions[0]!.validityInterval).toEqual(JAN10_INTERVAL);

      const versions = await versionChain(caseId);
      expect(versions.map((v) => v.versionNumber)).toEqual([1, 2]);
      expect(versions.map((v) => v.reason)).toEqual([
        `RELATION_ACCEPTED:${relationId}`,
        `RELATION_AMENDED:${relationId}`,
      ]);

      // TSC has ACCEPTED + AMENDED in sequence.
      const history = await temporalStateChangeStore.listForEntity(caseId, "RELATION", relationId);
      expect(history.map((h) => h.stateType)).toEqual(["ACCEPTED", "AMENDED"]);
      expect(history.map((h) => h.sequence)).toEqual([1, 2]);
      // The AMENDED entry carries the correction (domain) interval.
      expect(history[1]!.validityInterval).toEqual(FEB20_INTERVAL);
    });

    it("historical projection keeps the ORIGINAL interval as-of version 1 and the amended one as-of version 2", async () => {
      const caseId = randomUUID();
      const e1 = await materializeEntityViaStore(caseId, "proj-amend-a@example.org");
      const e2 = await materializeEntityViaStore(caseId, "proj-amend-b@example.org");
      const hyp = await upsertHypothesis({
        caseId,
        sourceEntityId: e1.id,
        targetEntityId: e2.id,
        relationType: "association",
        validityInterval: JAN10_INTERVAL,
      });
      const accepted = await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: hyp, actor: "test@indago" },
        materializationStores(),
      );
      const relationId = accepted.relationId;
      const original = (await relationStore.findById(relationId, { caseId }))!.temporalAssertions[0]!.id;
      await amendRelationValidity(
        {
          caseId,
          relationId,
          newInterval: FEB20_INTERVAL,
          supersedesAssertionId: original,
          actor: "test@indago",
        },
        materializationStores(),
      );

      const atV1 = await projectionService.projectGraphVersion(caseId, { versionNumber: 1 });
      const snap1 = normalizeBuiltGraph(atV1.graph, caseId);
      expect(snap1.edges[0]!.temporalRange).toEqual(JAN10_INTERVAL);

      const atV2 = await projectionService.projectGraphVersion(caseId, { versionNumber: 2 });
      const snap2 = normalizeBuiltGraph(atV2.graph, caseId);
      expect(snap2.edges[0]!.temporalRange).toEqual(FEB20_INTERVAL);
    });

    it("amending with the SAME interval is idempotent (no duplicate version/TSC/assertion)", async () => {
      const caseId = randomUUID();
      const e1 = await materializeEntityViaStore(caseId, "idem-amend-a@example.org");
      const e2 = await materializeEntityViaStore(caseId, "idem-amend-b@example.org");
      const hyp = await upsertHypothesis({
        caseId,
        sourceEntityId: e1.id,
        targetEntityId: e2.id,
        relationType: "association",
        validityInterval: JAN10_INTERVAL,
      });
      const accepted = await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: hyp, actor: "test@indago" },
        materializationStores(),
      );
      const relationId = accepted.relationId;
      const original = (await relationStore.findById(relationId, { caseId }))!.temporalAssertions[0]!.id;

      await amendRelationValidity(
        {
          caseId,
          relationId,
          newInterval: FEB20_INTERVAL,
          supersedesAssertionId: original,
          actor: "test@indago",
        },
        materializationStores(),
      );
      const second: AmendRelationResult = await amendRelationValidity(
        {
          caseId,
          relationId,
          newInterval: FEB20_INTERVAL,
          supersedesAssertionId: original,
          actor: "test@indago",
        },
        materializationStores(),
      );
      expect(second.versionCreated).toBe(false);

      const versions = await versionChain(caseId);
      expect(versions).toHaveLength(2); // ACCEPTED + FIRST AMENDED only
      const after = await relationStore.findById(relationId, { caseId });
      expect(after!.temporalAssertions).toHaveLength(2);
    });

    // -----------------------------------------------------------------------
    // item B: entity mutation versioning.
    // -----------------------------------------------------------------------
    it("materializing a fresh canonical entity via the authority records ENTITY_CREATED + TSC; projecting excludes it before v1", async () => {
      const caseId = randomUUID();

      // Exercise the FULL authority boundary — candidate mentions → candidate
      // pair → PROPOSED hypothesis → explicit acceptance. Entity type is
      // PERSON (NAME-bearing) so the canonical profile is derived from the
      // candidate value. The entity stores include graphVersionStore +
      // temporalStateChange, so the authority writes ENTITY_CREATED + TSC in
      // the SAME transaction (item B).
      const entityId = await materializeEntityViaAuthority(caseId, "entity-ver-auth@example.org");

      const chain = await versionChain(caseId);
      expect(chain.length).toBe(1);
      expect(chain[0]!.reason).toBe(`ENTITY_CREATED:${entityId}`);
      expect(chain[0]!.metadata).toMatchObject({ change: "ENTITY_CREATED", entityId });

      const lifecycle = replayEntityLifecycle(chain, 1);
      expect(lifecycle.get(entityId)).toEqual({ createdAtVersion: 1, archivedAtVersion: null });

      // TSC recorded the CREATED transition in the same boundary.
      const tsc = await temporalStateChangeStore.listForEntity(caseId, "ENTITY", entityId);
      expect(tsc.map((t) => t.stateType)).toEqual(["CREATED"]);

      // Projection at version 1 includes the entity as a node.
      const projected = await projectionService.projectGraphVersion(caseId, { versionNumber: 1 });
      const snap = normalizeBuiltGraph(projected.graph, caseId);
      expect(snap.nodes.map((n) => n.id)).toContain(entityId);
    });

    it("transitionEntityStatus ARCHIVED records ENTITY_ARCHIVED version + TSC; projection drops the node", async () => {
      const caseId = randomUUID();
      // Authority path: records the CREATED version (v1) + CREATED TSC.
      const entityId = await materializeEntityViaAuthority(caseId, "arch-a@example.org");

      const result = await transitionEntityStatus(
        { caseId, entityId, newStatus: "ARCHIVED", actor: "test@indago" },
        { entityStore, graphVersionStore, temporalStateChange: temporalStateChangeStore },
      );
      expect(result.versionCreated).toBe(true);
      expect(result.previousStatus).toBe("ACTIVE");

      const chain = await versionChain(caseId);
      expect(chain.map((v) => v.reason)).toEqual([
        `ENTITY_CREATED:${entityId}`,
        `ENTITY_ARCHIVED:${entityId}`,
      ]);

      const tsc = await temporalStateChangeStore.listForEntity(caseId, "ENTITY", entityId);
      expect(tsc.map((t) => t.stateType)).toEqual(["CREATED", "ARCHIVED"]);

      // Projection at version 2 (post-archive) drops the node.
      const projected = await projectionService.projectGraphVersion(caseId, { versionNumber: 2 });
      const snap = normalizeBuiltGraph(projected.graph, caseId);
      expect(snap.nodes.map((n) => n.id)).not.toContain(entityId);
    });

    it("transitionEntityStatus is idempotent (already ARCHIVED → no second version)", async () => {
      const caseId = randomUUID();
      const e1 = await materializeEntityViaStore(caseId, "arch-idem@example.org");
      await transitionEntityStatus(
        { caseId, entityId: e1.id, newStatus: "ARCHIVED", actor: "test@indago" },
        { entityStore, graphVersionStore, temporalStateChange: temporalStateChangeStore },
      );
      const again = await transitionEntityStatus(
        { caseId, entityId: e1.id, newStatus: "ARCHIVED", actor: "test@indago" },
        { entityStore, graphVersionStore, temporalStateChange: temporalStateChangeStore },
      );
      expect(again.versionCreated).toBe(false);

      const chain = await versionChain(caseId);
      expect(chain).toHaveLength(1);
    });

    // -----------------------------------------------------------------------
    // item D: DB-level unique ACTIVE GraphVersion per case.
    // -----------------------------------------------------------------------
    it("refuses a SECOND ACTIVE GraphVersion for the same case at the DB level", async () => {
      const caseId = randomUUID();
      await graphVersionStore.createVersion({ caseId, investigationId, status: "ACTIVE" });

      // Bypass the store (which auto-demotes) and insert a raw duplicate ACTIVE
      // row — the partial unique index must reject it. Prisma surfaces the
      // violation for a raw-created partial index as a P2002 whose message names
      // the index or the fields (the index itself is not declared in
      // schema.prisma, so the message may reference only the columns).
      await expect(
        prisma.graphVersion.create({
          data: {
            id: randomUUID(),
            caseId,
            investigationId,
            versionNumber: 99,
            status: "ACTIVE",
            projectionStatus: "PENDING",
          },
        }),
      ).rejects.toThrow(
        /GraphVersion_unique_active_per_case|Unique constraint failed on the (fields|constraint)/,
      );
    });

    it("createVersion auto-demotion keeps exactly one ACTIVE version per case by construction", async () => {
      const caseId = randomUUID();
      for (let i = 0; i < 5; i++) {
        await graphVersionStore.createVersion({ caseId, investigationId, status: "ACTIVE" });
      }
      const chain = await versionChain(caseId);
      const active = chain.filter((v) => v.status === "ACTIVE");
      expect(active).toHaveLength(1);
      expect(active[0]!.versionNumber).toBe(5);
      expect(chain.filter((v) => v.status === "SUPERSEDED")).toHaveLength(4);
    });

    // -----------------------------------------------------------------------
    // item E: concurrent version creation — unique versionNumbers, single ACTIVE.
    // -----------------------------------------------------------------------
    it("concurrent canonical acceptances yield unique version numbers with no P2002 and one ACTIVE", async () => {
      const caseId = randomUUID();
      const e1 = await materializeEntityViaStore(caseId, "conc-a@example.org");
      const e2 = await materializeEntityViaStore(caseId, "conc-b@example.org");

      const hyps = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          upsertHypothesis({
            caseId,
            sourceEntityId: e1.id,
            targetEntityId: e2.id,
            relationType: `association_${i}`,
          }),
        ),
      );

      const results = await Promise.all(
        hyps.map((hyp) =>
          materializeCanonicalRelationFromAcceptedHypothesis(
            { caseId, hypothesisId: hyp, actor: "test@indago" },
            materializationStores(),
          ),
        ),
      );
      expect(results.every((r) => r.materialized)).toBe(true);

      const chain = await versionChain(caseId);
      const numbers = chain.map((v) => v.versionNumber);
      expect(numbers).toHaveLength(8);
      expect(new Set(numbers).size).toBe(8); // unique
      expect(numbers).toEqual([...numbers].sort((a, b) => a - b)); // monotonic & contiguous

      const active = chain.filter((v) => v.status === "ACTIVE");
      expect(active).toHaveLength(1);
    });

    // -----------------------------------------------------------------------
    // item F: concurrent idempotent TSC writes converge to one row.
    // -----------------------------------------------------------------------
    it("concurrent idempotent TSC writes for the same logical key produce one row", async () => {
      const caseId = randomUUID();
      const entityId = randomUUID();

      const writes = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          temporalStateChangeStore.recordChange({
            caseId,
            investigationId,
            entityType: "RELATION",
            entityId,
            stateType: "ACCEPTED",
            note: `attempt ${i}`,
          }),
        ),
      );

      const written = writes.filter((w) => w.written);
      expect(written).toHaveLength(1);

      const rows = await temporalStateChangeStore.listForEntity(caseId, "RELATION", entityId);
      expect(rows).toHaveLength(1);
    });

    // -----------------------------------------------------------------------
    // item G: append-only trigger audit.
    // -----------------------------------------------------------------------
    it("rejects UPDATE and DELETE on TemporalStateChange; allows INSERT", async () => {
      const caseId = randomUUID();
      const entityId = randomUUID();
      await temporalStateChangeStore.recordChange({
        caseId,
        investigationId,
        entityType: "RELATION",
        entityId,
        stateType: "ACCEPTED",
      });

      // UPDATE is forbidden.
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "TemporalStateChange" SET "stateType" = 'REVERSED' WHERE "caseId" = '${caseId}'`,
        ),
      ).rejects.toThrow(/append-only/);

      // DELETE is forbidden.
      await expect(
        prisma.$executeRawUnsafe(
          `DELETE FROM "TemporalStateChange" WHERE "caseId" = '${caseId}'`,
        ),
      ).rejects.toThrow(/append-only/);

      // INSERT remains allowed (the trigger only guards UPDATE/DELETE).
      const rowsBefore = (await temporalStateChangeStore.listForEntity(caseId, "RELATION", entityId)).length;
      expect(rowsBefore).toBe(1);
    });
  },
);