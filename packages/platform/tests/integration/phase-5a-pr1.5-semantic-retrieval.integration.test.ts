import { describe, expect, beforeAll, afterAll, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

import {
  DeterministicEmbeddingProvider,
  deterministicVectorFor,
  canonicalizeSemanticText,
  contentHashOf,
  EmbeddingPipeline,
  SemanticSearchService,
} from "@indago/semantic-retrieval";
import type { EmbeddingProvider } from "@indago/semantic-retrieval";
import type { SemanticTextUnit, TemporalInterval, EmbeddingProviderHealth } from "@indago/contracts";

import { SemanticTextUnitStore } from "../../src/persistence/semantic-text-unit-store.js";
import { PostgresEmbeddingRepository } from "../../src/persistence/embedding-repository.js";
import { PostgresSemanticSearchRepository } from "../../src/persistence/semantic-search-repository.js";

// ============================================================================
// Phase 5A-PR1.5 — semantic-retrieval integration (real Postgres + pgvector)
//
// Uses DeterministicEmbeddingProvider (768-dim, test-only) to exercise the
// full stack offline. Coverage matrix:
//   - embedding pipeline idempotency (re-run = ZERO provider calls)
//   - determinism (same query → same order)
//   - threshold filtering
//   - TRUE closed-interval TEMPORAL OVERLAP:
//       stored 03-01→03-31 + query 03-15→04-15  ⇒ RETAINED
//       stored 03-01→03-31 + query 04-01→04-30  ⇒ EXCLUDED
//       stored-contains-query / query-contains-stored / left+right partial /
//       exact boundary touch / open lower+upper stored bounds / NULL scope
//   - IDENTITY correctness (mutable caseId+sourceType+sourceId row):
//       update ⇒ contentHash changes, ONLY the stale unit re-embeds,
//       stale embedding excluded from search, current embedding searchable
//   - PROVIDER isolation (identity-scoped vectors; modelVersion swap yields
//       empty results until vectors exist for that identity)
//   - CASE isolation (identical text, identical vector, identical sourceId in
//       another case never appears)
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const exact = (iso: string) => ({ value: iso, precision: "exact" } as const);
const interval = (
  fromIso: string,
  toIso: string | null,
): TemporalInterval => ({
  validFrom: exact(fromIso),
  ...(toIso === null ? {} : { validTo: exact(toIso) }),
  precision: "exact",
  semantics: "observed",
});

const DIMS = 768;

// The SemanticTextUnit contract requires BOTH the durable row id AND sourceId
// to be UUIDs. Tests still describe units by readable tokens (u1, t-left, …);
// sid(token) maps a token to a deterministic UUID so the SAME token in
// DIFFERENT cases yields the SAME sourceId (what the case-isolation test
// needs), while every stored value stays contract-valid.
const sourceIdTokens = new Map<string, string>();
function sid(token: string): string {
  let mapped = sourceIdTokens.get(token);
  if (mapped === undefined) {
    const digest = createHash("sha256").update(`indago:test-unit:${token}`, "utf8").digest();
    const bytes = Array.from(digest.subarray(0, 16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
    mapped = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    sourceIdTokens.set(token, mapped);
  }
  return mapped;
}
function tokenOf(sourceId: string): string {
  for (const [token, mapped] of sourceIdTokens) {
    if (mapped === sourceId) return token;
  }
  return sourceId;
}

describe.skipIf(!TEST_DATABASE_URL)(
  "Phase 5A-PR1.5 semantic-retrieval (real Postgres + pgvector)",
  () => {
    let prisma: PrismaClient;
    let unitStore: SemanticTextUnitStore;
    let embeddingRepo: PostgresEmbeddingRepository;
    let searchRepo: PostgresSemanticSearchRepository;
    let provider: DeterministicEmbeddingProvider;
    let pipeline: EmbeddingPipeline;
    let service: SemanticSearchService;

    const caseId = randomUUID();
    const foreignCaseId = randomUUID();
    const temporalCaseId = randomUUID();
    const providerCaseId = randomUUID();
    let foreignSameId: SemanticTextUnit;

    function makeUnit(
      overrides: Partial<SemanticTextUnit> & { id: string; normalizedText: string },
    ): SemanticTextUnit {
      const { id: sortKey, ...rest } = overrides;
      const canonical = canonicalizeSemanticText(rest.normalizedText);
      const contentHash = contentHashOf(canonical);
      return {
        id: randomUUID(), // durable row id (UUID-shaped, contract-valid)
        caseId,
        sourceType: "OBSERVATION",
        sourceId: rest.sourceId ?? sid(sortKey),
        normalizedText: canonical,
        contentHash,
        ...rest,
      } as SemanticTextUnit;
    }

    function makeRawStoredInterval(partial: Record<string, unknown>) {
      // Mirrors the JSONB shape the repository reads; endpoint values are
      // pulled from `->>'value'` so the stored key must be nested under
      // { value } (same shape TemporalIntervalSchema produces).
      return { precision: "exact", semantics: "observed", ...partial };
    }

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
      unitStore = new SemanticTextUnitStore(prisma);
      embeddingRepo = new PostgresEmbeddingRepository(prisma);
      searchRepo = new PostgresSemanticSearchRepository(prisma);
      provider = new DeterministicEmbeddingProvider(DIMS);
      pipeline = new EmbeddingPipeline(
        { provider, repository: embeddingRepo },
        { pipeline: { batchSize: 16, concurrency: 2, maxRetries: 2, retryBaseDelayMs: 0 } },
      );
      service = new SemanticSearchService({ provider, repository: searchRepo });

      // Clean slate
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "SemanticEmbedding" CASCADE');
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "SemanticTextUnit" CASCADE');
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    // -----------------------------------------------------------------------
    // Core embedding pipeline + determinism
    // -----------------------------------------------------------------------

    it("embeds units and reports counts", async () => {
      const units = [
        makeUnit({ id: "u1", normalizedText: "Wire transfer of 5000 USD from Alice to Bob on 2024-07-03" }),
        makeUnit({ id: "u2", normalizedText: "Monthly electricity bill payment for July 2024" }),
        makeUnit({ id: "u3", normalizedText: "Credit card statement showing international charges" }),
      ];

      const persisted = await unitStore.upsertMany(units);
      expect(persisted).toBe(3);

      const report = await pipeline.embedUnits(units, { caseId });
      expect(report.requested).toBe(3);
      expect(report.skipped).toBe(0);
      expect(report.embedded).toBe(3);
    });

    it("second run is idempotent — zero embedded, zero provider calls", async () => {
      const units = await unitStore.findByCase(caseId);
      expect(units.length).toBe(3);

      const report = await pipeline.embedUnits(units, { caseId });
      expect(report.requested).toBe(3);
      expect(report.skipped).toBe(0);
      expect(report.embedded).toBe(0);
      expect(report.unchanged).toBe(3);
    });

    it("returns same results in same order for identical query", async () => {
      const r1 = await service.retrieve({ caseId, query: "wire transfer alice bob" });
      const r2 = await service.retrieve({ caseId, query: "wire transfer alice bob" });

      expect(r1.results.length).toBeGreaterThan(0);
      expect(r2.results.length).toBe(r1.results.length);
      expect(r2.results.map((r) => r.semanticTextUnitId)).toEqual(
        r1.results.map((r) => r.semanticTextUnitId),
      );
    });

    it("threshold 1.0 returns zero results (no non-identical text is perfectly self-similar)", async () => {
      const result = await service.retrieve({
        caseId,
        query: "monthly electricity bill",
        threshold: 1.0,
      });
      expect(result.results.length).toBe(0);
    });

    // -----------------------------------------------------------------------
    // Case isolation
    // -----------------------------------------------------------------------

    it("cross-case vectors never leak — identical text, identical vector, identical triple-sourceId", async () => {
      // Same sourceId as the domestic u1, IDENTICAL text (→ identical
      // deterministic vector) and identical contentHash, but a DIFFERENT case
      // and therefore a DIFFERENT durable row id (identity = caseId +
      // sourceType + sourceId).
      foreignSameId = makeUnit({
        caseId: foreignCaseId,
        id: "foreign-same-u1",
        sourceId: sid("u1"),
        normalizedText: "Wire transfer of 5000 USD from Alice to Bob on 2024-07-03",
      });
      await unitStore.upsertMany([foreignSameId]);
      await pipeline.embedUnits([foreignSameId], { caseId: foreignCaseId });

      const result = await service.retrieve({ caseId, query: "wire transfer alice bob" });
      // Exactly the domestic twin survives case isolation: an identical-vector
      // foreign row would otherwise surface as a second sourceId 'u1' hit.
      expect(result.results.filter((r) => r.sourceId === sid("u1"))).toHaveLength(1);
      // The foreign unit (row id) can never be a hit of a domestic search.
      expect(result.results.map((r) => r.semanticTextUnitId)).not.toContain(
        foreignSameId.id,
      );
    });

    it("relationship stays symmetric: querying the foreign case returns only its own units", async () => {
      const result = await service.retrieve({ caseId: foreignCaseId, query: "wire transfer alice bob" });
      expect(result.caseId).toBe(foreignCaseId);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.sourceId).toBe(sid("u1"));
      expect(result.results[0]!.semanticTextUnitId).toBe(foreignSameId.id);
    });

    // -----------------------------------------------------------------------
    // Temporal overlap — TRUE closed-interval overlap
    // -----------------------------------------------------------------------

    async function seedTemporal(
      sourceId: string,
      scope: TemporalInterval | null,
    ): Promise<void> {
      const unit = makeUnit({
        caseId: temporalCaseId,
        id: sourceId,
        sourceId: sid(sourceId),
        normalizedText: `Payment received for consulting services (${sourceId}) in March 2024`,
        ...(scope === null ? { temporalScope: null } : { temporalScope: scope }),
      });
      await unitStore.upsertMany([unit]);
      await pipeline.embedUnits([unit], { caseId: temporalCaseId });
    }

    async function temporalSearch(queryScope: TemporalInterval, query: string): Promise<readonly string[]> {
      const result = await service.retrieve({
        caseId: temporalCaseId,
        query,
        temporalContext: queryScope,
      });
      return result.results.map((r) => tokenOf(r.sourceId));
    }

    it("required case A: stored 03-01→03-31 + query 03-15→04-15 ⇒ RETAINED", async () => {
      await seedTemporal("t-left", interval("2024-03-01T00:00:00.000Z", "2024-03-31T23:59:59.999Z"));
      const ids = await temporalSearch(
        interval("2024-03-15T00:00:00.000Z", "2024-04-15T23:59:59.999Z"),
        "consulting services payment march",
      );
      expect(ids).toContain("t-left");
    });

    it("required case B: stored 03-01→03-31 + query 04-01→04-30 ⇒ EXCLUDED", async () => {
      const ids = await temporalSearch(
        interval("2024-04-01T00:00:00.000Z", "2024-04-30T23:59:59.999Z"),
        "consulting services payment march",
      );
      expect(ids).not.toContain("t-left");
    });

    it("stored interval CONTAINS query window ⇒ overlap", async () => {
      await seedTemporal("t-contains", interval("2024-01-01T00:00:00.000Z", "2024-06-30T23:59:59.999Z"));
      const ids = await temporalSearch(
        interval("2024-03-01T00:00:00.000Z", "2024-03-31T23:59:59.999Z"),
        "consulting services payment march",
      );
      expect(ids).toContain("t-contains");
    });

    it("query window CONTAINS stored interval ⇒ overlap", async () => {
      await seedTemporal("t-contained", interval("2024-03-01T00:00:00.000Z", "2024-03-31T23:59:59.999Z"));
      const ids = await temporalSearch(
        interval("2024-02-01T00:00:00.000Z", "2024-04-30T23:59:59.999Z"),
        "consulting services payment march",
      );
      expect(ids).toContain("t-contained");
    });

    it("left partial overlap (query ends inside stored) ⇒ overlap", async () => {
      await seedTemporal("t-left-partial", interval("2024-03-01T00:00:00.000Z", "2024-05-31T23:59:59.999Z"));
      const ids = await temporalSearch(
        interval("2024-04-01T00:00:00.000Z", "2024-04-30T23:59:59.999Z"),
        "consulting services payment march",
      );
      expect(ids).toContain("t-left-partial");
    });

    it("right partial overlap (query starts inside stored) ⇒ overlap", async () => {
      await seedTemporal("t-right-partial", interval("2024-03-01T00:00:00.000Z", "2024-04-30T23:59:59.999Z"));
      const ids = await temporalSearch(
        interval("2024-04-15T00:00:00.000Z", "2024-06-30T23:59:59.999Z"),
        "consulting services payment march",
      );
      expect(ids).toContain("t-right-partial");
    });

    it("stored interval fully BEFORE query ⇒ excluded", async () => {
      const ids = await temporalSearch(
        interval("2024-06-01T00:00:00.000Z", "2024-06-30T23:59:59.999Z"),
        "consulting services payment march",
      );
      expect(ids).not.toContain("t-right-partial");
    });

    it("stored interval fully AFTER query ⇒ excluded", async () => {
      await seedTemporal("t-after", interval("2024-08-01T00:00:00.000Z", "2024-08-31T23:59:59.999Z"));
      const ids = await temporalSearch(
        interval("2024-06-01T00:00:00.000Z", "2024-06-30T23:59:59.999Z"),
        "consulting services payment march",
      );
      expect(ids).not.toContain("t-after");
    });

    it("exact boundary touch on the LEFT counts as overlap (touch semantics)", async () => {
      await seedTemporal("t-touch-left", interval("2024-03-01T00:00:00.000Z", "2024-03-31T23:59:59.999Z"));
      // Query ends EXACTLY where the stored interval begins.
      const ids = await temporalSearch(
        interval("2024-02-01T00:00:00.000Z", "2024-03-01T00:00:00.000Z"),
        "consulting services payment march",
      );
      expect(ids).toContain("t-touch-left");
    });

    it("exact boundary touch on the RIGHT counts as overlap (touch semantics)", async () => {
      // Query STARTS exactly at the stored interval end.
      const ids = await temporalSearch(
        interval("2024-03-31T00:00:00.000Z", "2024-04-30T23:59:59.999Z"),
        "consulting services payment march",
      );
      expect(ids).toContain("t-touch-left");
    });

    it("missing stored validTo = open upper bound ⇒ retained when overlapping", async () => {
      await seedTemporal("t-open-up", interval("2024-03-01T00:00:00.000Z", null));
      const ids = await temporalSearch(
        interval("2024-03-15T00:00:00.000Z", "2024-04-15T23:59:59.999Z"),
        "consulting services payment march",
      );
      expect(ids).toContain("t-open-up");
    });

    it("missing stored validFrom = open lower bound ⇒ retained when overlapping", async () => {
      // TemporalIntervalSchema requires validFrom on the typed boundary, so
      // inject the open-lower-bound JSONB directly (the repository must treat
      // a missing stored endpoint as open — same shape a legacy row could hold).
      const sourceId = "t-open-low";
      const unit = makeUnit({
        caseId: temporalCaseId,
        id: sourceId,
        sourceId: sid(sourceId),
        normalizedText: `Payment received for consulting services (${sourceId}) in March 2024`,
        temporalScope: interval("2024-03-01T00:00:00.000Z", "2024-03-31T23:59:59.999Z"),
      });
      await unitStore.upsertMany([unit]);
      await pipeline.embedUnits([unit], { caseId: temporalCaseId });
      const partial = JSON.stringify(makeRawStoredInterval({
        validTo: exact("2024-03-31T23:59:59.999Z"),
      }));
      await prisma.$executeRawUnsafe(
        `UPDATE "SemanticTextUnit" SET "temporalScope" = '${partial}'::jsonb WHERE "id" = '${unit.id}'`,
      );

      const ids = await temporalSearch(
        interval("2024-03-15T00:00:00.000Z", "2024-04-15T23:59:59.999Z"),
        "consulting services payment march",
      );
      expect(ids).toContain(sourceId);
    });

    it("NULL temporalScope is UNCONSTRAINED pass-through under a filter window", async () => {
      await seedTemporal("t-null", null);
      const ids = await temporalSearch(
        interval("2024-01-01T00:00:00.000Z", "2024-12-31T23:59:59.999Z"),
        "consulting services",
      );
      expect(ids).toContain("t-null");
    });

    // -----------------------------------------------------------------------
    // Identity correctness — mutable (caseId, sourceType, sourceId) row
    // -----------------------------------------------------------------------

    it("updating the same triple updates contentHash in place", async () => {
      const units = await unitStore.findByCase(caseId);
      const before = units.find((u) => u.sourceId === sid("u1"));
      expect(before).toBeDefined();
      const beforeU = before!;
      await expect(unitStore.findById(beforeU.id)).resolves.toEqual(beforeU);

      const updated: SemanticTextUnit = {
        ...beforeU,
        normalizedText: "Wire transfer of 5000 USD from Alice to Bob on 2024-07-05 — revised date",
        contentHash: contentHashOf(canonicalizeSemanticText(
          "Wire transfer of 5000 USD from Alice to Bob on 2024-07-05 — revised date",
        )),
      };
      const persisted = await unitStore.upsert(updated);
      expect(persisted.id).toBe(beforeU.id); // same row, same id
      expect(persisted.contentHash).not.toBe(beforeU.contentHash);
      expect(persisted.normalizedText).toBe(updated.normalizedText);

      const stored = await unitStore.findById(beforeU.id);
      expect(stored!.contentHash).toBe(updated.contentHash);
    });

    it("re-embeds only the stale unit; current units untouched", async () => {
      const units = await unitStore.findByCase(caseId);
      expect(units.length).toBe(3);

      const report = await pipeline.embedUnits(units, { caseId });
      expect(report.embedded).toBe(1); // only the revised u1
      expect(report.unchanged).toBe(2);
    });

    it("stale embedding is EXCLUDED, current embedding is searchable", async () => {
      // u1 is now current for the revised text; the stale vector (old hash)
      // for the same unit id must never be returned.
      const result = await service.retrieve({ caseId, query: "wire transfer alice bob" });
      const stale = result.results.filter((r) => r.sourceId === sid("u1"));
      expect(stale.length).toBeGreaterThan(0);
      for (const hit of stale) {
        expect(hit.contentHash).toBe(
          contentHashOf(canonicalizeSemanticText(
            "Wire transfer of 5000 USD from Alice to Bob on 2024-07-05 — revised date",
          )),
        );
      }

      // Direct SQL proof: the embedding row contentHash must equal the unit's.
      const rows = await prisma.$queryRaw<Array<{ contentHash: string }>>`
        SELECT e."contentHash"
        FROM "SemanticEmbedding" e
        JOIN "SemanticTextUnit" u ON u."id" = e."semanticTextUnitId"
        WHERE u."caseId" = ${caseId}
          AND u."sourceId" = ${sid("u1")}
      `;
      expect(rows).toHaveLength(1);
    });

    // -----------------------------------------------------------------------
    // Provider isolation — identity-scoped vectors
    // -----------------------------------------------------------------------

    it("vectors for one provider identity cannot satisfy a search for another identity", async () => {
      const unit = makeUnit({
        caseId: providerCaseId,
        id: "p1",
        normalizedText: "Invoice INV-2024-118 for consulting delivered in March",
      });
      await unitStore.upsertMany([unit]);
      await pipeline.embedUnits([unit], { caseId: providerCaseId });

      // Different modelVersion ⇒ different identity slot ⇒ NO vectors yet.
      const providerV2: EmbeddingProvider = {
        identity: {
          providerId: "deterministic-test",
          modelId: "deterministic",
          modelVersion: "v2",
          dimensions: DIMS,
          embeddingPolicyVersion: "v1",
        },
        embedQuery: async (text) => deterministicVectorFor(text, DIMS),
        embedDocuments: async (texts) => texts.map((text) => deterministicVectorFor(text, DIMS)),
        healthCheck: async (): Promise<EmbeddingProviderHealth> => ({
          providerId: "deterministic-test",
          modelId: "deterministic",
          modelVersion: "v2",
          dimensions: DIMS,
          healthy: true,
        }),
      };
      const serviceV2 = new SemanticSearchService({ provider: providerV2, repository: searchRepo });

      const empty = await serviceV2.retrieve({
        caseId: providerCaseId,
        query: "invoice consulting delivered",
      });
      expect(empty.results.length).toBe(0); // honest empty — never fallback

      // Embed under identity v2 ⇒ its vectors now satisfy identity v2 search.
      const pipelineV2 = new EmbeddingPipeline(
        { provider: providerV2, repository: embeddingRepo },
        { pipeline: { batchSize: 16, concurrency: 2, maxRetries: 2, retryBaseDelayMs: 0 } },
      );
      const report = await pipelineV2.embedUnits([unit], { caseId: providerCaseId });
      expect(report.embedded).toBe(1);

      const hit = await serviceV2.retrieve({
        caseId: providerCaseId,
        query: "invoice consulting delivered",
      });
      expect(hit.results.some((r) => r.sourceId === sid("p1"))).toBe(true);

      // And identity v1 search is unaffected by the v2 vectors.
      const v1 = await service.retrieve({
        caseId: providerCaseId,
        query: "invoice consulting delivered",
      });
      expect(v1.results.some((r) => r.sourceId === sid("p1"))).toBe(true);
    });
  },
);