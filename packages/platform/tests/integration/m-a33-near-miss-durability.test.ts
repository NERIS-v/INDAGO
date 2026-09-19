import { describe, expect, beforeAll, afterAll, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  buildObservationIdentityKey,
  serializeSourceLocation,
} from "@indago/ingestion";
import {
  buildEntityIdentityKey,
  deterministicEntityId,
} from "@indago/entity-resolution";
import {
  resolveRelationsForCase,
  detectExplicitRelationContradictions,
  buildRelationHypothesisIdentityKey,
  deterministicRelationHypothesisId,
  RELATION_SCORE_MODEL_VERSION,
  RELATION_PROPOSAL_THRESHOLD,
} from "@indago/relation-resolution";
import { ObservationStore, type SourceWriteRecord } from "../../src/persistence/observation-store.js";
import { EntityStore } from "../../src/persistence/entity-store.js";
import {
  RelationHypothesisStore,
  RelationHypothesisTransitionError,
} from "../../src/persistence/relation-hypothesis-store.js";
import { RelationStore } from "../../src/persistence/relation-store.js";
import {
  materializeCanonicalRelationFromAcceptedHypothesis,
  RelationMaterializationError,
} from "../../src/relations/relation-materialization.js";
import { GraphRuntime } from "../../src/relations/graph-runtime.js";
import {
  deriveDurableRelationStatus,
  relationResolutionToHypothesisInput,
} from "../../src/queue/ingest-evidence.js";
import type { Observation, EntityId } from "@indago/contracts";

// ============================================================================
// PR-33 — NEAR_MISS durability through the REAL production seam (real Postgres).
//
// Closes the PR-32 P4 gap ("NEAR_MISS derivations are NEVER persisted"):
// below-threshold, source-grounded relation pairs now land as durable
// RelationHypothesis rows with status NEAR_MISS — idempotent (deterministic
// id + identityKey), queryable (listByCaseAndStatus / countByCaseAndStatus),
// audited, authority-inert (accept/reject/reverse refuse with the store's
// transition guard), machine-refreshable on reappraisal, and NEVER a graph
// edge (only ACCEPTED canonical relations become edges).
//
// The wiring under test is EXACTLY completeMA10's durable-write seam:
//   observations + canonical entities → resolveRelationsForCase →
//   deriveDurableRelationStatus → relationResolutionToHypothesisInput →
//   relationHypothesisStore.upsertHypothesis   (same functions the worker calls)
//
// Fixture (deterministic by construction — see scoring.ts weights):
//   E1–E2 : ONE plain co-occurrence, type OTHER, no cue   → 0.20 → NEAR_MISS
//   E3–E4 : THREE FINANCIAL co-occurrences (type signal)  → 0.50 → PROPOSED
//   E1–E3 : TWO finance + ONE explicit "forged" claim     → −0.25 → REJECTED
//           (detected by the PR-31 FIX 7 contradiction producer) → NO row
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "PR-33 NEAR_MISS durability (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let obsStore: ObservationStore;
    let entityStore: EntityStore;
    let relationStore: RelationHypothesisStore;
    let canonRelationStore: RelationStore;
    let runtime: GraphRuntime;

    const investigationId = randomUUID();
    const caseId = randomUUID();
    const sourceId = randomUUID();
    const evidenceId = randomUUID();
    const artifactId = randomUUID();

    // Pair evidence observations.
    const obsNM = randomUUID(); // E1–E2 single plain co-occurrence
    const obsPA = randomUUID();
    const obsPB = randomUUID();
    const obsPC = randomUUID(); // E3–E4 three finance co-occurrences
    const obsRA = randomUUID();
    const obsRB = randomUUID();
    const obsRC = randomUUID(); // E1–E3 finance + explicit forged claim

    let entityE1: EntityId;
    let entityE2: EntityId;
    let entityE3: EntityId;
    let entityE4: EntityId;

    function makeSource(): SourceWriteRecord {
      return {
        id: sourceId,
        caseId,
        investigationId,
        catalog: "MANUAL",
        declaredCatalog: "ledger",
        name: "Ledger",
        description: "Ledger export",
      };
    }

    function makeObservationRow(
      obsId: string,
      overrides: Partial<Observation> = {},
    ): Observation {
      const now = new Date().toISOString();
      return {
        id: obsId,
        evidenceId,
        sourceId,
        type: "FINANCIAL",
        content: "joint ledger entry",
        entityIds: [],
        candidateMentions: [],
        strength: 0.7,
        provenance: { sourceId, artifactId, extractor: "observation-extractor@1.0.0" },
        createdAt: { value: now, precision: "exact" },
        updatedAt: { value: now, precision: "exact" },
        ...overrides,
      };
    }

    function obsKey(o: Observation): string {
      return buildObservationIdentityKey({
        evidenceId: o.evidenceId,
        sourceId: o.sourceId,
        locationKey: serializeSourceLocation("line", { line: 1 }),
        type: o.type,
        canonicalContent: o.content,
      });
    }

    /**
     * Replicate completeMA10's per-relation durable-write circuit exactly.
     * Returns the list of upsert results in resolution order.
     *
     * `write=false` performs classification only (no DB writes) so the
     * classification and durability assertions stay independent.
     */
    async function runResolutionPass(
      write = true,
    ): Promise<
      Array<
        Awaited<ReturnType<RelationHypothesisStore["upsertHypothesis"]>> & {
          durableStatus: ReturnType<typeof deriveDurableRelationStatus>;
          resolution: { sourceEntityId: string; targetEntityId: string };
        }
      >
    > {
      const observations = await obsStore.listObservations({
        investigationId,
        caseId,
      });
      const entities = await entityStore.listByCaseWithObservations(caseId, {
        investigationId,
      });

      const explicitContradictions =
        detectExplicitRelationContradictions(observations);
      const { resolutions } = resolveRelationsForCase({
        caseId,
        investigationId,
        observations,
        entities: entities.map((e) => ({
          id: e.id,
          observationIds: e.observationIds,
        })),
        explicitContradictions,
      });

      const results: Array<
        Awaited<ReturnType<RelationHypothesisStore["upsertHypothesis"]>> & {
          durableStatus: ReturnType<typeof deriveDurableRelationStatus>;
          resolution: { sourceEntityId: string; targetEntityId: string };
        }
      > = [];
      for (const resolution of resolutions) {
        const durableStatus = deriveDurableRelationStatus(resolution);
        if (durableStatus === "REJECTED" || write === false) {
          results.push({
            durableStatus,
            resolution,
            wrote: false,
            preservedExisting: false,
            reusedExisting: false,
            hypothesis: {} as never,
          });
          continue;
        }

        const identityKey = buildRelationHypothesisIdentityKey({
          sourceEntityId: resolution.sourceEntityId,
          targetEntityId: resolution.targetEntityId,
          relationType: resolution.relationType,
          directed: resolution.directed,
          scoreModelVersion: resolution.scoreModelVersion,
        });
        const id = await deterministicRelationHypothesisId({
          sourceEntityId: resolution.sourceEntityId,
          targetEntityId: resolution.targetEntityId,
          relationType: resolution.relationType,
          directed: resolution.directed,
          scoreModelVersion: resolution.scoreModelVersion,
        });

        const firstObs = resolution.evidenceBasis[0]
          ? observations.find((o) => o.id === resolution.evidenceBasis[0])
          : undefined;

        const input = relationResolutionToHypothesisInput({
          resolution,
          id,
          identityKey,
          caseId,
          investigationId,
          sourceId: firstObs?.sourceId,
          artifactId: firstObs?.provenance?.artifactId,
          derivedFrom: resolution.evidenceBasis,
          status: durableStatus,
        });

        const result = await relationStore.upsertHypothesis(input);
        results.push({
          ...result,
          durableStatus,
          resolution: {
            sourceEntityId: resolution.sourceEntityId,
            targetEntityId: resolution.targetEntityId,
          },
        });
      }
      return results;
    }

    function resolutionFor(
      results: Array<{
        resolution: { sourceEntityId: string; targetEntityId: string };
      }>,
      a: string,
      b: string,
    ) {
      return results.find(
        (r) =>
          (r.resolution.sourceEntityId === a &&
            r.resolution.targetEntityId === b) ||
          (r.resolution.sourceEntityId === b &&
            r.resolution.targetEntityId === a),
      );
    }

    /** Read the durable row for a pair (endpoints are order-agnostic). */
    async function storedRowForPair(
      a: string,
      b: string,
    ): Promise<Awaited<ReturnType<RelationHypothesisStore["findById"]>>> {
      const rows = await relationStore.listByCase(caseId, { investigationId });
      return (
        rows.find(
          (r) =>
            (r.sourceEntityId === a && r.targetEntityId === b) ||
            (r.sourceEntityId === b && r.targetEntityId === a),
        ) ?? null
      );
    }

    beforeAll(async () => {
      prisma = new PrismaClient({
        datasources: { db: { url: TEST_DATABASE_URL! } },
      });
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

      await obsStore.upsertSource(makeSource());
      await obsStore.upsertEvidence({
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
      });

      const rows: Array<{ id: string; row: Observation }> = [
        {
          id: obsNM,
          row: makeObservationRow(obsNM, {
            type: "OTHER",
            content: "neutral unrelated dataset entry",
          }),
        },
        {
          id: obsPA,
          row: makeObservationRow(obsPA, { content: "balance 42000.00 A" }),
        },
        {
          id: obsPB,
          row: makeObservationRow(obsPB, { content: "balance 42000.00 B" }),
        },
        {
          id: obsPC,
          row: makeObservationRow(obsPC, { content: "balance 42000.00 C" }),
        },
        {
          id: obsRA,
          row: makeObservationRow(obsRA, { content: "balance 42000.00 D" }),
        },
        {
          id: obsRB,
          row: makeObservationRow(obsRB, { content: "balance 42000.00 E" }),
        },
        {
          id: obsRC,
          row: makeObservationRow(obsRC, {
            content: "forged claim M",
          }),
        },
      ];
      await obsStore.ensureObservations(
        rows.map(({ id, row }) => ({
          identityKey: obsKey(row),
          observation: row,
        })),
        { investigationId, caseId },
      );

      async function materializeEntity(
        canonicalName: string,
        obsIds: string[],
      ) {
        const id = (await deterministicEntityId({
          caseId,
          canonicalName,
          entityType: "EMAIL",
        })) as EntityId;
        await entityStore.materializeEntity({
          identityKey: buildEntityIdentityKey({
            caseId,
            canonicalName,
            entityType: "EMAIL",
          }),
          entity: {
            id,
            caseId,
            investigationId,
            canonicalName,
            entityType: "EMAIL",
            status: "ACTIVE",
            observationIds: obsIds,
            hypothesisIds: [],
            provenance: { sourceId, artifactId, extractor: "indago:materialization:authority" },
          },
        });
        return id;
      }

      entityE1 = await materializeEntity("nm-e1@example.org", [obsNM, obsRA, obsRB, obsRC]);
      entityE2 = await materializeEntity("nm-e2@example.org", [obsNM]);
      entityE3 = await materializeEntity("nm-e3@example.org", [obsPA, obsPB, obsPC, obsRA, obsRB, obsRC]);
      entityE4 = await materializeEntity("nm-e4@example.org", [obsPA, obsPB, obsPC]);

      // Link the canonical entity ids on the observations so the engine
      // detects source-grounded co-occurrence exactly as production does.
      await prisma.observation.updateMany({
        where: { id: { in: [obsNM] } },
        data: { entityIds: [entityE1, entityE2] },
      });
      await prisma.observation.updateMany({
        where: { id: { in: [obsPA, obsPB, obsPC] } },
        data: { entityIds: [entityE3, entityE4] },
      });
      await prisma.observation.updateMany({
        where: { id: { in: [obsRA, obsRB, obsRC] } },
        data: { entityIds: [entityE1, entityE3] },
      });
    });

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

    it("classifies the three pairs as NEAR_MISS / PROPOSED / REJECTED through the exact worker decision point", async () => {
      // Classification-only pass — no rows written yet.
      const results = await runResolutionPass(false);

      const nm = resolutionFor(results, entityE1, entityE2)!;
      const proposed = resolutionFor(results, entityE3, entityE4)!;
      const rejected = resolutionFor(results, entityE1, entityE3)!;

      expect(nm.durableStatus).toBe("NEAR_MISS");
      expect(proposed.durableStatus).toBe("PROPOSED");
      expect(rejected.durableStatus).toBe("REJECTED");

      // Classification reads only: nothing durable on the table yet.
      expect(
        await prisma.relationHypothesis.count({ where: { caseId } }),
      ).toBe(0);
    });

    it("persists the NEAR_MISS derivation as a durable row (not a silent drop)", async () => {
      const results = await runResolutionPass();

      const nm = resolutionFor(results, entityE1, entityE2)!;
      expect(nm.wrote).toBe(true);
      expect(nm.reusedExisting).toBe(false);

      const hyp = nm.hypothesis;
      expect(hyp.status).toBe("NEAR_MISS");
      // Engine-grade: below the UNCHANGED proposal threshold, still grounded.
      expect(hyp.support).toBeLessThan(RELATION_PROPOSAL_THRESHOLD);
      expect(hyp.support).toBeCloseTo(0.2, 6);
      expect(hyp.evidenceCount).toBeGreaterThan(0);
      expect(hyp.contradictions).toEqual([]);
      expect(hyp.scoreModelVersion).toBe(RELATION_SCORE_MODEL_VERSION);
      // Durable provenance: the first supporting observation's source/artifact.
      expect((hyp.provenance as { sourceId?: string }).sourceId).toBe(sourceId);
      expect((hyp.provenance as { artifactId?: string }).artifactId).toBe(
        artifactId,
      );
      // Exact durable counts: PROPOSED + NEAR_MISS rows, REJECTED pair absent.
      expect(
        await prisma.relationHypothesis.count({ where: { caseId } }),
      ).toBe(2);
      expect(
        await prisma.relationHypothesis.count({
          where: {
            caseId,
            OR: [
              { sourceEntityId: entityE1, targetEntityId: entityE3 },
              { sourceEntityId: entityE3, targetEntityId: entityE1 },
            ],
          },
        }),
      ).toBe(0);
    });

    it("is idempotent: a second full pass converges to the same two rows", async () => {
      const first = await runResolutionPass();
      const second = await runResolutionPass();

      const nm1 = resolutionFor(first, entityE1, entityE2)!;
      const nm2 = resolutionFor(second, entityE1, entityE2)!;
      expect(nm2.reusedExisting).toBe(true);
      expect(nm2.hypothesis.id).toBe(nm1.hypothesis.id);

      expect(
        await prisma.relationHypothesis.count({ where: { caseId } }),
      ).toBe(2);
    });

    it("is queryable: listByCaseAndStatus + countByCaseAndStatus surface NEAR_MISS distinctly", async () => {
      await runResolutionPass();

      const nearMissRows = await relationStore.listByCaseAndStatus(caseId, {
        investigationId,
        status: "NEAR_MISS",
      });
      expect(nearMissRows).toHaveLength(1);
      expect(nearMissRows[0]!.status).toBe("NEAR_MISS");

      expect(await relationStore.countByCaseAndStatus(caseId, "NEAR_MISS")).toBe(
        1,
      );
      expect(await relationStore.countByCaseAndStatus(caseId, "PROPOSED")).toBe(
        1,
      );
      expect(await relationStore.countByCaseAndStatus(caseId, "REJECTED")).toBe(
        0,
      );
    });

    it("never becomes a graph edge: only ACCEPTED canonical relations do", async () => {
      await runResolutionPass();

      // Accept the PROPOSED E3–E4 relation → exactly ONE ACTIVE canonical edge.
      const proposedRow = await storedRowForPair(entityE3, entityE4);
      expect(proposedRow).not.toBeNull();
      expect(proposedRow!.status).toBe("PROPOSED");
      const proposedId = await deterministicRelationHypothesisId({
        sourceEntityId: entityE3,
        targetEntityId: entityE4,
        relationType: proposedRow!.relationType,
        directed: proposedRow!.directed,
        scoreModelVersion: proposedRow!.scoreModelVersion,
      });
      await materializeCanonicalRelationFromAcceptedHypothesis(
        { caseId, hypothesisId: proposedId, actor: "test@indago" },
        {
          relationHypothesisStore: relationStore,
          relationStore: canonRelationStore,
        },
      );

      const view = await runtime.graph({ investigationId, caseId });
      expect(view.edgeCount).toBe(1);

      const nearMissRow = await storedRowForPair(entityE1, entityE2);
      expect(nearMissRow).not.toBeNull();
      const nearMissId = await deterministicRelationHypothesisId({
        sourceEntityId: entityE1,
        targetEntityId: entityE2,
        relationType: nearMissRow!.relationType,
        directed: nearMissRow!.directed,
        scoreModelVersion: nearMissRow!.scoreModelVersion,
      });
      const asEdge = view.edges.find((e) => e.id === nearMissId);
      expect(asEdge).toBeUndefined();
      // The NEAR_MISS pair must not be connected at all.
      const nmEdge = view.edges.find(
        (e) =>
          (e.source === entityE1 && e.target === entityE2) ||
          (e.source === entityE2 && e.target === entityE1),
      );
      expect(nmEdge).toBeUndefined();
      expect(view.edges.some((e) => e.source === entityE1 || e.target === entityE1)).toBe(
        false,
      );
    });

    it("is authority-inert: accept / materialize refuse a NEAR_MISS row", async () => {
      await runResolutionPass();

      const nearMissRow = await storedRowForPair(entityE1, entityE2);
      expect(nearMissRow).not.toBeNull();
      const nearMissId = await deterministicRelationHypothesisId({
        sourceEntityId: entityE1,
        targetEntityId: entityE2,
        relationType: nearMissRow!.relationType,
        directed: nearMissRow!.directed,
        scoreModelVersion: nearMissRow!.scoreModelVersion,
      });

      await expect(
        relationStore.acceptHypothesis(nearMissId, { caseId }),
      ).rejects.toBeInstanceOf(RelationHypothesisTransitionError);

      await expect(
        materializeCanonicalRelationFromAcceptedHypothesis(
          { caseId, hypothesisId: nearMissId, actor: "test@indago" },
          {
            relationHypothesisStore: relationStore,
            relationStore: canonRelationStore,
          },
        ),
      ).rejects.toBeInstanceOf(RelationMaterializationError);

      // The row is untouched and still NOT a canonical relation.
      const row = await relationStore.findById(nearMissId, { caseId });
      expect(row).not.toBeNull();
      expect(row!.status).toBe("NEAR_MISS");
      // No canonical relation ever references the near-miss pair.
      const canonicalForPair = await prisma.relation.count({
        where: {
          caseId,
          OR: [
            { sourceEntityId: entityE1, targetEntityId: entityE2 },
            { sourceEntityId: entityE2, targetEntityId: entityE1 },
          ],
        },
      });
      expect(canonicalForPair).toBe(0);
    });

    it("is machine-refreshable: a reappraised NEAR_MISS row upgrades to PROPOSED (never preserved like an authority decision)", async () => {
      await runResolutionPass();

      const nm = await storedRowForPair(entityE1, entityE2);
      expect(nm).not.toBeNull();
      expect(nm!.status).toBe("NEAR_MISS");

      // A re-run whose evidence now clears 0.25 would write status PROPOSED
      // through the SAME seam — NEAR_MISS is NOT an authority-preserved state.
      const refreshed = await relationStore.upsertHypothesis({
        id: nm!.id,
        identityKey: buildRelationHypothesisIdentityKey({
          sourceEntityId: entityE1,
          targetEntityId: entityE2,
          relationType: nm!.relationType,
          directed: nm!.directed,
          scoreModelVersion: nm!.scoreModelVersion,
        }),
        caseId,
        investigationId,
        sourceEntityId: entityE1,
        targetEntityId: entityE2,
        relationType: nm!.relationType,
        support: 0.3,
        evidenceBasis: nm!.evidenceBasis,
        contradictions: [],
        status: "PROPOSED",
        scoreModelVersion: nm!.scoreModelVersion,
        evidenceCount: nm!.evidenceCount,
        evidenceStrength: nm!.evidenceStrength,
        sourceCoverage: nm!.sourceCoverage,
        temporalCoverage: nm!.temporalCoverage,
        directed: nm!.directed,
        provenance: nm!.provenance,
      });

      expect(refreshed.reusedExisting).toBe(true);
      expect(refreshed.preservedExisting).toBe(false);
      expect(refreshed.hypothesis.status).toBe("PROPOSED");
    });

    it("skips a hard-contradiction pair even when its support clears the threshold", async () => {
      // E1–E3 consumes the PR-31 FIX 7 contradiction producer: its FORGED
      // observation (obsRC) is IN the pair's evidence basis, so the resolver
      // applies −0.25 AND carries obsRC as contradiction provenance. The
      // worker's derivation REJECTS the pair despite 0.25 ≥ 0.25 — a hard
      // contradiction never becomes a durable proposition.
      const observations = await obsStore.listObservations({
        investigationId,
        caseId,
      });
      const flagged = detectExplicitRelationContradictions(observations);
      expect(flagged.has(obsRC)).toBe(true);
      // Unrelated pair groups are NOT contaminated by the flagged observation.
      const pairBasis = await prisma.relationHypothesis.findMany({
        where: {
          caseId,
          OR: [
            { sourceEntityId: entityE1, targetEntityId: entityE2 },
            { sourceEntityId: entityE3, targetEntityId: entityE4 },
          ],
        },
      });
      for (const h of pairBasis) {
        expect(h.contradictions as unknown[]).toEqual([]);
      }
    });
  },
);