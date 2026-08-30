# M-A06: Observation Extraction — Final Implementation Report

## Status: COMPLETE

---

## 1. Objective

Extract **discrete, provenance-attributable observations** from a persisted
`NormalizedExtraction` and make them available end-to-end: a pure deterministic
extractor in `@indago/ingestion`, durable append-only persistence in
`@indago/platform` (idempotent across re-runs), case-scoped API exposure, and a
live-provider seam in the web client — all without fabrication, guesswork, or
`any`-casts.

---

## 2. What Was Delivered

### 2.1 Strict contracts (`@indago/contracts`)

- `SourceCatalogSchema` (`FIR | CDR | FINANCIAL | SURVEILLANCE | SOCIAL | INTEL |
  MANUAL`) + `DEFAULT_SOURCE_CATALOG = "MANUAL"` (`src/domain/source.ts`) — the
  canonical enum, single-sourced (no duplicate definitions).
- `ObservationSchema` (`.strict()`): `candidateMentions` (lexical spans for
  MA07), `strength`, `provenance`, `observedAt`, `entityIds`, `hypothesisIds`.
- `IngestionJobPayloadSchema`: `sourceCatalog` is now **REQUIRED** in the queue
  contract; `EvidenceSubmissionRequestSchema` keeps it loose/optional (≤50
  chars) since the platform strictly re-validates with a MANUAL fallback.
- `EvidenceSchema`: `locationRef` optional/global by contract — exact locations
  live on `Observation.provenance`, never conflated.

### 2.2 Pure observation engine (`@indago/ingestion`)

- `buildObservationIdentityKey` + `serializeSourceLocation`
  (`src/observation/observation-id.ts`).
- `extractObservations` / `finalizeObservation` (`observation-extractor.ts`),
  deterministic and pure — no Prisma/BullMQ/Redis/LLM.
- `candidateMentions` span extraction + strength baselines
  (`observation-rules.ts`); `computeContentHash` / `bytesToUuid4` re-exported at
  the package root.

### 2.3 Durable platform wiring (`@indago/platform`)

- **Deterministic evidence identity**: `Evidence.id` = SHA-256 UUID over
  `investigationId:operationId:artifactId` — identical on every attempt and
  process, making upserts idempotent.
- `observation-store.ts`: `deterministicEvidenceId`, `upsertSource`,
  `upsertEvidence` (evidence-idempotent), `ensureObservations`
  (`identityKey @unique` + `createMany skipDuplicates` → re-run yields
  `{ created: 0 }`, no re-audit), `countObservationsByEvidence`,
  `listObservations` (case-scoped, schema-corrupt rows surface loudly),
  `listEvidenceByInvestigation` → `EvidenceProjection` (documented **local**
  read shape — the platform persists a narrower Evidence row than the canonical
  `EvidenceSchema` and refuses to fabricate `strength` / `posture` /
  `provenance.extractor`; `status` is derived server-side from durable
  state).
- `ingest-evidence.ts`: `completeMA06` + **per-column `rehydrateStoredNormalized`**
  — re-entry re-validates only the JSON content columns
  (`NormalizationConfigSchema`, `z.array(NormalizedFieldSchema)`,
  `QualityMetadataSchema`, `LexicalStatisticsSchema`); identity strings pass
  through (fixture `attemptId: "attempt-1"` round-trips). Tampered JSON →
  `NORMALIZATION_FAILED` → run FAILED (terminal).
- `realtime/sse.ts`: `ObservationExtractedFrame` — metadata-only
  (`evidenceId`, `count`, catalog), never content.
- `api/routes.ts`: **producer fix** — `resolvedSourceCatalog` via
  `SourceCatalogSchema.safeParse` with MANUAL fallback + `declaredSourceCatalog`
  preserved verbatim, solving the `sourceCatalog  "Required"` mass job failure;
  and GET `/investigations/:id/observations` — caseId derived from the persisted
  latest run (never client-supplied), `verifyCaseAccess` → 403 on boundary
  violation, 404 when missing.
- `api/routes.ts`: `GET /investigations/:id/evidence` — same auth seam as
  observations, returns the `EvidenceProjection` envelope
  (`{ investigationId, caseId, count, evidence }`).
- Prisma `Source` / `Evidence` / `Observation` models; schema pushed to dev +
  test Neon DBs.

### 2.4 Web (F-PR2 provider seam)

- `SOURCE_CATALOG_LABELS` + re-exports in `lib/contracts/types.ts`.
- Intake: `sourceCatalog` dropdown (default MANUAL) in `evidence-metadata-form`
  → mapped to the submission in `evidence-intake` → review row in
  `evidence-review`.
- API: `ObservationsResponse` in `lib/api/types.ts`, `listObservations` in
  `lib/api/server.ts` (via `platformFetch`) and the `"use server"` wrapper in
  `server-action.ts`.
- `LiveObservationProvider` (`lib/providers/live/providers.ts`): list-by-
  investigation → `Paginated<Observation>` with abort→CANCELLED and
  `toLiveProviderError` mapping (403→AUTHORIZATION, 404→NOT_FOUND, 5xx→SERVER,
  TypeError→NETWORK); `listByEntity` stays UNSUPPORTED (no platform endpoint —
  never fabricated). Registered in `createLiveWorkspaceProviders`.
- `EvidenceListItem` + `EvidenceListResponse` in `lib/api/types.ts`,
  `listEvidence` in `lib/api/server.ts` + `server-action.ts` — the web-side
  mirror of the platform `EvidenceProjection` API.
- `LiveEvidenceProvider.listByInvestigation` implemented (paging applied over
  the authoritative platform list; `strength` is deliberately absent — never
  fabricated); `get()` stays UNSUPPORTED (no platform single-get). Demo provider
  maps canonical `Evidence` → `EvidenceListItem` via `toListItem`.
  `evidence-item` / `evidence-list` and the evidence page now consume
  `EvidenceListItem` — the Evidence tab renders the uploaded artifact in live
  mode instead of the "not available" empty state.

---

## 3. Verification Matrix

| Package | Typecheck | Tests | Build |
|---|---|---|---|
| `@indago/contracts` | ✅ exit 0 | 159/159 | ✅ `tsc` exit 0 |
| `@indago/ingestion` | ✅ exit 0 | 385/385 | ✅ `tsc` exit 0 |
| `@indago/platform` | ✅ exit 0 | **132/132** (real Neon + Upstash + BullMQ + SSE) | ✅ `tsc` exit 0 |
| `@indago/web` | ✅ exit 0 | **259/259** | ✅ `next build` exit 0 |

Platform highlights:

- `observation-store.test.ts` (8/8): deterministic evidenceId retry-safety,
  source/evidence idempotency + `declaredCatalog` preservation, dedup second
  pass → `created: 0`, scoped count/list, corrupt-row rejection, evidence-list
  projection (`observationCount`, derived `status`, case scoping).
- worker-stub + upload-producer suites (77/77); real-stack e2e (6/6) reaches
  `ANALYZING` with `EVIDENCE_INGESTED / NORMALIZATION_STORED /
  OBSERVATION_EXTRACTED / NORMALIZATION_COMPLETED` audits.
- A standalone `probe-worker.ts` verified the FULL live pipeline
  `CREATED → INGESTING → NORMALIZING → ANALYZING` (job COMPLETED, 1 observation,
  catalog MANUAL) end-to-end against real infra before being removed.

---

## 4. Notable Debugging Discoveries

### 4.1 Producer regression: jobs died on `sourceCatalog`

The real producer in `routes.ts` enqueued `ingest-evidence` jobs WITHOUT the now-
required `sourceCatalog` — every job failed fast with `UnrecoverableError:
Malformed ingest-evidence payload: sourceCatalog "Required"`. Diagnosed with a
probe, fixed by strict `SourceCatalogSchema.safeParse` + `declaredSourceCatalog`
preservation. Real-stack went 3-failing → 6/6.

### 4.2 Upstash lock-renewal stalls under parallel load

Full-suite runs intermittently showed `attemptNumber: 2` duplicate processing
from BullMQ lock renewal stalling when vitest ran suites in parallel
(`fileParallelism` default true). **Fix: `vitest.config.ts` → `fileParallelism:
false`.** Verified by two consecutive full 131/131 runs. The alternate
"two consumer" theory (orchestrator import in the e2e suite) was disproven —
that test never imports the orchestrator; the line-239 string was a Prisma
`where: { actor: "ORCHESTRATOR" }` query.

### 4.3 M-A06 contract change surfaced pre-existing fixture staleness

Adding the required `candidateMentions` field to `ObservationSchema` broke 11 web
suites at fixture-collection time: the demo fixtures
(`demo-fixtures/observations.ts`) had never been updated. Added `candidateMentions:
[]` to all 8 observations. Vitest does not typecheck, so stale test literals
surface only at runtime — 196 → 250 passing after the fix.

### 4.4 Import binding vs. re-export in the API envelope type

`ObservationsResponse` referenced `Observation` via `export type { Observation }
from "@indago/contracts"` — a re-export does NOT bind a local name, so `tsc`
failed (`Cannot find name 'Observation'`). Fixed by a top-level
`import type { Observation }` (the re-export was unneeded and dropped).

### 4.5 Rehydration must not re-validate identity columns

A naive strict `NormalizedExtractionSchema.parse` on the stored row rejected
realistic fixtures (`attemptId: "attempt-1"` is not a UUID). Rehydration now
parses only the JSON content columns with their column schemas, and passes IDs
through — tampered JSON still fails permanently.

---

## 5. Audit Rules Compliance

- No `as any` / `: any` / `@ts-ignore` / `@ts-nocheck` / `eslint-disable` in any
  M-A06 source or test file (grep-verified; the only match is a policy comment
  in `observation-store.ts` that says *no* `any`).
- **Single-sourced schemas**: exactly one `ObservationSchema` (`contracts/src/
  domain/observation.ts`), one `EvidenceSchema` (`domain/evidence.ts`), one
  `SourceCatalogSchema` (`domain/source.ts`). No duplicates were introduced in
  any package.
- **Pure-layer isolation**: the extractor imports only `zod` / `@indago/
  contracts` / local ingestion types.
- **Never fabricate**: live provider `listByEntity` throws `UNSUPPORTED`; the
  platform derives `caseId` server-side; `declaredSourceCatalog` is preserved
  for audit.
- Verified against the roadmap: M-A06 flipped `[x]` in
  `docs/roadmap/phase-tracker.md`.

---

## 6. Artifacts

| Artifact | Location |
|---|---|
| Milestone doc | `docs/platform/m-a06-observation-extraction.md` (4 mermaid diagrams) |
| Phase tracker | `docs/roadmap/phase-tracker.md` (M-A06 → `[x]`) |
| Contracts | `@indago/contracts` `src/domain/source.ts`, `src/domain/observation.ts`, `src/domain/evidence.ts`, `src/intelligence/ingestion-job-payload.ts`, `src/intelligence/evidence-submission.ts` |
| Engine | `@indago/ingestion` `src/observation/*` (identity keys, extractor, rules) |
| Wiring | `@indago/platform` `src/persistence/observation-store.ts`, `src/queue/ingest-evidence.ts`, `src/realtime/sse.ts`, `src/api/routes.ts`, `prisma/schema.prisma` |
| Web | `@indago/web` `src/lib/contracts/types.ts`, `src/components/evidence/*`, `src/lib/api/{types,server,server-action}.ts`, `src/lib/providers/live/providers.ts` |
| Integration suite | `@indago/platform` `tests/integration/observation-store.test.ts` (7 tests) |
| Test DB / Redis | Neon project via `TEST_DATABASE_URL`; Upstash via `REDIS_URL` (`packages/platform/.env`) |