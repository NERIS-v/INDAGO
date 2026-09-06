# F-PR16 — Network interaction hardening + Entity Pulse circular redesign

**Status:** COMPLETE. Typecheck EXIT=0. Build EXIT=0. Full web suite **92 files / 1011 tests, 1011 passed**. Dedicated suites green and stability-repeated: `pulse-model.test.ts` (39), `pulse-panel.test.tsx` (13), `pulse-rail.test.tsx` (5), `pr2-graph-control-center.test.tsx` (27 incl. layout + lifecycle), `use-network-workspace.test.tsx` (19 incl. Matrix/Flow snap-back regressions), `pr3-investigative-context.test.tsx` (42), `pr4-operational-rail.test.tsx` (15), `pr5-interwoven-intelligence.test.tsx` (19), `pr6-timeline-default-scope.test.tsx` (3).

---

## 1. Objective

F-PR16 for `packages/web` (frontend only) hardens the network-interaction surfaces and delivers the **Entity Pulse circular redesign**: (a) fix the representation-switch snap-back, (b) make the views bar genuinely in-flow, (c) give every non-committed graph operation an honest, escapable lifecycle, and (d) redesign the pulse as large circular nodes with temporal perimeter peaks, a rail-held detail drill, and honest empty states — all deterministic, provider-backed, and regression-locked.

Consistent with F-PR6 contracts: SELECT stays distinct from FOCUS, sample counts/aria-labels are preserved, the pulse card id/aria-selected contract is intact, real zeroes are reported as NO DATA / NO ACTIVITY IN WINDOW, and nothing is fabricated.

## 2. What F-PR16 delivers

### 2.1 Snap-back and views-bar hardening

- **Snap-back (Bug #1).** In `lib/network/use-network-workspace.tsx`, a `pendingParamsRef` buffer coalesces `setActiveNetworkView` + `setFocus/temporal/filter` writes that land in the same tick, so a "Show on Graph" action (switch representation **and** focus in one click) serializes once: `?view=` is dropped (graph is the REST-ful default), `focus=` applies atop the **final** URL, never resurrecting the old `?view=pulse|matrix|flow`.
- **Views bar overlap (Bug #2).** `representation-switcher.tsx` + `control-center-layout.tsx` render the representation bar **in-flow** with a `data-representation-bar` strip inside the graph workspace; the layout exposes `data-context-region` only on the real contextual panel (no shadow wrapper) so the bridge tests resolve the true panel.
- **Operation-panel lifecycle (Bug #3).** `graph-panel.tsx` stores merge/scan timers in refs, `closeMergePanel()` cancels timers and resets to IDLE then publishes the close; window Escape closes Upload → Merge → Discovery → Gaps and exits Judge Mode cleanly (real drawer visibility in `judge/page.tsx`); `IntelligenceDetailPanel` / `EntityResolutionPanel` gain Escape→onClose. The merge drawer is restructured per §7 (explanation, ✕, "Current Object", divider, Cancel always under IDLE/PROCESSING).

### 2.2 Entity Pulse redesign (main deliverable)

**Model** (`lib/network/pulse/pulse-model.ts`, pure module):

- **Temporal peaks** — `buildEntityPeaks` clusters observations by UTC day (`dayKeyOf`), derives a real date from the parsed `observedAt` (never fabricated), and emits deterministic `EntityPulsePeak`s: `key`, `label` ("FIN · 20-FEB" style short category·date), `observationCount`, `magnitude` (normalized salience from `stableHash`), `angle` (stable per entity/day), `category` code from a fixed category set. Untimed observations get an honest `timestampMs: null` peak sorted last.
- **Scene placement** — `placePulseScene` assigns each placed entity an even radial slot (`PULSE_PHASE + (i+0.5)/count·2π`) with deterministic per-entity wobble; `shortEntityLabel` derives a short readable name from the canonical name.
- **Fields** — `EntityPulseField` gains `peaks`, `peaksTotal`, `peaksCapped` (`PULSE_MAX_PEAKS_PER_ENTITY=6` perimeter cap), and per-entity `peaksInWindow`/`concentrationPct`. New constants `PULSE_PEAK_CHIPS_PER_ENTITY=3`, `PULSE_PEAK_CATEGORY_CODES`, scene ring radii.

**Glyph** (`control-center/pulse/pulse-glyph.tsx`): circular node — centered short name over a surface fill, category ring, salience halo + contour (non-color differentiation, §23), perimeter peak ticks (`data-pulse-peak`, label/angle/magnitude/category attrs) with magnitude→tick length and category→tick color, `data-pulse-peaks-count`. Reduced-motion static geometry; `role="img"` aria-label preserves the F-PR6 contract (`observations in window`, `analytical relevance`, `data-pulse-sample-count="96"`).

**Panel** (`pulse-panel.tsx`): circular tiles (h-32/h-36) with `pulse-entity-card` / parent `data-pulse-card-entity` + `data-pulse-card-prominent`; focused tile additionally `data-pulse-card-selected`; peak-chip row under each tile (`pulse-peak-chips`, `data-pulse-peak-chip`, `-label`, `-angle`, `-count`, `title` "N observations"), capped at 3 with an honest "+N more" narration (`data-pulse-peak-more`); Open in Graph chip only on the focused/selected tile (seam-gated). The old text-heavy detail `dl` moved to the rail. Two honest empty states: `pulse-empty-no-data` (no entities placed) and `pulse-empty-no-window-activity` (entities placed, bounded window, 0 in-window observations).

**Rail** (`pulse-rail.tsx`): when a pulse is selected (via panel or `?view=pulse#focus=…`), the left rail holds the selected-entity **detail drill** (§16): `pulse-rail-detail` with `data-pulse-rail-entity`, Window activity / Observations / Analytical relevance rows, and a **Key events** list of real peak rows (`data-pulse-rail-peak`, `-label`, `×count`); entity-anchored case signals with `data-pulse-rail-marker`. Overview stats + hint retained; **Open in Graph** and **Clear selection** unchanged.

**Tests.**

- `pulse-model.test.ts` +7 F-PR16 describes (39): peak determinism, day-cluster labeling regex, untimed honesty, cap at 6, scene placement determinism/count uniqueness, short labels, entity peaks in-window counts.
- `pulse-panel.test.tsx` F-PR16 describe (13 total, 5 new): peaks on glyphs (`data-pulse-peaks-count`), chip labels/tooltips, "+N more" cap narration, NO DATA, NO ACTIVITY IN WINDOW — while **all F-PR6 contracts are preserved** (cards, SELECT≠FOCUS, prominent-focus, Open-in-Graph gating, loading/error, sr-only overview, `pulse-markers`, `pulse-open-in-graph`).
- `pulse-rail.test.tsx` (5, new): detail drill, activity/observations/relevance rows, real Key-event rows equal `field.peaks`, Open in Graph + Clear selection, calm entity invents no peaks.
- `use-network-workspace.test.tsx` +2 (19): Matrix→Graph and Flow→Graph "Show on Graph does NOT snap back" — same coalescing proof as the Pulse case.

### 2.3 Pre-existing-drift repairs surfaced by the F-PR16 gates

- **`data-context-region` shadow (my own regression, fixed).** A wrapper `<div data-context-region>` inside `control-center-layout.tsx:105` preceded the real `ContextualPanel` in the DOM, so `document.querySelector("[data-context-region]")` (used by pr3/pr4/pr5 bridge helpers) returned the wrapper, which has no `data-context-state` → `regionState()` was `null` → 27 end-to-end failures. Fixed by removing the attribute from the wrapper so the true panel is the single `data-context-region` presenter.
- **`gaps-list.tsx` impact label (pre-existing, unrelated to F-PR16).** PR-3/PR-4 Detect-Gaps tests match the uppercase `"IMPACT"` token but the ledger rendered lowercase `"{impact} impact"` since the F-PR15 gap ledger landed; verified pre-existing via a clean-`origin/main` stash run. Aligned the label to the uppercase mono contract → pr3/pr4 Detect-Gaps flows green.

## 3. Files

**Changed** (commit `d39c0e9`, pushed)
- `packages/web/src/app/investigations/[id]/judge/page.tsx` — real drawer visibility for lead/gap toggles.
- `packages/web/src/components/graph/control-center/control-center-layout.tsx` — in-flow layout, no shadow `data-context-region`.
- `packages/web/src/components/graph/control-center/graph-control-center.tsx` — views bar in-flow integration.
- `packages/web/src/components/graph/control-center/representation-switcher.tsx` — in-flow strip.
- `packages/web/src/components/graph/graph-panel.tsx` — merge timer refs, `closeMergePanel`, Escape routing, §7 drawer restructure, discovery close.
- `packages/web/src/components/intelligence/entity-resolution-panel.tsx`, `intelligence/intelligence-detail-panel.tsx` — Escape→onClose.
- `packages/web/src/lib/network/use-network-workspace.tsx` — `pendingParamsRef` coalescing.
- `packages/web/tests/pr2-graph-control-center.test.tsx` (+116), `tests/use-network-workspace.test.tsx` (+38) — layout + lifecycle + snap-back regressions.

**Changed** (commit `589cde0`, pushed)
- `packages/web/src/lib/network/pulse/pulse-model.ts` — peak/scene model.
- `packages/web/src/components/graph/control-center/pulse/pulse-glyph.tsx` — circular node rewrite.
- `packages/web/src/components/graph/control-center/pulse/pulse-panel.tsx` — circular tiles + chips + empty states.
- `packages/web/src/components/graph/control-center/pulse/pulse-rail.tsx` — detail drill (§16).
- `packages/web/src/components/intel/gaps-list.tsx` — impact label uppercase alignment (pre-existing drift).
- `packages/web/tests/pulse-model.test.ts` (+7 describes), `tests/pulse-panel.test.tsx` (+5 F-PR16), `tests/use-network-workspace.test.tsx` (+2 nav regressions).

**Added**
- `packages/web/tests/pulse-rail.test.tsx` (5).

## 4. Protected areas confirmation

- Only `packages/web/**` changed across both commits. No backend/contracts/platform/Prisma/workers/SSE files; no new routes or dependencies.
- Pulse geometry and peaks are pure deterministic functions of provider data (no `Math.random`, no fabricated observations): `stableHash` + day clustering only.
- F-PR6 pulse contracts are preserved byte-for-attribute (sample count 96, aria structure, card testids, SELECT≠FOCUS, `pulse-open-in-graph`, `pulse-markers`).
- F-PR9 hypothesis pipeline is untouched (mode-1 surface preserved; its own honest-data rules remain scoped to F-PR9).
- Canonical evidence is never mutated; merge timers are the real 1800/3300 ms and are cancelled by `closeMergePanel`.
- `opencode.json` and unrelated repo docs remain untracked/untouched.

## 5. Honest-data thread

```
snap-back  = pendingParamsRef coalesces same-tick view+focus writes; final URL is the REST-ful default + focus (+ params)
pulse      = peaks are real observation day-clusters (date parsed from observedAt, never invented); untimed → timestampMs:null
empty      = NO DATA only when no entities placed; NO ACTIVITY IN WINDOW only when a bounded window has a real 0
glyph      = labels/magnitudes/angles deterministic from stableHash; reduced-motion static geometry
rail       = detail drill shows the selected field's real peaks; calm field invents nothing
lifecycle  = real timers, real cancel, real Escape; closing publishes the panel close; no fake states
```

## 6. Verification evidence

- `npx tsc --noEmit` (packages/web) — EXIT 0 (both commits).
- `pnpm --filter @indago/web... build` — EXIT 0.
- `npx vitest run` (packages/web) — **92 files / 1011 tests, 1011 passed**.
- Stability: pulse trio (57), nav regressions (2), lifecycle suite — repeated green; pr3/pr4/pr5/pr6 all green after the layout+gaps repairs.