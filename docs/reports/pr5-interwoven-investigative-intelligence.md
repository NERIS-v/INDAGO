# PR-5 — Interwoven Investigative Intelligence

**Status:** DELIVERED — all verification green. Web regression **520/520 tests across 52 files** (including 27 new PR-5 tests), all seven packages `pnpm typecheck` exit 0, full `pnpm build` exit 0 (Next.js production build + all intelligence packages + platform Prisma). The bottom-right Investigative Intelligence panel is no longer a reserved placeholder: all five tabs are now **genuinely context-aware and interwoven** with the graph selection, grounded strictly in existing domain logic, and backend-swappable UI → provider contract → Demo/Live with honest unsupported states.

## A. Scope & Goal

PR-3 answered "what IS this selection?" and PR-4 "what can I actually DO about it?" PR-5 answers "**what does the investigation itself say about it, right now, next to the graph?**" The Investigative Intelligence panel (Overview / Hypotheses / Signals / Evidence / Activity) is now built from the same provider seams and the same `InvestigativeContext` that drive everything else:

1. **Overview** — investigation-level profile from provider `totalItems` counts (with an honest "Counts · No rankings" posture) that becomes a per-kind resolved stat grid + grounded narrative when a context is selected.
2. **Hypotheses** — the canonical working hypothesis set through the new `HypothesisProvider` seam, context-sensitive (hypothesis selection first, entity filtering), with "Select on graph" re-materializing the selection in the CSP.
3. **Signals** — a deterministic signal surface filtered from provider-owned lists with a documented threshold and review counts — no scoring, no rankings.
4. **Evidence** — source-identity groups at investigation level and posture surfaces (supporting/contradicting) for evidence, hypothesis, and entity selections.
5. **Activity** — a realtime case-activity stream (history memory-bank replay + live subscription) with de-duplication and a live status badge.

Hard rules honored throughout: **no fabricated AI claims, metrics, or rankings**; demo data stays behind demo providers; Live unsupported surfaces are honest `unsupported`, never a silent demo fallback; every surface differentiates `resolved / unsupported / not-found / error / empty`; the frozen PR-0–4 render contracts and the global `InvestigativeContext` remain the single source of selection state.

## B. Frozen Contract (untouched by PR-5)

- PR-0/1/2/3/4 render contracts — `data-slot`, `data-capability`, rail action model, `aria-pressed` surfaces, tablist/tabpanel a11y shell with `intel-tab-*` ids and arrow-key roving focus.
- All provider interfaces in `lib/providers/types.ts` (extended only by the additive `HypothesisProvider` seam), the demo/live provider bundles, `getDataModeConfig` latencies, `ProviderError` codes, `WorkspaceProvider`.
- `lib/context` PR-3 contracts: `InvestigativeContext`, resolver, generation-token race-guard controller, `getContextualCapabilities` — consumed, not replaced.
- The `ContextualPanel` in-context slices from PR-3's continuation and its `data-context-*` hooks.
- Graph canvas glue, physics, temporal filtering, cross-case layers — the intelligence panel only ever calls `onSelectContext`, which flows into the existing `revealContext`.

## C. Files Added

| File | Purpose |
|---|---|
| `packages/web/src/lib/context/context-narrative.ts` | **Pure narrative + stats module.** `buildResolvedStats(details)` → per-kind `ContextStat[]` (8 kinds); `buildResolvedNarrative(details)` → deterministic grounded clauses. Every number is a provider-owned count or a documented `pct()`; `null` slices become `"--"` or "unavailable in this data mode." |
| `packages/web/src/components/graph/control-center/intelligence/shared.tsx` | Shared tab primitives: `IntelligencePanel`, `IntelligenceLoading`, `IntelligenceError`, `UnavailableState`, `EmptyIntelligenceState`, `SelectOnGraphButton` (`data-select-on-graph`), `StatCard`/`StatGrid` (`data-context-stat*`), `ClauseList` (`data-context-clauses`). |
| `packages/web/src/components/graph/control-center/intelligence/intelligence-overview.tsx` | Overview tab. No context → `useInvestigationCounts` (9 parallel guarded `totalItems` probes, `pageSize: 1`, per-source `null` on failure → `"--"`, availability narrative). Context → `useContextDetails` → `buildResolvedStats`/`buildResolvedNarrative` with `UnavailableState`/not-found/error/loading branches. |
| `packages/web/src/components/graph/control-center/intelligence/intelligence-hypotheses.tsx` | Hypotheses tab via `workspace.hypotheses.listByInvestigation({ pageSize: 200 })`. Hypothesis selection → selected-first + `data-hypothesis-selected`; entity selection → filtered + honest filter note; live → `UnavailableState`. |
| `packages/web/src/components/graph/control-center/intelligence/intelligence-signals.tsx` | Signals tab. `WEAK_SUPPORT_THRESHOLD = 0.3` documented export; guarded parallel loads of contradictions, open gaps (`isOpenGap`), weak relations (`support < 0.3`), active leads (`isActiveLead`), foreign overlays, PENDING/IN_PROGRESS review tasks; `SignalItem` grouped list with click-through; "Thresholds · No rankings" label; `noneAvailable` → single honest `UnavailableState`. |
| `packages/web/src/components/graph/control-center/intelligence/intelligence-evidence.tsx` | Evidence tab. Investigation-level source-identity groups; posture surfaces via `Extract<ResolvedContextDetails, { kind ... }>` for evidence (pure package + source group + supports/contradicts/leads), hypothesis (supporting vs contradicting lists), entity (referencing packages). |
| `packages/web/src/components/graph/control-center/intelligence/intelligence-activity.tsx` | Activity tab. `realtime.connect` + `subscribe`; de-dupe via `event.id ?? \`${action}|${targetId}|${timestamp}\``; newest-100 bound; change-only status poll (1.5s); empty state. |
| `packages/web/tests/pr5-context-narrative.test.ts` | 8 pure tests (stats/narrative for all 8 demo-resolved kinds, determinism, hypothesis robustness clause 78/100, `--` and unavailable-slice contract, threshold constant). |
| `packages/web/tests/pr5-interwoven-intelligence.test.tsx` | 19 end-to-end shell tests (Overview investigation + entity surfaces, Hypotheses ordering/filter/re-materialization, Signals groups + no-fabricated-weak-edge + contradiction click-through, Evidence source groups + hypothesis posture, Activity replay/dedupe/empty, live UNSUPPORTED honesty, source guard, resolver provenance). |

## D. Files Changed

- `packages/web/src/lib/providers/types.ts` — additive `HypothesisProvider` seam (`get`, `listByInvestigation`) + `readonly hypotheses` on `WorkspaceProviders`; `ProviderError.unsupported` canonical message for the seam.
- `packages/web/src/lib/providers/demo/state.ts` + `demo/providers.ts` — `hypothesisById` map seeded from `demo-fixtures/hypotheses.ts`; `DemoHypothesisProvider`.
- `packages/web/src/lib/providers/live/providers.ts` — `UnsupportedHypothesisProvider` (list + get throw `UNSUPPORTED` — never fake data).
- `packages/web/src/lib/context/context-details.ts` — PR-5 already relied on the PR-3 surface; retained and verified (hypothesis branch carries `supportingEvidence`/`contradictingEvidence`/observations/`robustness`).
- `packages/web/src/components/graph/control-center/investigative-intelligence.tsx` — **orchestrator rewrite**: hosts the five real tab components, adds the required `onSelectContext` prop, keeps the tablist/tabpanel a11y shell and roving focus.
- `packages/web/src/components/graph/control-center/graph-control-center.tsx` — passes `onSelectContext={revealContext}` to `InvestigativeIntelligence` (the one interweaving thread; F-PR5 network-view seams land beside it and resolve independently).
- `packages/web/src/components/graph/control-center/intelligence/intelligence-activity.tsx` — added `data-activity-event-key` test hook (dedupe verification).
- `packages/web/src/lib/context/context-narrative.ts` — added; `context-details.ts` unchanged behaviorally.

**Section-change matrix (tests updated because the panel is now connected):**

| File | Old expectation | New expectation |
|---|---|---|
| `tests/pr2-graph-control-center.test.tsx:300` | `/hypothesis layer is connected \(PR-5\)/` (reserved placeholder) | `await findByText("Working hypotheses")` after ArrowRight to the Hypotheses tab |
| `tests/pr2-graph-control-center.test.tsx:303-306` | "keeps the Overview tab quiet" → `/No intelligence is shown until the reasoning layer is connected/` | "surfaces the investigation overview with real provider counts — never fabricated intelligence" → `Investigation overview` + `Counts · No rankings` + placeholder absent |
| `tests/pr3-investigative-context.test.tsx:533` | reserved-panel placeholder text | Connected Overview: `Investigation overview` + `Counts · No rankings` |
| `tests/pr3-investigative-context.test.tsx:549-551` | `"Overview · Entity"`, `data-intelligence-context-selection`, `/selected through the context bridge/` | `data-intelligence-overview` kind `entity`, `Entity overview`, `[data-context-stat-grid]`, `[data-context-clauses]`, `/observations and \d+ relations trace this entity/` |

## E. Files Removed

None. The PR-2/3 reserved placeholder panel was replaced in place by the real tabs.

## F. Files Intentionally Untouched (scope discipline)

- `graph-canvas.tsx`, `use-graph-layout.ts`, physics, temporal filtering, cross-case layers — the intelligence panel calls `onSelectContext` and nothing else into the canvas.
- Demo/Live providers and fixture databases — consumed through the seams only; the intelligence modules carry **no** demo/live/fixture imports (source guard test asserts this against import lines only, mirroring pr3).
- `operational-rail.tsx`, `contextual-panel.tsx`, `use-graph-live.ts` (F-PR5 stream), `app/investigations/[id]/judge/page.tsx`.
- Platform integration tests remain pre-existing-failure (no real `TEST_DATABASE_URL`) — untouched app code, reported honestly.

## G. The interweaving thread

Every intelligence action that needs the graph funnels through ONE prop: `onSelectContext: (ctx: InvestigativeContext) => void`. The shell binds it to `revealContext`, so:

```
Hypotheses/Signals/Evidence "Select on graph"  →  InvestigativeContext  →  revealContext  →
CSP resolution (race-guarded)  →  ContextualPanel slices  →  graph canvas focus + region open
```

Re-materialization is a real resolution, not a stub: clicking a contradiction selects its `leftObservationId`, clicking a hypothesis selects `{ kind: "hypothesis", id }`, and the ContextualPanel confirms via `data-context-kind` + the hypothesis-resolution summary (`Robustness assessment … perturbation stability, not a truth probability`).

## H. Honest data policy (per tab)

| Tab | No context | Selected context | Live mode |
|---|---|---|---|
| Overview | 9 provider `totalItems` counts, "Counts · No rankings", availability narrative | per-kind stat grid + narrative via `useContextDetails` | all `"--"` + "unavailable in this data mode." (every count source is `Unsupported*`; evidence probe is guarded) |
| Hypotheses | full `hypotheses.listByInvestigation` set, CONF/poster counts | hypothesis → selected-first; entity → filtered + note; delete → note | `UnavailableState` — "No provisional hypotheses are shown." |
| Signals | contradictions / open gaps / weak edges / active leads / overlays / review counts; "Thresholds · No rankings" | click-through re-selects the canonical object | single `UnavailableState` when every source is unsupported |
| Evidence | source-identity groups (`data-evidence-source-group`) | evidence/hypothesis/entity posture lists (supporting vs contradicting, `PostureNote` for null vs empty) | `UnavailableState` (evidence list unsupported) |
| Activity | realtime history replay + subscription, de-duped, 100 cap | — | real-time SSE stream (not exercised in jsdom) |

Weak-edge honesty detail: `WEAK_SUPPORT_THRESHOLD = 0.3` filters `relations.listByInvestigation` (relation-hypothesis supports — all ≥ 0.58 in demo, so the weak group is legitimately absent). Graph-edge support (REL_6 at 0.2) is a different seam and is not conflated.

## I. Test-context facts locked by the suite

- HYP_1 "Shell-network money laundering" ACTIVE, confidence 0.82, **4 supporting / 0 contradicting evidence** (fixture-verified), 4 supporting observations, related entities incl. ENT_VICTOR; robustness 78/100 → "Robustness 78/100 — perturbation stability, not a truth probability."
- Evidence titles use an em dash ("Account 0092 — Transaction Ledger"); sources `SRC_BANK_RECORDS` / `SRC_COMMS` / `SRC_REGISTRY` produce ≥ 3 source groups; 2 account-ledger rows share the ledger text.
- `CONTRADICTION_1` (OBS_8 ↔ OBS_9) is the first Signals row → "Select on graph" re-materializes `observation` OBS_8.
- Review queue renders "Review queue · 2 pending tasks" + one "Informational" row; foreign overlays produce the cross-case group.
- Live hypotheses: `listByInvestigation` and `get` both reject `{ code: "UNSUPPORTED" }` — never a fake list; provenance test asserts list + get agree on unsupported.

## J. Source guards

`context-narrative.ts`, `context-details.ts`, `use-context-details.ts`, and all `intelligence/*` components import only provider types / context / api types / UI primitives. The guard test (mirroring pr3's import-line extraction) asserts no `providers/(demo|live)`, `demo-*fixtures`, `create(WorkspaceDemo|Live)Providers`, `graph-live`, or `useGraphLiveOverlay` in import lines across `lib/context` and `control-center/intelligence`. The boundary is documented in the code comments (which the guard deliberately does not scan).

## K. Accessibility

Tablist/tabpanel shell: `role="tablist"` named "Investigative intelligence tabs", per-tab `aria-selected`, `intel-tab-*` ids, arrow-key roving focus; `IntelligencePanel` region contains per-tab content; all interactive "Select on graph" buttons are real `<button>`s with `aria-label` including the object id; informational signal rows use a non-interactive badge. `data-*` hooks (see inventory above) power the tests with zero visual differences.

## L. De-scoped (explicitly NOT in PR-5)

- No derived scoring/ranking of hypotheses, signals, or sources; no LLM-generated summaries; robustness is presented only as the engine's perturbation score with a disambiguation sentence.
- No PR-6/7/8/9 scope: no anomaly-resolution engine UI, no hypothesis editing, no "resolve/challenge" mutations.

## M. Risks & residual

- The Activity tab's 1.5s status poll produces benign `act(...)` warnings under jsdom; the live SSE path is not exercised in the test environment (stubbed realtime covers the empty state).
- Platform integration tests still fail pre-existing (`PrismaClientInitializationError`, no real `TEST_DATABASE_URL`) — unrelated to PR-5 and unchanged.
- F-PR5 network-view seams in `graph-control-center.tsx` now typecheck and build clean alongside this work.

## N. Verification

```
packages/web tests       pnpm vitest run          →  52 files, 520 tests, all passed
packages/web PR-5 files  pr5-context-narrative    →   8 passed
                         pr5-interwoven-intelligence → 19 passed
typecheck (repo)         pnpm typecheck           →  exit 0 (all 7 packages)
build (repo)             pnpm build               →  exit 0 (Next.js + all packages + platform)
```

Newly updated legacy suites (`pr2-graph-control-center`, `pr3-investigative-context`) stay green with the connected panel assertions per section D. PR-1/PR-4, provider boundary, live-provider, and the F-PR5 representation/serialization suites all remain green unmodified.

---

PR-6 can now begin.