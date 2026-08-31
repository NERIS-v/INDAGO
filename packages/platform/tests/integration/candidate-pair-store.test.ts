import { describe, expect, beforeAll, afterAll, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  CandidatePairSchema,
  type EntityMentionCandidate,
  type CandidatePair,
  type Observation,
} from "@indago/contracts";
import {
  buildCandidatePairIdentityKey,
  buildEntityMentionIdentityKey,
  buildObservationIdentityKey,
  deterministicCandidatePairId,
  finalizeCandidatePair,
  blockCandidates,
  serializeSourceLocation,
} from "@indago/ingestion";
import { CandidatePairStore } from "../../src/persistence/candidate-pair-store.js";
import {
  ObservationStore,
  type SourceWriteRecord,
  type EvidenceWriteRecord,
} from "../../src/persistence/observation-store.js";
import { EntityMentionStore } from "../../src/persistence/entity-mention-store.js";

// ============================================================================
// M-A08 CandidatePairStore — REAL round-trips against TEST_DATABASE_URL.
//
// Purpose: prove the durable comparison-universe persistence boundary
// end-to-end against real Postgres. Requires `TEST_DATABASE_URL`/schema; the
// suite skips cleanly when unset.
//
// CandidatePair has two ON DELETE CASCADE FKs to EntityMentionCandidate, which
// itself cascades to Observation → Evidence → Source. So the full real chain
// must be seeded before pair rows can be inserted.
//
// Idempotency / partial-retry under test:
//   - CandidatePair.identityKey @unique → a re-insert of an existing pair is a
//       per-pair no-op (skipDuplicates), never a whole-batch gate.
//   - If pair A persists and pair B fails, a retry creates ONLY B.
//
// M-A08 boundary — pair rows carry NO EntityId / ResolutionScore, and
// read-backs reassemble into the strict CandidatePairSchema.
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)(
  "M-A08 CandidatePairStore integration (real Postgres)",
  () => {
    let prisma: PrismaClient;
    let pairStore: CandidatePairStore;
    let candStore: EntityMentionStore;
    let obsStore: ObservationStore;

    const investigationId = randomUUID();
    const caseId = randomUUID();
    const otherCaseId = randomUUID();
    const sourceId = randomUUID();
    const evidenceId = randomUUID();
    const artifactId = randomUUID();
    const otherSourceId = randomUUID();
    const otherEvidenceId = randomUUID();

    const obsA = randomUUID();
    const obsB = randomUUID();
    const otherObsA = randomUUID();
    const otherObsB = randomUUID();

    function makeSource(overrides: Partial<SourceWriteRecord> = {}): SourceWriteRecord {
      return {
        id: sourceId,
        caseId,
        investigationId,
        catalog: "MANUAL",
        declaredCatalog: "ledger",
        name: "Ledger",
        description: "Ledger export",
        ...overrides,
      };
    }

    function makeEvidence(
      evId: string,
      srcId: string,
      csId: string,
    ): EvidenceWriteRecord {
      return {
        id: evId,
        investigationId,
        caseId: csId,
        operationId: randomUUID(),
        sourceId: srcId,
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
      evId: string,
      srcId: string,
      csId: string,
      overrides: Partial<Observation> = {},
    ): Observation {
      const now = new Date().toISOString();
      return {
        id: obsId,
        evidenceId: evId,
        sourceId: srcId,
        type: "FINANCIAL",
        content: "balance 42000.00",
        entityIds: [],
        candidateMentions: [],
        strength: 0.7,
        provenance: { sourceId: srcId, artifactId, extractor: "observation-extractor@1.0.0" },
        createdAt: { value: now, precision: "exact" },
        updatedAt: { value: now, precision: "exact" },
        ...overrides,
      };
    }

    function makeCandidate(
      obsId: string,
      n: number,
      overrides: Partial<EntityMentionCandidate> = {},
    ): EntityMentionCandidate {
      const now = new Date().toISOString();
      return {
        id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        observationId: obsId,
        text: overrides.text ?? `unique-${n}@example.org`,
        start: overrides.start ?? 0,
        end: overrides.end ?? 22,
        entityType: "EMAIL",
        extractionMethod: "PATTERN_MATCH",
        canonicalMatchValue: overrides.canonicalMatchValue ?? `unique-${n}@example.org`,
        provenance: { sourceId, artifactId, extractor: "obs@1.0.0" },
        createdAt: { value: now, precision: "exact" },
        updatedAt: { value: now, precision: "exact" },
        ...overrides,
      };
    }

    async function seedCandidate(obsId: string, n: number, overrides: Partial<EntityMentionCandidate> = {}): Promise<EntityMentionCandidate> {
      const cand = makeCandidate(obsId, n, overrides);
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
        { investigationId, caseId: cand.observationId === otherObsA || cand.observationId === otherObsB ? otherCaseId : caseId },
      );
      return cand;
    }

    async function buildPair(
      left: EntityMentionCandidate,
      right: EntityMentionCandidate,
      caseIdToUse: string,
      sharedValue: string,
    ): Promise<{ identityKey: string; pair: CandidatePair }> {
      // Blocking keys derive from canonicalMatchValue — normalize both sides to
      // the pair's shared value so they land in the same EXACT_STRONG_IDENTIFIER
      // block. The persisted candidate identityKeys are unaffected (already
      // unique per candidate); the pair references the same candidate ids.
      const a = { ...left, canonicalMatchValue: sharedValue };
      const b = { ...right, canonicalMatchValue: sharedValue };
      const { drafts } = blockCandidates(
        { candidates: [a, b], caseId: caseIdToUse, investigationId },
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
      return { identityKey, pair };
    }

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
      pairStore = new CandidatePairStore(prisma);
      candStore = new EntityMentionStore(prisma);
      obsStore = new ObservationStore(prisma);

      await prisma.candidatePair.deleteMany({});
      await prisma.entityMentionCandidate.deleteMany({});
      await prisma.observation.deleteMany({});
      await prisma.evidence.deleteMany({});
      await prisma.source.deleteMany({});

      // Real Source → Evidence → Observation chain for the primary case.
      await obsStore.upsertSource(makeSource());
      await obsStore.upsertEvidence(makeEvidence(evidenceId, sourceId, caseId));
      await obsStore.ensureObservations(
        [
          {
            identityKey: buildObservationIdentityKeyFor(makeObservationRow(obsA, evidenceId, sourceId, caseId, { content: "balance 42000.00 AAA" })),
            observation: makeObservationRow(obsA, evidenceId, sourceId, caseId, { content: "balance 42000.00 AAA" }),
          },
          {
            identityKey: buildObservationIdentityKeyFor(makeObservationRow(obsB, evidenceId, sourceId, caseId, { content: "balance 42000.00 BBB" })),
            observation: makeObservationRow(obsB, evidenceId, sourceId, caseId, { content: "balance 42000.00 BBB" }),
          },
        ],
        { investigationId, caseId },
      );

      // Separate case boundary chain.
      await obsStore.upsertSource(makeSource({ id: otherSourceId, caseId: otherCaseId }));
      await obsStore.upsertEvidence(makeEvidence(otherEvidenceId, otherSourceId, otherCaseId));
      await obsStore.ensureObservations(
        [
          {
            identityKey: buildObservationIdentityKeyFor(makeObservationRow(otherObsA, otherEvidenceId, otherSourceId, otherCaseId, { content: "other balance CCC" })),
            observation: makeObservationRow(otherObsA, otherEvidenceId, otherSourceId, otherCaseId, { content: "other balance CCC" }),
          },
          {
            identityKey: buildObservationIdentityKeyFor(makeObservationRow(otherObsB, otherEvidenceId, otherSourceId, otherCaseId, { content: "other balance DDD" })),
            observation: makeObservationRow(otherObsB, otherEvidenceId, otherSourceId, otherCaseId, { content: "other balance DDD" }),
          },
        ],
        { investigationId, caseId: otherCaseId },
      );
    });

    afterAll(async () => {
      await prisma.candidatePair.deleteMany({});
      await prisma.entityMentionCandidate.deleteMany({});
      await prisma.observation.deleteMany({});
      await prisma.evidence.deleteMany({});
      await prisma.source.deleteMany({});
      await prisma.$disconnect();
    });

    it("deterministicCandidatePairId is retry-safe and order-independent", async () => {
      const a = await deterministicCandidatePairId({
        caseId,
        leftCandidateId: "00000000-0000-4000-8000-000000000101",
        rightCandidateId: "00000000-0000-4000-8000-000000000102",
      });
      const b = await deterministicCandidatePairId({
        caseId,
        leftCandidateId: "00000000-0000-4000-8000-000000000102",
        rightCandidateId: "00000000-0000-4000-8000-000000000101",
      });
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it("ensureCandidatePairs inserts; an identical re-pass yields created=0 (per-pair dedup)", async () => {
      const left = await seedCandidate(obsA, 101);
      const right = await seedCandidate(obsB, 102);
      const { identityKey, pair } = await buildPair(left, right, caseId, "ravi.akram@example.org");

      const first = await pairStore.ensureCandidatePairs([{ identityKey, pair }]);
      expect(first.created).toBe(1);
      expect(first.skipped).toBe(0);

      const second = await pairStore.ensureCandidatePairs([{ identityKey, pair }]);
      expect(second.created).toBe(0);
      expect(second.skipped).toBe(1);
    });

    it("partial retry — only NEW pairs are inserted on a re-run (no whole-batch gate)", async () => {
      // existing pair A (persisted above), plus a NEW pair B in the same batch.
      const leftA = await seedCandidate(obsA, 201);
      const rightA = await seedCandidate(obsB, 202);
      const pairA = await buildPair(leftA, rightA, caseId, "pair-a@example.org");

      const leftB = await seedCandidate(obsA, 203);
      const rightB = await seedCandidate(obsB, 204);
      const pairB = await buildPair(leftB, rightB, caseId, "pair-b@example.org");

      await pairStore.ensureCandidatePairs([{ identityKey: pairA.identityKey, pair: pairA.pair }]);

      // Retry with BOTH pair A (already durable) and pair B (new).
      const retry = await pairStore.ensureCandidatePairs([
        { identityKey: pairA.identityKey, pair: pairA.pair },
        { identityKey: pairB.identityKey, pair: pairB.pair },
      ]);
      expect(retry.created).toBe(1); // only B
      expect(retry.skipped).toBe(1); // A was already present
    });

    it("concurrent identical pair writes do not duplicate (unique identityKey)", async () => {
      const left = await seedCandidate(obsA, 301);
      const right = await seedCandidate(obsB, 302);
      const { identityKey, pair } = await buildPair(left, right, caseId, "cc@example.org");

      const [a, b] = await Promise.all([
        pairStore.ensureCandidatePairs([{ identityKey, pair }]),
        // identical pair, but with a deterministic id derived from the SAME key.
        (async () => {
          const sameId = await deterministicCandidatePairId({
            caseId,
            leftCandidateId: pair.leftCandidateId,
            rightCandidateId: pair.rightCandidateId,
          });
          return pairStore.ensureCandidatePairs([
            {
              identityKey,
              pair: { ...pair, id: sameId }, // id is derived from the same key → equal
            },
          ]);
        })(),
      ]);
      expect(a.created + b.created).toBe(1); // exactly one row ever lands
    });

    it("listByCase is case-scoped and reassembles strict CandidatePair rows", async () => {
      const left = await seedCandidate(obsA, 401);
      const right = await seedCandidate(obsB, 402);
      const { identityKey, pair } = await buildPair(left, right, caseId, "list@example.org");
      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const rows = await pairStore.listByCase(caseId, { investigationId });
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(CandidatePairSchema.safeParse(row).success).toBe(true);
      }

      const otherCaseRows = await pairStore.listByCase(otherCaseId, { investigationId });
      // No pairs were created in the other case yet.
      expect(otherCaseRows).toHaveLength(0);
    });

    it("M-A08 boundary — pair read-back carries no EntityId / ResolutionScore", async () => {
      const left = await seedCandidate(obsA, 501);
      const right = await seedCandidate(obsB, 502);
      const { identityKey, pair } = await buildPair(left, right, caseId, "bound@example.org");
      await pairStore.ensureCandidatePairs([{ identityKey, pair }]);

      const rows = await pairStore.listByCase(caseId, { investigationId });
      expect(rows.length).toBeGreaterThan(0);
      const someRow = rows.find((r) => r.id === pair.id)!;
      expect((someRow as Record<string, unknown>).entityId).toBeUndefined();
      expect((someRow as Record<string, unknown>).resolutionScore).toBeUndefined();
    });
  },
);

function buildObservationIdentityKeyFor(o: Observation): string {
  return buildObservationIdentityKey({
    evidenceId: o.evidenceId,
    sourceId: o.sourceId,
    locationKey: serializeSourceLocation("line", { line: 1 }),
    type: o.type,
    canonicalContent: o.content,
  });
}
