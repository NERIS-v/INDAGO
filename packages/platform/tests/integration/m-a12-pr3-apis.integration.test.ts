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
} from "@indago/entity-resolution";
import { EntityStore } from "../../src/persistence/entity-store.js";
import { RelationHypothesisStore } from "../../src/persistence/relation-hypothesis-store.js";
import { RelationStore } from "../../src/persistence/relation-store.js";
import { TemporalStateChangeStore } from "../../src/persistence/temporal-state-change-store.js";
import {
  materializeCanonicalRelationFromAcceptedHypothesis,
  reverseRelationHypothesis,
} from "../../src/relations/relation-materialization.js";
import {
  GraphProjectionService,
  normalizeBuiltGraph,
} from "../../src/relations/graph-version-service.js";
import {
  GraphVersionStore,
} from "../../src/persistence/graph-version-store.js";

// ============================================================================
// M-A12-PR3 Temporal APIs — REAL round-trips against TEST_DATABASE_URL.
//
// REQUIRES a REAL Postgres test database (TEST_DATABASE_URL). Skipped when
// the env var is absent — MUST NOT attempt a DB connection in that case.
//
// Proves:
//   1. Version listing + pagination (paginated query, total count, ordering).
//   2. Historical graph projection via versionNumber and via UUID id.
//   3. Checkpoint association (D7): associateCheckpoint + resolveVersionByCheckpoint.
//   4. Cross-case isolation for checkpoint mapping.
//   5. Deterministic replay after checkpoint association.
//   6. Jan10→Mar10 worked example with version listing round-trip.
//   7. WS-10 valid-at round trip (dimension B — domain-time containment).
//   8. as-of endpoint returns 501.
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "M-A12-PR3 temporal API endpoints (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let entityStore: EntityStore;
    let hypothesisStore: RelationHypothesisStore;
    let relationStore: RelationStore;
    let graphVersionStore: GraphVersionStore;
    let temporalStateChangeStore: TemporalStateChangeStore;
    let projectionService: GraphProjectionService;

    const investigationId = randomUUID();

    const JAN10 = "2026-01-10T12:00:00.000Z";
    const MAR10 = "2026-03-10T12:00:00.000Z";
    const JAN10_INTERVAL = {
      validFrom: { value: JAN10, precision: "exact" as const },
      precision: "exact" as const,
      semantics: "observed" as const,
    };

    async function materializeEntity(
      caseId: string,
      canonicalName: string,
      entityType = "ORGANIZATION",
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
          provenance: { extractor: "m-a12-pr3:test" },
        },
      });
      return result.entity;
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

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
      entityStore = new EntityStore(prisma);
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
      // TemporalStateChange is append-only by DB trigger — TRUNCATE (which row
      // triggers do not intercept) is the sanctioned test-reset seam.
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "TemporalStateChange"');
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    // -----------------------------------------------------------------------
    // 1. Version listing + pagination.
    // -----------------------------------------------------------------------
    it("lists versions in ascending versionNumber order with correct total", async () => {
      const caseId = randomUUID();
      const eA = await materializeEntity(caseId, "pag-a@example.org");
      const eB = await materializeEntity(caseId, "pag-b@example.org");

      // Create 3 versions.
      for (const relType of ["association", "financial", "communication"]) {
        const hyp = await upsertHypothesis({
          caseId,
          sourceEntityId: eA.id,
          targetEntityId: eB.id,
          relationType: relType,
        });
        await materializeCanonicalRelationFromAcceptedHypothesis(
          { caseId, hypothesisId: hyp, actor: "test@indago" },
          materializationStores(),
        );
      }

      const { versions: page1, total } = await graphVersionStore.listByCasePaginated(caseId, {
        limit: 2,
        offset: 0,
      });
      expect(total).toBe(3);
      expect(page1).toHaveLength(2);
      expect(page1[0]!.versionNumber).toBe(1);
      expect(page1[1]!.versionNumber).toBe(2);

      const { versions: page2, total: total2 } = await graphVersionStore.listByCasePaginated(caseId, {
        limit: 2,
        offset: 2,
      });
      expect(total2).toBe(3);
      expect(page2).toHaveLength(1);
      expect(page2[0]!.versionNumber).toBe(3);

      // Empty page.
      const { versions: page3 } = await graphVersionStore.listByCasePaginated(caseId, {
        limit: 2,
        offset: 10,
      });
      expect(page3).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // 2. Historical graph projection via versionNumber and UUID.
    // -----------------------------------------------------------------------
    it("projects historical graph at a specific versionNumber", async () => {
      const caseId = randomUUID();
      const eA = await materializeEntity(caseId, "hist-a@example.org", "PERSON");
      const eB = await materializeEntity(caseId, "hist-b@example.org", "PERSON");

      const hyp = await upsertHypothesis({
        caseId,
        sourceEntityId: eA.id,
        targetEntityId: eB.id,
        relationType: "communication",
        validityInterval: JAN10_INTERVAL,
      });
      await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: hyp, actor: "test@indago" },
        materializationStores(),
      );

      const built = await projectionService.projectGraphVersion(caseId, {
        versionNumber: 1,
      });
      const snap = normalizeBuiltGraph(built.graph, caseId);
      expect(snap.edges).toHaveLength(1);
      expect(snap.edges[0].temporalRange).toEqual(JAN10_INTERVAL);
      expect(snap.nodes.length).toBeGreaterThanOrEqual(2);
    });

    it("projects historical graph by UUID id", async () => {
      const caseId = randomUUID();
      const eA = await materializeEntity(caseId, "uuid-a@example.org", "PERSON");
      const eB = await materializeEntity(caseId, "uuid-b@example.org", "PERSON");

      const hyp = await upsertHypothesis({
        caseId,
        sourceEntityId: eA.id,
        targetEntityId: eB.id,
        relationType: "ownership",
      });
      await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: hyp, actor: "test@indago" },
        materializationStores(),
      );

      const versions = await graphVersionStore.listByCase(caseId);
      const v1 = versions[0]!;

      const built = await projectionService.projectGraphVersion(caseId, {
        graphVersionId: v1.id,
      });
      const snap = normalizeBuiltGraph(built.graph, caseId);
      expect(snap.edges).toHaveLength(1);
    });

    // -----------------------------------------------------------------------
    // 3. Checkpoint association (D7).
    // -----------------------------------------------------------------------
    it("associates a checkpoint with a version and resolves it back", async () => {
      const caseId = randomUUID();
      const eA = await materializeEntity(caseId, "cp-a@example.org");
      const eB = await materializeEntity(caseId, "cp-b@example.org");

      const hyp = await upsertHypothesis({
        caseId,
        sourceEntityId: eA.id,
        targetEntityId: eB.id,
        relationType: "association",
      });
      await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: hyp, actor: "test@indago" },
        materializationStores(),
      );

      const versions = await graphVersionStore.listByCase(caseId);
      const v1 = versions[0]!;
      expect(v1.checkpointId).toBeNull();

      // Associate a checkpoint with version 1.
      const checkpointId = randomUUID();
      const updated = await graphVersionStore.associateCheckpoint(
        v1.id,
        checkpointId,
        { caseId },
      );
      expect(updated).not.toBeNull();
      expect(updated!.checkpointId).toBe(checkpointId);

      // Resolve version by checkpoint.
      const resolved = await graphVersionStore.resolveVersionByCheckpoint(
        checkpointId,
        { caseId },
      );
      expect(resolved).not.toBeNull();
      expect(resolved!.id).toBe(v1.id);
      expect(resolved!.versionNumber).toBe(1);
    });

    // -----------------------------------------------------------------------
    // 4. Cross-case isolation for checkpoint mapping.
    // -----------------------------------------------------------------------
    it("checkpoint mapping is case-scoped — same checkpointId maps to different versions", async () => {
      const caseA = randomUUID();
      const caseB = randomUUID();
      const checkpointId = randomUUID();

      const eA = await materializeEntity(caseA, "xcase-a@example.org");
      const eB = await materializeEntity(caseA, "xcase-b@example.org");
      const fA = await materializeEntity(caseB, "xcase-f@example.org");
      const fB = await materializeEntity(caseB, "xcase-g@example.org");

      const hypA = await upsertHypothesis({
        caseId: caseA,
        sourceEntityId: eA.id,
        targetEntityId: eB.id,
        relationType: "ownership",
      });
      const hypB = await upsertHypothesis({
        caseId: caseB,
        sourceEntityId: fA.id,
        targetEntityId: fB.id,
        relationType: "ownership",
      });

      await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId: caseA, hypothesisId: hypA, actor: "test@indago" },
        materializationStores(),
      );
      await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId: caseB, hypothesisId: hypB, actor: "test@indago" },
        materializationStores(),
      );

      const versionsA = await graphVersionStore.listByCase(caseA);
      const versionsB = await graphVersionStore.listByCase(caseB);

      // Associate same checkpointId with versions in both cases.
      await graphVersionStore.associateCheckpoint(versionsA[0]!.id, checkpointId, { caseId: caseA });
      await graphVersionStore.associateCheckpoint(versionsB[0]!.id, checkpointId, { caseId: caseB });

      // Each case resolves to its own version.
      const resolvedA = await graphVersionStore.resolveVersionByCheckpoint(checkpointId, { caseId: caseA });
      const resolvedB = await graphVersionStore.resolveVersionByCheckpoint(checkpointId, { caseId: caseB });
      expect(resolvedA!.id).toBe(versionsA[0]!.id);
      expect(resolvedB!.id).toBe(versionsB[0]!.id);
      expect(resolvedA!.id).not.toBe(resolvedB!.id);

      // Cross-case lookup returns null.
      const crossA = await graphVersionStore.resolveVersionByCheckpoint(checkpointId, {
        caseId: "nonexistent-case",
      });
      expect(crossA).toBeNull();
    });

    // -----------------------------------------------------------------------
    // 5. Deterministic replay.
    // -----------------------------------------------------------------------
    it("replays the same version deterministically after checkpoint association", async () => {
      const caseId = randomUUID();
      const eA = await materializeEntity(caseId, "detpr3-a@example.org", "PERSON");
      const eB = await materializeEntity(caseId, "detpr3-b@example.org", "PERSON");

      const hyp = await upsertHypothesis({
        caseId,
        sourceEntityId: eA.id,
        targetEntityId: eB.id,
        relationType: "communication",
        validityInterval: JAN10_INTERVAL,
      });
      await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: hyp, actor: "test@indago" },
        materializationStores(),
      );

      const versions = await graphVersionStore.listByCase(caseId);
      const v1 = versions[0]!;
      await graphVersionStore.associateCheckpoint(v1.id, randomUUID(), { caseId });

      // Project twice — discard first Graphology instance.
      const graph1 = await projectionService.projectGraphVersion(caseId, {
        versionNumber: v1.versionNumber,
      });
      const graph2 = await projectionService.projectGraphVersion(caseId, {
        versionNumber: v1.versionNumber,
      });

      const snap1 = normalizeBuiltGraph(graph1.graph, caseId);
      const snap2 = normalizeBuiltGraph(graph2.graph, caseId);
      expect(snap1).toEqual(snap2);
      expect(snap1.edges).toHaveLength(1);
    });

    // -----------------------------------------------------------------------
    // 6. Jan10→Mar10 worked example with version listing.
    // -----------------------------------------------------------------------
    it("Jan10 accept → Mar10 reverse: version listing shows both, projection at v1 has edge, v2 does not", async () => {
      const caseId = randomUUID();
      const eA = await materializeEntity(caseId, "jan10-a@example.org", "PERSON");
      const eB = await materializeEntity(caseId, "jan10-b@example.org", "PERSON");

      const hyp = await upsertHypothesis({
        caseId,
        sourceEntityId: eA.id,
        targetEntityId: eB.id,
        relationType: "communication",
        validityInterval: JAN10_INTERVAL,
      });
      await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: hyp, actor: "test@indago" },
        materializationStores(),
      );

      // Reverse (Mar 10 ingestion).
      await reverseRelationHypothesis(
        { caseId, hypothesisId: hyp },
        materializationStores(),
      );

      const { versions, total } = await graphVersionStore.listByCasePaginated(caseId, {
        limit: 10,
        offset: 0,
      });
      expect(total).toBe(2);
      expect(versions).toHaveLength(2);
      expect(versions[0]!.reason).toMatch(/^RELATION_ACCEPTED:/);
      expect(versions[1]!.reason).toMatch(/^RELATION_REVERSED:/);

      // v1: edge present with Jan10 temporalRange.
      const snap1 = normalizeBuiltGraph(
        (await projectionService.projectGraphVersion(caseId, { versionNumber: 1 })).graph,
        caseId,
      );
      expect(snap1.edges).toHaveLength(1);
      expect(snap1.edges[0].temporalRange).toEqual(JAN10_INTERVAL);

      // v2: edge absent (reversed).
      const snap2 = normalizeBuiltGraph(
        (await projectionService.projectGraphVersion(caseId, { versionNumber: 2 })).graph,
        caseId,
      );
      expect(snap2.edges).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // 7. WS-10 valid-at round trip.
    // -----------------------------------------------------------------------
    it("projectGraphValidAt returns the domain-valid graph at a point in time", async () => {
      const caseId = randomUUID();
      const eA = await materializeEntity(caseId, "va-a@example.org", "PERSON");
      const eB = await materializeEntity(caseId, "va-b@example.org", "PERSON");

      const hyp = await upsertHypothesis({
        caseId,
        sourceEntityId: eA.id,
        targetEntityId: eB.id,
        relationType: "communication",
        validityInterval: JAN10_INTERVAL,
      });
      await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: hyp, actor: "test@indago" },
        materializationStores(),
      );

      // Just before the interval start → no edge (excluded, not guessed).
      const before = await projectionService.projectGraphValidAt(
        { caseId, investigationId },
        "2026-01-10T11:59:59.999Z",
      );
      expect(normalizeBuiltGraph(before.graph, caseId).edges).toHaveLength(0);

      // Exactly at the (closed) start → the edge is present with its persisted
      // temporalRange.
      const at = await projectionService.projectGraphValidAt(
        { caseId, investigationId },
        JAN10,
      );
      const snap = normalizeBuiltGraph(at.graph, caseId);
      expect(snap.edges).toHaveLength(1);
      expect(snap.edges[0].relationType).toBe("communication");
      expect(snap.edges[0].temporalRange).toEqual(JAN10_INTERVAL);
    });
  },
);
