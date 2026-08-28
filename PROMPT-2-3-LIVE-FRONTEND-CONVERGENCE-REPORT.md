# PROMPT 2/3 — LIVE FRONTEND CONVERGENCE REPORT

Repository: `INDAGO` · Package: `packages/web` (+ regression on contracts / ingestion / platform)
Date: 2026-08-28

---

## 1. Executive Summary

This prompt connected the existing Next.js frontend to the now-real backend through the
**existing provider interfaces** — with DEMO / LIVE / AUTO modes, the demo providers, the
mock fixtures, and the UI design untouched. No component was added, removed, or reshaped; no
component branches on DataMode; demo providers and fixtures remain behavior-identical (two
compile-only lines were repaired, see §4).

What is now genuinely wired in LIVE mode:

| Concern | Before | After |
|---|---|---|
| `LiveInvestigationProvider.get()` | threw `UNSUPPORTED` | **hits** `GET /investigations/:id?caseId=` (server action); run status projected to canonical `Investigation` (§5) |
| `LiveInvestigationProvider.start()` | **missing** (interface broke; class did not compile) | **hits** `POST /investigations/start` |
| `LiveEvidenceProvider.submit()` | **missing** (interface broke) | **hits** `POST /investigations/:id/evidence` (server action) |
| `LiveEvidenceProvider.prepareUpload()` | **missing** | UploadThing `casePackUploader` → `UploadedFileReference[]` |
| `cases` provider | **missing** (bundle did not compile) | present, typed `UNSUPPORTED` (no endpoint exists) |
| Live realtime | real SSE → blank in Activity Feed | platform frames **normalized** into `action`/`description` at the provider boundary (§9) |
| Live overview | full-screen error (all 5 providers threw) | investigation authoritative; unsupported lists render distinct `Unavailable` (§10) |

Everything else stays deliberately `UNSUPPORTED` with a typed `ProviderError` — there are no
endpoints for those reads, and we never fabricate data nor fall back to demo.

## 2. Scope & Exit Criteria

In scope: wire the live provider layer to real endpoints behind the existing provider
interfaces; keep all three data modes, the demo providers/fixtures, and the UI design intact;
make live mode honest and usable on the active route. Out of scope (explicit): component
redesign, wizard rewiring/mounting, deleting demo data, inventing endpoints, changing backend
contracts, or adding a second frontend model. Exit: web typecheck/test/build green, backend
regression green, DoD checklist satisfied.

## 3. Provider Gap Map (authoritative)

| Provider | Method | Live before | Platform endpoint | Live now |
|---|---|---|---|---|
| Investigation | `get` | UNSUPPORTED | `GET /investigations/:id?caseId=` | **WIRED** (projection, §5) |
| Investigation | `start` | (missing) | `POST /investigations/start` | **WIRED** |
| Investigation | `listByCase` | UNSUPPORTED | none | `UNSUPPORTED` |
| Evidence | `submit` | (missing) | `POST /investigations/:id/evidence` | **WIRED** |
| Evidence | `prepareUpload` | (missing) | UploadThing `casePackUploader` | **WIRED** |
| Evidence | `listByInvestigation` / `get` | UNSUPPORTED | none | `UNSUPPORTED` |
| Realtime | lifecycle + events | live (real SSE via proxy) | `GET /investigations/:id/stream` | **WIRED** + normalization |
| Case | `list` / `get` | (missing) | none | `UNSUPPORTED` |
| Observation / Entity / Graph / Timeline / Lead / Gap / Review / Robustness / CrossCase | all reads | UNSUPPORTED | none | `UNSUPPORTED` |

No live method talks to an endpoint that does not exist. No invented endpoint.

## 4. Concrete Changes (files)

- **`src/lib/providers/live/run-projection.ts`** (new) — pure `projectRunStatusToInvestigation()`.
- **`src/lib/providers/live/errors.ts`** (new) — `toLiveProviderError()` (§8).
- **`src/lib/providers/live/providers.ts`** — wired `LiveInvestigationProvider` (get/start),
  wired `LiveEvidenceProvider` (submit/prepareUpload), added `UnsupportedCaseProvider`, fixed
  the latent interface break (missing `start` / `cases` that previously failed `tsc`).
- **`src/lib/providers/realtime/normalizer.ts`** — platform-frame → canonical event mapping (§9).
- **`src/app/investigations/[id]/investigation-overview.tsx`** — per-resource resilience (§10).
- **`src/lib/providers/demo/providers.ts`** + **`demo/submit.ts`** — compile-only repairs:
  removed two stale `void source; void artifacts;` dead lines; narrowed `artifactIds[i]` to
  `artifactIds[i] ?? deterministicUuid(<identical seed>)`, which yields the same deterministic
  id in every reachable case. Behavior/data untouched.
- **`tests/live-providers.test.ts`** (new, mocked), **`tests/live-run-projection.test.ts`**
  (new), **`tests/realtime-live.integration.test.ts`** (new, integration), extended
  **`tests/realtime-normalizer.test.ts`**, refreshed **`tests/mock-leakage.test.ts`**.

## 5. Run-Status → Canonical Investigation Projection

`GET /investigations/:id` exposes **only** run status (`status`, `state`, `currentStage`,
`error`, timestamps). The platform has no investigation-metadata store (Prisma holds
`InvestigationRun`, there is no `Investigation` model), but `InvestigationProvider.get()` must
return a strict-schema `Investigation`. Per the agreed decision, the live adapter is a
**documented projection**, `projectRunStatusToInvestigation()`:

- **Truthful, mapped verbatim:** `id` (= `investigationId`), `caseId` (the canonical case the
  platform re-verified), `createdAt`/`updatedAt` (as `ObservedTime { value, precision: "exact" }`),
  `description` = `currentStage ?? error ?? ""`.
- **PROJECTION (marked in code + this report), deterministic neutrals for unsourced fields:**
  `title = "Investigation <id>"`, `priority = "MEDIUM"`, `owner = "platform"`,
  `entityIds/evidenceIds/hypothesisIds/leadIds = []`. Never read back as factual metadata.
- **Status bridge (documented table):** `QUEUED|INITIALIZING|RUNNING→ACTIVE`, `PAUSED→PAUSED`,
  `COMPLETED→CLOSED`, `FAILED→PAUSED`, `CANCELLED→ARCHIVED`, unknown→`ACTIVE`.
- **No second frontend model; no schema change.** Output is validated via
  `InvestigationSchema.parse` (schema-valid by construction; test asserts strict-parse passes).
- **Errors never become a fake Investigation:** `get()` maps API failures to `ProviderError`
  *before* projection runs; the pure mapper is never fed error responses (tests cover all
  branches).

When the backend later exposes canonical metadata, replace the projection body only — no
`InvestigationProvider` or UI change.

## 6. Evidence Flow (UI → Provider → Platform)

```
EvidenceSubmission wizard (unmounted seam, unchanged) ──────► server-action.submitEvidence
LiveEvidenceProvider.submit (new, provider boundary)  ──────► server-action.submitEvidence
        lib/api/server.submitEvidence — single transport, validated with
            EvidenceSubmissionRequestSchema, Authorization: Bearer AUTH_TOKEN
        ──► POST /api/v1/investigations/:id/evidence
             platform: resolve run → caseId → verifyCaseAccess (403 boundary)
             platform: generates operationId/correlationId
             platform: one ingest-evidence BullMQ job per file with
               jobId = idempotencyKey `evidence-{investigationId}-{fileKey}`  (backend-owned)
        ◄── 202 { operationId, correlationId, jobsEnqueued, fileCount }
```

- The browser never transmits raw bytes into the queue; only `UploadedFileReference`s.
- Idempotency / operation / correlation ids are **backend-owned** — the frontend never
  generates job/operation/correlation ids. The demo builds *its own* deterministic ids inside
  the demo boundary only (documented demo simulation, untouched).
- Browser uploads go through the platform's UploadThing router (`casePackUploader`,
  `x-investigation-id` header) → file refs → evidence submission.

## 7. Auth & Case Boundary (backend stays authoritative)

- All live calls go through `lib/api/server.ts` (server-only, `AUTH_TOKEN` via
  `Authorization: Bearer`); browser code never sees the token. Server actions
  (`lib/api/server-action.ts`) are the only client-visible seam, unchanged.
- The live providers do **not** verify tokens or case access — they forward the canonical
  `caseId` from the workspace identity; the platform performs `verifyToken` /
  `verifyCaseAccess` (403 on violation). The frontend never generates case ids and never
  fabricates access.

## 8. Error Model (mapped at the provider boundary)

`toLiveProviderError()` maps platform failures to `ProviderError` codes (fed to `ErrorDisplay`):

| Platform | ProviderError |
|---|---|
| 401 / 403 | `AUTHORIZATION` (UNAUTHORIZED) |
| 404 | `NOT_FOUND` |
| 409 | `CANCELLED` (category CONFLICT) |
| 5xx | `SERVER` (INTERNAL) |
| fetch network (`TypeError`) | `NETWORK` (EXTERNAL_SERVICE, retryable) |
| plain/config errors | `SERVER` |

`ProviderError.unsupported()` is used where no endpoint exists. There is no silent live→demo
fallback; a live failure is always a typed error.

## 9. Realtime Normalization (provider boundary)

Platform SSE frames are heterogeneous; the Activity Feed renders `action` (main line) and
`description` (sub-line). `normalizeEvent()` maps at the provider boundary — UI untouched:

- canonical-shaped frames that already carry `action` → **pass through** (covers demo + audit
  records) — demo stream parity preserved;
- `{ type: "CONNECTED" }` → `action = "STREAM_CONNECTED"`, `description = message`;
- `{ type: "EVIDENCE_SUBMITTED", evidenceTitle, fileCount, operationId }`
  → `action = "EVIDENCE_SUBMITTED"`, `description = "Evidence submitted: <title> (N file(s))"`,
  `targetType = "EVIDENCE"`, `targetId = operationId`;
- `{ state, message, ... }` (ProgressPayload) → `action = "RUN_PHASE_<STATE>"`,
  `description = message` (e.g. `RUN_PHASE_INGESTING`, `RUN_PHASE_NORMALIZING`).

`runStateAction()` / `evidenceSubmittedDescription()` are exported for tests and reused by the
integration test. Deduplication and status consolidation are unchanged. The live overview now
shows a faithful `CREATED → INGESTING → NORMALIZING → ANALYZING` progression read from the
backend run — backend state remains authoritative; the UI only maps labels.

## 10. Loading / Empty / Error States (overview)

`InvestigationOverview`:
- **investigation is authoritative** — `get()` failure → full `ErrorDisplay` with retry
  (unchanged behavior).
- evidence / entities / leads / gaps load via a tolerant `settleList` (allSettled-style): a
  fulfilled list renders its count; an unsupported/backend failure renders a distinct muted
  `Unavailable` — **not** an empty array that would read as "no data", and **not** a silent
  demo fallback.
- Demo mode is unaffected (all lists resolve; rendering identical to before); single `loading`
  spinner while the investigation is loading.

This is error-model handling, not DataMode branching — the same code path runs in every mode.

## 11. Demo Preservation

Demo providers, fixtures, session/submit builders, timing, realtime replay, and the evidence
wizard are unchanged in behavior. The two compile-only repairs (§4) do not alter any data,
ordering, or deterministic identity. The wizard is **not** provider-rewired and **not** mounted
on the active route: its current data path is preserved and documented as the next-prompt seam
(§21).

## 12. Data-Mode Routing (demo / live / auto)

`config.ts` / `factory.ts` untouched. Resolution is unchanged:
- demo case + `demo` mode → demo bundle; any other case → live bundle;
- `auto` routes the configured demo case to demo and everything else to live, dev-only;
- production `auto`/`demo` without a configured demo case **throws** (no silent fallback).
The live bundle now compiles and needs no special-casing in components.

## 13. Tests & Honest Labeling

| Suite | Label | What it exercises | Result |
|---|---|---|---|
| `tests/live-providers.test.ts` (18) | **mocked** | Live provider adapters: exact endpoint args to server actions / UploadThing, status→ProviderError mapping, no-fabrication-on-error, signal cancellation, unsupported lists, `toLiveProviderError` | pass |
| `tests/live-run-projection.test.ts` (8) | **unit** | projection determinism, schema-validity, status table, neutral defaults, truthful fields, throws-on-invalid | pass |
| `tests/realtime-live.integration.test.ts` (3) | **integration** | real `LiveRealtimeProvider` + normalizer + deduper + `createSseClient` against platform-shaped frames (CONNECTED / progress / EVIDENCE_SUBMITTED / audit passthrough); only the fetch transport boundary is stubbed | pass |
| `tests/realtime-normalizer.test.ts` (+5) | **unit** | platform-frame mapping, demo passthrough, helpers | pass |
| `tests/mock-leakage.test.ts` | **unit** | live failure surfaces a real `ProviderError`, never demo fixtures | pass |
| `tests/evidence-review` / `evidence-metadata-form` | **unit** | existing wizard components — unchanged, still passing | pass |
| **Full web suite** | — | 27 files, 199 tests | **199 passed** |

## 14. Real E2E — Run Instructions (documented, not executed)

A full real E2E requires running platform (Postgres + Redis) and `next dev`; it was **not
executed in this environment** (no live stack). Honest labeling: mocked (§13) and integration
(§13) are executed here; real E2E is documented only.

```bash
# platform (one shell)
docker compose up -d        # or your redis/postgres
npm --prefix packages/platform run dev   # AUTH_TOKEN=demo-token, LEGACY_PIPELINE_ENABLED=false
# web  (another shell)
npm --prefix packages/web run dev
# browser:
#   LIVE:  http://localhost:3000/investigations/<id>?caseId=<case>  with NEXT_PUBLIC_DATA_MODE=live
#   DEMO:  NEXT_PUBLIC_DATA_MODE=auto + NEXT_PUBLIC_DEMO_CASE_ID=<demo case>
```

Verify: overview renders the run-status projection; activity feed streams `RUN_PHASE_*` /
`EVIDENCE_SUBMITTED`; evidence submission returns 202 with `operationId`; the SSE badge shows
**Live**.

## 15. No Backend Imports Into Web

Grep over `packages/web/src`: zero matches for `@indago/platform`, `prisma`, `bullmq`,
`ioredis`, `@indago/ingestion`, `redis`. The only contracts coupling is `@indago/contracts`
(the canonical schemas the web package already consumes). No secrets live in the bundle:
`AUTH_TOKEN` is server-only; the SSE proxy and server actions are the only authenticated hops.

## 16. Consistency — No Duplicated Abstractions

- **API client:** single transport `lib/api/server.ts`. `server-action.ts` is a thin
  `"use server"` facade (a Next.js requirement) reused by both the wizard and the live
  providers — not a competing client.
- **Provider interfaces:** unchanged, single definition in `lib/providers/types.ts`.
- **Payload → event normalization:** one implementation in `realtime/normalizer.ts`.
- **Idempotency / ids:** no frontend computation in live paths (backend-owned).
- **DataMode logic:** factory/config untouched and single-sourced.
- **Base URL construction:** only `lib/api/server.ts` / `uploadthing.ts` / SSE proxy.
- **Auth handling:** only `lib/api/server.ts` + `app/api/sse/[id]/route.ts`.

## 17. Security Audit

- Browser bundle contains no `AUTH_TOKEN`, no platform credentials, no queue connection info.
- SSE goes through the Next.js proxy (no token in the browser) — existing test
  `"should never send auth tokens in fetch request"` still passes.
- Errors are mapped; `ProviderError` messages are surfaced, never raw Prisma/queue internals.
- Backend case-boundary 403 is preserved and propagated as `AUTHORIZATION`, never downgraded.

## 18. Env Audit

`packages/web/.env.example` already documents `NEXT_PUBLIC_API_URL`, `AUTH_TOKEN`,
`NEXT_PUBLIC_DATA_MODE`, `NEXT_PUBLIC_DEMO_CASE_ID`, `DEMO_TIMING_SCALE` — placeholders / dev
defaults, and every live transport (`api/server.ts`, `uploadthing.ts`, SSE proxy) reads exactly
these. No new env keys required; nothing new to document.

## 19. Web Typecheck / Test / Build

- **`npm run typecheck`** — clean. (The package was **broken before this prompt**: the live
  bundle was missing `start`/`cases` and the demo files had stale type errors → repaired, §4.)
- **`npm test`** — 27 files / **199 passed**.
- **`npm run build`** — `next build` compiled, types checked, 23 routes built; SSE proxy and
  dynamic investigation routes intact.

## 20. Backend Regression (untouched)

- `@indago/contracts`: **114/114** (7 files), typecheck clean.
- `@indago/ingestion`: **292/292** (26 files), typecheck clean.
- `@indago/platform`: **55/55** plus 13 integration tests skipped (no test DB), typecheck clean.
- No backend source was modified in this prompt (git diff confirmed — web files only).

## 21. Deferred Risks / Next-Prompt Seams

1. **Wizard → provider boundary:** the evidence wizard still calls the `submitEvidence`
   server action directly and is unmounted on the active route. Next step: mount a
   provider-backed evidence flow (`workspace.evidence.prepareUpload`/`submit`) — the UI is
   already designed for it.
2. **List endpoints:** `evidence/entities/leads/gaps` reads, `cases`, and
   `investigations.listByCase` have no platform GET endpoints; the overview shows `Unavailable`
   until they exist.
3. **Metadata endpoint:** canonical Investigation title/description/priority/owner remain
   projection defaults until the platform exposes an investigation store.
4. **Real realtime / evidence E2E** requires the running stack (documented in §14).
5. **Upload progress semantics:** `UploadProgressData.progress` is mapped 1:1; exact
   UploadThing per-file-vs-batch behavior should be confirmed during the real E2E.

## 22. Architecture (data flow)

```
┌───────────────────────────── browser ─────────────────────────────────┐
│  Workspace shell ("use client")                                        │
│   └── useWorkspace() ──► WorkspaceProviders bundle (factory, one/ws)   │
│         mode: demo | live   (never branched by components)             │
│         ├── investigations.get  ─┴─► server-action ──► api/server ──►  │
│         ├── evidence.submit     ─┴─► server-action ──► api/server ──►  │
│         ├── evidence.prepareUpload ─► uploadthing(client) ──►          │
│         └── realtime ──► sse-client ──► /api/sse/[id] ──► platform SSE │
│                                normalizeEvent @ provider boundary      │
└──────────────┬──────────────────────────────┬─────────────────────────┘
               │ (Auth via AUTH_TOKEN, server) │ (UploadThing secret, server)
        packages/platform  …  packages/contracts (canonical schemas only)
```

The web package depends on: `@indago/contracts` (types/schemas), Next.js, React, UploadThing,
zod. It imports **no** backend runtime package. All three modes share the same component tree;
providers differ at the boundary.

---

## Definition of Done

- [x] Live provider wiring happens exclusively behind the existing provider interfaces (§3-§7).
- [x] `LiveInvestigationProvider.get` hits `GET /investigations/:id` (server action) and maps
      run status → canonical `Investigation` via a documented projection; errors are never fake data.
- [x] `LiveInvestigationProvider.start` hits `POST /investigations/start`.
- [x] `LiveEvidenceProvider.submit` hits `POST /investigations/:id/evidence`;
      `prepareUpload` uploads via UploadThing and returns `UploadedFileReference[]`.
- [x] Evidence flow: browser → UploadThing refs → platform; no bytes in queue; no frontend
      job/operation/correlation ids; backend-owned idempotency (`evidence-{investigationId}-{fileKey}`).
- [x] No endpoint was invented; unsupported reads stay typed `UNSUPPORTED`.
- [x] DEMO / LIVE / AUTO modes preserved; demo fixtures & behavior untouched (compile-only fixes only).
- [x] No component-level demo/live branching; no silent live→demo fallback.
- [x] Backend token auth + case-boundary (403) remain authoritative; frontend never generates
      case ids or verifies access.
- [x] Backend run state (`CREATED→INGESTING→NORMALIZING→ANALYZING`) is authoritative; UI only
      maps labels through the normalizer.
- [x] Realtime platform frames normalized to `action`/`description` at the provider boundary;
      canonical/demo events pass through; dedupe + status model unchanged.
- [x] Loading/Empty/Error distinct; unsupported live lists render `Unavailable`
      (never empty, never demo).
- [x] Error model 401/403/404/409/5xx/network mapped to `ProviderError` (§8).
- [x] No `@indago/platform`, prisma, bullmq, ioredis, redis, `@indago/ingestion` imports in web (§15).
- [x] No duplicated API client / provider interfaces / normalizer / idempotency / URL / auth logic (§16).
- [x] web typecheck clean; web tests **199/199**; web build green (§19).
- [x] Backend regression: contracts **114/114**, ingestion **292/292**, platform **55/55**
      (+13 skipped); typechecks clean (§20).
- [x] 0 `any` / `as any` / `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error` in web src & tests.
- [x] No secrets/credentials in web; env placeholders documented (§17-§18).
- [x] Tests labeled honestly: mocked vs integration (executed) vs real-E2E (documented, §13-§14).
- [x] Evidence wizard + demo evidence path preserved; the provider-backed mount seam is
      documented (§11, §21).