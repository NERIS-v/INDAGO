# PR-0 GRAPH CONTROL CENTER REDESIGN — Baseline Output Report

Milestone: `PR-0` · 2026-09-04 · Monorepo root: `C:\Users\Mayur\Desktop\INDAGO`
Companion artifact: `docs/reports/pr0-graph-baseline.md` (full capability matrix + PR-1 targets).

---

## A. Executive summary

PR-0 is the baseline milestone for the GRAPH CONTROL CENTER REDESIGN. It performed a full forensic
verification of the existing graph + provider surface, ran the pre-existing regression suites, added a
dedicated 14-test baseline suite, type-checked all packages, and produced this report. **No source code was
changed** — the redesign work is intentionally deferred to PR-1+. The current implementation is internally
consistent, deterministic in demo mode, correctly inverted across a Demo/Live provider seam, and fully green
under the verification executed. The single honest caveat: platform integration/e2e suites were not run
(require live Neon Postgres + Upstash Redis).

## B. Objective and scope

Verify the current Graph Control Center implementation is a trustworthy baseline before redesign. Protect the
capability surface with regression tests. Document contract- and backend-swappability. Scope: all four
packages — `contracts` (schema), `intelligence` (engines), `platform` (backend), `web` (frontend + provider
architecture). Explicitly out of scope: any redesign, any new business logic, any refactor of the known
demo couplings (documented as PR-1 targets instead).

## C. Method

1. Parallel forensic exploration of all packages (provider seam chain, graph tree, backend routes, engines).
2. Architecture verification of the seam inversion: UI → `useWorkspace()` → `WorkspaceProviders` bundle →
   `createWorkspaceDemoProviders` / `createWorkspaceLiveProviders`; confirmed per-workspace construction, no
   singleton, UNSUPPORTED (never silent) live fallback, deterministic `DataModeConfig`.
3. Verification of the graph canvas interaction surface (selection, keyboard/Tab + a11y list, hover/focus,
   d3 drag, wheel zoom, pointer pan, fit + double-click, reduced motion) at `packages/web/src/components/graph/graph-canvas.tsx`.
4. Execution of pre-existing suites (all green).
5. Authoring `packages/web/tests/pr0-graph-baseline.test.ts` (14 tests) and executing the full web suite.
6. Type-checking all packages against the new test's shapes.
7. Authoring this report + the capability baseline doc.

## D. Files changed by PR-0

- **Added (tests only):** `packages/web/tests/pr0-graph-baseline.test.ts`
- **Added (docs only):** `docs/reports/pr0-graph-baseline.md`
- **Changed (source):** none — intentional.

## E. Test verification results

| Package / suite | Files | Tests | Status |
| --- | --- | --- | --- |
| web (pre-existing, before PR-0 add) | 36 | 319 | ✓ |
| web (full, post PR-0 add) | **37** | **333** | ✓ |
| contracts | 11 | 181 | ✓ |
| platform — pure graph/temporal units (m-a12-pr2, m-a12-pr3, temporal-interval-validation) | 3 | 47 | ✓ |
| platform — full suite (integration/e2e, DB + Redis) | 26 | — | **NOT RUN** (external stack + 5-min cap) |
| intelligence — graphology-projection | 1 | 11 | ✓ |
| intelligence — entity-resolution | 2 | 32 | ✓ |
| intelligence — relation-resolution | 1 | 37 | ✓ |
| intelligence — ingestion | 33 | 459 | ✓ |
| **Total verified** | **87** | **1,086** (+14 new) | ✓ |

Type check (`tsc --noEmit`): exit 0 on `@indago/contracts`, `@indago/platform`, `@indago/web`, `@indago/intelligence`.

## F. Capability + Live classification (spec §7/§15)

Per-capability rows live in `pr0-graph-baseline.md` §3. Summary classification:

- **REAL LIVE (client):** Evidence, Observations, Investigation, Case, Activity/realtime (SSE). These have real
  HTTP/SSE clients in `lib/providers/live/`.
- **REAL DEMO (through the real seam, deterministic fixtures):** Graph, Gaps, Graph Holes/overlay, Discovery,
  Cross-Case, Timeline, Leads, Hypotheses, Contradictions, Robustness, Review, Entity Resolution, Relation
  Resolution, Graph Versions. UIs consume these via contracts; fixtures are swappable.
- **FIXTURE (hardcoded inline, off-seam):** `DEMO_GAPS` in `graph-panel.tsx`; foreign-entity merge from
  `MOCK_FOREIGN_CASES`/`FOREIGN_ENTITIES_DB`. These are the PR-1 audit items (T1–T3).
- **UNSUPPORTED (live path returns `ProviderError.unsupported`):** every non-live capability — enforced, never
  a silent fallback.

## G. Findings

1. **G1 (backend-exists-but-unwired):** platform serves graph `current`/`versions`/`versions/:vid` (`graph/as-of`
   is a 501 pointer to the version endpoint), `traversal`, `centrality`, `communities`, `canonical-relations`,
   and audited `relation-hypotheses` accept/reject/reverse — but the live frontend bundle implements none of
   these (`LiveGraphProvider` does not exist). Free surface for PR-3 live graph wiring.
2. **G2 (backend pitfall):** `graph/as-of` deliberately returns **501** ("PR0 does not define sufficient
   temporal-boundary semantics") — do not build the frontend time-travel scrub against it; use
   `/graph/versions/:vid`.
3. **G3 (audit read missing):** `logAuditEvent` is write-only; there is no audit read endpoint and no
   `AuditProvider` seam. Audit transparency for relation authority remains backend-internal.
4. **G4 (lead/hypothesis persistence absent):** Leads and hypotheses exist in demo fixtures only; backend has
   entity-hypothesis accept + `investigations/start` but no lead persistence or list of served hypotheses.
5. **G5 (contract-comment drift):** `InvestigationTimeline.items` is commented "sorted ascending by time" but
   the fixture is band-grouped (ascending per band). Documented; the test asserts per-band ascending (T4).
6. **G6 (type wart, harmless):** `f-pr4.test.ts` passes `{ simulateLatency: false }` where `DataModeConfig` is
   declared; tolerated at runtime (T5).
7. **G7 (deviation set is closed):** the demo-coupling scan proves the ONLY graph component importing demo
   internals is `graph-panel.tsx` — the reusable engine layer (`graph-canvas`, `use-graph-layout`,
   `graph-hole-burst-layer`, `graph-live`) is provider-clean and frozen.

## H. Upload choreography invariant (Section 8E) — verified

Evidence Submit → `triggerOrQueueUploadSequence(realtime)` → `triggerSequence("upload", …)` (`NAMED_SEQUENCES`):
1. `ENTITY_CREATED` — "Meridian Transit Pvt Ltd" (port key courier-firm; bank→courier edge)
2. `GAP_IDENTIFIED` — graph hole `upload:gap:courier-owner`
3. `EVIDENCE_REVIEWED` — hole-resolve; Victor→Meridian ownership edge restored
4. `ENTITY_CREATED` — "Unregistered SIM · +91 98•••••42"

Verified by test: exact action order, provider-owned catalog resolution for all four keys, late-subscriber
history replay (memory-bank replay, deterministic).

## I. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Demo coupling in `graph-panel.tsx` (T1–T3) could break live-mode | Live mode already `UNSUPPORTED` for graph; refactor is PR-1 scoped, test-guarded by pr0 §17.6 |
| Timeline global-sort contract drift (G5) | Documented + per-band invariant tested |
| Platform integration suites unverified (E) | Requires external Neon + Redis; rerun in CI/gated env before merge |
| Cross-case monkey-patch could mask provider gaps | Cross-case is demo-only; live route absent is a PR-1+ roadmap item |
| `graph/as-of` trap (G2) | Recorded in baseline doc §3 temp-state row |

## J. Recommendations

1. Merge PR-0 as the verifiable baseline (tests + docs only).
2. Keep the §17.6 demo-coupling guards in CI — they are the tripwire for PR-1.
3. Under PR-1: T1 (consume provider catalog), T2 (route cross-case through `CrossCaseProvider`), T3 (single gap
   source), T4 (timeline sort contract), T5 (config-typing cleanup).
4. Under PR-3+: wire live graph client to `/graph/current` + `/versions/:vid`; add audit read + lead/hypothesis
   persistence; add cross-case backend route.

## K. Deliverables

1. `packages/web/tests/pr0-graph-baseline.test.ts` — 14 tests (A/E/G/C + §17.6 guards).
2. `docs/reports/pr0-graph-baseline.md` — capability matrix, frozen contracts, interaction surface, PR-1 targets.
3. This report.

## L. Sign-off checklist

- [x] All pre-existing suites green (87 files / 1,086 tests)
- [x] New PR-0 suite green (14 tests); full web suite 37/333 green
- [x] All packages type-check clean
- [x] Demo/Live seam inversion + no-singleton verified
- [x] Interaction surface verified
- [x] No source changes made in PR-0
- [ ] Platform integration/e2e green (requires Neon + Upstash Redis; unrun)

## M. Out of scope for PR-0 (explicit)

Redesign of the graph canvas, physics, overlay mechanics, provider boundaries, or backend wiring. All such
work belongs to PR-1+ and must keep the frozen contracts in `pr0-graph-baseline.md` §4 intact.

## N. Handoff pointers

- Overlay catalog seam: `DemoGraphProvider.getOverlayCatalog()` (`demo/providers.ts:352`) — already exposes the
  upload catalog GraphPanel manually imports (T1).
- Realtime memory-bank replay: `DemoRealtimeProvider.subscribe` (`demo/realtime.ts:39-40`).
- Upload choreography events: `demo-fixtures/upload-demo-sequence.ts`, registered at `demo/realtime.ts:10-12`.
- Cross-case fixture + DB: `demo-fixtures/cross-case.ts` (`operationFinancialShadowCrossCase` 0.87,
  `MOCK_FOREIGN_CASES`, `FOREIGN_ENTITIES_DB`, `CROSS_ENTITY_ID`).
- Backend graph seam: `graph-version-store.ts` + `graph-version-service.ts` (§F/G).
- Deterministic IDs: `deterministicUuid(...)` in `demo/submit.ts`.