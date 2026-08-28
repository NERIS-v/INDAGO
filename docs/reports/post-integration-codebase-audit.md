# Post-Integration Codebase Audit

> HEAD `b423ec8` (main) — audited after Gurashish's pipeline-wiring work (`7975ab4`, `730089a`, `34ab3af`), compared against the agreed I-PR2 architecture.
> Method: read-every-file + run-every-verification. No code was modified.
> Legends: ✅ implemented / ⚠️ partial / ❌ absent / 🧪 test-only / 🔴 defect

---

## 1. Executive Summary

**The state-machine pipeline and the ingestion pipeline are now two different worlds, and the second one finally does real work.**

Gurashish wired the `@indago/ingestion` package into the platform worker end-to-end: evidence submitted via `POST /investigations/:id/evidence` is now **validated → fetched over HTTP → classified → OCR'd → parsed → console-dumped → audit-stamped (EVIDENCE_INGESTED) → progress-broadcast**. That is a genuine vertical slice of M-PR1→M-PR3, previously absent.

**But it is 100% in-memory and 0% persisted.** The artifact is stored in a module-level `InMemoryArtifactStorage` (lost on restart), the `RawExtraction` result is printed with `console.dir` and discarded, no Artifact/RawExtraction/Evidence/EvidenceItem row exists in Prisma, and no investigation-run state transition happens for evidence jobs. The run-state machine (CREATE→INGEST→NORMALIZE→ANALYZE→DISCOVER) executes purely against a *legacy* branch (`/ingest` over HTTP, or `USE_MOCK_INGESTION`) that is unrelated to the new ingestion package. UploadThing remains an audit-only producer; there is still exactly **one** `ingest-evidence` producer.

Frontend safety holds: the web workspace seam (F-PR2) is read-only, live providers are unsupported-stubs, and the I-PR2 evidence-wizard UI is **dead code** (zero imports, unmounted route renders a generic scaffold). Demo parity is intact.

**Three 🔴 findings** merit attention before I-PR3: (1) `routes.ts:169` fabricates a random `caseId` into the queue payload when the run's caseId isn't UUID-shaped; (2) `server.ts:37` hardcodes the Seattle UploadThing ingest URL; (3) untracked `packages/platform/test-db.mjs` ships a live Neon connection string with a real password.

Verdict: **structurally sound foundation, I-PR3 can start** once persistence, state-lifecycle, and the write-path UI seam are accepted as the next milestones.

---

## 2. Repository State

- **HEAD:** `b423ec8` on `main` (local matches `origin/main`).
- **Commits since the I-PR2 audit baseline** (all merged; no open feature branches):

| Commit | Title | Effect |
|---|---|---|
| `7975ab4` | feat(platform): wire ingestion and extraction services to BullMQ worker | Imports `@indago/ingestion`; worker now acquires + extracts + audits `EVIDENCE_INGESTED` |
| `730089a` | fix(platform): resolve UploadThing regional routing and state machine transitions | Hardcodes `ingestUrl: https://sea1.ingest.uploadthing.com`; comments out pipeline re-queue in the CREATED branch |
| `34ab3af` | test(platform): add emitProgressEvent to sse mock in worker-stub | Tests now assert acquisition/extraction/`EVIDENCE_INGESTED` |

- `origin/feat/wire-extraction-pipeline` and `origin/fix/phase3-backend-routing` are **fully merged** into main.
- Packages: `contracts`, `platform`, `ingestion` (inside `intelligence/`), `web`. Root is pnpm workspace; no CI (`.github/**` absent).
- Untracked file of note: `packages/platform/test-db.mjs` 🔴.

---

## 3. What Changed Since the I-PR2 Audit

| Area | I-PR2 audit finding | Now |
|---|---|---|
| Worker evidence path | enqueued + audited, **no ingestion** | ✅ acquires, classifies, extracts, audits `EVIDENCE_INGESTED` |
| Artifact storage | n/a (no wiring) | ⚠️ `InMemoryArtifactStorage` only (`mem://{hash}`), module-level singleton |
| Raw extraction | n/a | ⚠️ produced, `console.dir`'d, **never persisted** |
| Evidence job → run state | no transition | ❌ still no DB/state change for `ingest-evidence` jobs |
| Producer count | single (`routes.ts:186`) | ✅ still single — UploadThing audits only |
| UploadThing regional routing | dead domain | 🔴 hardcoded Seattle URL (`server.ts:37`) |
| `caseId` authority | canonical column | ⚠️ authoritative in DB, but 🔴 random fallback injected at `routes.ts:169` for non-UUID caseIds |
| SSE progress verbs | ad-hoc `state` strings | ⚠️ same drift, now includes `INGESTING/NORMALIZING/ANALYZING/DISCOVERING/FAILED/GRAPH_READY` |
| Frontend write-path seam | proposed I-PR2 wizard | ❌ not in provider seam; wizard code unmounted (dead) |
| Ingestion module tests | n/a | ✅ 24 files / 280 tests green |

---

## 4. Actual End-to-End Flow (verified by reading code, not by assumption)

```
Browser (web)                    Platform (Express :3000)                      Ingestion pkg (@indago/ingestion)
───────────                      ─────────────────────────                     ────────────────────────────────
UploadThing GET /api/uploadthing ├─ createRouteHandler (ingestUrl=sea1 🔴)
   │  file                       │  onUploadComplete → audit EVIDENCE_UPLOADED   (NOT a producer, audit errors swallowed)
   │                             │
EvidenceSubmitUI(dead)  ─ sorry ─┘
Nothing in web currently calls  POST /investigations/:investigationId/evidence  (write-path seam absent on web)
```
```
Existing API path (the only live write-path consumer: postman/curl):
POST /api/v1/investigations/:investigationId/evidence
   requireAuth (demo-token) → requireRole(INVESTIGATOR|ADMIN)
   → find run (run.caseId authority)
   → verifyCaseAccess(user, run.caseId)
   → validate EvidenceSubmissionRequestSchema
   → opId/ correlationId = randomUUID each batch
   → payloadCaseId = uuidRegex.test(caseId) ? caseId : randomUUID()      🔴 fabrication risk
   → per file: idempotencyKey = evidence-{investigationId}-{fileKey}
     queue.add("ingest-evidence", job, { jobId: idempotencyKey })
   → audit EVIDENCE_QUEUED → SSE {type:"EVIDENCE_SUBMITTED"} → 202
                                                                    v
Worker ("investigation-pipeline", attempts:3, exp backoff 2000ms)
   ├─ "ingest-evidence" handler:                     (<-- new since I-PR2)
   │     validate IngestionJobPayloadSchema
   │     emitProgress(INGESTING)
   │     acquisitionService.acquire(artifactReference, {sourceId:uuid, operationId})
   │         HttpArtifactFetcher (50MB, 30s) → InMemoryArtifactStorage.write   ⚠️ RAM only
   │     emitProgress(NORMALIZING)
   │     extractionService.extract(artifact) → classify → route → parse(OCR fallback)
   │     console.dir(ExtractionResult)                                        ⚠️ not persisted
   │     emitProgress(ANALYZING)
   │     audit EVIDENCE_INGESTED   ✅  -> no run-state change, no DB write ❌
   │     failure ⇒ emitProgress(FAILED) + throw (BullMQ auto-retry, no INGESTION_JOB_FAILED audit)
   └─ run-state handler (legacy, unrelated to ingestion pkg):
         CREATED→INGESTING(PIPELINE_START); re-queue commented out
         INGESTING → context.caseId → USE_MOCK_INGESTION? synthetic : HTTP /ingest(:8080)
                     persist graph in contextData → emit GRAPH_READY → NORMALIZING(INGESTION_COMPLETE)
         NORMALIZING → ANALYZING(NORMALIZATION_COMPLETE)
         ANALYZING → hardcoded agentDecision → validateClaim grounding → DISCOVERING(ANALYSIS_COMPLETE)
                     (grounded-fail ⇒ delayed re-queue 1000ms)
         WAITING_FOR_EVIDENCE → status=PAUSED
         any throw ⇒ status=FAILED + lastError in contextData
   transition util: validates against DEFAULT_RUN_STATE_CONFIGURATION.validTransitions,
                    appends AgentCheckpoint (stateHash=randomUUID() 🧪), sets RUNNING,
                    emitProgress(newState), audit SYSTEM_ACTION.
                                                                    v
SSE GET /api/v1/investigations/:id/stream (requireAuth)
   ← CONNECTED + every audit record + every progress event + EVIDENCE_SUBMITTED
     (three different shapes on one channel — see §20)
                                                                    v
Web LiveRealtimeProvider (Next proxy) → SseClient → normalizer passthrough → Activity Feed (event.action)
Web DemoRealtimeProvider → deterministic fixture events (action verbs) → same feed
```

---

## 5. UploadThing

- `platform/src/api/server.ts:31-40` — `createRouteHandler` mounted at `/api/uploadthing`; config pin: `ingestUrl: "https://sea1.ingest.uploadthing.com"` 🔴 hardcoded Seattle server. Should use the default discovery or a config value; a non-Seattle region breaks uploads.
- `platform/src/api/uploadthing.ts` — `casePackUploader` limit matrix: pdf 16MB×10, image 8MB×20, text 16MB×10, blob 32MB×5.
- Middleware requires only an `x-investigation-id` header; authentication is delegated to `UPLOADTHING_SECRET` (comment, `:33-35`). No case-boundary check on upload, but no data is stored by the platform either.
- `onUploadComplete` (line 38-62): resolves run → reads canonical `run.caseId` → audits `EVIDENCE_UPLOADED` → **never enqueues**. Audit errors are swallowed (`.catch(() => {})`). Follows the single-producer rule.

---

## 6. Evidence Submission

Endpoint: `POST /api/v1/investigations/:investigationId/evidence` (`routes.ts:123-239`). Order verified:
1. `requireAuth`, `requireRole(["INVESTIGATOR","ADMIN"])` (line 126-127).
2. Resolve run (`findFirst` → 404).
3. Resolve case authority `run.caseId` (line 141) → 400 if absent.
4. `verifyCaseAccess(user, caseId)` → 403 on miss (line 147).
5. `EvidenceSubmissionRequestSchema.safeParse` (line 154).
6. New `operationId` + `correlationId` per submission (line 164-165).
7. **Per-file** `jobId = evidence-{investigationId}-{fileKey}` (line 174) → dedupe by BullMQ job id.
8. Audit `EVIDENCE_QUEUED` (line 209).
9. SSE `{type:"EVIDENCE_SUBMITTED", evidenceTitle, fileCount, operationId}` (line 219).
10. `202 {operationId, correlationId, jobsEnqueued, fileCount}`.

Missing: no `requireCaseAccess` middleware here (correctly replaced by per-case verification), no body-size guard beyond schema, no explicit failure audit (`INGESTION_JOB_FAILED` — see §19 dead codes).

---

## 7. Authentication

- `requireAuth` → `verifyToken` (`auth.ts`): **mock** `demo-token` for local dev; a fixed user with hardcoded `allowedCases` UUIDs. Production-grade session/auth is out of scope.
- Browser never holds `AUTH_TOKEN` (server-side only: `web/src/lib/api/server.ts`, `app/api/sse/[...]/route.ts`). Verified by grep — not present in the provider bundle.
- `POST /start` also enforces `requireRole(INVESTIGATOR|ADMIN)` + `requireCaseAccess`.
- The SSE stream endpoint is `requireAuth` only (`routes.ts:21-25`) — any authenticated caller can subscribe to any investigation's event feed.

---

## 8. Case Authorization

- `verifyCaseAccess(user, caseId)` — case-access list from the token; **dev bypass unless `NODE_ENV=production`** (`auth.ts`). In production semantics this is the boundary.
- Evidence submission: verifies against **DB `run.caseId`** ✅ (the canonical authority).
- `GET /investigations/:id`: verifies against the **query `caseId`** ⚠️ but never cross-checks `run.caseId`. A caller authorized for their own case can read a different run's status just by passing a caseId they *are* allowed to.
- `POST /start`: `requireCaseAccess` reads case scope from request; the created run row carries `caseId` in a real column (`InvestigationRun.caseId`).
- UploadThing: no case check (but the platform stores nothing).

---

## 9. ArtifactReference

Constructed *server-side on the platform* (`routes.ts:176-184`) — fields:

| Field | Value | Source | Notes |
|---|---|---|---|
| `url` | `file.fileUrl` | client | UploadThing fallback URL; fetched by `HttpArtifactFetcher` |
| `originalFilename` | `file.fileName` | client | |
| `declaredMimeType` | `file.mimeType` | client | trusted in classification (see §18) |
| `declaredSizeBytes` | `file.fileSize` | client | not enforced beyond fetcher 50MB cap |
| `sourceType` | `"FILE_UPLOAD"` | platform | valid contract enum |
| `idempotencyKey` | `evidence-{inv}-{fileKey}` | platform | same as BullMQ jobId |
| `providerMetadata.fileKey` | `file.fileKey` | client | passed through |

Note: the queue job is the parent; there is **no Evidence/Source row** written at submit time (deferred full model), so `fileKey` provenance lives only in the audit event + job metadata.

---

## 10. Identity Model

| Concept | Type / Source | Notes |
|---|---|---|
| `investigationId` | UUID, route param + URL | unique per run (`InvestigationRun.investigationId @unique`) |
| `caseId` | String → ~~UUID~~ `z.string()` at `/start`; `z.string().uuid()` in `CaseIdSchema` + `IngestionJobPayloadSchema` | 🔴 **canonicality clash** — `/start` accepts any string (`routes.ts:12-18`), but the evidence queue payload requires UUID, hence the random fallback at `routes.ts:169` |
| `workspaceId` | `workspace:{investigationId}` (web, client-side) | distinct from both, per F-PR2 boundary |

`contextData.caseId` is written at `/start` (`routes.ts:94`) and consumed by the legacy INGESTING branch (`orchestrator.ts:169-194`) — duplication of the column persists.

---

## 11. Idempotency

- Formula in code: `evidence-{investigationId}-{fileKey}` → used as BullMQ **`jobId`** (routes.ts:174, 202) and as the ArtifactReference `idempotencyKey`.
- Formula in tests/contracts: `sha256(investigationId:fileKey)` (ingestion tests). 🧪 **Mismatch in recipe** (naming/derivation), though behaviorally dedupe-by-job-id still works as long as the same formula is used everywhere at runtime — it is.
- Dedupe mechanism: **queue-level only** (BullMQ duplicate `jobId`). There is no DB-level evidence record to dedupe against, so a crash *after* `queue.add` but *before* job execution cannot be detected (no persisted intent).
- Producer-vs-content: two files with identical content but different `fileKey`s are two jobs ✅ (content dedup is only relevant inside `InMemoryArtifactStorage` by hash, and only for the same process lifetime).

---

## 12. Correlation

- `operationId`, `correlationId` generated per submission batch (routes.ts:164-165); `operationId` flows into the job payload **and** into acquisition `options`; `correlationId` flows into the job payload.
- Scope: **request/batch-level**. There is no global run-level correlation id in the SSE/audit stream, so the UI cannot join an evidence event to its pipeline results (relevant for I-PR3 write-path).

---

## 13. Queue Contract

- Single canonical schema: **`IngestionJobPayloadSchema`** (`.strict()`) from `@indago/contracts`.
- Single producer of `ingest-evidence`: `routes.ts:186` only. Verified by grep — no competing schema or producer anywhere; UploadThing audits only.
- Worker validates the job with `IngestionJobPayloadSchema.safeParse` (`orchestrator.ts:62`) and audits `SYSTEM_ACTION` for malformed payloads before throwing.
- ❌ No **EVIDENCE/RawExtraction** job types; no typed queue envelope/event contract — the schema is a single flat payload.

---

## 14. BullMQ

- Queue `investigation-pipeline`; `defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } }` (`orchestrator.ts:48-54`).
- Two Redis connections: producer conn + worker conn (`maxRetriesPerRequest: null`).
- Re-queue pattern on the run-state side uses `queue.add` after each transition (or 1000ms delay on grounding failure).
- No `completed`/`failed` listeners: final failures leave no audit trail and update no run state for evidence jobs ❌.

---

## 15. Worker

- Two branches on the same `investigation-pipeline` worker (orchestrator.ts:61 & 154).
- **`ingest-evidence` (evidence pipeline, ✅ new):** validate → progress(INGESTING) → `ArtifactAcquisitionService.acquire` (HttpArtifactFetcher 50MB / 30s; `sourceId: randomUUID()`) → progress(NORMALIZING) → `ExtractionService.extract` (classify → route → parse; Tesseract OCR fallback) → `console.dir` → progress(ANALYZING) → audit `EVIDENCE_INGESTED`. Failure → progress(FAILED) + throw.
  - ⚠️ No persistence of artifact (`InMemoryArtifactStorage`), no persistence of `RawExtraction`, no run-state change, no Evidence record.
- **Run-state machine (legacy):** see §16. Reads `contextData.caseId`, optionally calls `INGESTION_SERVICE_URL||http://localhost:8080/ingest` or synthetic graph.
- Shared singleton services (`sharedStorage`, `parserRegistry`, `ocrProvider`) are module-level — shared across jobs in-process 🔴 data-loss/contention risk for concurrent evidence jobs is present only for memory storage; acceptable for now, a real store is required in I-PR3.

---

## 16. State Machine

- Canonical transitions live in contracts (`DEFAULT_RUN_STATE_CONFIGURATION.validTransitions`); worker enforces every transition through `transitionState` (orchestrator.ts:307-313) — no illegal `INGESTING→ANALYZING` etc. is possible ✅.
- Actual reachable path: `CREATED → INGESTING → NORMALIZING → ANALYZING → DISCOVERING`.
- `WAITING_FOR_EVIDENCE` sets `status=PAUSED` only (no further transition).
- 🔴 **Evidence ingestion does not transition state at all** — the evidence pipeline and the state machine are disconnected (by design so far, flagged for I-PR3).
- Prisma comment on `state` lists `CREATED, INGESTING, ANALYZING, WAITING_FOR_EVIDENCE` — stale (missing `NORMALIZING`, `DISCOVERING`).

---

## 17. Prisma / Persistence

- Models (4): `InvestigationRun` (incl. `caseId` column, `contextData Json`), `AgentCheckpoint` (pseudo-hash: `stateHash = randomUUID()` 🧪 not a real hash), `ToolExecution`, `AuditEvent`.
- **No** migrations directory — schema is pushed via `db push`. No Artifact, RawExtraction, Source, Evidence, or EvidenceItem models ❌.
- Evidence submission writes **zero** DB rows (audit event only).
- `logAuditEvent` (audit/logger.ts) — genuine append-only SHA-256 hash chain inside a `$transaction`: `sha256(previousHash:actor:action:targetId:timestamp)`, `previousHash` chain, unique `hash`.

---

## 18. Artifact Storage

- `ArtifactStorage` interface: `write / read / exists` (ingestion/src/storage/artifact-storage.ts).
- Only implementation: **`InMemoryArtifactStorage`** — key `mem://{hash}`, content-addressed, deterministic writes. Restart = data loss. No S3/local-disk implementation, no TTL.
- Worker uses *one process-lifetime* instance — safe for the demo, wrong for multi-instance scale.

---

## 19. RawExtraction

- `ExtractionResult` produced by `ExtractionService.extract` (acquisition→read→classify→route→parse).
- Consumption: `console.dir(...)` in the worker (orchestrator.ts:128-133) — **no RawExtraction row, no Evidence→Observations/Entities/Relations, no graph writes** ❌ (intentionally out of scope per M-PR* boundaries; must become the I-PR3 deliverable).
- `ExtractionService` is cleanly non-semantic: never creates observations/entities, never touches Redis/BullMQ/UploadThing ✅ (extraction-service.ts:14-18).
- **Dead action names:** `INGESTION_JOB_QUEUED`, `INGESTION_JOB_FAILED` are defined in `AuditActionSchema` but never emitted (grep → schema + unit tests only).

---

## 20. Realtime

- One `EventEmitter` (`progress`) channels three **incompatible shapes**:
  1. **Audit records** — `{investigationId, action, actor, targetType, targetId, description, timestamp, previousHash, hash}` (logger.ts:43).
  2. **Progress verbs** — `{investigationId, state, message, timestamp}` (sse.ts:38-44), states `INGESTING/NORMALIZING/ANALYZING/GRAP*_READY/FAILED`.
  3. **Ad-hoc events** — `{type: "CONNECTED"|"EVIDENCE_SUBMITTED", ...}`.
- None of `CONNECTED`, `GRAPH_READY`, `EVIDENCE_SUBMITTED`, `EVIDENCE_QUEUED` are in `EventTypeSchema`; the SSE verbs are **ad-hoc strings** ⚠️.
- Client (`LiveRealtimeProvider` → Next proxy → `SseClient`) passes events through a normalizer that does **not** validate against `EventTypeSchema`, so drift stays invisible until a consumer type-switches.
- Demo events use `action` verbs (canonical-ish names `EVIDENCE_INGESTED`, `ENTITY_CREATED`, …) in `SseEvent` transport shape — different verb field than live progress (`state`). UI keys on `event.action` → demo feed renders; live feed would render empty items. Parity drift.

---

## 21. Frontend Safety

- F-PR2 seam is intact and read-only: `lib/providers/types.ts` exposes *catalog reads + realtime only*. **No `submitEvidence`/`uploadEvidence` in the provider seam** ✅ — backend cannot force a frontend rewrite here.
- Live providers are `ProviderError.unsupported()` stubs except `LiveRealtimeProvider` (wraps the SSE stream via the Next.js proxy with `AUTH_TOKEN` server-side).
- `InvestigationOverview` consumes only `useWorkspace()`; it never branches on `DataMode` and never imports Demo/Live internals ✅.
- `WorkspaceBoundary` builds the bundle client-side; identity model `workspaceId` vs `caseId` vs `investigationId` documented ✅.
- **I-PR2 evidence wizard is dead code on main:** zero imports of `investigation-detail`; the evidence route renders only `InvestigationScaffold`. The `submitEvidence` server action exists (`lib/api/server-action.ts`) but nothing in the UI calls it.
- AUTH_TOKEN: server files only ✅.

---

## 22. Mock / Live Parity

| Read | Demo | Live |
|---|---|---|
| investigations.get / status | deterministic fixtures | `unsupported()` → ErrorDisplay 🔴 UX gap |
| evidence / entities / leads / gaps | fixture catalogs | `unsupported()` |
| realtime | 7 deterministic events (`action` verbs) | SSE pass-through (`state`/`type` verbs) ⚠️ shape drift |
| writes (submit/upload evidence) | **absent both** | absent — no UI path |

No silent fallback: `auto` in production → live; unknown caseId in `demo` mode throws config error ✅. But live = broken UI today by design (stubs), so "live parity" is *structural*, not functional.

---

## 23. Consistency Audit (duplication / canonicality)

| Thing | Locations | Verdict |
|---|---|---|
| caseId | 1978 Wings, `InvestigationRun.caseId`, `contextData.caseId`, queue payload, audit descriptions | ⚠️ duplicated; queue copy can be fabricated 🔴 |
| EvidenceSubmissionRequest / queue payload fields | matched | ✅ |
| idempotency recipe | code vs tests | ⚠️ recipe differs (`evidence-…` vs `sha256(inv:file)`) |
| SSE verbs | 3 shapes + EventTypeSchema | 🔴 ad-hoc, unaudited |
| run states | contracts (authoritative) ↔ schema comment | ⚠️ comment stale |
| stateHash | `AgentCheckpoint` | 🧪 `randomUUID()` masquerading as hash |

---

## 24. Security Audit

- 🔴 **Secret in repo:** `packages/platform/test-db.mjs` (untracked) contains a live Neon Postgres connection string with real password (`postgresql://neondb_owner:npg_…`).
- Demo-token auth is dev-only; `.env.example` documents it. No secrets in committed files otherwise.
- No `DATABASE_URL`/`UPLOADTHING*` committed. No CI to leak envs.
- CSP `connectSrc: ["'self'"]` — SSE is same-origin through the Next proxy ✅.
- UploadThing relies on `UPLOADTHING_SECRET`; upload callback has no user validation (platform stores nothing, so exposure is limited to audit lines) ⚠️.
- SSE stream: any authenticated user may subscribe to any investigation feed ⚠️; `GET /investigations/:id` boundary check uses the query `caseId`, not the run's ⚠️.
- Evidence endpoint does verify against `run.caseId` ✅.

---

## 25. Test Coverage

All green at HEAD `b423ec8`:

| Package | Files | Tests | Build / Typecheck |
|---|---|---|---|
| contracts | 7 | 111 | ✅ |
| platform | 3 | 49 | ✅ |
| ingestion | 24 | 280 | ✅ |
| web | 24 | 164 | ✅ (`next build` passes with demo env) |
| **Total** | **58** | **604** | ✅ |

- worker-stub tests now mock `@indago/ingestion` and assert acquisition + extraction + `EVIDENCE_INGESTED` + `emitProgressEvent` calls.
- One stale test title at `worker-stub.test.ts:134` references `INGESTION_JOB_FAILED`.
- No CI pipeline — nothing runs these in an automated gate ❌.

---

## 26. Bugs / Regressions

🔴 **High**
1. `routes.ts:167-169` — non-UUID `run.caseId` (allowed by `StartInvestigationSchema.caseId: z.string()`) is silently replaced with a **random UUID** in the queue payload. Breaks case provenance; the audit + worker see a fabricated `caseId`. Either enforce UUID at `/start` or stop injecting `caseId` into the worker payload.
2. `server.ts:37` — hardcoded `ingestUrl: "https://sea1.ingest.uploadthing.com"`. Breaks non-Seattle deployments.
3. `packages/platform/test-db.mjs` — committed-adjacent live DB secret.

⚠️ Medium
4. In-memory-only artifact/extraction store loses everything on restart; multi-instance deployment cannot share state.
5. No failure audit / run-state result for evidence jobs; `INGESTION_JOB_FAILED` defined but never emitted.
6. `GET /investigations/:id` caseId check vs run caseId untethered.
7. SSE verb-field drift (`state` vs `type` vs audit `action`) with a passthrough normalizer.

🧪 Low
8. Stale schema comment on run `state`; `stateHash = randomUUID()`; stale test title; `console.dir` debug in worker; `onUploadComplete` audit errors swallowed.

---

## 27. Technical Debt

- Two parallel pipelines (evidence-ingest vs run-state) sharing one queue worker without a shared envelope.
- Legacy `/ingest` integration path + `USE_MOCK_INGESTION` still live in the state machine, shadowing the new ingestion package.
- `payloadCaseId` hack (above) is a load-bearing defect.
- UploadThing URL pinned by mnemonic.
- No `Prisma Migrations`; schema commentary drifting.
- `AgentCheckpoint.stateHash` not a real content hash.

---

## 28. Gap Matrix (vs agreed I-PR2 architecture)

| I-PR2 capability | Status | Evidence |
|---|---|---|
| Explicit evidence submission API | ✅ | `POST /evidence`, schema → queue |
| Single `ingest-evidence` producer | ✅ | grep: routes.ts:186 only |
| UploadThing writes audited, non-producer | ✅ | uploadthing.ts |
| Corpus ingestion executed on worker | ✅ | orchestrator.ts:61-151 |
| Artifact/Extraction persisted | ❌ | in-memory only |
| Evidence → Observations/Entities/Graph | ❌ | console.dir only |
| Run lifecycle reflects evidence progress | ❌ | disconnected |
| SSR old wizard removed from active routes | ✅ | zero imports |
| Write-path UI seam (submit/upload) | ❌ | not on web seam |
| Live providers functional | ❌ | unsupported stubs |
| Idempotent job identity | ✅ | jobId dedupe |
| Correlation end-to-end | ⚠️ | batch-level only |
| Immutable audit trail | ✅ | hash chain |
| Case boundary enforcement | ✅ | production path via run.caseId |
| Frontend cannot be forced to rewrite | ✅ | read-only seam |

---

## 29. I-PR3 Readiness

**Verdict: YES — can start, with four named prerequisites.**

- ✅ End-to-end ingestion pipeline proven in-process (acquire → OCR → parse → audit).
- ✅ Queue/worker/tests/builds all green; single-producer discipline verified.
- ⚠️ Prerequisite A — **Persistence:** introduce Prisma `Evidence`/`Artifact`/`RawExtraction` (+ real object store), and a `db push`/migration policy.
- ⚠️ Prerequisite B — **Lifecycle wiring:** evidence jobs must write run-state transitions/checkpoints so the UI can reflect progress.
- ⚠️ Prerequisite C — **Write-path seam:** add `evidence.submit/upload` to the web provider seam (backend-first contract; frontend stays decoupled).
- ⚠️ Prerequisite D — **Sanitize:** fix `payloadCaseId` fabrication and `sea1` pin; remove `test-db.mjs`.

---

## 30. Architecture Diagrams

### 30.1 Request → Queue → Worker (evidence)

```
Client ──POST /evidence──▶ routes.ts
                             ├─ requireAuth / requireRole / verifyCaseAccess(run.caseId)
                             ├─ schema-validate ──▶ opId, corrId
                             ├─ per file: jobId=evidence-{inv}-{fileKey}
                             │    │
                             │    ▼
                             │  BullMQ: investigation-pipeline (attempts:3, backoff 2000)
                             │    │  Worker: ingest-evidence
                             │    ▼
                             │  [validate schema] → [Acquire: HTTP 50MB/30s → InMemoryStorage] → [Extract: classify→route→parse(+OCR)] → [console.dir] → [audit EVIDENCE_INGESTED]
                             │                               │                            │
                             │                               ▼                            ▼
                             │                        (artifacts in RAM ⚠️)     (RawExtraction discarded ⚠️)
                             │    │
                             ▼    ▼
                        audit(EVIDENCE_QUEUED) → SSE progress → Activity Feed
```

### 30.2 State-machine pipeline (legacy)

```
CREATED ─▶ INGESTING ─▶ NORMALIZING ─▶ ANALYZING ─▶ DISCOVERING
              │             │             │
              ├─ context.caseId → mock|/ingest ─▶ graph in contextData ─▶ GRAPH_READY
              └─ (evidence pipeline does NOT touch this) ⚠️
```

### 30.3 SSE event channel (three shapes, one bus)

```
emitProgressEvent   ▶ {investigationId, state, message, timestamp}
logAuditEvent       ▶ {investigationId, action, actor, …, previousHash, hash}
evidence endpoint   ▶ {investigationId, type:"EVIDENCE_SUBMITTED", …}
                           │  filtered by investigationId in streamEventsHandler
                           ▼
                  GET /investigations/:id/stream  (requireAuth only)
                           ▼
                  LiveRealtimeProvider (Next proxy) ─▶ SseClient ─▶ normalizer (passthrough)
                                                                   ▼
                                                        Overview Activity Feed (event.action)
```

---

## 31. Final Verdict

Gurashish delivered the **first real vertical slice of the ingestion pipeline**, cleanly inside the worker and behind the single-producer rule. The frontend seam remains read-only and mock/live-safe; tests and builds are green (604 tests + 3 builds + 4 typechecks). **This is a strong foundation, not a regression.**

Three blockers must be resolved before treating the pipeline as more than a demo: the fabricated `caseId` (routes.ts:169), the hardcoded Seattle ingest URL (server.ts:37), and the credentials leak (test-db.mjs). Everything else missing — persistence, extraction→graph semantics, run-lifecycle coupling, and the write-path UI seam — are precisely the I-PR3 deliverables, now safely scoped.

> **I-PR3: GO**, contingent on the four prerequisites in §29.