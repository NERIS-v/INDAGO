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
import {
  materializeCanonicalRelationFromAcceptedHypothesis,
  rejectRelationHypothesis,
  reverseRelationHypothesis,
} from "../../src/relations/relation-materialization.js";
import {
  GraphProjectionService,
  normalizeBuiltGraph,
} from "../../src/relations/graph-version-service.js";
import {
  GraphVersionStore,
  GraphVersionLifecycleError,
} from "../../src/persistence/graph-version-store.js";

// ============================================================================
// M-A12-PR2 Graph Versioning + Historical Projection — REAL round-trips
// against TEST_DATABASE_URL.
//
// REQUIRES a REAL Postgres test database (TEST_DATABASE_URL). The suite is
// skipped when the env var is absent — it MUST NOT attempt a DB connection in
// that case. The authority transaction uses pg_advisory_xact_lock, which only
// works on live Postgres, which is exactly why this suite is BLOCKED without
// one.
//
// Proves the M-A12-PR2 substitute for the stored graph:
//
//   1. Persistence + version numbering: each genuinely graph-affecting
//      canonical change (new ACCEPTED relation, ACTIVE→REVERSED flip) creates
//      a GraphVersion in the SAME transaction, with a case-scoped, monotonically
//      increasing, never-reused versionNumber and linear auto-parent lineage.
//   2. Lifecycle transitions (DRAFT→ACTIVE→SUPERSEDED) are guarded; illegal
//      transitions throw GraphVersionLifecycleError.
//   3. Parent validation: a missing parent → PARENT_NOT_FOUND; a cross-case
//      parent → PARENT_CROSS_CASE.
//   4. Canonical mutation + version atomicity: REJECT creates NO version; a
//      REVERSE of an ACTIVE canonical flips the canonical + creates a
//      RELATION_REVERSED version; a second reverse produces NO additional
//      version (idempotent).
//   5. Historical reconstruction (Jan 10 → Mar 10 worked example): the Jan 10
//      validityInterval stays on the edge in version N even after a Mar 10
//      reverse landed in version N+1 (dimension A revision order and dimension
//      B domain validity stay distinct).
//   6. Deterministic replay: projecting the same version twice yields
//      deep-equal normalized snapshots; the edge list is sorted.
//   7. Projection status: after projecting, the version is COMPLETE with
//      nodeCount/edgeCount > 0; projectCurrentGraph marks latestActiveByCase
//      COMPLETE.
//   8. Current graph excludes REJECTED/REVERSED relations.
//   9. Case isolation: version numbering restarts at 1 per case; no bleed.
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "M-A12-PR2 graph versioning + historical projection (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let entityStore: EntityStore;
    let hypothesisStore: RelationHypothesisStore;
    let relationStore: RelationStore;
    let graphVersionStore: GraphVersionStore;
    let projectionService: GraphProjectionService;

    const investigationId = randomUUID();

    const JAN10 = "2026-01-10T12:00:00.000Z";
    const JAN10_INTERVAL = {
      validFrom: { value: JAN10, precision: "exact" as const },
      precision: "exact" as const,
      semantics: "observed" as const,
    };

    async function materializeEntity(caseId: string, canonicalName: string, entityType = "ORGANIZATION") {
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
          provenance: { extractor: "m-a12-pr2:test" },
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
    });

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
      entityStore = new EntityStore(prisma);
      hypothesisStore = new RelationHypothesisStore(prisma);
      relationStore = new RelationStore(prisma);
      graphVersionStore = new GraphVersionStore(prisma);
      projectionService = new GraphProjectionService({
        graphVersions: graphVersionStore,
        entities: entityStore,
        relations: relationStore,
      });

      await prisma.graphVersion.deleteMany({});
      await prisma.relation.deleteMany({});
      await prisma.relationHypothesis.deleteMany({});
      await prisma.entity.deleteMany({});
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    // -----------------------------------------------------------------------
    // 1. Persistence + version numbering + auto-linear lineage.
    // -----------------------------------------------------------------------
    it("accepting two proposed hypotheses creates versions 1 and 2 with linear parent lineage", async () => {
      const caseId = randomUUID();
      const entityA = await materializeEntity(caseId, "acme-a@example.org");
      const entityB = await materializeEntity(caseId, "acme-b@example.org");

      const hyp1 = await upsertHypothesis({
        caseId,
        sourceEntityId: entityA.id,
        targetEntityId: entityB.id,
        relationType: "association",
      });
      const hyp2 = await upsertHypothesis({
        caseId,
        sourceEntityId: entityA.id,
        targetEntityId: entityB.id,
        relationType: "financial",
      });

      const r1 = await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: hyp1, actor: "test@indago" },
        materializationStores(),
      );
      const r2 = await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: hyp2, actor: "test@indago" },
        materializationStores(),
      );
      expect(r1.materialized).toBe(true);
      expect(r1.reused).toBe(false);
      expect(r2.materialized).toBe(true);
      expect(r2.reused).toBe(false);

      const count = await graphVersionStore.countByCase(caseId);
      expect(count).toBe(2);

      const versions = await graphVersionStore.listByCase(caseId);
      expect(versions.map((v) => v.versionNumber)).toEqual([1, 2]);
      expect(versions.map((v) => v.status).sort()).toEqual(["DRAFT", "DRAFT"]);
      expect(versions.map((v) => v.projectionStatus).sort()).toEqual(["PENDING", "PENDING"]);

      const [v1, v2] = versions;
      expect(v1!.versionNumber).toBe(1);
      expect(v2!.versionNumber).toBe(2);
      expect(v1!.parentGraphVersionId).toBeNull();
      expect(v2!.parentGraphVersionId).toBe(v1!.id);
      expect(v2!.reason).toMatch(/^RELATION_ACCEPTED:/);
    });

    // -----------------------------------------------------------------------
    // 2. Lifecycle transitions.
    // -----------------------------------------------------------------------
    it("enforces DRAFT→ACTIVE→SUPERSEDED lifecycle and refuses illegal transitions", async () => {
      const caseId = randomUUID();
      const entityA = await materializeEntity(caseId, "lc-a@example.org");
      const entityB = await materializeEntity(caseId, "lc-b@example.org");
      const hyp = await upsertHypothesis({
        caseId,
        sourceEntityId: entityA.id,
        targetEntityId: entityB.id,
        relationType: "ownership",
      });
      await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: hyp, actor: "test@indago" },
        materializationStores(),
      );

      const versions = await graphVersionStore.listByCase(caseId);
      const v1 = versions[0]!;
      expect(v1.status).toBe("DRAFT");

      await graphVersionStore.transitionStatus(v1.id, { caseId }, "ACTIVE");
      const active = await graphVersionStore.findById(v1.id, { caseId });
      expect(active!.status).toBe("ACTIVE");

      await expect(
        graphVersionStore.transitionStatus(v1.id, { caseId }, "ACTIVE"),
      ).rejects.toBeInstanceOf(GraphVersionLifecycleError);

      await graphVersionStore.transitionStatus(v1.id, { caseId }, "SUPERSEDED");
      const superseded = await graphVersionStore.findById(v1.id, { caseId });
      expect(superseded!.status).toBe("SUPERSEDED");

      await expect(
        graphVersionStore.transitionStatus(v1.id, { caseId }, "DRAFT"),
      ).rejects.toBeInstanceOf(GraphVersionLifecycleError);
    });

    // -----------------------------------------------------------------------
    // 3. Parent validation.
    // -----------------------------------------------------------------------
    it("refuses a nonexistent parent and a cross-case parent", async () => {
      const caseId = randomUUID();
      const otherCaseId = randomUUID();

      await expect(
        graphVersionStore.createVersion({
          caseId,
          investigationId,
          parentGraphVersionId: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(GraphVersionLifecycleError);

      await expect(
        graphVersionStore.createVersion({ caseId: otherCaseId, investigationId }),
      ).rejects.toBeInstanceOf(GraphVersionLifecycleError);

      // Create a real version in otherCase, then use it as a parent for case.
      const foreignVersion = await graphVersionStore.createVersion({
        caseId: otherCaseId,
        investigationId,
      });
      await expect(
        graphVersionStore.createVersion({
          caseId,
          investigationId,
          parentGraphVersionId: foreignVersion.id,
        }),
      ).rejects.toBeInstanceOf(GraphVersionLifecycleError);
    });

    // -----------------------------------------------------------------------
    // 4. Canonical mutation + version atomicity + reject.
    // -----------------------------------------------------------------------
    it("REJECT creates no version; REVERSE creates a version and is idempotent on second reverse", async () => {
      const caseId = randomUUID();
      const entityA = await materializeEntity(caseId, "rej-a@example.org");
      const entityB = await materializeEntity(caseId, "rej-b@example.org");

      // Fresh case: no versions yet.
      expect(await graphVersionStore.countByCase(caseId)).toBe(0);

      // Reject a PROPOSED hypothesis -> NO version, hypothesis goes REJECTED.
      const rejectHyp = await upsertHypothesis({
        caseId,
        sourceEntityId: entityA.id,
        targetEntityId: entityB.id,
        relationType: "association",
      });
      await rejectRelationHypothesis(
        { caseId, hypothesisId: rejectHyp },
        materializationStores(),
      );
      expect(await graphVersionStore.countByCase(caseId)).toBe(0);
      const rejectedHyp = await hypothesisStore.findById(rejectHyp, { caseId });
      expect(rejectedHyp!.status).toBe("REJECTED");

      // Accept a NEW hypothesis -> version 1.
      const acceptHyp = await upsertHypothesis({
        caseId,
        sourceEntityId: entityA.id,
        targetEntityId: entityB.id,
        relationType: "financial",
      });
      const acceptResult = await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: acceptHyp, actor: "test@indago" },
        materializationStores(),
      );
      expect(acceptResult.materialized).toBe(true);
      expect(await graphVersionStore.countByCase(caseId)).toBe(1);

      const canonicalRelationId = acceptResult.relationId;
      const canonicalBefore = await relationStore.findById(canonicalRelationId, { caseId });
      expect(canonicalBefore!.status).toBe("ACTIVE");

      // Reverse the accepted hypothesis -> version 2.
      const reverseResult = await reverseRelationHypothesis(
        { caseId, hypothesisId: acceptHyp },
        materializationStores(),
      );
      expect(reverseResult.canonicalReversed).toBe(true);
      expect(await graphVersionStore.countByCase(caseId)).toBe(2);

      const reversedCanonical = await relationStore.findById(canonicalRelationId, { caseId });
      expect(reversedCanonical!.status).toBe("REVERSED");

      const versions = await graphVersionStore.listByCase(caseId);
      const v2 = versions[1]!;
      expect(v2.reason).toBe(`RELATION_REVERSED:${canonicalRelationId}`);

      // Reversing again: the canonical is already REVERSED -> no canonical flip,
      // no new version (idempotent).
      const reverseAgain = await reverseRelationHypothesis(
        { caseId, hypothesisId: acceptHyp },
        materializationStores(),
      );
      expect(reverseAgain.canonicalReversed).toBe(false);
      expect(await graphVersionStore.countByCase(caseId)).toBe(2);
    });

    // -----------------------------------------------------------------------
    // 5. Historical reconstruction — Jan 10 → Mar 10 worked example.
    //
    //    version N   = accept relation R (edge A-B) with Jan 10 validityInterval
    //    version N+1 = reverse R  (Mar 10 ingestion)
    //
    //    version N projection: edge A-B PRESENT with Jan 10 temporalRange.
    //    version N+1 projection: edge A-B ABSENT as an ACTIVE canonical edge,
    //       but the relation row still exists (REVERSED) — history preserved.
    // -----------------------------------------------------------------------
    it("reconstructs version N with Jan-10 temporalRange and version N+1 without the edge", async () => {
      const caseId = randomUUID();
      const entityA = await materializeEntity(caseId, "jan-a@example.org", "PERSON");
      const entityB = await materializeEntity(caseId, "jan-b@example.org", "PERSON");

      // Domain event on Jan 10: accept relation R carrying the Jan 10 interval.
      const hypR = await upsertHypothesis({
        caseId,
        sourceEntityId: entityA.id,
        targetEntityId: entityB.id,
        relationType: "communication",
        validityInterval: JAN10_INTERVAL,
      });
      await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: hypR, actor: "test@indago" },
        materializationStores(),
      );
      const vN = (await graphVersionStore.listByCase(caseId)).at(-1)!;
      expect(vN.versionNumber).toBe(1);

      // Later (Mar 10 ingestion): reverse the same relation -> version N+1.
      await reverseRelationHypothesis(
        { caseId, hypothesisId: hypR },
        materializationStores(),
      );
      const vN1 = (await graphVersionStore.listByCase(caseId)).at(-1)!;
      expect(vN1.versionNumber).toBe(2);

      // The canonical relation row STILL exists — REVERSED, history preserved.
      const ap = await relationStore.listByCase(caseId, { investigationId });
      expect(ap).toHaveLength(1);
      expect(ap[0]!.status).toBe("REVERSED");

      // Version N projection: edge present, Jan 10 temporalRange.
      const graphN = await projectionService.projectGraphVersion(caseId, {
        versionNumber: vN.versionNumber,
      });
      const snapN = normalizeBuiltGraph(graphN, caseId);
      expect(snapN.edges).toHaveLength(1);
      const edgeN = snapN.edges[0]!;
      expect(edgeN.relationType).toBe("communication");
      expect(edgeN.temporalRange).toEqual(JAN10_INTERVAL);
      // Dimension B (domain validity) is the Jan 10 value — untouched even though
      // the Mar 10 reverse landed in a later version (dimension A).
      const persisted = await relationStore.findById(ap[0]!.id, { caseId });
      expect(persisted!.validityInterval).toEqual(JAN10_INTERVAL);

      // Version N+1 projection: the edge is ABSENT as an ACTIVE canonical edge.
      const graphN1 = await projectionService.projectGraphVersion(caseId, {
        versionNumber: vN1.versionNumber,
      });
      const snapN1 = normalizeBuiltGraph(graphN1, caseId);
      expect(snapN1.edges).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // 6. Deterministic replay.
    // -----------------------------------------------------------------------
    it("replays the same version deterministically (deep-equal, sorted edges)", async () => {
      const caseId = randomUUID();
      const entityA = await materializeEntity(caseId, "det-a@example.org");
      const entityB = await materializeEntity(caseId, "det-b@example.org");

      const hyp1 = await upsertHypothesis({
        caseId,
        sourceEntityId: entityA.id,
        targetEntityId: entityB.id,
        relationType: "ownership",
      });
      const hyp2 = await upsertHypothesis({
        caseId,
        sourceEntityId: entityA.id,
        targetEntityId: entityB.id,
        relationType: "association",
      });
      await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: hyp1, actor: "test@indago" },
        materializationStores(),
      );
      await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: hyp2, actor: "test@indago" },
        materializationStores(),
      );

      const versions = await graphVersionStore.listByCase(caseId);
      const target = versions[1]!;

      const graph1 = await projectionService.projectGraphVersion(caseId, {
        versionNumber: target.versionNumber,
      });
      // "DISCARD" the first graph (no retained reference); rebuild from scratch.
      const graph2 = await projectionService.projectGraphVersion(caseId, {
        versionNumber: target.versionNumber,
      });

      const snap1 = normalizeBuiltGraph(graph1, caseId);
      const snap2 = normalizeBuiltGraph(graph2, caseId);
      expect(snap1).toEqual(snap2);
      expect(snap1.edges).toHaveLength(2);
      // Deterministic sorted edge order.
      const ids1 = snap1.edges.map((e) => e.id);
      const sortedIds1 = [...ids1].sort((a, b) => a.localeCompare(b));
      expect(ids1).toEqual(sortedIds1);
    });

    // -----------------------------------------------------------------------
    // 7. Projection status: COMPLETE with counts after projected versions.
    // -----------------------------------------------------------------------
    it("marks projected versions COMPLETE with nodeCount/edgeCount > 0", async () => {
      const caseId = randomUUID();
      const entityA = await materializeEntity(caseId, "ps-a@example.org");
      const entityB = await materializeEntity(caseId, "ps-b@example.org");
      const hyp = await upsertHypothesis({
        caseId,
        sourceEntityId: entityA.id,
        targetEntityId: entityB.id,
        relationType: "communication",
      });
      const result = await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: hyp, actor: "test@indago" },
        materializationStores(),
      );
      await projectionService.projectGraphVersion(caseId, { versionNumber: 1 });

      const v = await graphVersionStore.findByVersionNumber(caseId, 1);
      expect(v).not.toBeNull();
      expect(v!.projectionStatus).toBe("COMPLETE");
      expect(v!.nodeCount).toBeGreaterThan(0);
      expect(v!.edgeCount).toBeGreaterThan(0);

      // projectCurrentGraph marks the latest ACTIVE version COMPLETE.
      const gv = await graphVersionStore.findById(
        (await graphVersionStore.listByCase(caseId))[0]!.id,
        { caseId },
      );
      await graphVersionStore.transitionStatus(gv!.id, { caseId }, "ACTIVE");
      await projectionService.projectCurrentGraph({ caseId, investigationId });
      const latest = await graphVersionStore.latestActiveByCase(caseId);
      expect(latest).not.toBeNull();
      expect(latest!.projectionStatus).toBe("COMPLETE");
      expect(latest!.nodeCount).toBeGreaterThan(0);
      expect(latest!.edgeCount).toBeGreaterThan(0);
      void result;
    });

    // -----------------------------------------------------------------------
    // 8. Current graph excludes REJECTED / REVERSED relations.
    // -----------------------------------------------------------------------
    it("projectCurrentGraph excludes REJECTED and REVERSED relations as edges", async () => {
      const caseId = randomUUID();
      const entityA = await materializeEntity(caseId, "cur-a@example.org");
      const entityB = await materializeEntity(caseId, "cur-b@example.org");

      // A REJECTED hypothesis never appears as an edge.
      const rejectHyp = await upsertHypothesis({
        caseId,
        sourceEntityId: entityA.id,
        targetEntityId: entityB.id,
        relationType: "association",
      });
      await rejectRelationHypothesis(
        { caseId, hypothesisId: rejectHyp },
        materializationStores(),
      );

      // An accepted relation that later goes REVERSED is not an edge in the
      // current graph either.
      const revHyp = await upsertHypothesis({
        caseId,
        sourceEntityId: entityA.id,
        targetEntityId: entityB.id,
        relationType: "financial",
      });
      await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: revHyp, actor: "test@indago" },
        materializationStores(),
      );
      await reverseRelationHypothesis(
        { caseId, hypothesisId: revHyp },
        materializationStores(),
      );

      const built = await projectionService.projectCurrentGraph({
        caseId,
        investigationId,
      });
      const snap = normalizeBuiltGraph(built, caseId);
      expect(snap.edges).toHaveLength(0);
      expect(snap.nodes.map((n) => n.canonicalName).sort()).toEqual([
        "cur-a@example.org",
        "cur-b@example.org",
      ]);
    });

    // -----------------------------------------------------------------------
    // 9. Case isolation: versionNumber restarts at 1 per case, no bleed.
    // -----------------------------------------------------------------------
    it("keeps version chains isolated per case", async () => {
      const caseA = randomUUID();
      const caseB = randomUUID();

      const a1 = await materializeEntity(caseA, "iso-a1@example.org");
      const a2 = await materializeEntity(caseA, "iso-a2@example.org");
      const b1 = await materializeEntity(caseB, "iso-b1@example.org");
      const b2 = await materializeEntity(caseB, "iso-b2@example.org");

      const hypA = await upsertHypothesis({
        caseId: caseA,
        sourceEntityId: a1.id,
        targetEntityId: a2.id,
        relationType: "ownership",
      });
      const hypB = await upsertHypothesis({
        caseId: caseB,
        sourceEntityId: b1.id,
        targetEntityId: b2.id,
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

      const listA = await graphVersionStore.listByCase(caseA);
      const listB = await graphVersionStore.listByCase(caseB);
      expect(listA.map((v) => v.versionNumber)).toEqual([1]);
      expect(listB.map((v) => v.versionNumber)).toEqual([1]);

      // A sequential second version in caseB is numbered 2, distinct from 1 —
      // and does NOT bleed into caseA.
      const hypB2 = await upsertHypothesis({
        caseId: caseB,
        sourceEntityId: b1.id,
        targetEntityId: b2.id,
        relationType: "association",
      });
      await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId: caseB, hypothesisId: hypB2, actor: "test@indago" },
        materializationStores(),
      );
      const listA2 = await graphVersionStore.listByCase(caseA);
      const listB2 = await graphVersionStore.listByCase(caseB);
      expect(listA2).toHaveLength(1);
      expect(listB2.map((v) => v.versionNumber)).toEqual([1, 2]);
    });
  },
);