# PR-0 — Graph Control Center Baseline

> PR-0 is the **baseline/verification** milestone for the GRAPH CONTROL CENTER REDESIGN.
> It does **not** redesign anything. It documents and protects the current capability surface,
> then hands off a precise picture of what PR-1+ may change.

- Milestone: `PR-0`
- Scope: verification · regression protection · contract/backend-swappability documentation
- Rule: **no new business logic, no redesign**; all deltas are tests and documentation
- Date: 2026-09-04
- Verified against: all four packages (`contracts`, `intelligence`, `platform`, `web`)

---

## 1. What passed verification

| Item | Result |
| --- | --- |
| Pre-existing test suites (web, contracts, intelligence, platform pure-unit) | 87 files / 1,086 tests — all green |
| New PR-0 regression suite (`packages/web/tests/pr0-graph-baseline.test.ts`) | 14 / 14 green |
| Type check (`tsc --noEmit`) — all packages | clean (exit 0) |
| Full `@indago/web` suite post-add | 37 files / 333 tests — all green |
| Provider seam inversion (UI → bundle → Demo/Live factory) | confirmed, no singleton |
| Graph canvas interaction surface | confirmed |
| Platform integration/e2e suites (Neon Postgres + Upstash Redis) | **NOT RUN** — requires live external stack; see §7 |

---

## 2. Architecture invariants (serve as the PR-1+ contract)

```
React UI
  └─ useWorkspace()                 lib/providers/workspace/context.tsx
       └─ WorkspaceProviders       lib/providers/types.ts  (14 interfaces + realtime)
            ├─ createWorkspaceDemoProviders(identity, DataModeConfig)  demo/providers.ts:754
            └─ createWorkspaceLiveProviders(identity, env)             live/providers.ts
```

- The **same frontend contract** drives both Demo and Live — nothing may bypass it.
- Bundles are **per-workspace constructed** (keyed by `workspaceKey(investigationId)`); no singleton, no cross-workspace bleed.
- Demo-only invariant is test-enforced (`mock-leakage.test.ts`, `data-mode.test.ts`): demo material never leaks into live/render paths silently.
- `LayoutNode`/`LayoutEdge` are local to `use-graph-layout.ts` (correctly engine-private, not exported into the contract).
- Real-time shape: `subscribe` → accumulates into a memory bank → **synchronously replays accumulated history to late subscribers**, then new events flow.
- Upload choreography (Section 8E invariant): Evidence Submit → `triggerOrQueueUploadSequence()` → `triggerSequence("upload")`;
  deterministic 4-stage sequence = entity creation ("Meridian Transit Pvt Ltd") → graph-hole identification →
  evidence review / hole resolution (restores Victor→Meridian ownership edge) → second entity creation ("Unregistered SIM · +91 98•••••42").
  Registered in `DemoRealtimeProvider.NAMED_SEQUENCES` (`demo/realtime.ts:10-12`).

---

## 3. Capability surface (spec §7/§15)

Legend — Live column: `REAL LIVE` real HTTP/SSE client; `REAL DEMO` deterministic fixture through the real seam; `FIXTURE` hardcoded inline data; `UNSUPPORTED` `ProviderError.unsupported`.

| Capability | Owner / implementation | Provider seam | Demo | Live | Current UI consumer | Future graph reuse |
| --- | --- | --- | --- | --- | --- | --- |
| Graph (current, versioned projection) | `graph-canvas.tsx`, `graph-panel.tsx`, `graph-version-service.ts`, `graph-version-store.ts` | `GraphProvider` (`demo/providers.ts:352`) | REAL DEMO — 6 nodes / 6 edges, `GN_BANK` hub (importance 0.95), `GE_1` bridge, `GE_5` CONTRADICTED, `GE_6` support 0.2 | UNSUPPORTED (backend `/cases/{id}/graph/current` exists, no live client) | Graph Control Center | primary projection target |
| Graph holes + overlay | `graph-hole-burst-layer.tsx`, realtime catalog (`catalogKey`), `graph-live.ts` | `GapProvider.getGraphHoles`, `GraphProvider.getOverlayCatalog` | REAL DEMO — holes appear only via overlay choreography (base serves zero) | UNSUPPORTED | Graph Control Center overlay | overlay = PR-1 clean-up locus |
| Upload choreography | `demo-fixtures/upload-demo-sequence.ts`, `demo/realtime.ts` | `RealtimeProvider` (`triggerOrQueueUploadSequence` lives in `graph-live.ts`) | REAL DEMO — deterministic 4-stage sequence (§2) | UNSUPPORTED | Evidence intake → live graph overlay | keep as canonical demo |
| Graph versions (persisted replay seam) | `graph-version-store.ts`, routes `cases/{id}/graph/versions`, `versions/:vid`, `graph/as-of` | — (backend only; no live `GraphProvider` client) | REAL DEMO — single ACTIVE version | **backend-exists-but-unwired** client | none | time-travel scrub |
| Traversal | `graph-runtime.ts`, route `graph/traversal` | expected on `GraphProvider` | REAL DEMO (hops bounded ≤ 4) | **backend-exists-but-unwired** client | none (covered by m-a12-pr2 tests) | exploration tools |
| Centrality | `structuralImportance` on nodes; route `graph/centrality` | `GraphProvider` | REAL DEMO | **backend-exists-but-unwired** client | node sizing/emphasis | layout weighting |
| Communities | route `graph/communities` | `GraphProvider` | REAL DEMO | **backend-exists-but-unwired** client | none | clustering, colors |
| Discovery | `discovery-panel.tsx`, `demo-fixtures/discovery.ts` | `IntelligenceProvider` (`demo/providers.ts:556`) | REAL DEMO (`demoDiscoveryCandidates`) | UNSUPPORTED | discovery panel | lead generation UX |
| Gaps | `gaps/page.tsx` + `DEMO_GAPS` (⚠ duplicated, §6) | `GapProvider` | REAL DEMO / FIXTURE (panel hardcodes 3 mocks) | UNSUPPORTED | Gaps page, graph panel | single source of truth |
| Evidence | `evidence-intake.tsx`, evidence fixture, `ingest-evidence` queue | `EvidenceProvider` (`demo:157`, `live:138`) | REAL DEMO | **REAL LIVE** `/investigations/{id}/evidence` | evidence intake / drawer | always full |
| Observations | observation fixture, m-a05/m-a06 pipeline | `ObservationProvider` (`demo:292`, `live:218`) | REAL DEMO | **REAL LIVE** `/investigations/{id}/observations` | observations UI | temporal anchors |
| Entity resolution | `entity-resolution.tsx` + fixture pair/resolutions | `EntityProvider` (`demo:326`) | REAL DEMO | UNSUPPORTED (backend accept route exists) | entity drawer | canonical entity projection |
| Relation resolution & authority | `relation-materialization.ts`, routes accept/reject/reverse (audited) | `RelationProvider` (`demo:529`) | REAL DEMO | **backend-exists-but-unwired** client | none (m-a10 layer) | edge authority controls |
| Canonical relations | route `canonical-relations`, graph projection input | via `GraphProvider` | REAL DEMO | **REAL LIVE** (backend, no client) | graph | projection backbone |
| Leads | `demo-fixtures/leads.ts`, `leads/page.tsx` | `LeadProvider` (`demo:418`) | REAL DEMO | **no backend persistence** (only `investigations/start`) | leads page | leads → hypothesis |
| Hypotheses | `demo-fixtures/hypotheses.ts` | `IntelligenceProvider`, `ReviewProvider` | REAL DEMO | backend entity-hypothesis accept exists; no lead/entity-hypothesis client | hypothesis UI | evidence triage |
| Contradictions | `demo-fixtures/contradictions.ts` | `RobustnessProvider`, `ObservationProvider` | REAL DEMO (`CONTRADICTED` edge status) | UNSUPPORTED | contradictions list | edge rendering |
| Provenance | `evidence.provenance` + artifacts + `SRC_*` chains; raw extraction (m-pr2/pr3) | `EvidenceProvider`, `ObservationProvider` | REAL DEMO | REAL LIVE (backend) | evidence drawer | traceability |
| Robustness | `robustness/page.tsx`, fixture robustness | `RobustnessProvider` (`demo:489`) | REAL DEMO | UNSUPPORTED | robustness page | graph confidence |
| Cross-Case | `demo-fixtures/cross-case.ts`, `demo/providers.ts:510` | `CrossCaseProvider` | REAL DEMO (`MOCK_FOREIGN_CASES`, `FOREIGN_ENTITIES_DB`, match 0.87) | **backend route absent** | graph panel foreign merge (⚠ §6) | global intelligence |
| Timeline | `demo-fixtures/timeline.ts` (band-grouped) | `TimelineProvider` (`demo:401`) | REAL DEMO — deterministic, per-band ascending | UNSUPPORTED | timeline panel scrub/play | temporal state scrub |
| Temporal state | `activeTimeRange` on graph; m-a12 temporal APIs | `GraphProvider` version | REAL DEMO | backend m-a12 present, no client | timeline → graph scrub | PR-3 |
| Activity | `demo/realtime.ts`, `live/realtime.ts`, SSE `/stream` | `RealtimeProvider` | REAL DEMO (deterministic replay) | **REAL LIVE** SSE | recent activity / live overlay | live graph |
| Review | `review/page.tsx` + fixture | `ReviewProvider` (`demo:473`) | REAL DEMO | UNSUPPORTED | review queue | acceptance UX |
| Audit | `platform/src/audit/logger.ts` `logAuditEvent` | none (backend write-only) | — | **backend-exists-but-unwired** (no read endpoint) | none | authority transparency |

---

## 4. Frozen contracts and seams (do not break in PR-1+)

1. `WorkspaceProviders` shape in `lib/providers/types.ts` — 14 capability interfaces + `RealtimeProvider`.
2. `DiagnosticLevel` + `ProviderError` taxonomy (`types.ts:96-103`): UNSUPPORTED / EXTERNAL_SERVICE / VALIDATION / UNAUTHORIZED / NOT_FOUND / INTERNAL / CONFLICT.
3. `GraphRealtimeCatalog` + `catalogKey(action, targetId)` — the ONLY way overlay events are expressed.
4. `paginate`, `deterministicSleep`, `throwIfAborted`, `resolveSignal` helper conventions in demo providers.
5. Graph query-parameter bounds enforced at HTTP boundary (`routes.ts:36-80`): `hops ∈ [0,4]`, `maxPaths/maxResults ∈ [1,1000]` — mirrors graphology-projection caps.
6. Determinism contract: demo providers receive `DataModeConfig` (`demoTimingScale`, `demoCaseId`, `mode`) and are fully deterministic for fixed config.
7. UI components are provider-clean: `graph-canvas.tsx`, `use-graph-layout.ts`, `graph-hole-burst-layer.tsx`, `graph-live.ts` import **no** demo/live internals (test-enforced §17.6).

---

## 5. Graph Control Center interaction surface (verified)

| Interaction | Location | Covered by |
| --- | --- | --- |
| Selection: point + Enter/Space | `graph-canvas.tsx:512-513` | graph-physics.test.tsx |
| Keyboard / Tab a11y focus + list | `graph-canvas.tsx:553` | graph-physics.test.tsx |
| Hover / focus emphasis | `graph-canvas.tsx:510-511` | graph-physics.test.tsx |
| d3 force drag | `graph-canvas.tsx:225-240` | graph-physics.test.tsx |
| Zoom (wheel), pan (pointer), fit (auto/button/double-click) | `graph-canvas.tsx:300` | graph-physics.test.tsx |
| Reduced motion (`matchMedia`) | `graph-canvas.tsx:91-97` | graph-physics.test.tsx |
| Physics (drag inertia, repulsion, edge spring, attraction) | `use-graph-layout.ts` | graph-physics.test.tsx |

---

## 6. PR-1 cleanup targets (documented in PR-0, NOT fixed here)

| # | Location | Issue | Fix direction |
| --- | --- | --- | --- |
| T1 | `graph-panel.tsx:16` | imports `uploadDemoCatalog` directly — duplicates `DemoGraphProvider.getOverlayCatalog()` (which already returns it) | consume the provider catalog only |
| T2 | `graph-panel.tsx:20`, `120-140` | imports `MOCK_FOREIGN_CASES` / `FOREIGN_ENTITIES_DB` and monkey-patches `workspace.entities.get` | route through `CrossCaseProvider` |
| T3 | `graph-panel.tsx:25-50` | hardcodes `DEMO_GAPS`, duplicating `gaps/page.tsx` data → drift risk | single `GapProvider` source |
| T4 | `types.ts` `InvestigationTimeline.items` | comment claims global "ascending by time"; fixture is band-grouped (ascending per band only) | either sort globally or fix the comment |
| T5 | `f-pr4.test.ts` | passes `{ simulateLatency: false }` where signature is `DataModeConfig` (type wart tolerated at runtime) | migrate to proper `DataModeConfig` |

---

## 7. Gaps in verification

- **Platform integration + e2e suites not run**: require live Neon Postgres (`TEST_DATABASE_URL` present in `packages/platform/.env`) and Upstash Redis; the serial 60s-timeout suite exceeds the 5-min shell cap. Only the DB-free platform graph/temporal suites ran (m-a12-pr2, m-a12-pr3, temporal-interval-validation — 47 tests).
- Live-provider client surface is thin by design; live graph capabilities are **UNSUPPORTED** (enforced, not missing trust).

---

## 8. Verification evidence (new PR-0 file)

`packages/web/tests/pr0-graph-baseline.test.ts` — 14 tests:

- §8.A demo graph determinism + topology: version counts match arrays (6/6); fixture labels; `GN_BANK` hub; `GE_1`/`GE_6` roles; `GE_5` CONTRADICTED; determinism across repeated calls and independent bundles; zero base holes.
- §8.E upload choreography: exact 4-stage action order; every choreography event resolves through the provider-owned overlay catalog; late subscriber receives full accumulated history.
- §8.G cross-case boundary: cobalt/crimson `isForeign` + bridge telemetry; `FOREIGN_ENTITIES_DB` canonical lookups; provider match 0.87.
- §8.C timeline boundary: per-band ascending determinism (documents T4).
- §17.6 demo-coupling guards: only `graph-panel.tsx` may import demo internals; reusable graph engine files stay provider-clean.