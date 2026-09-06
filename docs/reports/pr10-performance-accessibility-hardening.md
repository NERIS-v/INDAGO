# PR-10 — Performance, Accessibility & Hardening

**Status:** DELIVERED. The Graph Control Center is hardened in three dimensions without a single new graph feature: the presentation-model derivation dropped its `O(V·E)`/double-derivation hotspots to `O(V+E)` and was proven behavior-identical; the physics simulation and the rendered projection are now provably decoupled (a readability filter can never restart the physics); every provider-driven surface is wrapped in an honest, isolating error boundary; the canvas exposes exactly one tab stop per node with truthful `aria-pressed` and labeled controls; and a historical version selection can never silently mutate the visible graph. New suites: **`pr10-*` — 10 files, 76 tests, 76 passed.** Regression: pr0–pr9 filtered **30 files / 400 tests / 400 passed**; full web suite **90 files / 960 tests / 960 passed**; `tsc --noEmit` **EXIT=0**; `npm run build` **SUCCESS**.

---

## A. Scope & Goal

PR-10 is the engineering hardening pass delivered in three accountable axes:

- **Performance.** The `deriveGraphVisualContext` projection previously ran an `O(V·E)` per-edge `input.nodes.find`, an `O(V·E)` per-node evidence-in-scope scan, and derived node signals **twice** per full context. PR-10 replaced those with a `nodeById` index, a single-pass `groundedIncidentByNode` map, and one shared signal derivation — then proved the result is **behavior-identical** (the entire pr6 living-graph suite stays green, plus the new pure large-projection suite). The physics/render decoupling (§5) guarantees that a PR-4 readability-filter interaction changes *only* the rendered edge set and never the simulation content key.
- **Accessibility.** One tab stop per node (the interaction circle — the sr-only duplicate entity list is gone), roving-tab tablists with arrow-key navigation and `aria-selected`/`aria-controls`, labeled zoom controls, `aria-pressed` honesty on every toggle, and `role="alert"` fallbacks.
- **Hardening.** Per-surface error boundaries so a single provider slice can never take down the shell; mutation-safety guards on the relation-authority actions (deferred-promise debounce, busy/destructive-confirm locks, stale-concurrent-change detection, verbatim reject reasons); a historical-gate proving a lifted version selection is never silently mutated by realtime or authority actions.

## B. Frozen Contract

Everything the previous derivations locked stays frozen and verified by their original suites:

- `data-graph-*` hooks and the `data-graph-node-state`/`data-graph-edge-state` JSON projections (pr6).
- Exact primitives classes (`bg-danger/10`, `animate-breathe`, `type-section`, `type-caption`, `hover:bg-surface-100`, `p-8`, `h-8`) and behavior/testids (pr2/pr4/pr7/pr8).
- `EdgeSupportBand` ordinal vocabulary (`supportBand`, `posture`, `evidenceInScope`, `attentionLevel` 0–3), `AttentionSignalType` vocabulary, `ATTENTION_CONVERGENCE_MIN_SIGNAL_TYPES=2` and `ATTENTION_CONVERGENCE_HOPS=2`.
- Relation-authority state machine: accept/reject/reverse only when PROPOSED, `REL_5` via `operationFinancialShadowRelations`, `relationAuthorityAvailable("demo")` = `{ available: true }`.
- Provider/live seams, `getDataModeConfig`, capability table, `ProviderError` codes: untouched.
- `@indago/contracts` read as-is.

## C. Files Added

| File | Purpose |
|---|---|
| `packages/web/tests/pr10-mutation-safety.test.tsx` | **6 tests** — deferred-promise guard (rapid Accept double-click → one `onMutate` + `relation-authority-busy`); destructive-confirm busy lock → one call; rejected mutation → verbatim message in `relation-authority-error` + panel recovery + retry; stale concurrent change → `relation-authority-stale` ("not Accepted"), never a false success; accept success → `relation-authority-success` "Accept recorded."; Reject inline-confirm first click performs no provider call, confirm runs with `("reject", reason)`, empty reason → `("accept", undefined)`. |
| `packages/web/tests/pr10-error-boundaries.test.tsx` | **8 tests** — failing child → `error-boundary-<label>` fallback with `role="alert"` and `console.error("[<label>] render failure", …)`; label→slug hyphenation/lower-casing (``Versions panel`` → `versions-panel`); sibling isolation; silent containment (never rethrows into the shell); fs source-guard proving all six wired labels (Contextual panel / Intelligence / Relation authority / Deep-dive bridges / Activity feed / Versions panel) + the `error-boundary-${…}` slug contract. |
| `packages/web/tests/pr10-visual-state.test.ts` | **8 tests** — 1000-node/3000-edge projection: every element keyed exactly once, dangling edges honestly skipped, derivation stable across calls; evidence-in-scope equals the brute-force reference (grounded, non-contradicted/archived incidents); region convergence with 2 distinct signal types; filter honesty (a 0.5 minSupport filter kills weak-support attention; the unfiltered twin still converges); foreign/contradiction flags survive at scale (`caseScope`, `posture`). |
| `packages/web/tests/pr10-activity-lifecycle.test.tsx` | **7 tests** — exactly ONE realtime subscribe per mount retained across a full 1500ms badge-poll window (spied), exactly one unsubscribe on unmount, fresh subscription on remount; pure reducer determinism (`eventKey` id-wins, composite dedupe, bounded limit 100, newest-first); record-only banner (`HISTORICAL_NO_SILENT_MUTATION`) while events keep streaming; `realtimeMayMutateVisibleGraph` false only for historical selections. |
| `packages/web/tests/pr10-realtime-lifecycle.test.ts` | **15 tests** — normalization vocabulary (`STREAM_CONNECTED`, `EVIDENCE_SUBMITTED` identity mapping, `RUN_PHASE_<STATE>`, canonical passthrough, unknown-frame honesty), `eventIdentity` id-wins, bounded-FIFO `EventDeduplicator` with re-accept-after-eviction + `reset()`, `consolidateStatus` error-wins; provider behavior: idempotent connect never wipes the bank, catch-up replay on subscribe, unsubscribe stops delivery (queued sequences pause, drain to later subscribers), disconnect clears the bank, reconnect restarts. |
| `packages/web/tests/pr10-a11y.test.tsx` | **10 tests** — exactly one labeled `role="button"` per node with `tabindex="0"`, `focus-visible:ring`, `outline-none`, `data-nodeid`, and the interaction layer holding the ONLY focusable node affordances; click/Enter selection sets `aria-pressed` honestly and clears on re-selection; zoom controls (`Zoom in`/`Zoom out`/`Fit graph to view`) labeled; `data-graph-physics-edges`/`data-graph-render-edges` readable; temporal tablist roving `tabIndex` + `aria-selected`/`aria-controls` + ArrowRight advance-and-focus + wrap-around; representation switcher `aria-pressed`=current, disabled `not-ready` view with honest title, `onChange` only for available views. |
| `packages/web/tests/pr10-deep-link.test.tsx` | **9 tests** — every `relationDeepDiveLinks`/`entityDeepDiveLinks` href starts `/investigations/{id}`, never drops `?caseId=`, network bridge = `/graph?…focus=<entity>`; null slices → `available:false` with per-slice honest notes; page-level bridges always available; present slices flip on with no note; hostile entity ids are `encodeURIComponent`-escaped; the `?focus` deep link selects the owning graph node (`aria-pressed="true"` via `focusNode`). |
| `packages/web/tests/pr10-large-graph.test.tsx` | **2 tests** — the REAL canvas+layout engine renders a 500-node/800-edge projection: exactly 500 `g[data-graph-node-state]`, 800 `g[data-graph-edge-state]`, 500 interaction tab stops, `data-graph-physics-edges="800"`; a filtered render keeps physics at 800 while `data-graph-render-edges` equals the filtered set. |
| `packages/web/tests/pr10-authority-gate.test.tsx` *(earlier pass)* | **7 tests** — historical selection → `relation-authority-historical-unavailable` gate note, authority panel/buttons never rendered, deep-dive bridges persist; `historical=false` default keeps the panel; entity+historical renders bridges-only; shell E2E: Flow segment click → relation context → switch to Graph → Versions → v2 → gate note + bridges → Return to current → panel back; `data-version-badge="historical"` + `data-versions-replay-note` + `data-return-current`. |
| `packages/web/tests/pr10-simulation-stability.test.tsx` *(earlier pass)* | **4 tests** — §5 physics/render decoupling: filter interactions change only the RENDER set; `data-graph-physics-edges` stays the full topology; RENDERED edge states equal `data-graph-render-edges`; GE_6 (0.2 support) is the only low-support edge below 0.5. |

## D. Files Changed

- `packages/web/src/lib/graph/graph-visual-state.ts` — **hotspot pass, verified behavior-identical**: `AttentionInput.signals` optional (`deriveAttentionRegions` uses `input.signals ?? deriveNodeSignals(input)`); `nodeById` Map built once; `evidenceInScopeForNode` `O(V·E)` scan → single-pass `groundedIncidentByNode`; `deriveNodeSignals` computed once and shared; the edge loop uses `nodeById.get` instead of `input.nodes.find`. pr6 flagship (50/50) proves nothing observable changed.
- `packages/web/src/components/graph/graph-canvas.tsx` — §5: `physicsEdges` (full simulation topology) vs `edges` (PR-4 filtered render) honored via `visibleEdgeIds`; container exposes `data-graph-physics-edges`/`data-graph-render-edges`; canvas indexing (`nodeTimeById`, `layoutNodesById`, `adjacencyFor`); interaction circles = the single per-node affordance (`role="button"`, `aria-label` + ", bridge candidate", `aria-pressed`, `tabindex` roved by time-range, `focus-visible:ring`).
- `packages/web/src/components/graph/graph-panel.tsx` — feeds disjoint `physicsEdges`/`edges`; `controlsRef` captured; zoom controls labeled.
- `packages/web/src/components/ui/panel-error-boundary.tsx` — **new**: `role="alert"` fallback with the `error-boundary-<label>` slug, `text-danger/80`, `console.error("[<label>] render failure", …)`; silent containment.
- `packages/web/src/components/graph/control-center/graph-control-center.tsx` — lifts `temporalSelection` (controlled vs local), gates the authority footer on `historical`, removed the unused `deriveGraphVisualContext` import; wraps Contextual panel + Intelligence in boundaries.
- `packages/web/src/components/graph/control-center/contextual-panel-footer.tsx` — historical gate: gate note replaces the authority panel (+ deep-dive bridges persist), `mutate()` throws in historical, `historical` is an additive-safe optional prop (pr8 footer spin renders unchanged).
- `packages/web/src/components/graph/control-center/temporal-context-panel.tsx` — optional controlled `selection`/`onSelectionChange` (absent → identical pre-PR-10 local-state behavior); wraps Activity feed + Versions panel in boundaries.

## E. Files Removed

None.

## F. Files Intentionally Untouched (scope discipline)

- Parallel workstreams — `src/lib/network/matrix/`, `pulse/`, `flow/`, `representation-switcher.tsx`, `page.tsx`, `capabilities.ts`, `nav.ts`, `timeline-panel.tsx`: never opened for PR-10.
- Provider/live seams, contracts, platform, intelligence engines: untouched.
- Everything outside `packages/web/**`: untouched.

## G. The honest-data thread

- **Behavior-identical refactor.** The performance pass changed indexing, never semantics: pr6 (50/50) + the new visual-state/evidence brute-force reference + the 1000/3000 projection all hold.
- **Attention only from visible edges.** A `minSupport` filter hides weak-support attention; the unfiltered twin still converges. Filtered edges never contaminate evidence scope.
- **Status vs groundness.** Edge `evidenceInScope` follows groundness under an evidence focus (posture conveys `contradicted`); node scope excludes contradicted/archived.
- **Dedupe identity.** `eventIdentity` = `id:`-prefixed when present, else the `action|targetId|timestamp` composite; the feed reducer mirrors it.
- **Deep links can't lie.** Null slice → `available:false` + a per-slice note; `?caseId=` is never dropped; page-level routes stay real.
- **Record-only, never silent-mutate.** Historical selection keeps the activity feed recording while `realtimeMayMutateVisibleGraph` returns false and the authority footer renders the gate note instead of any mutation control.
- **Realtime lifecycle discipline.** `subscribe` replays the memory bank (catch-up), `unsubscribe` stops delivery (queued sequences pause, never ghost-deliver), `disconnect` clears the bank, `connect` is idempotent and never wipes it.

## H. Performance evidence

- `deriveGraphVisualContext` on 1000 nodes / 3000 edges: every id keyed exactly once, stable across repeated calls, evidence scope matches the brute-force reference.
- Real-layout canvas on 500 nodes / 800 edges: 500 node states, 800 physics edges, 500 tab stops — with a filter, rendered edges shrink while `data-graph-physics-edges` stays 800.
- Realtime: one subscription per mount retained across the full 1500ms status poll; one unsubscribe on unmount; no re-subscribe / no setState-after-unmount.

## I. Accessibility evidence

- One tab stop per node; the interaction layer is the only focusable node surface.
- `aria-pressed` truth across click, Enter-key, and `?focus` deep link; cleared on re-selection.
- Roving-tab tablist (`aria-selected`, `aria-controls`, arrow navigation, focus movement, wrap-around).
- `role="alert"` boundary fallbacks with labeled testids; representation switcher `aria-pressed` + disabled-with-title.

## J. Hardening evidence

- Mutation safety: busy/deferred locks, stale-concurrent-change detection, verbatim reject messaging, Reject confirm flow without premature mutation.
- Error containment: a failing surface degrades alone; siblings stay mounted; the boundary never rethrows.
- Historical gate: no authority gate note under current selection; full gate under historical; bridges persist; return-to-current restores the panel.

## K. Test-safety verification style

The suites lock behavior and structure exactly as their predecessors did: primitives assert exact classes and testids; pr6-style `data-graph-*` JSON checks are untouched; boundary/source-guard tests re-read source from disk (fs) so contract drift in the wiring is caught. Realism where it matters: real timers for the poll/lifecycle demonstrations, the real layout engine for the 500/800 render, the fast demo seam (timing scale 0.001) for provider behavior with `waitFor`.

## L. Out of scope (explicitly defers)

- New graph features/analytics; AI/evidence/hypothesis/anomaly engines; historical replay; matrix/pulse/flow work; new theme/navigation/mobile; backend/provider architecture changes.
- The parallel `matrix/`/`pulse/`/`flow/` representations and their rail/chrome (parallel workstream owns them).

## M. Risks & residual

- The fs/source re-reads are a proxy for compiled output; the assertions lock the same strings the compiler consumes, so CI risk is low.
- The lifecycle demonstration turns the 1500ms badge poll into ~1.7s of real wall-clock; the 500/800 layout render is ~20s — these are bounded, deliberate waits, not flake windows.
- The brute-force evidence and signal references recompute the *documented* rule in-test; if the rule is ever intentionally changed, these references must change with it (they will then fail loudly rather than silently).

## N. Verification

```
packages/web pr10      vitest run pr10-* (10 files)          → 76 tests, 76 passed
Regression            vitest run pr0…pr9 (30 files)          → 400 tests, 400 passed
full web suite        vitest run (90 files)                  → 960 tests, 960 passed
typecheck             tsc --noEmit (packages/web)            → EXIT=0
build                 npm run build (packages/web)           → SUCCESS
```

PR-0–9 across the codebase remain green; every frozen contract, `data-*` hook, and primitives class survives untouched. The hard-earned earlier sessions' F-PR9-attributed `tsc` drift is fully resolved on the merged branch (the parallel stream landed, so nothing remains to attribute). Performance, accessibility, and hardening now each stand on their own locked suite — and together they hold: 960/960 green, typecheck clean, production build intact.

---

INDAGO V7 Graph Control Center engineering hardening is complete.