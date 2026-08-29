# M-A05: Normalization Engine — Final Implementation Report

## Status: COMPLETE

---

## 1. Objective

Emit a **deterministic canonical representation** of every ingested artifact:
`RawExtraction → NormalizedExtraction`, persisted once per ingestion attempt and
driving the run lifecycle `NORMALIZING → ANALYZING` with an append-only audit
trail — all under a pure, testable engine with zero production `any`-casts.

---

## 2. What Was Delivered

### 2.1 Pure normalization engine (`@indago/ingestion`)

- `NormalizationService.normalize(raw, provenance)` — synchronous, deterministic,
  byte-identical output for identical input (deep-equal tested).
- `NORMALIZER_ID: "indago-text-canonicalizer"`, `NORMALIZER_VERSION: "1.0.0"`.
- Field-level canonicalization with explicit statuses:
  - `NORMALIZED` / `UNCHANGED` / `AMBIGUOUS` / `UNPARSED` / `INVALID`
  - ISO dates (zonal → UTC conf 1.0; zone-less → AMBIGUOUS), D/M-vs-M/D elimination,
    month-only AMBIGUOUS, zip-code exceptions
  - numbers incl. fractions, currency (decimal precision preserved), uuid, email,
    url, phone shapes
- Per-field `sourceReference` mirroring the RawExtraction provenance
  (`pdf-page` / `docx-block` / `txt-line` / `csv-cell` / `ocr-line` / …).
- Quality metadata: completeness, statusCounts, per-field confidence, cleanliness
  flags, warnings digest, OCR summary (carried, never re-OCRed), optional language.
- Bounded lexical statistics (tokens, bigrams) with explicit caps from
  `DEFAULT_NORMALIZATION_CONFIG`.
- `stored-extraction.ts` projection: JSON-safe raw row shape, Date coercion,
  corrupt-row rejection — enabling idempotent re-entry.

### 2.2 Strict contracts (`@indago/contracts`)

All new Zod schemas are `.strict()`: `NormalizedFieldSchema`,
`QualityMetadataSchema`, `LexicalStatisticsSchema`, `NormalizationConfigSchema`,
`NormalizationProvenanceSchema`, `NormalizedExtractionSchema`. Faithful-reader
fixtures + negative cases in `tests/normalization.test.ts`.

### 2.3 Durable platform wiring (`@indago/platform`)

- `completeNormalization`: idempotent forward + re-entrant paths
  (`findNormalizedExtractionByAttempt` → skip recompute AND skip
  `NORMALIZATION_STORED` re-audit).
- `transitionRunToAnalyzing` returns whether THIS call applied the transition —
  the fence that keeps `NORMALIZATION_COMPLETED` single-valued.
- Re-entry walks `INGESTING → NORMALIZING (skip-if-past) → ANALYZING`, so a run
  is never stranded mid-ingest.
- P2002-safe `upsertNormalizedExtractionByAttempt` (concurrent duplicate insert
  collapses to one row) + `findNormalizedExtractionByAttempt` +
  `listRawExtractions` filters.
- `failNormalizationPermanently`: never retried — `NORMALIZATION_FAILED` audit
  once, run → FAILED, `UnrecoverableError`. The truthful SUCCEEDED attempt is
  preserved.
- Prisma `NormalizedExtraction` model: JSONB `config`/`canonicalFields`/`quality`/
  `lexicalStatistics`, `attemptId @unique`.

---

## 3. Verification Matrix

| Package | Typecheck | Unit tests | Integration (real infra) |
|---|---|---|---|
| `@indago/contracts` | ✅ `tsc --noEmit` | 133/133 | — |
| `@indago/ingestion` | ✅ | 360/360 | — |
| `@indago/platform` | ✅ | 123/123 | **24/24** |

Integration ran against **real Neon PostgreSQL** (`TEST_DATABASE_URL`), real
**Upstash Redis** (BullMQ), a real HTTP API + SSE stream, and the actual worker:

- `ingestion-pipeline.e2e.test.ts` — 8/8: worker completes to ANALYZING, artifact
  content-hash dedup, SUCCEEDED attempt with parser provenance, immutable
  RawExtraction, checkpoints + audit trail, real NormalizedExtraction
  (normalizerId/version, canonical fields + statuses, quality, `tokenCount`),
  content-addressed dedup, caseId-mismatch rejection.
- `ingestion-store.test.ts` — 10/10: upsert idempotency, concurrent P2002
  collapse, find-by-attempt, raw filters.
- `real-stack.e2e.test.ts` — 6/6: HTTP → BullMQ → worker → Postgres → SSE; run →
  ANALYZING; `NORMALIZATION_STORED` timestamp precedes ANALYZING-reached; SSE
  lifecycle frames; producer dedup; retry → permanent FAILED audited once.

---

## 4. Notable Debugging Discoveries

### 4.1 Preserved-schema DB migration (test environment)

The M-A05 test database is a dedicated Neon project seeded for this work. The
platform schema was applied with `prisma db push --force-reset` (prior
`mprev`-project data was deliberately cleared). A second root cause was chased:
**Prisma's Rust engine cannot fall back to IPv4** on dual-stack DNS where Node's
`pg` client can — every `P1001` traced to unroutable IPv6. The libpq-only
`hostaddr=<ipv4>` parameter fixes it while preserving the hostname for TLS/SNI.

### 4.2 Cold-start latency vs. 5 s test timeout

The remote pooled Neon TLS database makes the first job cycle take ~25 s
(verified by a standalone worker probe ending in `run.state: ANALYZING`, 6 audit
events). Integration tests now run under a 60 s testTimeout
(`packages/platform/vitest.config.ts`) instead of vitest's 5 s default.

### 4.3 Parallel query-engine spawn race

Real-stack intermittently failed cold `/start`/`/stream` with an empty
`PrismaClientInitializationError` — two Prisma engines (suite client + app
singleton) spawning concurrently on Windows. Fixed by pre-warming the shared
`db.$connect()` in `beforeAll` before importing the routes.

### 4.4 Test/contract key alignment

Vitest doesn't typecheck, so three stale keys surfaced only at runtime and were
corrected to the contract (production unchanged): `status → normalizationStatus`
(`NormalizedFieldSchema`), `totalTokens → tokenCount`
(`LexicalStatisticsSchema`), and `audit.createdAt → timestamp`
(`AuditEvent` model).

---

## 5. Audit Rules Compliance

- **No `as any` / `: any` / `@ts-ignore` / `@ts-nocheck` / `eslint-disable`** in any
  M-A05 source or test file (grep-verified; a pre-existing `as any` in
  `src/queue/recovery.ts` is outside M-A05 scope).
- **Pure-layer isolation**: `normalization-service.ts` / `stored-extraction.ts`
  import only `zod`, `@indago/contracts`, and local ingestion types — no Prisma,
  BullMQ, Redis, React, Express, or UploadThing (enforced by a barrel-export
  test).
- Verified against the roadmap: M-A05 flipped `[x]` in
  `docs/roadmap/phase-tracker.md`.

---

## 6. Artifacts

| Artifact | Location |
|---|---|
| Milestone doc | `docs/platform/m-a05-normalization.md` |
| Phase tracker | `docs/roadmap/phase-tracker.md` (M-A05 → `[x]`) |
| Contracts | `@indago/contracts` `src/intelligence/normalization.ts` (+ tests) |
| Engine | `@indago/ingestion` `src/normalization/*` (+ 59 new tests) |
| Wiring | `@indago/platform` `src/queue/ingest-evidence.ts`, `transitions.ts`, `persistence/ingestion-store.ts` |
| Test DB | Neon project bound via `TEST_DATABASE_URL` in `packages/platform/.env` |