# MA05 — Deterministic Normalization Engine: Audit Report

- **Milestone:** M-A05 (Normalization Engine)
- **Status:** Complete, verified, documented
- **Date:** 2026-08-29
- **Scope:** `@indago/contracts`, `@indago/intelligence/ingestion`, `@indago/platform`
- **Frontend impact:** none (`packages/web` intentionally untouched)

---

## 1. Executive summary

M-A05 inserts a **pure, deterministic, synchronous NormalizationService** between the
immutable `RawExtraction` (M-PR3) and the analysis stage (MA06+). It answers *"what is the
canonical shape of the material and how clean/complete is it?"* and explicitly does **not**
answer *"what does this material mean?"* — no Observation / Entity / Relation / Graph element
/ Lead / Hypothesis is produced.

The worker path is:

```
RawExtraction (persisted, immutable)
        │  re-entry reads persisted row via parseStoredRawExtraction()
        ▼
NormalizationService.normalize()          // pure, synchronous, no I/O
        │  output re-validated through NormalizedExtractionSchema.parse()
        ▼
NormalizedExtraction (persisted, attemptId @unique)
        │  NORMALIZATION_STORED audit → NORMALIZATION_COMPLETED audit (fenced)
        ▼
NORMALIZING ──► ANALYZING   (state machine; NORMALIZING ──► FAILED on INGESTION_PERMANENT_FAILURE)
```

All four package gates are green: `@indago/contracts` **133/133**, `@indago/ingestion`
**360/360** (59 new MA05 tests), `@indago/platform` unit **123/123** + real-infra
integration **24/24**, and all package typechecks pass.

---

## 2. Higher-level design choices

| # | Choice | Rationale |
|---|--------|-----------|
| 1 | **Pure synchronous `NormalizationService`** in `@indago/ingestion` (`normalization-service.ts:709`) | Deterministic core testable in isolation; zero I/O. Imports only `zod`, `@indago/contracts`, and local extraction types — no Prisma / BullMQ / Redis / Express / UploadThing. |
| 2 | **Contracts live in `@indago/contracts`** (`src/intelligence/normalization.ts`) | Single shared definition so ingestion and platform can never drift on the wire/storage contract. |
| 3 | **Strict Zod schemas** (`.strict()`) | Unknown keys are rejected, not silently dropped; `NormalizedExtractionSchema.parse` runs on every result (`normalization-service.ts:753`), making the output boundary validated by construction. |
| 4 | **Never guess.** `AMBIGUOUS → normalizedValue: null` | Ambiguity is surfaced, not resolved arbitrarily. Zone-less datetimes → AMBIGUOUS; `1/2/2024` (valid as both DMY and MDY) → AMBIGUOUS; bare `1,5` → AMBIGUOUS. |
| 5 | **Explicit, versionable config** (`NormalizationConfigSchema`, `DEFAULT_NORMALIZATION_CONFIG`) | Named policies (`indago-normalization-policy@1`, `date-policy@1`, …). A behavior change is a version bump, never a silent edit. |
| 6 | **Bounded output** | `maxFields: 5000`, `maxFieldLength: 100000`, plus bounded lexical caps (`maxTokens 100000`, `maxUniqueTokens 50000`, `maxTopTokens 20`, `maxTopBigrams 20`, `maxTokenLength 128`). Any input yields bounded output. |
| 7 | **String-based number/currency canonicalization** | `$1,234.50 → "1234.50"` preserving the declared decimal precision via string ops (`stripLeadingZeros`, grouping removal), **never floating-point arithmetic** — avoids `0.1 + 0.2`-class drift. |
| 8 | **OCR is never rerun** | Existing OCR confidence lines are summarized into `OcrQualitySummary` unchanged (`normalization-service.ts:678-698`). |
| 9 | **`attemptId` is the idempotency anchor** | `NormalizedExtraction.attemptId @unique` — at most one canonical row per attempt; duplicate persistence collapses on the unique constraint. |
| 10 | **No semantic intelligence in MA05** | File header contract (`normalization.ts:13-29`) and service header (`normalization-service.ts:14-18`) both forbid it; verified by static audit. |

---

## 3. Per-package walkthrough

### 3.1 `@indago/contracts`

New file `src/intelligence/normalization.ts` (352 lines):

- `RawExtraction`-boundary contract: `NormalizedExtractionSchema` (attemptId/artifactId/investigationId/caseId + `normalizerId`/`normalizerVersion` + `config` + `canonicalFields` + `quality` + `lexicalStatistics`).
- `NormalizedFieldSchema` — every canonical field keeps `rawValue` (verbatim, bounded at 100000) + `normalizedValue` (nullable on AMBIGUOUS/UNPARSED/INVALID) + `type` + `normalizationStatus` + `confidence` + `sourceReference`.
- `NormalizedValueTypeSchema`: `string | number | integer | date | datetime | uuid | email | phone | url | currency | fraction | ratio | code | other`.
- `QualityMetadataSchema`: completeness, status counts, per-field confidence (order-aligned), cleanliness flags, warnings digest, optional OCR summary, optional language metadata.
- `LexicalStatisticsSchema`: `tokenCount` (note: **not** `totalTokens`), `uniqueTokenCount`, `averageTokenLength`, capped `topTokens`/`topBigrams`.
- `NormalizationConfigSchema` + `DEFAULT_NORMALIZATION_CONFIG` with named sub-policies.
- `SourceReferenceSchema` — JSON-safe pointer mirroring the format-native source-location `kind`.
- Explicit "M-A05 does NOT create semantic intelligence" contract header.

Changes to existing files:

- `src/common/ids.ts:73-74` — added `IngestionAttemptIdSchema` / `IngestionAttemptId` (UUID).
- `src/domain/audit-event.ts:49-51` — added three actions: `NORMALIZATION_STORED`, `NORMALIZATION_COMPLETED`, `NORMALIZATION_FAILED`.
- `src/execution/state-machine.ts:130` — added edge `NORMALIZING → FAILED` (trigger `INGESTION_PERMANENT_FAILURE`); `NORMALIZING → ANALYZING` (`NORMALIZATION_COMPLETE`) pre-existed.
- `src/index.ts` — re-exports the new normalization surface.
- `tests/schema-validation.test.ts` — extended; `tests/normalization.test.ts` (new) — contract-level schema checks.

### 3.2 `@indago/intelligence/ingestion` — the pure layer

New `src/normalization/` (3 files):

- **`normalization-service.ts` (785 lines)** — the engine.
  - Deterministic field collection per format (`collectFields`): TXT lines, PDF pages, DOCX blocks/tables (cell-granular), CSV records/cells, JSON tree walk (`MAX_TREE_DEPTH = 16`), XML tree walk, IMAGE OCR lines.
  - Deterministic mechanical cleaning (`cleanText`): BOM strip → line-ending normalization → control-char removal → NFC → whitespace collapse. Flags tracked in `CleanlinessFlags`.
  - Deterministic detection/canonicalization (`detectCanonical`): dates (ISO, partial, named, month-year), integers (leading-zero strip), decimals (trailing-zero strip), grouped numbers (`1,234`), scientific, comma-ambiguous (`1,5` → AMBIGUOUS), currency (`$1,234.50`), UUID, email, URL, fraction, phone (loose → digit-only E.164-ish), trailing-punctuation trim.
  - Time-safe date canonicalization: ISO-with-zone → UTC `toISOString()`; zone-less datetime → AMBIGUOUS (never guessed); `isValidDateParts` guards overflow (no `2024-02-31`).
  - Bounded lexical statistics (`computeLexical`): hard caps applied mid-loop; deterministic ordering (count desc, tie-broken lexicographically); token truncation at `maxTokenLength`.
  - Conservative deterministic language heuristic (`detectLanguage`): script-ratio for hi/ar/ru/zh/el, English function-word ratio (threshold 0.04), sample capped at 2000 chars — **quality metadata only**, no translation.
  - `NormalizationService.normalize(raw, provenance, config)` is the only output-producing entry point; result re-parsed through `NormalizedExtractionSchema` before return.
  - IDs: `NORMALIZER_ID = 'indago-text-canonicalizer'`, `NORMALIZER_VERSION = '1.0.0'` (`normalization-service.ts:43-44`).
- **`stored-extraction.ts` (301 lines)** — the rehydration seam. `parseStoredRawExtraction(row)` re-derives a typed `RawExtraction` from the persisted Prisma row using a discriminated union of per-format Zod bodies (`RawExtractionBodySchema`) + `PersistedRawExtractionRowSchema`. No `any`, no blind casts. Throws descriptively on non-conforming stored JSON, which the worker converts into an **unrecoverable** permanent failure (not a retry).
- **`index.ts`** — barrel: `NormalizationService`, `NORMALIZER_ID`, `NORMALIZER_VERSION`, `parseStoredRawExtraction`, rehydration schemas.

`src/index.ts` exports the barrel; `package.json` test script now reflects the full suite.

### 3.3 `@indago/platform` — persistence, worker, side effects

- **`prisma/schema.prisma:193-212`** — new `NormalizedExtraction` model:
  - `attemptId @unique` (idempotency anchor), `artifactId`, `investigationId`, `caseId`, `normalizerId`, `normalizerVersion` as queryable columns; `config`/`canonicalFields`/`quality`/`lexicalStatistics` as JSON blobs.
  - Relations: `artifact Artifact` and `attempt IngestionAttempt` (Cascade on attempt). Indexes on `[investigationId]` and `[artifactId, createdAt]`.
  - Comment block is explicit: this table creates **no** observations/entities (pre-MA06), normalization never mutates `RawExtraction`.
- **`src/persistence/ingestion-store.ts`** — write/read of normalized output; concurrent-duplicate safety.
- **`src/queue/ingest-evidence.ts`** — `completeNormalization` (idempotent: detects an already-stored normalized row and re-enters safely) and `failNormalizationPermanently` (unrecoverable path).
- **`src/queue/ingest-deps.ts`** — wiring of the normalizer/config and provenance into the worker.
- **`src/queue/transitions.ts`** — `transitionRunToAnalyzing` is **fenced**: it returns truthy only when the state actually moves `NORMALIZING → ANALYZING`. `NORMALIZATION_COMPLETED` is audited **only** when that returns true; `NORMALIZATION_STORED` is emitted after persistence.
- Experimental/verification scaffold: `vitest.config.ts` (new, timeouts) and pre-warmed Prisma connect in the integration tests.

---

## 4. Runtime correctness & determinism detail

- **Determinism:** same `RawExtraction` + same `contracts` input → byte-identical output. No dependence on machine, time, locale, randomness, network, or AI. All iterations are over fixed orders (`Object.keys`, insertion, then explicit sort); the one sort comparator is fully deterministic (`count desc`, then lexicographic).
- **No guessing:** every ambiguous value carries `normalizedValue: null` while `rawValue` is preserved verbatim (bounded). Statuses `AMBIGUOUS / UNPARSED / INVALID` are honest, not guessed.
- **Number/currency safety:** all transforms are pure string operations (group separator removal, leading/trailing zero strip); no binary floating point is used to canonicalize money.
- **Boundedness:** field count capped by `maxFields` at collection and emission; field length capped at `maxFieldLength` (truncation documented as lossy); lexical maps and top-N lists hard-capped; token length capped before counting; tree walk depth-capped.
- **Provenance:** `artifactId`, `attemptId`, `investigationId`, `caseId` are carried; `parserId`/`parserVersion` remain on the attempt/raw records (never re-derived); every canonical field carries a `sourceReference`; OCR quality is summarized, never recomputed.

---

## 5. Test coverage (new for MA05)

- 59 new ingestion tests in `packages/intelligence/ingestion/tests/normalization/`.
- 13 stored-extraction rehydration tests.
- Schema-validation tests of the new contracts.
- "No-intelligence guard": the pure layer's import surface is restricted (zod + contracts + local extraction types only), enforced by barrel/test structure and the static audit.
- Determinism tests (byte-identical output on repeat runs; versioned config).
- Probability-free ambiguity tests (`1/2/2024`, zone-less datetimes, `1,5`).
- Concurrent normalization persistence test (unique-attempt race collapse).
- Real-Postgres normalization E2E (`ingestion-store.test.ts`).
- Real Redis/BullMQ/HTTP/SSE integration (`real-stack.e2e.test.ts`, `ingestion-pipeline.e2e.test.ts`).

---

## 6. Final verification matrix

| Gate | Command/scope | Result |
|------|---------------|--------|
| `@indago/contracts` | typecheck + vitest | **133/133**, clean |
| `@indago/intelligence/ingestion` | typecheck + vitest | **360/360**, clean |
| `@indago/platform` unit | typecheck + vitest (unit) | **123/123**, clean |
| `@indago/platform` integration | vitest (real Postgres + Redis/BullMQ + HTTP/SSE) | **24/24**, clean |
| Static audit | MA05 files | no `: any` / `as any` / `@ts-ignore` / `@ts-nocheck` |

---

## 7. Infrastructure & debugging discoveries (integration gate)

The integration gate runs against **real** Neon Postgres and **real** Upstash Redis/BullMQ.
Four root causes were found and fixed; these are the highest-value findings for a reviewer.

1. **Cold Neon pooler pure-latency.** The first pooled TLS connection can take ~25s (needed two jobs until the pool was warm). Vitest's default 5s test timeout killed it. FIX: `packages/platform/vitest.config.ts` — `testTimeout: 60_000`, `hookTimeout: 60_000`.
2. **Transient `PrismaClientInitializationError` in real-stack.** Two Prisma query engines spinning concurrently during cold start on Windows. FIX: pre-warm `appDb.$connect()` in `beforeAll` **before** importing the route modules (uses the `src/db/prisma.js` singleton).
3. **Wrong `REDIS_URL` guess.** The correct value lives in `packages/platform/.env` (`rediss://…@many-eagle-176300.upstash.io:6379`), not guessed. The worker needs the real URL with `rediss://`+TLS.
4. **Three test/contract key mismatches** (vitest does **not** typecheck tests — all three were runtime-only):
   - `real-stack.e2e.test.ts:331`: assertion used `createdAt` but the `AuditEvent` record field is **`timestamp`** (matches the Prisma model + SSE audit frame). This was misdiagnosed initially as a "phantom SSE frame" — **wrong theory**. `src/audit/logger.ts` (line ~43) broadcasts every audit record to SSE as a real frame, so `EVIDENCE_QUEUED`/`EVIDENCE_INGESTED` frames do arrive; the frame-presence assertions were correct all along. The bug was purely the key name.
   - `ingestion-pipeline.e2e.test.ts`: `status` → **`normalizationStatus`** (`NormalizedFieldSchema` key).
   - `ingestion-pipeline.e2e.test.ts`: `totalTokens` → **`tokenCount`** (`LexicalStatisticsSchema` key).

No production code changed as a result of (4) — all three were test bugs.

Environment facts for reproduction:

- `TEST_DATABASE_URL="postgresql://neondb_owner:<pw>@ep-sweet-morning-aqgvtmy3-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require&hostaddr=52.72.123.251"` — the **`hostaddr` IPv4 pin** is required because the Prisma Rust engine cannot fall back to IPv4 on dual-stack DNS; `pg` can. Keep `hostname` (TLS verification) + `hostaddr` together.
- `REDIS_URL="rediss://default:…@many-eagle-176300.upstash.io:6379"`.
- Both must be exported in the shell — **vitest does not load `.env`**.
- The suite sets `process.env.DATABASE_URL = TEST_DATABASE_URL` in `beforeAll`; the production `DATABASE_URL` (`ep-shy-meadow-…`) is never touched by tests.
- `prisma db push --force-reset` was applied to the **test** database only (user-approved).

---

## 8. Compliance & audit checklist

### Architecture

- [x] `RawExtraction` is the input boundary.
- [x] `RawExtraction` remains immutable.
- [x] `NormalizationService` is pure/synchronous.
- [x] Normalization has no Prisma/BullMQ/Redis/Express/UploadThing dependency.
- [x] `IngestionStore` is the persistence boundary.
- [x] `NormalizedExtraction` is persisted separately.
- [x] No observations/entities/relations/graph output is created in MA05.

### Normalization correctness

- [x] Deterministic output.
- [x] Explicit normalization version.
- [x] Strict Zod schemas.
- [x] Ambiguous values are not guessed.
- [x] `rawValue` is preserved within the configured bound.
- [x] Date handling is deterministic.
- [x] Number/currency handling avoids unsafe floating-point conversion.
- [x] Lexical statistics are bounded.

### Provenance

- [x] `artifactId` preserved.
- [x] `attemptId` preserved.
- [x] `investigationId` preserved.
- [x] `caseId` preserved.
- [x] `parserId` preserved.
- [x] `parserVersion` preserved.
- [x] Source references preserved.
- [x] OCR quality carried forward rather than rerunning OCR.

### Persistence

- [x] `NormalizedExtraction` Prisma model exists.
- [x] `attemptId` is the uniqueness/idempotency anchor.
- [x] Artifact and Attempt relations exist.
- [x] Quality/config/canonical/lexical blobs are persisted.
- [x] `IngestionStore` can write/read normalized output.

### Worker

- [x] Worker reads persisted `RawExtraction`.
- [x] Re-entry avoids re-extraction.
- [x] Existing normalized output is detected.
- [x] Duplicate completion is safe.
- [x] `NORMALIZATION_STORED` is emitted after persistence.
- [x] `NORMALIZATION_COMPLETED` is fenced on the actual transition.
- [x] `NORMALIZING → ANALYZING` is used.

### Retry / failure

- [x] Normalized output survives worker retry.
- [x] Duplicate persistence collapses via unique attempt + race handling.
- [x] Corrupt stored `RawExtraction` becomes a permanent failure.
- [x] Permanent normalization failure is audited.
- [x] BullMQ stops on unrecoverable normalization failure.

### Tests

- [x] 59 new ingestion tests.
- [x] 13 stored-extraction tests.
- [x] Schema validation tests.
- [x] No-intelligence guard.
- [x] Determinism tests.
- [x] Concurrent normalization persistence test.
- [x] Real Postgres normalization E2E.
- [x] Real Redis/BullMQ/HTTP/SSE integration.

### Final verification

- [x] Contracts: 133/133.
- [x] Ingestion: 360/360.
- [x] Platform unit: 123/123.
- [x] Platform integration: 24/24.
- [x] Typechecks clean at the final checkpoint.

### Frontend strategy

- [x] Demo providers preserved.
- [x] Live providers preserved.
- [x] Auto mode preserved.
- [x] MA05 did not require web changes.
- [ ] Actual browser → Live Provider → MA05 → UI verified. *(not proven by this audit)*
- [ ] Actual browser → UploadThing → evidence submit → MA05 verified. *(not proven by this audit)*

---

## 9. Frontend strategy — Live / Demo / Auto

```
                 DEMO                                      LIVE
                  │                                        │
              fixtures                                Live Provider
                  │                                        │
                  ▼                                  Platform API
                 UI                                        │
                                                       BullMQ
                                                         │
                                                       Worker
                                                         │
                                                       M-PR1 → M-PR2 → M-PR3
                                                         │
                                                       RawExtraction
                                                         │
                                                        MA05
                                                         │
                                               NormalizedExtraction
                                                         │
                                                     ANALYZING
                                                         │
                                                        SSE
                                                         │
                                                        UI

                         AUTO
                      ↙         ↘
                  DEMO          LIVE
```

### Proven by this audit

- **Backend MA05 → Live backend pipeline: YES.** Verified with real Postgres + real
  Redis/BullMQ + HTTP + SSE (`real-stack.e2e.test.ts` 24/24, real `NormalizedExtraction`
  persistence test). The audit reports the real stack, not mocks.

### Traced wiring (grep/read-verified) but not executed in a browser

The browser Live-mode path is fully wired to the real platform — nothing in it is mocked:

1. **Realtime/SSE:** `LiveRealtimeProvider` (`web/src/lib/providers/live/realtime.ts`) →
   `createSseClient` fetches `/api/sse/:id` (the Next.js proxy,
   `web/src/realtime/sse-client.ts:71`) → proxy route authenticates server-side with
   `AUTH_TOKEN` and streams from the platform → platform `GET …/stream` broadcasts audit
   frames (`platform/src/api/routes.ts:275`). Browser code **never** sees the token.
2. **Auth contract:** platform `api/auth.ts:36` accepts the literal `demo-token` **only when
   `NODE_ENV !== "production"`**; in production every token is rejected. The web server
   layer additionally refuses to use the demo credential in production
   (`web/src/lib/api/server.ts:35`).
3. **HTTP:** `web/src/lib/api/server.ts` drives `NEXT_PUBLIC_API_URL` +
   `AUTH_TOKEN` server-side.
4. **UploadThing:** browser `genUploader` targets `${NEXT_PUBLIC_API_URL}/api/uploadthing`
   (`web/src/lib/upload/uploadthing.ts`) — the platform's real `uploadthing/express` route
   (`platform/src/api/uploadthing.ts`) backed by `UPLOADTHING_TOKEN` /
   `UPLOADTHING_APP_ID` / `UPLOADTHING_INGEST_URL` in `platform/.env`. Anonymous browser
   uploads are **provider-upload staging** (no case-scoped audit), by the Prompt-4
   decision; the authorized `POST /api/v1/investigations/:id/evidence` → BullMQ → worker →
   MA05 generates the case-scoped audit trail and the `NORMALIZING → ANALYZING` fence.
5. **Ports:** platform `PORT=3001` (via `.env`; `server.ts` default 3000), and web
   `NEXT_PUBLIC_API_URL=http://localhost:3001`. `.env.local` defaults
   `NEXT_PUBLIC_DATA_MODE=demo`, so Live must be explicitly selected (or Auto) — this is
   exactly the intended Demo independence.

### Verdict

> **MA05 backend implemented, wired into the real Live ingestion pipeline, and verified on
> the real backend stack. Demo/Auto architecture remains intact (zero `packages/web`
> changes — verified via `git diff HEAD -- packages/web` = empty).**
>
> **"Browser → Live mode → MA05 → UI" and "Browser → UploadThing → evidence submit → MA05"
> are wired end-to-end but are NOT proven by the MA05 audit** — `realtime-live.integration.test.ts`
> honestly labels itself as "an INTEGRATION test (not a full real E2E)" and stubs only the
> fetch transport boundary; the repo has no browser E2E harness (no Playwright/`.spec.`/`.e2e.`
> artifacts).

> **Demo mode affected: NO.** Demo remains a separate deterministic product path fed by
> fixtures; Live is a separate real-backend path; Auto delegates to either. MA05 did not
> require web changes.

---

## 10. Remaining verification backlog

| # | Item | Type | Status |
|---|------|------|--------|
| 1 | Actual browser → Live Provider → MA05 → UI | environment-level E2E | **not yet run** |
| 2 | Actual browser → UploadThing → evidence submit → MA05 | environment-level E2E | **not yet run** |
| 3 | Production Neon schema deploy (`prisma db push`/migration on `DATABASE_URL`) | deployment | **not done this session** (only the test DB was updated) |

To run (1)/(2): start `pnpm --filter @indago/platform dev` (with `platform/.env`),
start `pnpm --filter @indago/web dev` (with `NEXT_PUBLIC_DATA_MODE=live`), create a Live
investigation, upload an evidence file, and confirm the UI renders `NORMALIZING → ANALYZING`
events and the `NormalizedExtraction` persists.

Deployment note for (3): the production Neon URL
(`ep-shy-meadow-az3si5ic…ap-southeast-1`) needs the same `hostaddr` IPv4 treatment as the
test URL before Prisma will connect reliably from Windows dual-stack hosts.

---

## 11. Known limitations & reviewer caveats

**Product/infra**
- `hostaddr` is pinned to the current pooler IPv4 A-record (`52.72.123.251`); if Neon
  rotates it, refresh the value (keep `hostname` for TLS).
- Real-concurrency behavior is proven at small scale (concurrent persistence test); no
  high-volume load test was run against the batch producer + real Postgres.
- `prisma db push` is used (no migration history yet) — production deploy requires an
  explicit `db push`/migration step.
- Policy v1 detection gaps surface as `AMBIGUOUS`/`INVALID`/`UNPARSED` by design — never
  silent guesses. Some intended-canonical forms (e.g. `MONTH_YEAR`, mixed TZ offsets) are
  deliberately left ambiguous.
- `rawValue` truncation at `maxFieldLength` is lossy (documented bound).
- Language heuristic is deliberately conservative (0.04 function-word threshold); low-
  confidence non-English text may omit `language` metadata.
- Pre-existing `as any` at `platform/src/queue/recovery.ts:28` — out of MA05 scope.

**Testing**
- Vitest does not typecheck tests — the three runtime-only key mismatches (§7.4) were
  caught by execution. Contract key renames must be mirrored in tests deliberately.
- The platform integration gate requires real infra + env exported in the shell (vitest
  does not load `.env`); documented in `.env.example`.
- The browser/Next layer is not covered by the platform integration gate (see §9/§10).

---

## 12. Changed files (MA05 footprint)

### Modified (18)

```
docs/roadmap/phase-tracker.md                       M-A05 [ ] → [x]
packages/contracts/src/common/ids.ts                + IngestionAttemptIdSchema
packages/contracts/src/domain/audit-event.ts        + NORMALIZATION_STORED/COMPLETED/FAILED
packages/contracts/src/execution/state-machine.ts   + NORMALIZING→FAILED edge
packages/contracts/src/index.ts                     exports
packages/contracts/tests/schema-validation.test.ts  extended
packages/intelligence/ingestion/package.json        suite wiring
packages/intelligence/ingestion/src/index.ts        exports normalization barrel
packages/platform/prisma/schema.prisma              + NormalizedExtraction model
packages/platform/src/persistence/ingestion-store.ts        write/read normalized
packages/platform/src/queue/ingest-deps.ts                  worker wiring
packages/platform/src/queue/ingest-evidence.ts              complete+permanent-failure paths
packages/platform/src/queue/transitions.ts                  fenced NORMALIZING→ANALYZING
packages/platform/tests/integration/ingestion-pipeline.e2e.test.ts  key fixes
packages/platform/tests/integration/ingestion-store.test.ts         normalization E2E
packages/platform/tests/integration/real-stack.e2e.test.ts          pre-warm + key fix
packages/platform/tests/worker-stub.test.ts              worker behavior
pnpm-lock.yaml
```

### New (7)

```
packages/contracts/src/intelligence/normalization.ts          contracts (352 lines)
packages/contracts/tests/normalization.test.ts                contract tests
packages/intelligence/ingestion/src/normalization/normalization-service.ts    engine (785 lines)
packages/intelligence/ingestion/src/normalization/stored-extraction.ts        rehydration (301 lines)
packages/intelligence/ingestion/src/normalization/index.ts                    barrel
packages/intelligence/ingestion/tests/normalization/                           59 tests
packages/platform/vitest.config.ts                         60s test/hook timeouts
```

Plus supporting docs: `docs/platform/m-a05-normalization.md`,
`docs/reports/m-a05-final-implementation-report.md`. The untracked `opencode.json` at repo
root is unrelated to MA05.