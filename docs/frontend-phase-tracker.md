# INDAGO Frontend-First Phase Tracker

**PS 26189 — Mayur x Gurashish**

> Practical execution board for `docs/frontend-development-plan.md`. Check off tasks as completed. Each row is small enough to be checked off. **Documentation-only artifact — no source code is modified by this document.**
>
> **Path convention:** unless a path already starts with `packages/web/src/`, all `Files` cells are relative to `packages/web/src/` (e.g. `components/ui/*` → `packages/web/src/components/ui/*`).

---

## Sprint Target

Build the production-shaped Investigator frontend **now**, demo-ready within ~7 days, using deterministic contract-valid implementations behind stable provider interfaces. When real backend services arrive, replace providers endpoint-by-endpoint — do not rebuild the UI.

## Owner Legend

| Tag | Owner | Responsibility |
|---|---|---|
| `[M]` | Mayur | WHAT INDAGO KNOWS — intelligence semantics, design/content, fixtures, narrative, judge narration |
| `[G]` | Gurashish | HOW INDAGO RUNS — shell, routing, providers, graph, timeline, realtime, performance |
| `[Both]` | Both | signature animations, Judge Mode, final integration, final rehearsal |

## Priority Legend

| Tag | Priority |
|---|---|
| **P0** | must |
| **P1** | should |
| **P2** | cut-if-time |

---

# Phase F0 — Foundation + Design System

**Gate:** design system + shell foundation exists.

| ID | Phase | Task | Owner | Reviewer | Priority | Dependencies | Files | Acceptance | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| F0-01 | F0 | Extend Tailwind v4 `@theme` with accent tokens (muted dusty rose, desaturated amber) — do not create a second design system | `[M]` | `[G]` | P0 | — | `packages/web/src/app/globals.css` | tokens in existing `@theme`; no duplicate theme | token exists | [ ] |
| F0-02 | F0 | Wire existing Inter + JetBrains Mono through `next/font` (if practical) | `[G]` | `[M]` | P1 | F0-01 | `packages/web/src/app/layout.tsx` | fonts load; fallback works | layout render | [ ] |
| F0-03 | F0 | Define centralized motion duration/easing tokens (fast 200ms, normal 400ms, slow 900–1400ms) | `[M]` | `[G]` | P0 | F0-01 | `globals.css` | tokens defined | — | [ ] |
| F0-04 | F0 | Add `prefers-reduced-motion` handling for grain + animations | `[G]` | `[M]` | P0 | F0-01 | `globals.css` | grain/motion disabled under reduced motion | a11y check | [ ] |
| F0-05 | F0 | Create Workspace shell + workspace nav alongside existing Sidebar | `[G]` | `[M]` | P0 | — | `components/layout/workspace-nav.tsx` (new), `layout.tsx` | shell renders | shell render | [ ] |
| F0-06 | F0 | Scaffold route structure `/`, `/investigations/new`, `/investigations/[id]` (and optional deep-links) | `[G]` | `[M]` | P0 | F0-05 | `app/**` routes | routes exist; shared layout | route smoke | [ ] |
| F0-07 | F0 | Polish existing UI primitives against token set (no new design system) | `[M]` | `[G]` | P1 | F0-01 | `components/ui/*` | primitives use tokens | — | [ ] |
| F0-08 | F0 | Define customer-facing intelligence semantic naming (confidence/lead/gap/evidence wording) | `[M]` | `[G]` | P0 | — | `docs` (naming ref) | naming doc agreed | — | [ ] |

# Phase F1 — Provider / Data

**Gate:** DemoProvider returns contract-valid coherent case.

| ID | Phase | Task | Owner | Reviewer | Priority | Dependencies | Files | Acceptance | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| F1-01 | F1 | Define domain provider interfaces (Investigation/Evidence/Observation/Entity/Graph/Timeline/Lead/Gap/Review/Robustness/Realtime) | `[G]` | `[M]` | P0 | F0-06 | `lib/providers/*Provider.ts` (new) | interfaces exist; canonical types | — | [ ] |
| F1-02 | F1 | Define `resolveDataMode(caseId, runtimeConfig)` with non-demo → live invariant | `[G]` | `[M]` | P0 | F1-01 | `lib/providers/DataMode.ts` (new) | non-demo never mock; no silent fallback | DataMode test | [ ] |
| F1-03 | F1 | Build provider bundle + factory | `[G]` | `[M]` | P0 | F1-01, F1-02 | `lib/providers/factory.ts`, `types.ts` (new) | bundle constructed from resolved mode | factory test | [ ] |
| F1-04 | F1 | Assemble coherent "Operation Financial Shadow" demo fixtures (case/investigation/evidence/observations/entities/relations/graph/timeline/leads/gaps/evidence-requests/cross-case/robustness/review/events) | `[M]` | `[G]` | P0 | — | `lib/providers/demo/demo-fixtures/*.json` (new) | coherent case; canonical fields | — | [ ] |
| F1-05 | F1 | Validate every fixture through canonical `@indago/contracts` schemas | `[G]` | `[M]` | P0 | F1-04 | `demo-fixtures/**` | all fixtures `schema.parse()` OK | fixture validation test | [ ] |
| F1-06 | F1 | Implement DemoProvider (contract-valid, deterministic, latency-aware, event-aware) | `[G]` | `[M]` | P0 | F1-04, F1-05 | `lib/providers/demo/*` (new) | mock behaves like future backend | DemoProvider test | [ ] |
| F1-07 | F1 | Implement LiveProvider wrappers (status/evidence/SSE live) with typed "not available" for missing endpoints | `[G]` | `[M]` | P1 | F1-01 | `lib/providers/live/*` (new) | live endpoints wrapped | LiveProvider test | [ ] |
| F1-08 | F1 | Live/Demo parity acceptance (same method signatures per domain) | `[G]` | `[M]` | P0 | F1-06, F1-07 | `lib/providers/**` | identical signatures; no UI branching | parity test | [ ] |
| F1-09 | F1 | Configure `DEMO_TIMING_SCALE` simulated-latency scale factor | `[G]` | `[M]` | P1 | F1-06 | `lib/providers/**` | latency configurable | — | [ ] |

# Phase F2 — Case / Evidence

**Gate:** case/evidence workflow works.

| ID | Phase | Task | Owner | Reviewer | Priority | Dependencies | Files | Acceptance | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| F2-01 | F2 | Refactor existing Investigation Detail to consume provider bundle (not direct fetch) | `[G]` | `[M]` | P0 | F1-03 | `investigations/[id]/investigation-detail.tsx` | detail reads from provider | render test | [ ] |
| F2-02 | F2 | Case List surface (evolve current `/` dashboard) | `[G]` | `[M]` | P0 | F0-06 | `app/page.tsx` | list from provider | render test | [ ] |
| F2-03 | F2 | New Case Intake wired to provider | `[G]` | `[M]` | P0 | F2-02 | `investigations/new/*` | intake creates via provider | flow test | [ ] |
| F2-04 | F2 | Evidence flow refactor (submit → provider → state) | `[G]` | `[M]` | P0 | F1-03 | `components/evidence/*`, `components/upload/file-upload.tsx` | evidence via provider; live/mock parity | parity test | [ ] |
| F2-05 | F2 | Observations semantic content | `[M]` | `[G]` | P0 | F1-04 | `components/intel/*` (new) | observations surface | render test | [ ] |
| F2-06 | F2 | Loading/empty/error states for case+evidence surfaces | `[G]` | `[M]` | P0 | F2-04 | `components/ui/empty-state.tsx`, `error-display.tsx` | states wired | state test | [ ] |

# Phase F3 — Graph / Timeline

**Gate:** graph/timeline work against provider only.

| ID | Phase | Task | Owner | Reviewer | Priority | Dependencies | Files | Acceptance | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| F3-01 | F3 | Day-2 graph spike: evaluate SVG renderer + deterministic/force layout; decide tech (no WebGL unless demo requirement) | `[G]` | `[M]` | P0 | F1-01 | `components/graph/*` (new) | spike decision documented (CSS+SVG or GSAP) | spike | [ ] |
| F3-02 | F3 | Build provider-driven Graph component (no hardcoded graph data in component) | `[G]` | `[M]` | P0 | F3-01, F1-03 | `components/graph/*` (new) | graph renders from `getGraph()` | graph purity test | [ ] |
| F3-03 | F3 | Graph presentation semantics (node size = demo-only KPP field; edge thickness = confidence; low-confidence dashed; bridge halo; community fog) | `[G]` | `[M]` | P0 | F3-02 | `components/graph/*` | presentation rules applied | — | [ ] |
| F3-04 | F3 | Node interaction → Entity Detail drawer (preserve graph context) | `[G]` | `[M]` | P0 | F3-02 | `components/graph/*`, drawer | node click opens drawer | interaction test | [ ] |
| F3-05 | F3 | Timeline component (case-wide range, scrubber, density strip) coupled to graph filtering | `[G]` | `[M]` | P0 | F1-01 | `components/timeline/*` (new) | scrubber filters graph | timeline filter test | [ ] |
| F3-06 | F3 | Graph/timeline semantic validation + presentation copy | `[M]` | `[G]` | P0 | F3-03, F3-05 | semantics/notes | wording approved | — | [ ] |
| F3-07 | F3 | Graph performance guardrails (node cap, pause simulation, memoize, throttle) | `[G]` | `[M]` | P0 | F3-02 | `components/graph/*` | guardrails applied | perf smoke | [ ] |

# Phase F4 — Intelligence

**Gate:** lead/entity/observation presentation works.

| ID | Phase | Task | Owner | Reviewer | Priority | Dependencies | Files | Acceptance | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| F4-01 | F4 | Display Observations feed from provider | `[G]` | `[M]` | P0 | F2-05 | `components/intel/observations*` | observations render | render test | [ ] |
| F4-02 | F4 | Entity resolution review queue + Entity Detail | `[G]` | `[M]` | P0 | F3-04 | `components/intel/entity*`, drawer | queue + detail work | render test | [ ] |
| F4-03 | F4 | Leads list + Lead Detail drawer | `[G]` | `[M]` | P0 | F1-01 | `components/intel/leads*` | leads work | render test | [ ] |
| F4-04 | F4 | Gaps list + Gap Detail drawer (graph-hole) | `[G]` | `[M]` | P0 | F1-01 | `components/intel/gaps*` | gaps work | render test | [ ] |
| F4-05 | F4 | Intelligence presentation copy (lead/gap/evidence wording) | `[M]` | `[G]` | P0 | — | semantics/notes | wording approved | — | [ ] |

# Phase F5 — Differentiation / Trust

**Gate:** lead → gap → evidence → trust story works.

| ID | Phase | Task | Owner | Reviewer | Priority | Dependencies | Files | Acceptance | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| F5-01 | F5 | Lead → Gap → Next Evidence narrative scripting in demo | `[Both]` | `[Both]` | P0 | F4-03, F4-04 | `demo-fixtures/events.json`, `components/feedback/*` | narrative order validated | narrative test | [ ] |
| F5-02 | F5 | Graph-hole visualization (dim graph + hole emphasis) | `[G]` | `[M]` | P0 | F3-02 | `components/graph/*`, `components/feedback/*` | hole shown | — | [ ] |
| F5-03 | F5 | Evidence-arrival visualization (opacity/translate + connection draw) | `[G]` | `[M]` | P0 | F5-01 | `components/feedback/*` | arrival moment renders | — | [ ] |
| F5-04 | F5 | Signature animations decision (CSS+SVG default; GSAP only if approved by spike) | `[G]` | `[M]` | P0 | F3-01 | `components/feedback/*`, `globals.css` | decision documented | — | [ ] |
| F5-05 | F5 | Counter-evidence + robustness semantic content/surface | `[M]` | `[G]` | P0 | F1-01 | `components/intel/robustness*` | robustness surface works | render test | [ ] |

# Phase F6 — Realtime / Animation / Judge

**Gate:** realtime + signature moments + Judge Mode works.

| ID | Phase | Task | Owner | Reviewer | Priority | Dependencies | Files | Acceptance | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| F6-01 | F6 | Realtime normalizer (loose SSE → canonical `InvestigationEvent`) reuse SSE client/proxy | `[G]` | `[M]` | P0 | F1-01 | `lib/realtime/normalize.ts` (new), `lib/realtime/sse-client.ts` | loose events normalized | normalize test | [ ] |
| F6-02 | F6 | Event deduplication by stable event ID once IDs exist; smart refresh (no per-event full refresh) | `[G]` | `[M]` | P0 | F6-01 | workspace state | dedupe works | dedupe test | [ ] |
| F6-03 | F6 | Mock realtime provider for demo mode | `[G]` | `[M]` | P0 | F1-06, F6-01 | `lib/providers/demo/Realtime*` | demo emits event sequence | sequence test | [ ] |
| F6-04 | F6 | SSE failure recovery (reconnect w/ backoff, calm recovery ring, keep loaded state) | `[G]` | `[M]` | P0 | F6-01 | workspace, `components/feedback/*` | recovery behavior | failure test | [ ] |
| F6-05 | F6 | Judge Mode (seeded case, predetermined sequence, no chrome, keyboard advance, deterministic, restart/reset) | `[Both]` | `[Both]` | P0 | F5-01 | `app/investigations/[id]/judge/*` (new) | guided demo works | Judge sequence test | [ ] |
| F6-06 | F6 | Judge Mode individual signature-moment rehearsal + reset | `[G]` | `[M]` | P1 | F6-05 | `judge/*` | per-moment rehearsal | — | [ ] |
| F6-07 | F6 | Demo narration (Mayur) + semantic QA | `[M]` | `[G]` | P0 | F6-05 | narration/notes | narration approved | — | [ ] |
| F6-08 | F6 | Performance pass (throttle, memoize, cap feed, avoid unnecessary renders) | `[G]` | `[M]` | P0 | F6-01 | workspace | perf guardrails | perf smoke | [ ] |

# Phase F7 — Polish / Freeze

**Gate:** two clean demo runs.

| ID | Phase | Task | Owner | Reviewer | Priority | Dependencies | Files | Acceptance | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| F7-01 | F7 | Fixture determinism (repeatable results across runs) | `[M]` | `[G]` | P0 | F1-05 | `demo-fixtures/**` | same output on repeat | determinism test | [ ] |
| F7-02 | F7 | Demo content + semantic audit | `[M]` | `[G]` | P0 | — | fixtures/semantics | semantics correct | audit | [ ] |
| F7-03 | F7 | Final integration (all PRs merged, single coherent app) | `[G]` | `[M]` | P0 | all | workspace | app coherent | integration | [ ] |
| F7-04 | F7 | Accessibility baseline (focus-visible, contrast ≥4.5:1, a11y labels, Escape closes drawers, keyboard Judge, graph node list) | `[G]` | `[M]` | P0 | F6-05 | components | baseline passes | a11y check | [ ] |
| F7-05 | F7 | Non-demo → live enforced; mock can never silently reach arbitrary real cases | `[G]` | `[M]` | P0 | F1-02 | `lib/providers/DataMode.ts` | invariant holds | DataMode test | [ ] |
| F7-06 | F7 | Mock/live routing final wiring + demo reset | `[G]` | `[M]` | P0 | F1-03 | `lib/providers/**` | switch works; reset works | reset test | [ ] |
| F7-07 | F7 | Two clean timed rehearsals (full demo + Judge) | `[Both]` | `[Both]` | P0 | F7-03 | demo | 2 clean runs | rehearsal log | [ ] |
| F7-08 | F7 | Live provider can replace demo provider without rewriting UI components | `[G]` | `[M]` | P0 | F1-08 | `lib/providers/**` | bundle swap, no component change | parity test | [ ] |

---

# Page Completion Matrix

Each row is one of the 22 views from `docs/frontend-development-plan.md` §14/§15. Mark `[x]` when the page is built against the provider. Source of truth for demo coverage.

| View | Page / Surface | Provider method(s) | Owner | Route / Tab | Page spec | Status |
|---|---|---|---|---|---|---|
| 01 | Login / Access | (optional) | `[M]` | route (P2) | §15 V01 | [ ] |
| 02 | Case List | `InvestigationProvider.getInvestigations()` | `[G]` | `/` | §15 V02 | [ ] |
| 03 | New Case Intake | `EvidenceProvider.submitEvidence()` | `[G]` | `/investigations/new` | §15 V03 | [ ] |
| 04 | Investigation Workspace | bundle + realtime | `[G]` | `/investigations/[id]` | §15 V04 | [ ] |
| 05 | Observations Feed | `ObservationProvider` | `[G]` | workspace tab | §15 V05 | [ ] |
| 06 | Entity Resolution Queue | `EntityProvider` | `[G]` | workspace tab | §15 V06 | [ ] |
| 07 | Entity Detail | `EntityProvider` + `GraphProvider` | `[G]` | drawer | §15 V07 | [ ] |
| 08 | Graph View | `GraphProvider.getGraph()` | `[G]` | workspace panel | §15 V08 | [ ] |
| 09 | Timeline View | `TimelineProvider.getTimeline()` | `[G]` | workspace panel | §15 V09 | [ ] |
| 10 | Leads List | `LeadProvider.getLeads()` | `[G]` | workspace tab | §15 V10 | [ ] |
| 11 | Lead Detail | `LeadProvider` + `CounterEvidence` | `[G]` | drawer | §15 V11 | [ ] |
| 12 | Gaps List | `GapProvider.getGaps()` | `[G]` | workspace tab | §15 V12 | [ ] |
| 13 | Gap Detail | `GapProvider` | `[G]` | drawer | §15 V13 | [ ] |
| 14 | Evidence Request Queue | `EvidenceProvider` / `GapProvider` | `[G]` | workspace tab | §15 V14 | [ ] |
| 15 | Cross-Case Signals | `CrossCaseProvider` (demo) | `[G]` | workspace tab | §15 V15 | [ ] |
| 16 | Reasoning Ledger | `ReviewProvider` / realtime | `[M]` | workspace tab | §15 V16 | [ ] |
| 17 | Discovery Mode | `GraphProvider` overlay | `[G]` | interaction mode | §15 V17 | [ ] |
| 18 | Boundary Expansion | `GraphProvider` overlay | `[G]` | interaction mode | §15 V18 | [ ] |
| 19 | Robustness Report | `RobustnessProvider` | `[M]` | workspace tab | §15 V19 | [ ] |
| 20 | Review Center | `ReviewProvider` | `[G]` | workspace tab | §15 V20 | [ ] |
| 21 | Admin / RBAC | (P2, cut-if-time) | `[G]` | `/admin/*` | §15 V21 | [ ] |
| 22 | Judge Mode | `DemoProvider` script | `[Both]` | `/investigations/[id]/judge/*` | §15 V22 | [ ] |

---

# Visual QA Matrix

Cross-object interaction check. Row = one interaction/detail to verify visually in both live and mock modes.

| # | Visual QA item | Mode | Status |
|---|---|---|---|
| 1 | Graph bloom animation (opacity + node stagger + edge dash-draw + bridge halo, settle, pause sim) | Demo | [ ] |
| 2 | Timeline scrubber filters graph visibility | Demo + Live | [ ] |
| 3 | Graph community washes + bridge halo render without clipping | Demo | [ ] |
| 4 | Node click opens Entity Detail drawer, graph context preserved | Demo + Live | [ ] |
| 5 | Entity-resolution convergence sequence (candidates → center, equal-weight Merge/Separate) | Demo | [ ] |
| 6 | Lead reveal (graph dim, surface translate, FOR/AGAINST stagger, alternatives, static confidence) | Demo | [ ] |
| 7 | Graph-hole dim + region pulse + candidate explanations enter (no red flash) | Demo | [ ] |
| 8 | Evidence-arrival (opacity/translate + connection draw) updates graph | Demo | [ ] |
| 9 | Cross-case thread draws (stroke-dasharray → offset 0) | Demo | [ ] |
| 10 | Reasoning ledger staggered row entrance (≤40ms, capped) | Demo + Live | [ ] |
| 11 | Traveling processing filament during state transitions | Demo | [ ] |
| 12 | Recovery ring on SSE reconnect (calm, keep loaded state) | Live | [ ] |
| 13 | Judge Mode keyboard-advance + restart; deterministic run-to-run | Demo | [ ] |
| 14 | Confidence numbers NOT animated (AnalyticalConfidence/ResolutionScore are [0,1], not probability) | All | [ ] |
| 15 | Robustness = perturbation count [0,100] shown, not truth probability | All | [ ] |
| 16 | GraphHole vs InvestigativeGap remain distinct (structural vs classification) | All | [ ] |
| 17 | PII revealed only on explicit toggle (Entity Detail) | All | [ ] |
| 18 | Low-confidence edges dashed + transparent; edge thickness maps to confidence | Demo | [ ] |
| 19 | Empty/loading/error/recovery states per surface (§25) | All | [ ] |
| 20 | `prefers-reduced-motion`: grain loop stops, animations skip/jump-to-end | All | [ ] |
| 21 | Demo reset restores initial snapshot; Judge restart works | Demo | [ ] |

---

# F-PR Tracker

| PR | Goal | Owner | Dependencies | Acceptance | Status |
|---|---|---|---|---|---|
| F-PR1 | Foundation + Design System | Mayur/Gurashish | — | shell renders via provider | [ ] |
| F-PR2 | Provider Seam + Demo Case | Gurashish/Mayur | F-PR1 | contract-valid coherent case | [ ] |
| F-PR3 | Core Workspace + Case/Evidence | Gurashish | F-PR1, F-PR2 | case→evidence→provider→intelligence | [ ] |
| F-PR4 | Graph + Timeline | Gurashish | F-PR2, F-PR3 | graph/timeline via provider | [ ] |
| F-PR5 | Intelligence Surfaces | Gurashish/Mayur | F-PR3 | lead/entity/observation presentation | [ ] |
| F-PR6 | Signature Motion + Realtime | Gurashish | F-PR2, F-PR4 | realtime + signature moments | [ ] |
| F-PR7 | Judge Mode + Polish | Both | all | 2 clean runs + freeze | [ ] |

---

# Daily Board

| Day | Mayur | Gurashish | Joint Gate | Definition of Done |
|---|---|---|---|---|
| 1 | design tokens, typography, motion constants, primitives, semantic naming, demo data model | workspace shell, routes, provider interfaces/factory, DataMode skeleton | bare workspace renders via provider abstraction | Foundation + seam |
| 2 | assemble coherent demo fixtures, canonical validation, intelligence semantics | graph spike + tech decision, realtime normalizer | one contract-valid demo case + graph spike | Demo case + graph |
| 3 | Observations/Entity/Leads/Gaps semantic content | Case List, Intake, workspace provider integration, evidence refactor | case→evidence→provider→visible intelligence | Case/Evidence + intel pages |
| 4 | graph/timeline semantic validation, presentation copy | graph impl, timeline, node interaction, entity drawer | graph/timeline work from provider only | Graph + Timeline |
| 5 | lead/gap/evidence/counter-evidence/robustness semantics | signature animations, graph-hole, evidence-arrival, realtime shell | Lead→Gap→Next Evidence narrative | Differentiation + trust + signature |
| 6 | demo narration, semantic QA | Judge Mode, realtime/error/recovery/performance | complete guided demo | Judge Mode + Realtime |
| 7 | fixture determinism, semantic audit, demo content | final integration, accessibility, performance, mock/live, reset | two clean timed rehearsals | Polish + parity + freeze |

---

# Integration Gates

| Gate | Phase | Exit Criteria | Status |
|---|---|---|---|
| G-F0 | F0 | design system + shell foundation exists | [ ] |
| G-F1 | F1 | DemoProvider returns contract-valid coherent case | [ ] |
| G-F2 | F2 | case/evidence workflow works | [ ] |
| G-F3 | F3 | graph/timeline work against provider only | [ ] |
| G-F4 | F4 | lead/entity/observation presentation works | [ ] |
| G-F5 | F5 | lead→gap→evidence→trust story works | [ ] |
| G-F6 | F6 | realtime + signature moments + Judge Mode works | [ ] |
| G-F7 | F7 | two clean demo runs | [ ] |

---

# Demo Checklist

- [ ] Coherent deterministic demo case ("Operation Financial Shadow") contract-valid
- [ ] Provider bundle consumes demo fixtures, validated via canonical `@indago/contracts`
- [ ] Demo mode explicitly mock or live; demo day has NO silent fallback
- [ ] Non-demo cases always live (never mock)
- [ ] Full narrative: MESSY CASE → OBSERVATIONS → RESOLUTION → TEMPORAL GRAPH → CROSS-CASE SIGNAL → LEAD → EVIDENCE FOR/AGAINST → GRAPH HOLE → GAP → BEST NEXT EVIDENCE → COUNTER-EVIDENCE → ROBUSTNESS → VERIFIED EVIDENCE → GRAPH UPDATE → LEAD REASSESSMENT → REASONING LEDGER
- [ ] Signature animations implemented (graph bloom, lead reveal, evidence arrival, graph-hole, ledger)
- [ ] Timeline coupled to graph (scrubber + density + filter)
- [ ] Graph provider-driven, no hardcoded data in components
- [ ] Realtime works in mock mode (canonical `InvestigationEvent`)
- [ ] Judge Mode deterministic, keyboard-advance, restart/reset, independence from backend latency in mock
- [ ] Loading/empty/error/recovery states present
- [ ] Demo reset restores initial snapshot
- [ ] `DEMO_TIMING_SCALE` controls pacing
- [ ] SSE failure shows calm recovery ring without destroying loaded state

---

# Final Freeze Checklist

- [ ] No source code / package.json / lockfiles / Prisma / contracts / routes / components / config modified by documentation effort
- [ ] Existing design system extended, no second design system
- [ ] No competing state-management systems introduced
- [ ] No real intelligence implemented inside frontend
- [ ] No mock fallback global; non-demo always live
- [ ] DemoProvider not a special rendering path
- [ ] RecordedProvider not built (Phase 2 only)
- [ ] Judge Mode specialized to demo case, not over-generalized
- [ ] Admin deep work cut until core story done
- [ ] Graph not compromised for secondary visuals
- [ ] Platform SSE/worker discrepancies (auto-pipeline, duplicate emission) documented as dependencies, not silently rewritten
- [ ] No WebGL/Three.js added without demonstrated requirement
- [ ] Core demo narrative protected over page-count completion
- [ ] Accessibility baseline passes
- [ ] Two clean timed rehearsals pass
- [ ] Live provider replaces demo provider without rewriting UI components
