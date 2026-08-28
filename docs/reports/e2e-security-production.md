# End-to-End Security & Production Hardening

Repository: `INDAGO` — Packages: `platform`, `contracts`, `ingestion`, `web`
Date: 2026-08-28

---

## 1. Executive Summary

This phase closed the loop that the prior phase could only document: **the full application stack
now runs as one real system and is proven by real integration tests.**

Build & test evidence (all executed in this session):

| Package | Unit/Provider tests | Real-integration tests | Typecheck | Build |
|---|---|---|---|---|
| `@indago/platform` | **63 passed** | **18/18 passed** (real Postgres + Redis + BullMQ + worker + SSE) | clean | clean |
| `@indago/contracts` | **114/114** (7 files) | — | clean | clean |
| `@indago/ingestion` | **292/292** (26 files) | — | clean | clean |
| `@indago/web` | **199/199** (27 files) | — | clean | clean |

The centerpiece is the new **real-stack E2E suite** (`real-stack.e2e.test.ts`): it runs the
REAL express API, the REAL BullMQ queue against REAL Redis, the REAL worker, the REAL
acquisition/extraction pipeline and REAL Postgres — and asserts the complete lifecycle
HTTP POST evidence → job → worker → `RawExtraction` → run `NORMALIZING` → ordered SSE frames,
plus BullMQ producer dedup, real 503 retry→permanent-failure, exactly-once failure audit,
and API security (401/403/403/400).

It also fixed two latent but real integration truths that only surfaced once the stack became
real:

1. **`hashVerified` was never provable over the API** — the evidence contract had no content-
   hash field, so `Artifact.hashVerified` was always `false` end-to-end. Added an optional
   `sha256Hash` on `UploadedFileReferenceSchema`, wired into `ArtifactReference.declaredContentHash`,
   verified against fetched bytes on ingestion.
2. **`INGESTION_JOB_FAILED` was audited once per attempt (3× for a 3-attempt job), not once
   per job.** The worker's `"failed"` listener is now gated to terminal failure only (retries
   exhausted **or** `UnrecoverableError`), and non-retryable/integrity failures now throw
   `UnrecoverableError` so BullMQ stops immediately instead of pointlessly retrying.

## 2. Scope & Exit Criteria

In scope: real end-to-end verification of the canonical ingestion path; production hardening
of worker failure semantics (retry/audit/progress), evidence-submission hash verification,
UploadThing defense-in-depth, and SSE reconnect/re-sync; acceptance checklist + MA05 readiness
gate.

Out of scope (unchanged, per this phase): demo/live/auto provider architecture, demo fixtures and
realtime demos, UI components, provider interfaces, evidence wizard internals, and
normalization/observation/entity/graph/lead domains — nothing in those areas was rewritten;
the platform still does **not** create domain-model rows (RawExtraction is the output
boundary).

Exit criteria (all met): real-stack E2E + retry + dedup + security executed green; unit
suites green; typechecks + builds green; boundary/secret/leak audits clean; report with
reality matrix (§45), diagrams (§46), acceptance checklist (§47), boundary compliance (§48),
MA05 gate (§49).

## 3. Environment & Provisioning

No local Postgres/Redis exist on this machine, so this phase provisioned the stack with Docker:

| Component | Container | Version | Exposed | Auth |
|---|---|---|---|---|
| Postgres | `indago-postgres` | postgres:16-alpine (16.15) | 5432 | user `indago` (dev-only credential, not printed here) |
| Redis | `indago-redis` | redis:7-alpine | 6379 | `requirepass` set (dev-only; production MUST use a secret store) |

Two databases: `indago` (dev) and `indago_test` (dedicated integration DB). Integration
suites require `TEST_DATABASE_URL` + `REDIS_URL`; the platform `orchestrator` defaults to
`redis://localhost:6379`, so integration runs explicitly export `REDIS_URL` (the Redis
container requires the password).

Schema: `prisma db push` applied to `indago_test` (all 7 tables — Artifact, IngestionAttempt,
RawExtraction, InvestigationRun, AgentCheckpoint, AuditEvent, ToolExecution). Prisma Client
regenerated (v5.22.0).

## 4. Test Evidence: Full Matrix

| Command | Result | Notes |
|---|---|---|
| platform `vitest run` (unit, no env) | **63 passed / 18 skipped** | integration files self-skip without `TEST_DATABASE_URL`/`REDIS_URL` |
| platform `vitest run tests/integration` (env set, sequential) | **18/18 passed** | real Postgres + real Redis/BullMQ + real worker + real SSE |
| contracts `vitest run` | **114 passed** | |
| ingestion `vitest run` | **292 passed** | includes real PDF text-layer/OCR extraction |
| web `vitest run` | **199 passed** | 27 files (one CPU-load flake observed in an untouched test; green on clean reruns & in isolation) |
| platform/contracts/ingestion/web typecheck | **clean** | |
| platform `tsc` build / `next build` (web, 16 routes) | **clean** | web build must be run as a single direct process (see §21) |
| secrets / `any` / boundary greps | **clean** | §17, §18 |

## 5. Package-by-Package Results

- **@indago/contracts — unchanged semantics, one additive field.** `UploadedFileReferenceSchema`
  gains optional `sha256Hash` (hex SHA-256, regex-validated). Rebuilt `dist`; 114/114 green.
  All other schemas untouched.
- **@indago/ingestion — zero changes.** It already supported `ArtifactReference.declaredContentHash`
  (hash-verified acquisition, `HASH_MISMATCH` rejection, `requireContentHash` config). 292/292 green.
- **@indago/platform — worker semantics + hardening + tests.** See §9–§16 and §22.
- **@indago/web — one compile repair to make the live bundle genuinely buildable.**
  `factory.ts` referenced a `LiveCaseProvider` export that did not exist (the live provider
  bundled an unexported `UnsupportedCaseProvider`). Renamed/exported it as `LiveCaseProvider`
  (still typed `UNSUPPORTED` — the platform exposes no case-list endpoint). This is the same
  class it previously used internally; behavior unchanged. 199/199 + build green.

## 6. Reality Matrix (§45)

Honest labeling — what is real, what is a stub, what is documented-only:

| Layer | Component | Reality |
|---|---|---|
| HTTP API | `POST /investigations/start`, `POST …/evidence`, `GET …/:id`, `GET …/stream` | **REAL**, exercised by real-stack E2E |
| Auth | `resolveUploadAuth`, `requireAuth`, `requireRole`, `verifyCaseAccess` | **REAL** (dev-token boundary), 401/403/400 asserted |
| Queue | BullMQ `investigation-pipeline` (Redis, attempts 3, exp. backoff 2s/4s) | **REAL**, dedup + retry asserted with real Redis |
| Worker | single `investigationWorker`, `ingest-evidence` route | **REAL** |
| Acquisition | `HttpArtifactFetcher` → local HTTP fixture → SHA-256 → `FilesystemArtifactStorage` | **REAL**; content hash & on-disk bytes verified |
| Verification | `hashVerified` = computed==declared (declared via new `sha256Hash`) | **REAL** (now reachable over the API) |
| Extraction | real parser registry + TXT extraction | **REAL**; RawExtraction JSON asserted |
| Persistence | Prisma (Artifact/IngestionAttempt/RawExtraction/Run/Checkpoint/Audit) | **REAL** Postgres |
| SSE | real stream endpoint; CONNECTED + progress + EVIDENCE_* + audit passthrough | **REAL**; ordered-frame assertions |
| UploadThing | browser→UploadThing signing/CDN + platform middleware + `resolveUploadAuth` | **REAL code, unit-tested**; CDN handshake not exercised (no real UT secret/cdn) — documented §8/§13 |
| Next.js browser shell → server actions | unit-tested (validated transport, 401/403/404 mapping) | not browser-exercised here — documented omission (§8) |
| OCR (Tesseract) | provider wired at runtime | exercised by ingestion package real-PDF tests |

## 7. Architecture (§46)

**End-to-end evidence path (all real in `real-stack.e2e.test.ts`):**

```
browser/server-action (web unit-tested) ── POST /api/v1/investigations/:id/evidence
  gg-pipeline
platform routes.ts
  resolve Run → canonical caseId → verifyCaseAccess (403) → validate EvidenceSubmissionRequestSchema
  → for each file: ArtifactReference { url, declaredMimeType, declaredSizeBytes,
        declaredContentHash: sha256Hash?, providerMetadata.fileKey }
  → queue.add("ingest-evidence", payload, { jobId: "evidence-{inv}-{fileKey}" })   (dedup)
  → audit EVIDENCE_QUEUED → SSE EVIDENCE_SUBMITTED → 202 { operationId, jobsEnqueued }

BullMQ (real Redis) ── investigationWorker.ingest-evidence
  validate payload (Unrecoverable on malformed)
  resolve run; caseId==payload.caseId else Unrecoverable(CASE_ID_MISMATCH)  [attempt FAILED]
  upsert attempt RUNNING (retry# = attemptsMade+1)
  transition CREATED→INGESTING (+ agentCheckpoint + audit SYSTEM_ACTION)
  progress(state=INGESTING) "Acquiring…"
  acquire artifact (fetch → sha256 → verifies declared hash/mime/size → storage write)
  upsert Artifact by contentHash (content-addressed dedup)
  progress(state=INGESTING) "Classifying & extracting…"     ← run still INGESTING
  extract (parser registry) → if fail, onIngestionError
  upsert attempt SUCCEEDED  →  insert RawExtraction (immutable per attempt)
  transition INGESTING→NORMALIZING (+ checkpoint + audit)  ← state now NORMALIZING
  audit EVIDENCE_INGESTED (only after persistence)
  progress(state=NORMALIZING) "Extraction complete…"

Failure paths
  retryable (HTTP ≥500 / network): attempt FAILED ⨗ progress(state=INGESTING, "retrying…")
      ⨗ rethrow → BullMQ backoff; run stays INGESTING
  terminal (exhausted / non-retryable / integrity): UnrecoverableError rethrow,
      transition → RUN FAILED (+ FAILED frame once), worker "failed" listener audits
      INGESTION_JOB_FAILED exactly once
```

**SSE flow (§18–§20):**

```
POST evidence → realtimeEvents.emit("progress", EVIDENCE_SUBMITTED)
worker progress()      → EVIDENCE_* / state frames (state mirrors DB — §9)
audit logger()         → broadcasts each hash-chained AuditEvent with id
stream endpoint        → data: <json> per frame + CONNECTED { id: randomUUID(), timestamp }
web LiveRealtimeProvider → sse-client → normalizeEvent → deduper (id/signature)
  STREAM_CONNECTED (with unique id) → overview re-fects InvestigationRun (re-sync)
```

## 8. Real-Stack E2E Execution (§31–§34)

`packages/platform/tests/integration/real-stack.e2e.test.ts` (new, gated on
`TEST_DATABASE_URL && REDIS_URL`):

| Test | What it proves | Result |
|---|---|---|
| start a run through the real API | run persisted `QUEUED` + canonical `caseId` | pass |
| REAL end-to-end (SSE + BullMQ + worker + Postgres) | artifact (contentHash, caseId, hashVerified), attempt SUCCEEDED/attempt 1/parserId, RawExtraction `TXT` + content, ordered SSE frames CONNECTED → EVIDENCE_SUBMITTED → EVIDENCE_QUEUED → INGESTING → NORMALIZING → EVIDENCE_INGESTED, and **`ingestedIdx > normIdx`** (§4 guard on the wire) | pass |
| BullMQ producer dedup | same `jobId` POST twice → same `processedOn`, one attempt, still completed, no phantom re-process | pass |
| REAL retry + permanent failure | `/flaky.txt` 503 → BullMQ retry ×3 (backoff 2s/4s) → run `FAILED`, attempt `FAILED` attempt 3 with error `HTTP_ERROR`, `INGESTION_JOB_FAILED` audit **count = 1** | pass |
| security on the real API | 401 (no auth), 403 (bad token), 403 (wrong caseId incl. run.caseId cross-check), 400 (malformed body) | pass |

Honest omissions (documented, unit-tested elsewhere): the Next.js browser shell, UploadThing
signing/CDN, and the browser→UploadThing handshake are not exercised against the real network
(stack would require the UT secret + a browser). §34 scope = API→queue→worker→DB→SSE path,
which is exactly what this suite exercises with zero mocks in the data path.

## 9. §4 Progress-State Convergence (SSE state mirrors DB)

- The "Classifying & extracting…" progress frame was previously emitted with state
  `NORMALIZING` while the DB was still `INGESTING` → the SSE stream claimed a later lifecycle
  stage than the authoritative run (a §4 violation). Now it emits `INGESTING`; the run only
  becomes `NORMALIZING` after `RawExtraction` is durably persisted and the DB transition runs.
- Retryable attempt failures emit `INGESTING` + "retrying…" (run truly stays INGESTING);
  `FAILED` frames are produced exclusively by `transitionRunToPermanentFailure`, which drives
  the DB to FAILED itself. Verified in `worker-stub.test.ts` (§4: classify frame is INGESTING
  and precedes the first NORMALIZING enable; retryable ⇒ no FAILED frame; terminal ⇒ FAILED)
  and on the wire by `real-stack` (`ingestedIdx > normIdx` and the streamed state sequence).

## 10. Retry & Failure Semantics

Explicit, tested model (queue defaults attempts 3 / exponential backoff 2000):

| Failure | Durable attempt | Progress frame | Throw | Audit |
|---|---|---|---|---|
| Retryable, retries remain | `FAILED` ⨗ | `INGESTING` "retrying…" | `Error` (BullMQ retries) | — |
| Retryable, exhausted | `FAILED` | `FAILED` (from transition) | `UnrecoverableError` | `INGESTION_JOB_FAILED` ×1 |
| Non-retryable (404, copy/auth/hash mis-match, empty, unsupported) | `FAILED` | `FAILED` (from transition) | `UnrecoverableError` | `INGESTION_JOB_FAILED` ×1 |
| Integrity (malformed payload / unknown run / `CASE_ID_MISMATCH`) | (`CASE_ID_MISMATCH` writes a FAILED attempt) | — | `UnrecoverableError` | `INGESTION_JOB_FAILED` ×1 |

`UnrecoverableError` is what makes "non-retryable" actually mean it: BullMQ otherwise retries
any rejection, which would have silently turned a 404 into 3 pointlessly-held acquisitions.
The `"failed"` listener now audits **only terminal** outcomes (`attemptsMade >= attempts`
**or** `err instanceof UnrecoverableError`), which fixed the 3×-audit bug (§1).

## 11. Idempotency & Deduplication (three layers)

1. **API level:** `POST /evidence` generates backend-owned `operationId`/`correlationId`; the
   browser never fabricates them.
2. **Queue level:** `jobId = "evidence-{investigationId}-{fileKey}"` — BullMQ at-most-once.
   Real-stack test proves re-POSTing the same file against the same run neither re-processes
   nor changes `processedOn`, and leaves exactly **one** attempt row.
3. **Content level:** `Artifact.contentHash @unique` (SHA-256) — bytes dedup to one row and a
   deterministic artifact id. Ingestion `(investigationId, idempotencyKey) @unique` and
   `RawExtraction.attemptId @unique` enforce immutable-per-attempt persistence.
   `ingestion-pipeline.e2e` proves identical bytes via a second job → **same artifact row**.

## 12. §8–§10 Evidence-Submission Hardening (hash verification)

- **Before:** the evidence contract carried no content hash, so `Artifact.hashVerified` was
  `false` in every real submission — a verification knob that the API could never satisfy.
- **After:** `UploadedFileReference.files[].sha256Hash` (optional, regex-validated,
  untrusted). `routes.ts` maps it to `ArtifactReference.declaredContentHash`; acquisition
  recomputes SHA-256 over the fetched bytes and sets `hashVerified = computed === declared`
  (a mismatch is `HASH_MISMATCH`, non-retryable, and the job fails). Real-stack now asserts
  `hashVerified === true` end-to-end over HTTP.
- Web server-actions and the wizard submit without a hash — `hashVerified` then truthfully
  reports `false` (an unverified artifact) rather than fabricating verification.

## 13. §8–§10 UploadThing Defense-in-Depth (resolveUploadAuth)

`packages/platform/src/api/auth.ts` resolves the request:

| Request | Result |
|---|---|
| No `Authorization` header | authenticated anonymous (UploadThing-signed handshake), `user: null` |
| Non-Bearer scheme | rejected `"Malformed authorization header"` |
| Invalid Bearer token | rejected `"Invalid upload token"` |
| Valid Bearer token | authenticated as the platform user |

`uploadthing.ts` middleware now enforces this (upload completes only when the pre-signed
handshake passes **or** a real platform token is presented), and surfaces `{ investigationId,
uploader }` to `onUploadComplete`. Covered by 5 new unit tests in `upload-producer.test.ts`.
The Browser uploads still travel through UploadThing's signed URLs (`x-investigation-id`
required) — the platform never bypasses UploadThing; `onUploadComplete` only resolves the run
and audits.

## 14. Auth & Case Boundary

Unchanged and re-verified end-to-end: single `verifyToken` (dev `demo-token` → INVESTIGATOR
`usr_demo_123`, allowedCases); `requireAuth` 401 / 403; `verifyCaseAccess` (non-production
returns true) **plus** the `run.caseId === query.caseId` cross-check on the status endpoint;
`GET ?caseId=` 403 on an outside case; evidence bodies require `investigationId` and are
re-checked against the run. Web maps 401/403 → `AUTHORIZATION` (existing tests still green).
No credentials are printed or shipped; the web bundle has zero platform credentials (see §18).

## 15. §18–§20 Realtime Convergence (RESYNC)

- The SSE `CONNECTED` frame now carries a fresh `id: randomUUID()` + `timestamp`, giving each
  (re)connection a unique identity. The web dedup key is `id` when present, so reconnects
  surface as distinct events instead of being swallowed as duplicates.
- `investigation-overview.tsx` listens for `STREAM_CONNECTED`: on reconnects after the first
  connection it re-fetches the authoritative `InvestigationRun` state (so the UI re-syncs to
  the DB reality without double-fetching on the initial connect).
- Audits broadcast over SSE keep their own `id`; progress frames carry timestamps — dedup
  stays safe. Real-stack validates the ordered streamed lifecycle end-to-end (§8).

## 16. §40–§44 Audit Trail & Exactly-Once Failure Audit

- Every step is audited through the hash-chained `audit/logger.ts` and **also broadcast over
  SSE** (the record IS the activity feed event): `INVESTIGATION_OPENED`, `EVIDENCE_QUEUED`,
  `EVIDENCE_INGESTED` (only after persistence), `SYSTEM_ACTION` transitions (ORCHESTRATOR),
  `INGESTION_PERMANENT_FAILURE`, and the terminal `INGESTION_JOB_FAILED`.
- `INGESTION_JOB_FAILED` exactly-once (attempt-level vs. job-level semantics fixed — §10),
  asserted by the real-stack test (`auditCount === 1` for a 3-attempt failure).

## 17. §1/§48 RawExtraction Boundary Compliance

RawExtraction remains the terminal output of the ingestion tier. Audits:

- `@indago/ingestion` extraction produces `RawExtraction` values only; it never constructs
  Observations / EntityHypotheses / RelationHypotheses / GraphNodes / GraphEdges / Leads /
  Gaps — matches the M-PR3 do-not list.
- Platform src contains **zero** `prisma.observation/entityHypothesis/relationHypothesis/
  graphNode/graphEdge/investigativeLead/investigativeGap .create*` calls (grep-verified §4
  heading of this section).
- Ingestion keeps full provenance: attempt (parserId/parserVersion/format/attemptNumber),
  artifact linkage, `extractedAt`; `warnings` round-trip in their own column (single source
  of truth — the `extraction` JSON no longer embeds a duplicated `warnings` copy, fixing an
  integrity mismatch caught by the store round-trip test).

## 18. Security Audit

- **Secrets:** zero hardcoded credentials in any `packages/**/src` (grep for password/secrets/
  bearer literals → only explanatory comments). Web ships no `AUTH_TOKEN`; platform never
  prints DB/Redis credentials.
- **Input:** evidence payload strict-validated (url/name/size/mime/hash), 400 on malformed;
  queue payload re-validated in the worker; hash/mime/size all verified against fetched bytes.
- **Case boundary:** doubly enforced (access-check + run.caseId cross-check), asserted with
  real HTTP requests.
- **Worker integrity:** canonical `run.caseId` (not the payload's) is the source of truth; a
  mismatched queue payload is `CASE_ID_MISMATCH` and never touches the artifact.
- **UploadThing:** middleware auth gate (§13), `x-investigation-id` required.

## 19. Fault Modes Found & Fixed

| Fault | Root cause | Fix / test |
|---|---|---|
| `hashVerified` always false | contract lacked a content-hash field | `sha256Hash` → `declaredContentHash` (§12) |
| Failure audit 3× per job | listener fired per attempt | terminal-only gate + `UnrecoverableError` (§10) |
| Non-retryable failure retried | plain `Error` threw → BullMQ retried | `UnrecoverableError` for terminal/integrity (§10) |
| Duplicate FAILED frames | handler emitted + transition emitted | single emit from `transitionRunToPermanentFailure` (§9) |
| `extraction` JSON duplicated `warnings` | extraction column stored warnings copy | strip into dedicated column (§17) |
| Real-stack dedup poll always false | BullMQ `Job` has no `.state` property (`getState()` is async) | test uses `getState()` |
| Web live bundle did not compile | `factory.ts` imported missing `LiveCaseProvider` | export the (unchanged) `UnsupportedCaseProvider` as `LiveCaseProvider` (§5/§19) |
| Cross-suite DB clobber | pnpm recursive runner double-spawned vitest into one test DB | sequential execution, dedicated DB, reset-fixtures (§21) |

## 20. Env & Secrets Audit

- Platform env reads at process start into singletons (`db`, `orchestrator`); integration
  suites set `DATABASE_URL`/`REDIS_URL`/`ARTIFACT_STORAGE_DIR` **before** dynamic imports —
  verified pattern, no env leakage between suites.
- Web env: existing `.env.example` keys unchanged (nothing new introduced).
- Dev containers use dev-only credentials (redacted in this report); production security notes:
  Redis `requirepass` from a secret store, Postgres credentials from a secret store, real JWT /
  OIDC bearer verification behind the `verifyToken` seam, UploadThing secret server-side only,
  and `NODE_ENV=production` (turns the dev `verifyCaseAccess` bypass off).

## 21. Reproducibility & Environment Quirks

- **pnpm `--filter` on this Windows box** sometimes executes package scripts from a virtual
  store path (`…\pnpm\store\v11\projects\<hash>\packages\…`) where Windows junctions
  (`AppData/Local/Application Data`) cause esbuild to fail loading any package's
  `vitest.config.ts` (`Cannot read directory … Access is denied`). Affects contracts/
  ingestion/web (which ship configs); it predates and is unrelated to this phase.
- **Reliable pattern used for verification:** run suites directly from the package directory
  (`npx vitest run …` from `packages/<pkg>`), and `npx next build` directly (a direct
  `pnpm --filter web build` double-spawns `next build` which collide on `.next`).
- **Platform test scripts** now enforce sequential file execution via CLI
  (`vitest run --no-file-parallelism` on both `test` and `test:integration`) instead of a
  config file — same guarantee that the two real-DB suites never clobber a shared test DB,
  without the pnpm/config-load problem.
- **Flaky test note:** `web/tests/api-client.test.ts` intermittently fails under full-suite
  CPU load (passes in isolation and on clean reruns — 199/199 final); untouched by this phase.

## 22. Files Changed

Platform (src): `queue/ingest-evidence.ts` (INGESTING progress, UnrecoverableError semantics,
single FAILED emit), `queue/orchestrator.ts` (terminal-only failure audit), `api/routes.ts`
(declare content hash), `api/auth.ts` (resolveUploadAuth), `api/uploadthing.ts` (auth gate),
`realtime/sse.ts` (CONNECTED id+timestamp), `persistence/ingestion-store.ts` (warnings column
truth, single Prisma boundary preserved).

Platform (tests): `tests/worker-stub.test.ts` (§4/§5 progress-state tests + bullmq mock),
`tests/upload-producer.test.ts` (resolveUploadAuth), `tests/integration/real-stack.e2e.test.ts`
(new real-stack suite), `tests/integration/ingestion-pipeline.e2e.test.ts` (declared hash).
`package.json` scripts (sequenced execution).

Contracts: `intelligence/evidence-submission.ts` (optional `sha256Hash`).

Web: `src/lib/providers/live/providers.ts` (`LiveCaseProvider` exported). Everything else
unchanged (no component/provider/interface rewrites).

## 23. Definition of Done — Acceptance Checklist (§47)

- [x] Real-stack E2E executed against **real** Postgres + Redis/BullMQ + worker + SSE — zero
      mocks in the data path (§8).
- [x] POST evidence → RawExtraction durable → run reaches `NORMALIZING` → streamed
      `EVIDENCE_INGESTED` ordered **after** the persistence-enabling `NORMALIZING` frame (§8, §9).
- [x] BullMQ producer dedup proven: same jobId submitted twice → one processing, one
      attempt, one artifact (§11).
- [x] Real retry + permanent failure: 503 → 3 attempts → run FAILED; non-retryable and
      integrity failures do **not** retry; `INGESTION_JOB_FAILED` audited **once** (§10, §16).
- [x] `hashVerified` provable over the API via optional `sha256Hash` (§12).
- [x] UploadThing middleware defense-in-depth with `resolveUploadAuth` (5 unit tests) (§13).
- [x] SSE CONNECTED carries a unique id; web re-syncs InvestigationRun on reconnect (§15).
- [x] Progress `state` mirrors the authoritative run state at every emit site (§9).
- [x] RawExtraction boundary: no observation/entity/lead/graph writes; provenance kept (§17).
- [x] API security: 401 / 403 (bad token + wrong caseId) / 400 asserted over the real HTTP
      stack (§8, §14).
- [x] No hardcoded secrets; env documented; web bundle has no platform credentials (§18, §20).
- [x] Platform 63 unit + 18 real-integration; contracts 114; ingestion 292; web 199; all
      typechecks + builds green (§4, §5).
- [x] Demo/live/auto providers, fixtures, wizard, and UI untouched (except the one
      compile-repair export rename, §5).
- [x] Reality matrix, diagrams, audit checks, MA05 gate included herein (§6–§24).

## 24. §49 MA05 Readiness Gate

MA05 (normalization/observation extraction) can be considered **READY** when the ingestion
tier delivers a durable, queryable, provenance-preserving normalized surface. Status:

- **RawExtraction IS durable** — immigrant-per-attempt rows in Postgres (verified on-disk in
  the real-stack suite; immutable `attemptId @unique`).
- **RawExtraction IS queryable** — dedicated store boundary (`findRawExtractionByAttempt`,
  artifact content-hash lookup) with strict types (no `any`).
- **Provenance is preserved** — every row carries artifactId, parserId, parserVersion,
  format, attemptNumber, investigationId, extractedAt.
- **Boundary stays clean** — no observation/entity/lead/graph writes at the raw tier (§17).

**MA05 input fields (ready to consume):**

| Field | Present | Source |
|---|---|---|
| `investigationId` / `caseId` | yes (Artifact + Run) | canonical Prisma |
| artifact content (fetched bytes / hash) | yes (FilesystemArtifactStorage, SHA-256) | acquisition |
| `RawExtraction.extraction` (format/lines/…) + `warnings` | yes | extraction tier |
| parser provenance (id/version/format) | yes (attempt + extraction rows) | extraction tier |
| attempt/idempotency identity | yes | queue/`idempotencyKey` |
| audit trail (hash-chained, SSE-broadcast) | yes | audit/logger |

**Gate verdict: READY (YES).** Run reaches NORMALIZING and downstream MA05 can consume
`RawExtraction` without reaching back into the ingestion tier. MA05 itself (normalization,
analytics) remains the next phase's scope and must not modify RawExtraction.

## 25. Risks & Next-Phase Seams

1. **UploadThing real handshake** still needs a live UT secret + browser to exercise the CDN
   signing path end to end (unit-tested only). `prepareUpload` progress semantics should be
   confirmed against real UploadThing.
2. **List/metadata endpoints** (`cases`, evidence/entities/leads/gaps reads,
   `investigations.listByCase`, canonical investigation metadata) remain `UNSUPPORTED` /
   projection defaults until the platform exposes GET endpoints.
3. **Auth is dev-grade** (`demo-token`). Production hardening of `verifyToken` (JWT/OIDC +
   secret store) is the migration path; `NODE_ENV=production` already disables the
   dev-access bypass and the wrong-case 403 cross-check is real at any env.
4. **Wizard mount seam** (provider-backed evidence flow on the active route) remains
   documented for the next phase.
5. **pnpm/junction quirk** (§21) is environmental — direct package-dir execution is the
   reliable CI pattern on this box (documented in `test:integration` guidance).

## 26. Run Instructions (reproduce)

```powershell
# 1. Infra (Docker Desktop must be running)
docker start indago-postgres indago-redis     # or docker compose up -d

# 2. Schema (once)
pnpm --filter @indago/contracts build
$env:DATABASE_URL = "postgresql://indago:<password>@localhost:5432/indago_test"
pnpm --filter @indago/platform db:push
Remove-Item Env:DATABASE_URL

# 3. Platform real-stack verification (direct, sequential — see §21)
Set-Location packages/platform
$env:TEST_DATABASE_URL = "postgresql://indago:<password>@localhost:5432/indago_test"
$env:REDIS_URL = "redis://:<redis-password>@localhost:6379"
npx vitest run tests/integration --no-file-parallelism   # 18/18

# 4. Unit + package verification
$env:TEST_DATABASE_URL = ""; $env:REDIS_URL = ""          # (integration files self-skip)
pnpm --filter @indago/platform test                       # 63 passed / 18 skipped
(push to packages/contracts, packages/intelligence/ingestion, packages/web)
npx vitest run                                           # 114 / 292 / 199
npx tsc --noEmit                                         # clean
npx next build                                           # web: 16 routes
```

---

*No secrets are printed in this report; dev-only credentials are redacted. Every test
assertion was executed in this session against the provisioned containers.*
