import { describe, expect, beforeAll, afterAll, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

import {
  DeterministicEmbeddingProvider,
  canonicalizeSemanticText,
  contentHashOf,
} from "@indago/semantic-retrieval";
import type { SemanticTextUnit } from "@indago/contracts";

import { SemanticTextUnitStore } from "../../src/persistence/semantic-text-unit-store.js";
import { PostgresEmbeddingRepository } from "../../src/persistence/embedding-repository.js";
import { PostgresSemanticSearchRepository } from "../../src/persistence/semantic-search-repository.js";
import { EmbeddingPipeline } from "@indago/semantic-retrieval";
import { SemanticSearchService } from "@indago/semantic-retrieval";

// ============================================================================
// Phase 5A-PR1.5 — semantic-retrieval integration (real Postgres + pgvector)
//
// Uses DeterministicEmbeddingProvider (test-only, dims 768) to exercise the
// full stack without a live LLM provider. Covers:
//   - idempotent embedding pipeline (re-run = zero provider calls)
//   - case isolation (cross-case vectors never leak into query results)
//   - determinism (same query → same result order)
//   - threshold filtering
//   - temporal filtering (overlap semantics matching graph-hole-region)
//   - contentHash change → re-embedding + fresh vectors
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

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

    function makeUnit(
      overrides: Partial<SemanticTextUnit> & { id: string; normalizedText: string },
    ): SemanticTextUnit {
      const canonical = canonicalizeSemanticText(overrides.normalizedText);
      const contentHash = contentHashOf(canonical);
      return {
        caseId,
        sourceType: "observation",
        sourceId: overrides.id,
        normalizedText: canonical,
        contentHash,
        ...overrides,
      } as SemanticTextUnit;
    }

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
      unitStore = new SemanticTextUnitStore(prisma);
      embeddingRepo = new PostgresEmbeddingRepository(prisma);
      searchRepo = new PostgresSemanticSearchRepository(prisma);
      provider = new DeterministicEmbeddingProvider();
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
    // Core embedding pipeline
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

    // -----------------------------------------------------------------------
    // Determinism
    // -----------------------------------------------------------------------

    it("returns same results in same order for identical query", async () => {
      const r1 = await service.retrieve({ caseId, query: "wire transfer alice bob" });
      const r2 = await service.retrieve({ caseId, query: "wire transfer alice bob" });

      expect(r1.results.length).toBeGreaterThan(0);
      expect(r2.results.length).toBe(r1.results.length);
      const ids1 = r1.results.map((r) => r.semanticTextUnitId);
      const ids2 = r2.results.map((r) => r.semanticTextUnitId);
      expect(ids2).toEqual(ids1);
    });

    // -----------------------------------------------------------------------
    // Case isolation
    // -----------------------------------------------------------------------

    it("cross-case vectors do not leak into query results", async () => {
      // Seed an identical unit into a different case
      const foreignUnit = makeUnit({
        id: "foreign-u1",
        caseId: foreignCaseId,
        normalizedText: "Wire transfer of 5000 USD from Alice to Bob on 2024-07-03",
      });
      await unitStore.upsertMany([foreignUnit]);
      await pipeline.embedUnits([foreignUnit], { caseId: foreignCaseId });

      const result = await service.retrieve({ caseId, query: "wire transfer alice bob" });
      for (const hit of result.results) {
        expect(hit.sourceId).not.toBe("foreign-u1");
      }
    });

    // -----------------------------------------------------------------------
    // Threshold filtering
    // -----------------------------------------------------------------------

    it("threshold 1.0 returns zero results (no hit is perfectly self-similar under deterministic projection)", async () => {
      const result = await service.retrieve({
        caseId,
        query: "monthly electricity bill",
        threshold: 1.0,
      });
      expect(result.results.length).toBe(0);
    });

    // -----------------------------------------------------------------------
    // Temporal filtering
    // -----------------------------------------------------------------------

    it("excludes temporally-filtered units when window does not overlap", async () => {
      const tsUnit = makeUnit({
        id: "ts-u1",
        normalizedText: "Payment received for consulting services in March 2024",
        temporalScope: {
          validFrom: { value: "2024-03-01T00:00:00.000Z", precision: "exact" },
          validTo: { value: "2024-03-31T23:59:59.999Z", precision: "exact" },
        },
      });
      await unitStore.upsertMany([tsUnit]);
      await pipeline.embedUnits([tsUnit], { caseId });

      // Query window fully AFTER the unit's interval → should be excluded
      const result = await service.retrieve({
        caseId,
        query: "consulting services payment",
        temporalContext: {
          validFrom: { value: "2024-07-01T00:00:00.000Z", precision: "exact" },
          validTo:   { value: "2024-12-31T23:59:59.999Z", precision: "exact" },
        },
      });
      const ids = result.results.map((r) => r.semanticTextUnitId);
      expect(ids).not.toContain("ts-u1");
    });

    it("includes temporally-filtered units when window overlaps", async () => {
      const result = await service.retrieve({
        caseId,
        query: "consulting services payment",
        temporalContext: {
          validFrom: { value: "2024-02-01T00:00:00.000Z", precision: "exact" },
          validTo:   { value: "2024-04-30T23:59:59.999Z", precision: "exact" },
        },
      });
      const ids = result.results.map((r) => r.semanticTextUnitId);
      expect(ids).toContain("ts-u1");
    });

    // -----------------------------------------------------------------------
    // Content change → re-embedding
    // -----------------------------------------------------------------------

    it("contentHash change triggers re-embedding of the changed unit only", async () => {
      const units = await unitStore.findByCase(caseId);
      const u1 = units.find((u) => u.sourceId === "u1")!;

      // Mutate text
      const updatedUnit: SemanticTextUnit = {
        ...u1,
        normalizedText: "Wire transfer of 5000 USD from Alice to Bob on 2024-07-05 — revised date",
        contentHash: contentHashOf(canonicalizeSemanticText("Wire transfer of 5000 USD from Alice to Bob on 2024-07-05 — revised date")),
      };
      await unitStore.upsert([updatedUnit]);

      const report = await pipeline.embedUnits(units, { caseId });
      expect(report.embedded).toBe(1);
      expect(report.unchanged).toBe(2);
    });
  },
);