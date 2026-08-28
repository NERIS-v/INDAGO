# F-PR2 — Workspace Shell, Provider Architecture & Deterministic Demo Case

Status: **Implementation Complete — Verified**
Branch: `feat/f-pr2-provider-architecture`
Parent baseline: F-PR1 (commit `030f815`)
Date: 2026-08-27

---

## 1. Goal

Establish the permanent app/data architecture for the INDAGO frontend:

- An **explicit identity model** separating `caseId`, `investigationId`, and `workspaceId`.
- A **DataMode resolution** policy with an invariant that prevents any accidental
  silent live→demo fallback.
- A **per-workspace provider bundle** (factory + abstract interfaces) where UI
  components consume a uniform provider interface and never branch on DataMode or
  import Demo/Live concrete implementations directly.
- A deterministic **"Operation Financial Shadow" demo case** whose every fixture is
  validated against the canonical `@indago/contracts` Zod schemas.
- **Demo providers** (deterministic, canonical-shaped) and **Live providers**
  (wrappers over the existing platform API / SSE transport).
- A **Realtime provider seam** that adds normalization + de-duplication on top of the
  existing SSE transport.
- A **workspace context + shell + navigation** and **route scaffolding** for all
  10 investigation views.
- Tests, `.env.example`, build/route verification, and this report.

### Explicitly out of scope (deferred to F-PR3+)

- Graph rendering, the 22 intelligence views/behaviors.
- GSAP / Framer Motion / Redux / Zustand / WebSocket. None were added.

---

## 2. Repository Baseline

- Created from the F-PR1 state (commit `030f815`, branch `feat/f-pr1-visual-foundation`).
- All F-PR2 work is uncommitted on branch `feat/f-pr2-provider-architecture`.
- Backing docs (`docs/frontend/frontend-development-plan.md`, `docs/frontend/frontend-phase-tracker.md`,
  `docs/frontend/f-pr1-visual-foundation.md`), `opencode.json`, and
  `packages/platform/test-db.mjs` were **left untouched** (verified in the git audit).

---

## 3. Identity Model

Three identity concepts are intentionally distinct and **never conflated**
(`src/lib/providers/types.ts`):

| Identity | Purpose | Used by |
|---|---|---|
| `caseId` | Data-mode resolution only | `resolveDataModeForWorkspace(caseId, env)` |
| `investigationId` | Investigation-scoped domain calls | `investigations.get`, `listByInvestigation`, `realtime.connect` |
| `workspaceId` | Keys the provider bundle instance | `WorkspaceProviders.workspaceId` |

- `WorkspaceIdentity { workspaceId, caseId, investigationId }` is the factory input.
- `WorkspaceProviders extends WorkspaceIdentity` — the bundle surfaces all three ids.
- For the deterministic demo the fixtures use **different** UUIDs:
  - `CASE_ID = "b1e0c9a6-0000-4000-8000-000000000001"`
  - `INVESTIGATION_ID = "b1e0c9a6-0000-4000-8000-000000000002"`
- The factory preserves that separation throughout; demo `case.ts` references
  `caseId`→`case`, `investigationId`→`investigation`, and both are surfaced on the bundle.

### Route model

- `/investigations/:investigationId?caseId=:caseId`
- `:investigationId` (route param) → `investigationId`.
- `?caseId=` (query param) → `caseId` (DataMode input).

---

## 4. DataMode Resolution (`src/lib/providers/config.ts`)

`NEXT_PUBLIC_DATA_MODE` ∈ `demo | live | auto`; `NEXT_PUBLIC_DEMO_CASE_ID` is the only
case allowed to resolve to demo.

### Invariant (fixed + tested — do not regress)

| Config | Environment | Case matches demo id | Result |
|---|---|---|---|
| `live` | any | any | **live** |
| `demo` | any | yes | **demo** |
| `demo` | any | **no** | **throws** |
| `auto` | development | yes | **demo** |
| `auto` | development | no | **live** |
| `auto` | production | any | **live** |

- `demo` in production without `NEXT_PUBLIC_DEMO_CASE_ID` set → throws.
- `auto` in production without `NEXT_PUBLIC_DEMO_CASE_ID` set → throws
  (`assertNoImplicitFallback`).
- **There is never a silent live→mock fallback.**

---

## 5. Provider Factory (`src/lib/providers/factory.ts`)

`createWorkspaceProviders(identity, env)`:

1. Reads `DataModeConfig` via `getDataModeConfig(env)`.
2. Resolves the effective mode via `resolveDataModeForWorkspace(identity.caseId, env)`.
3. Returns `createWorkspaceDemoProviders(identity, config)` (demo) or
   `createLiveWorkspaceProviders(identity, config)` (live).

- **Pure** — no module-level caches. Every call yields an independent bundle, so
  concurrent investigations never share mutable demo state.
- **No global singleton** — exactly one bundle per workspace.

---

## 6. Critical Architectural Correction: Client-Side Bundle

RSC cannot serialize provider instances (Sets, timeouts, in-memory demo state) across
the server→client boundary. Therefore the bundle is created **client-side**:

- `WorkspaceBoundary` (`src/lib/providers/workspace/boundary.tsx`, `"use client"`)
  reads `useParams().id` and `useSearchParams().caseId`, builds
  `{ workspaceId: "workspace:<id>", caseId, investigationId }`, calls
  `createWorkspaceProviders(identity, process.env)` in `useMemo`, and wraps the tree in
  `<WorkspaceProvider><WorkspaceShell>…</WorkspaceShell></WorkspaceProvider>`.
- It is wrapped in `<Suspense>` (Next 15 requirement for `useSearchParams`).

---

## 7. Provider Interfaces (`src/lib/providers/types.ts`)

An abstract interface per domain, plus the realtime seam:

- `InvestigationProvider` (get, listByCase)
- `EvidenceProvider` (listByInvestigation, get)
- `ObservationProvider` (listByInvestigation, listByEntity)
- `EntityProvider` (listByInvestigation, get)
- `GraphProvider` (getVersion, getNodes, getEdges, getGraphHoles)
- `TimelineProvider` (getTimeline)
- `LeadProvider` (listByInvestigation, get)
- `GapProvider` (listByInvestigation, get, evidenceRequests)
- `ReviewProvider` (listTasks)
- `RobustnessProvider` (getResult)
- `CrossCaseProvider` (listMatches)
- `RealtimeProvider` (connect, subscribe, disconnect, getStatus)

All providers return **canonical contract-shaped data** from `@indago/contracts`.

### Error model

`ProviderError` with stable codes (`UNSUPPORTED | NETWORK | VALIDATION | AUTHORIZATION |
NOT_FOUND | SERVER | TIMEOUT | CANCELLED`) and derived categories, plus
`toProviderError()` normalization. Fed to the existing `ErrorDisplay` component.

### Documented local types (no canonical schema exists)

There is **no canonical Timeline/Spanning schema** in `@indago/contracts`. Per scope
rules the frontend defines `TimelineBand` / `TimelineItem` / `InvestigationTimeline`
as **documented frontend assumptions**, not new contract schemas. Contracts IDs are
`z.string().uuid()`; object schemas are `.strict()`.

---

## 8. Deterministic Demo Case: "Operation Financial Shadow"

A self-consistent case about a suspected shell-company money-laundering network routing
funds through intermediary accounts.

### Fixture layout (`src/lib/providers/demo/demo-fixtures/`)

- `case.ts` — canonical `Case` (status `ACTIVE`, jurisdiction `FR`, label
  `FINANCIAL_CRIME`, tags `money-laundering` / `shell-companies`).
- `investigation.ts`, `sources.ts`, `artifacts.ts`, `evidence.ts`, `observations.ts`,
  `entities.ts`, `relations.ts`, `hypotheses.ts`, `leads.ts`, `gaps.ts`,
  `evidence-requests.ts`, `review-tasks.ts`, `graph.ts`, `timeline.ts`,
  `cross-case.ts`, `robustness.ts`, `events.ts`.
- `lookup.ts` — every fixture id is a fixed, valid UUID.
- `times.ts` — shared deterministic timestamps.
- `index.ts` — assembles the single immutable `demoFixtures` set.

### Canonical validation (`validate.ts`)

`validateDemoFixtures()` parses every singleton and every array element against its
canonical `@indago/contracts` Zod schema and returns a report; `assertDemoFixturesValid()`
throws a descriptive error. Bundles also validate fixtures at build time.

---

## 9. Demo Providers (`src/lib/providers/demo/providers.ts`)

Deterministic implementations backed by the per-workspace in-memory store.

- Simulated latency scaled by `DEMO_TIMING_SCALE` (`latency.ts`: `baseLatency`, `heavyLatency`,
  `streamDelay`, `deterministicSleep`) — no randomness, so tests are stable.
- Respect `AbortSignal`; throw `ProviderError.cancelled()` when aborted.
- `DemoRealtimeProvider` replays the fixed `events.ts` sequence with scaled stream delays.

### Per-workspace state (`state.ts`)

- In-memory, per-workspace mutable store (no IndexedDB, no global singleton).
- Holds canonical fixture data + derived O(1) `Map` indexes.
- `resetDemoWorkspaceState()` restores canonical fixtures exactly.
- `logDemoEvent()` appends to a bounded (500) event log.

---

## 10. Live Providers (`src/lib/providers/live/providers.ts`)

Wrappers over the existing platform API. No silent demo fallback; no invented schema.

- `LiveRealtimeProvider` reuses the existing authenticated SSE proxy (`createSseClient`).
- Domain endpoints the platform does not yet expose **throw `ProviderError.unsupported()`**
  (documented dependency), rather than fabricating data.

### Realtime seam (`src/lib/providers/realtime/normalizer.ts`)

- `normalizeEvent(raw, investigationId)` normalizes a raw transport `SseEvent` into a
  canonical `ProviderEvent`; fills a missing/empty `investigationId` from context.
- `EventDeduplicator` de-duplicates by stable identity (`id`, or
  `action|targetId|timestamp` fallback), bounded FIFO (default 200) to avoid unbounded
  memory growth across long-lived connections.
- `consolidateStatus(open, error)` maps transport callbacks to a single
  `RealtimeStatus` (`disconnected | connecting | connected | error`).

`LiveRealtimeProvider` wraps `createSseClient` and applies normalization + dedupe —
no second transport, no WebSocket, no in-browser auth tokens.

---

## 11. Workspace Context & Shell

- `context.tsx` — `WorkspaceProvider` + `useWorkspace()` (throws outside provider).
  Hands client components the bundle without revealing DataMode or importing
  Demo/Live implementations.
- `shell.tsx` — navigation bar (Overview / Graph / Timeline / Observations / Leads /
  Gaps / Evidence / Cross-Case / Ledger / Robustness / Review) + a data-mode indicator
  pill (Demo vs Live). Reads only `useWorkspace()` and `usePathname()`.

---

## 12. Route Architecture

Server routes under `src/app/investigations/[id]/`:

- `layout.tsx` — thin server wrapper rendering `<WorkspaceBoundary>`.
- `page.tsx` — renders `<InvestigationOverview investigationId={id} />`; keeps the
  "Missing caseId" notice when no `?caseId=` is present; **no** demo `notFound()`.
- `investigation-overview.tsx` (client) — consumes `useWorkspace()`, loads
  investigation / evidence / entities / leads / gaps and subscribes to the realtime feed.
- `investigation-scaffold.tsx` (client) — shared placeholder that consumes the
  Workspace context (verifies shell wiring) and shows a canonical empty state. No
  intelligence behavior.
- 10 scaffold pages: `graph`, `timeline`, `observations`, `leads`, `gaps`, `evidence`,
  `cross-case`, `ledger`, `robustness`, `review`.

Final build route list (16 routes): `/` (static), `/design` (static), `/_not-found`,
`/api/sse/[investigationId]` (dynamic), `/investigations/new` (static), and
`/investigations/[id]` + 10 sub-routes (dynamic).

---

## 13. Tests (164 passing across 24 files)

New F-PR2 tests include:

- `tests/data-mode.test.ts` (11) — the DataMode invariant incl. the throw cases.
- `tests/identity.test.ts` (5) — identity model / workspace surface.
- `tests/fixture-validation.test.ts` (4) — every fixture passes canonical schemas.
- `tests/provider-factory.test.ts` (6) — bundle creation + isolation.
- `tests/mock-leakage.test.ts` (4) — UI never imports Demo/Live, no DataMode branching.
- `tests/realtime-normalizer.test.ts` (7) — normalization + dedupe.
- `tests/demo-realtime.test.ts` (4) — deterministic event replay/lifecycle.
- `tests/workspace-context.test.tsx` (2) — context provider/consumer.

---

## 14. Verification (final clean pass)

- **`pnpm --filter @indago/web test`** → 24 files passed, 164/164 tests.
- **`pnpm --filter @indago/web typecheck`** (`tsc --noEmit`) → exit 0.
- **`pnpm --filter @indago/web build`** → exit 0; 16 routes generated.
- **Route-200 smoke checks** (`next start -p 3999`, live mode — public demo vars not set
  in `.env.local`): all 14 routes returned HTTP 200
  (`/`, `/design`, `/investigations/new`,
  `/investigations/<INVESTIGATION_ID>?caseId=<CASE_ID>`, and all 10 scaffold sub-routes).

### Architecture audit (greps)

- No `DemoProvider`/`LiveProvider` imports in `src/app`.
- Single SSE transport (`createSseClient`), reused by `live/realtime.ts`; no WebSocket
  (only a comment match), no gsap/framer/redux/zustand/d3/force-graph.
- No `as any` / `@ts-ignore` / loose `any` in `src/lib/providers`.
- No stray `*.log` files left in the repo root.

---

## 15. Known Platform Dependencies / Caveats (factual)

- **Live domain endpoints are not yet exposed** by the platform; live providers throw
  `ProviderError.unsupported()`. Live mode was verified to build and serve routes, but
  real authenticated host firing was **not** end-to-end verified (no authenticated SSE
  host was running).
- **`DEMO_TIMING_SCALE` is not `NEXT_PUBLIC_`** and therefore is not available to the
  client-side bundle, which defaults to scale 1. Documented in `.env.example`.
- **No canonical Timeline/Spanning schema** exists; local timeline types are documented
  frontend assumptions.

---

## 16. Deferred Work (F-PR3+)

- Graph rendering (Renderer for `GraphProvider` data is intentionally deferred to F-PR4).
- The 22 intelligence views / behaviors (currently scaffolds).
- No GSAP/Framer/Redux/Zustand/WebSocket were introduced.

---

## 17. Definition of Done

- ✅ Explicit identity model (`caseId` / `investigationId` / `workspaceId`) implemented.
- ✅ DataMode resolution + no-silent-fallback invariant (fixed + tested).
- ✅ Per-workspace provider bundle + factory (client-side, non-singleton).
- ✅ Deterministic demo case, canonical-validated against `@indago/contracts`.
- ✅ Demo providers + Live wrappers.
- ✅ RealtimeProvider seam (SSE normalization + dedupe).
- ✅ Workspace context, shell, navigation.
- ✅ Route scaffolding (10 views) + `/investigations/[id]` + SSE API route.
- ✅ Tests (164/164), typecheck exit 0, build exit 0, all routes HTTP 200.
- ✅ `.env.example` updated.
- ✅ Architecture audit clean; no forbidden deps/additions.
- ✅ `docs/frontend/f-pr2-provider-architecture.md` report.
- ✅ Final git audit confirms scope is `packages/web/**` + `.env.example` + this report.
