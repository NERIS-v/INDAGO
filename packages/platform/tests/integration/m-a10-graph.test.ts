import { describe, expect, beforeAll, afterAll, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  type EntityMentionCandidate,
  type CandidatePair,
  type Observation,
  type EntityHypothesis,
} from "@indago/contracts";
import {
  buildObservationIdentityKey,
  buildEntityMentionIdentityKey,
  buildCandidatePairIdentityKey,
  serializeSourceLocation,
  finalizeCandidatePair,
  blockCandidates,
} from "@indago/ingestion";
import {
  buildEntityHypothesisIdentityKey,
  deterministicEntityHypothesisId,
  RESOLUTION_SCORE_MODEL_VERSION,
  deterministicEntityId,
} from "@indago/entity-resolution";
import {
  buildRelationHypothesisIdentityKey,
  deterministicRelationHypothesisId,
  RELATION_SCORE_MODEL_VERSION,
} from "@indago/relation-resolution";
import { EntityHypothesisStore } from "../../src/persistence/entity-hypothesis-store.js";
import {
  ObservationStore,
  type SourceWriteRecord,
  type EvidenceWriteRecord,
} from "../../src/persistence/observation-store.js";
import { EntityMentionStore } from "../../src/persistence/entity-mention-store.js";
import { CandidatePairStore } from "../../src/persistence/candidate-pair-store.js";
import { EntityStore } from "../../src/persistence/entity-store.js";
import { RelationHypothesisStore } from "../../src/persistence/relation-hypothesis-store.js";
import { RelationStore, buildRelationKey } from "../../src/persistence/relation-store.js";
import {
  materializeCanonicalRelationFromAcceptedHypothesis,
} from "../../src/relations/relation-materialization.js";
import {
  materializeCanonicalEntityFromAcceptedHypothesis,
} from "../../src/entities/entity-materialization.js";
import { GraphRuntime } from "../../src/relations/graph-runtime.js";
import { TRAVERSAL_BOUNDS } from "@indago/graphology-projection";

// ============================================================================
// M-A10 Graph Projection â€” REAL Postgres round-trip through the runtime service.
//
// Proves the DERIVED Graphology graph is rebuilt from authoritative canonical
// entities + ACTIVE canonical relations for ONE case:
//   1. graph: nodes = canonical entities; edges = ACTIVE accepted relations.
//   2. traversal: bounded N-hop paths from a canonical entity (cycle-safe).
//   3. centrality: degree rank of canonical entities over accepted relations.
//   4. communities: deterministic Louvain groups over the undirected view.
//   5. case isolation: another case's relations never leak into this graph.
//   6. REVERSED relations are excluded (only living relations become edges).
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "M-A10 Graph Projection integration (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let hypothesisStore: EntityHypothesisStore;
    let pairStore: CandidatePairStore;
    let candStore: EntityMentionStore;
    let obsStore: ObservationStore;
    let entityStore: EntityStore;
    let relationStore: RelationHypothesisStore;
    let canonRelationStore: RelationStore;
    let runtime: GraphRuntime;

    const investigationId = randomUUID();
    const caseId = randomUUID();
    const otherCaseId = randomUUID();
    const sourceId = randomUUID();
    const evidenceId = randomUUID();
    const artifactId = randomUUID();

    const obsA = randomUUID();
    const obsB = randomUUID();
    const obsC = randomUUID();

    function makeSource(caseOverride: string): SourceWriteRecord {
      return {
        id: sourceId,
        caseId: caseOverride,
        investigationId,
        catalog: "MANUAL",
        declaredCatalog: "ledger",
        name: "Ledger",
        description: "Ledger export",
      };
    }

    function makeEvidence(): EvidenceWriteRecord {
      return {
        id: evidenceId,
        investigationId,
        caseId,
        operationId: randomUUID(),
        sourceId,
        sourceName: "Ledger",
        sourceDescription: "Ledger export",
        evidenceType: "FINANCIAL",
        title: "Ledger",
        description: "Monthly ledger",
        observedAt: { value: "2026-08-01T00:00:00.000Z", precision: "day" },
        artifactId,
      };
    }

    function makeObservationRow(
      obsId: string,
      content: string,
    ): Observation {
      const now = new Date().toISOString();
      return {
        id: obsId,
        evidenceId,
        sourceId,
        type: "FINANCIAL",
        content,
        entityIds: [],
        candidateMentions: [],
        strength: 0.7,
        provenance: { sourceId, artifactId, extractor: "observation-extractor@1.0.0" },
        createdAt: { value: now, precision: "exact" },
        updatedAt: { value: now, precision: "exact" },
      };
    }

    function makeCandidate(
      obsId: string,
      n: number,
      canonicalMatchValue: string,
    ): EntityMentionCandidate {
      const now = new Date().toISOString();
      return {
        id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        observationId: obsId,
        text: canonicalMatchValue,
        start: 0,
        end: 22,
        entityType: "PERSON",
        extractionMethod: "PATTERN_MATCH",
        canonicalMatchValue,
        provenance: { sourceId, artifactId, extractor: "obs@1.0.0" },
        createdAt: { value: now, precision: "exact" },
        updatedAt: { value: now, precision: "exact" },
      };
    }

    async function seedCandidate(
      obsId: string,
      n: number,
      canonicalMatchValue: string,
    ): Promise<EntityMentionCandidate> {
      const cand = makeCandidate(obsId, n, canonicalMatchValue);
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
      sharedValue: string,
    ): Promise<{ pair: CandidatePair; identityKey: string }> {
      const a = { ...left, canonicalMatchValue: sharedValue };
      const b = { ...right, canonicalMatchValue: sharedValue };
      const { drafts } = blockCandidates(
        { candidates: [a, b], caseId, investigationId },
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

    async function prepareAcceptedEntity(
      canonicalName: string,
      aN: number,
      bN: number,
      obsForA: string,
      obsForB: string,
    ): Promise<string> {
      const left = await seedCandidate(obsForA, aN, canonicalName);
      const right = await seedCandidate(obsForB, bN, canonicalName);
      const { pair, identityKey } = await buildPair(left, right, canonicalName);
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
        supportingObservationIds: [obsForA, obsForB],
        contradictingObservationIds: [],
        provenance: {
          sourceId,
          artifactId,
          extractor: "indago:resolution:engine",
          extractionMethod: RESOLUTION_SCORE_MODEL_VERSION,
        },
        createdAt: { value: now, precision: "exact" },
        updatedAt: { value: now, precision: "exact" },
      };
      await hypothesisStore.upsertHypothesis({ identityKey: hypIdentityKey, hypothesis });

      const result = await materializeCanonicalEntityFromAcceptedHypothesis(
        { caseId, investigationId, hypothesisId, actor: "test@indago" },
        {
          entityHypothesisStore: hypothesisStore,
          entityMentionStore: candStore,
          entityStore,
        },
      );
      return result.entityId;
    }

    async function upsertAndAcceptRelation(params: {
      sourceEntityId: string;
      targetEntityId: string;
      relationType: string;
      directed: boolean;
    }): Promise<string> {
      const hypothesisId = await deterministicRelationHypothesisId({
        sourceEntityId: params.sourceEntityId,
        targetEntityId: params.targetEntityId,
        relationType: params.relationType,
      });
      await relationStore.upsertHypothesis({
        id: hypothesisId,
        identityKey: buildRelationHypothesisIdentityKey({
          sourceEntityId: params.sourceEntityId,
          targetEntityId: params.targetEntityId,
          relationType: params.relationType,
        }),
        caseId,
        investigationId,
        sourceEntityId: params.sourceEntityId,
        targetEntityId: params.targetEntityId,
        relationType: params.relationType,
        support: 0.6,
        evidenceBasis: [obsA, obsB],
        contradictions: [],
        status: "PROPOSED",
        scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
        evidenceCount: 2,
        evidenceStrength: 0.6,
        sourceCoverage: 1,
        temporalCoverage: 1,
        directed: params.directed,
        provenance: { sourceId, artifactId, extractor: "indago:relation-resolution:engine" },
      });
      const result = await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId, actor: "test@indago" },
        { relationHypothesisStore: relationStore, relationStore: canonRelationStore },
      );
      return result.relationId;
    }

    let entityA: string;
    let entityB: string;
    let entityC: string;
    let entityD: string;

    function buildObservationIdentityKeyFor(o: Observation): string {
      return buildObservationIdentityKey({
        evidenceId: o.evidenceId,
        sourceId: o.sourceId,
        locationKey: serializeSourceLocation("line", { line: 1 }),
        type: o.type,
        canonicalContent: o.content,
      });
    }

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
      hypothesisStore = new EntityHypothesisStore(prisma);
      pairStore = new CandidatePairStore(prisma);
      candStore = new EntityMentionStore(prisma);
      obsStore = new ObservationStore(prisma);
      entityStore = new EntityStore(prisma);
      relationStore = new RelationHypothesisStore(prisma);
      canonRelationStore = new RelationStore(prisma);
      runtime = new GraphRuntime({
        entities: entityStore,
        relations: canonRelationStore,
      });

      await prisma.relation.deleteMany({});
      await prisma.relationHypothesis.deleteMany({});
      await prisma.entity.deleteMany({});
      await prisma.entityHypothesis.deleteMany({});
      await prisma.candidatePair.deleteMany({});
      await prisma.entityMentionCandidate.deleteMany({});
      await prisma.observation.deleteMany({});
      await prisma.evidence.deleteMany({});
      await prisma.source.deleteMany({});

      await obsStore.upsertSource(makeSource(caseId));
      await obsStore.upsertEvidence(makeEvidence());
      await obsStore.ensureObservations(
        [
          {
            identityKey: buildObservationIdentityKeyFor(makeObservationRow(obsA, "balance AAA")),
            observation: makeObservationRow(obsA, "balance AAA"),
          },
          {
            identityKey: buildObservationIdentityKeyFor(makeObservationRow(obsB, "balance BBB")),
            observation: makeObservationRow(obsB, "balance BBB"),
          },
          {
            identityKey: buildObservationIdentityKeyFor(makeObservationRow(obsC, "balance CCC")),
            observation: makeObservationRow(obsC, "balance CCC"),
          },
        ],
        { investigationId, caseId },
      );

      entityA = await prepareAcceptedEntity("graph-alice@example.org", 1, 2, obsA, obsB);
      entityB = await prepareAcceptedEntity("graph-bob@example.org", 3, 4, obsA, obsB);
      entityC = await prepareAcceptedEntity("graph-carol@example.org", 5, 6, obsB, obsC);
      entityD = await prepareAcceptedEntity("graph-dave@example.org", 7, 8, obsB, obsC);

      // Accepted relations (this case):
      //   Aâ€”B association (undirected), Bâ€”C association (undirected)
      //   Aâ†’B ownership (directed), Câ†’D family (directed), Câ€”D association (undirected)
      await upsertAndAcceptRelation({
        sourceEntityId: entityA,
        targetEntityId: entityB,
        relationType: "association",
        directed: false,
      });
      await upsertAndAcceptRelation({
        sourceEntityId: entityB,
        targetEntityId: entityC,
        relationType: "association",
        directed: false,
      });
      await upsertAndAcceptRelation({
        sourceEntityId: entityA,
        targetEntityId: entityB,
        relationType: "ownership",
        directed: true,
      });
      await upsertAndAcceptRelation({
        sourceEntityId: entityC,
        targetEntityId: entityD,
        relationType: "family",
        directed: true,
      });
      const cdAssoc = await upsertAndAcceptRelation({
        sourceEntityId: entityC,
        targetEntityId: entityD,
        relationType: "association",
        directed: false,
      });

      // A REVERSED relation Bâ€”D must be excluded from the live graph.
      const reversedId = await upsertAndAcceptRelation({
        sourceEntityId: entityB,
        targetEntityId: entityD,
        relationType: "association",
        directed: false,
      });
      await canonRelationStore.markReversed(reversedId, { caseId });

      // A foreign case's canonical relation must never leak into this graph.
      // Its endpoints are arbitrary canonical entity ids in the OTHER case;
      // they are not created as rows in THIS case, so this case's node count
      // stays exactly 4.
      const foreignSource = "ffffffff-0000-4000-8000-00000000aa01";
      const foreignTarget = "ffffffff-0000-4000-8000-00000000bb02";
      const foreignHypId = await deterministicRelationHypothesisId({
        sourceEntityId: foreignSource,
        targetEntityId: foreignTarget,
        relationType: "association",
      });
      await prisma.relation.create({
        data: {
          id: `00000001-0000-4000-8000-000000000fff`,
          relationKey: buildRelationKey({
            sourceEntityId: foreignSource,
            targetEntityId: foreignTarget,
            relationType: "association",
            directed: false,
            scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
          }),
          caseId: otherCaseId,
          investigationId,
          sourceEntityId: foreignSource,
          targetEntityId: foreignTarget,
          relationType: "association",
          directed: false,
          support: 0.6,
          evidenceBasis: [obsA, obsB],
          contradictions: [],
          status: "ACTIVE",
          scoreModelVersion: RELATION_SCORE_MODEL_VERSION,
          evidenceCount: 2,
          provenance: { sourceId, artifactId, extractor: "test" },
          hypothesisId: foreignHypId,
        },
      });

      void cdAssoc;
    }, 300_000);

    afterAll(async () => {
      await prisma.relation.deleteMany({});
      await prisma.relationHypothesis.deleteMany({});
      await prisma.entity.deleteMany({});
      await prisma.entityHypothesis.deleteMany({});
      await prisma.candidatePair.deleteMany({});
      await prisma.entityMentionCandidate.deleteMany({});
      await prisma.observation.deleteMany({});
      await prisma.evidence.deleteMany({});
      await prisma.source.deleteMany({});
      await prisma.$disconnect();
    });

    it("graph projection: nodes are canonical entities, edges ACTIVE accepted relations", async () => {
      const view = await runtime.graph({ investigationId, caseId });

      // 4 canonical entities; 5 ACTIVE edges (Aâ€”B assoc, Aâ†’B ownership, Bâ€”C assoc,
      // Câ†’D family, Câ€”D assoc) â€” REVERSED Bâ€”D and the foreign-case relation excluded.
      expect(view.nodeCount).toBe(4);
      expect(view.edgeCount).toBe(5);

      const nodeIds = new Set(view.graph.nodes());
      expect(nodeIds.has(entityA)).toBe(true);
      expect(nodeIds.has(entityB)).toBe(true);
      expect(nodeIds.has(entityC)).toBe(true);
      expect(nodeIds.has(entityD)).toBe(true);
      expect(view.graph.hasNode("00000001-0000-4000-8000-000000000fff")).toBe(false);

      // REVERSED relation Bâ€”D excluded from edges.
      const reversedRelIds = (await canonRelationStore.listByCase(caseId, {
        investigationId,
      })).filter((r) => r.status === "REVERSED").map((r) => r.id);
      for (const rid of reversedRelIds) {
        const asEdge = view.edges.find((e) => e.id === rid);
        expect(asEdge).toBeUndefined();
      }
    });

    it("traversal: bounded N-hop paths from a canonical entity, cycle-safe", async () => {
      const paths = await runtime.traversal(
        { investigationId, caseId },
        entityA,
        1,
      );

      expect(paths.length).toBeGreaterThan(0);
      for (const p of paths) {
        expect(p.startNodeId).toBe(entityA);
        expect(p.hopCount).toBeLessThanOrEqual(TRAVERSAL_BOUNDS.maxHops);
      }
      // Alice reaches Bob within one hop (association and ownership both connect).
      const reachesBInOneHop = paths.some(
        (p) => p.hopCount === 1 && p.nodes.some((n) => n.nodeId === entityB),
      );
      expect(reachesBInOneHop).toBe(true);
    });

    it("centrality: degree rank of canonical entities over accepted relations", async () => {
      const centrality = await runtime.centrality({ investigationId, caseId });

      const byNode = new Map(centrality.map((c) => [c.nodeId, c]));
      // B is incident to both Aâ€”B edges and Bâ€”C â†’ degree 3, the projection max.
      expect(byNode.get(entityB)).toBeDefined();
      expect(byNode.get(entityB)!.degree).toBe(3);
      expect(byNode.get(entityB)!.centrality).toBeCloseTo(1, 6);
      // Highest degree first.
      for (let i = 1; i < centrality.length; i++) {
        expect(centrality[i - 1]!.degree).toBeGreaterThanOrEqual(centrality[i]!.degree);
      }
    });

    it("communities: deterministic Louvain groups cover every canonical entity", async () => {
      const communities = await runtime.communities({ investigationId, caseId });
      expect(communities.length).toBeGreaterThan(0);

      const memberIds = new Set(communities.flatMap((c) => [...c.memberNodeIds]));
      expect(memberIds.has(entityA)).toBe(true);
      expect(memberIds.has(entityB)).toBe(true);
      expect(memberIds.has(entityC)).toBe(true);
      expect(memberIds.has(entityD)).toBe(true);
    });

    it("case isolation: the foreign case's ACTIVE relation is absent", async () => {
      const view = await runtime.graph({ investigationId, caseId });
      expect(view.nodeCount).toBe(4);
      const foreignEdge = view.edges.find((e) => e.id === "00000001-0000-4000-8000-000000000fff");
      expect(foreignEdge).toBeUndefined();
    });

    it("reversing an ACTIVE relation removes its edge from the live graph", async () => {
      // Read the current live edges; ensure Bâ€”C association is present now.
      const before = await runtime.graph({ investigationId, caseId });
      const beforeEdge = before.edges.find(
        (e) =>
          (e.source === entityB && e.target === entityC) ||
          (e.source === entityC && e.target === entityB),
      );
      expect(beforeEdge).toBeDefined();

      // Reverse the ACTIVE canonical Bâ€”C association (represented by the edge
      // id, which is the canonical RelationId). REVERSED != MERGED: the row
      // stays but is no longer a living graph edge.
      const reversed = await canonRelationStore.markReversed(beforeEdge!.id, { caseId });
      expect(reversed).not.toBeNull();

      const after = await runtime.graph({ investigationId, caseId });
      const afterEdge = after.edges.find(
        (e) =>
          (e.source === entityB && e.target === entityC) ||
          (e.source === entityC && e.target === entityB),
      );
      expect(afterEdge).toBeUndefined();
    });
  },
);