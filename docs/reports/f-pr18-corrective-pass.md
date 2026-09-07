# F-PR18 — Corrective Pass: Focus-Ring Motion Contract, Timeline Workspace Height, Entity Pulse Redesign

**Scope:** `packages/web` only · **Series:** corrective pass after F-PR17 across three workstreams

**Validation:** 97 test files / 1067 tests passing · `tsc --noEmit` clean · production build EXIT 0
**Commits:** `706b218` · `1f796b6` · `16d2798` (+ F-PR19 section §8) — pushed to `origin/main` from `packages/web`

---

## §1 Objective

A single corrective release on the analyst surface, fixing an F-PR17 runtime defect and two remaining fit/visual gaps:

1. **Graph focus-ring motion contract** — the **dotted circle** (analytical focus ring) must hide the instant the graph moves and return at the node's live settled coordinates, for *every* interaction path — including committed selection. Selection identity is communicated through the node **body**, never the transient ring.
2. **Timeline parent workspace height** — the fixed parent band no longer leaves unused vertical dead space below the fit-redesigned timeline.
3. **Entity Pulse redesign** — replace the radial bars/glyph with a large entity node + continuous organic aura + per-category perimeter indicators. No dates anywhere.

---

## §2 Workstream A — focus ring is focus-only; selection is body-persistent

### 2.1 Root cause (found in F-PR17)
The F-PR17 ring gate was:
```
auraLit = isSelectedNode || (focusAuraOn && (isFocusTarget || isHovered))
```
The `isSelectedNode` branch **bypassed** `focusAuraOn`, so a selected node's ring stayed visible during motion. Worse, *every* major focus affordance (click, keyboard, rail Focus) writes `internalSelectedNode`, so the dotted circle never hid — exactly the §0A complaint.

### 2.2 Fix (`graph-canvas.tsx`)
Split the single lit gate into two independent contracts:
- `bodyEmphasis = isSelectedNode || (focusAuraOn && (isFocusTarget || isHovered))` — drives **node body** styling (fill, stroke, glow, label color/weight, `data-graph-selected`). Persists through motion for committed selections.
- `ringVisible = motionState === "settled" && bodyEmphasis && inTimeRange` — drives the **dotted circle** only. It is `false` the entire time the simulation is awake, for every case.

The ring renders only when `isFocusTarget || isHovered` (never for a bare selection), and its transition is `opacity 0ms` while `motionState === "moving"` so it snaps off instantly — no trailing fade behind a gliding node. On genuine settle it re-arms through the existing 160 ms delay + 250 ms fade. Reduced-motion path unchanged (instant commit, no hidden phase).

**Contract resolved (spec §0A / §6 / §12·9):**
- *"Only the analytical focus ring disappears"* = the **dotted circle** disappears during motion.
- *"Selection remains visible"* = the node **body** emphasis + `data-graph-selected` persists.
- Ring = focus-only overlay; selection = body-only state.

### 2.3 Tests
- `tests/pr18-graph-focus-lifecycle.test.tsx` — **17 tests** (10 §12 cases + source-contract checks): ring visible at settle; wake hides it; drag begin/continue/end keep it hidden; genuine settle returns it; returned ring sits at the **new** `data-graph-aura-x/y` matching the body circle after the node moved; exactly one ring per node after re-settle (no stale); selection persists via body styling with no ring; reduced-motion instant commit.
- `tests/pr17-graph-focus-lifecycle.test.tsx` — tests 4–5 updated to the corrected contract (selection persists via body, not ring).

---

## §3 Workstream B — timeline parent workspace height

### 3.1 Root cause
`bottomBandHeightClass()` returned `h-[clamp(14rem,34vh,26rem)]` — oversized relative to the compact three-lane timeline. Separately, the temporal-panel `tabpanel` lacked a vertical flex chain, so the timeline's `flex-1` never engaged → unused dead space below the timeline inside a band that was itself too tall.

### 3.2 Fix
- `packages/web/src/lib/layout/control-center.ts` — `bottomBandHeightClass()` retuned to `h-[clamp(12rem,26vh,16rem)]`.
- `packages/web/src/components/graph/control-center/temporal-context-panel.tsx` — tabpanel is now `flex min-h-0 flex-1 flex-col` and the time-tab child is wrapped in an inner `<div className="flex min-h-0 flex-1 flex-col">`, so the timeline fill-contract consumes every spare pixel with no idle gap.
- `tests/pr2-graph-control-center.test.tsx` — pinned string updated to the new band class.

### 3.3 Tests
- `tests/pr18-timeline-workspace-height.test.tsx` — 5 tests: compact band class; tabpanel flex chain source contract; inner time-tab wrapper; timeline fill subtree with no oversized absolute height; retuned height strictly less than the removed 14rem allocation.

---

## §4 Workstream C — Entity Pulse redesign

### 4.1 Data model (`pulse-model.ts`)
- Added `EntityPulseIndicator` — `{ category, label, count, strength (0..1, normalized to the entity's strongest category), angle }` — plus `buildEntityIndicators(nodeId, entityId, inWindowObservations)`. Angle is deterministic from the strongest observation's `PULSE_PHASE + stableHash(nodeId|obs.id)`.
- Added `indicators` to `EntityPulseField` and populated it in `buildEntityPulseOverview`.
- **Dates removed** — peak `label` is now the category code only (`FIN` instead of `FIN · 05-JAN`); `detail` drops the date too. No dates render anywhere on the pulse surface.

### 4.2 Glyph (`pulse-glyph.tsx` — full rewrite)
- viewBox **200×200**, center entity **node r=34** (surface-0 fill, category stroke), short entity label centered.
- **Continuous organic aura** — `outerSamples` remapped to `auraRadius = 64 + ((sample − 0.22)/0.78)·16` (baseline 64 up to 80, ~1.9–2.4× node), drawn as a closed spline contour (category fill at low opacity, stroke). No rigid circle, no radial bars.
- **Category perimeter indicators** — per indicator: a colored dot at the aura boundary, a thin leader line, and a **code-only label** (`FIN`/`COM`/`LOC`/`IDN`/`XCS`/`OTH`). Each `<g>` carries `data-pulse-peak`, `data-pulse-peak-label`, `data-pulse-peak-angle`, `data-pulse-peak-magnitude`, `data-pulse-indicator-category`, `data-pulse-indicator-count`, and a `<title>` accessible description.
- Selected ring: dashed `accent-rose` at r=95. All legacy data attributes (`data-pulse-entity`, `data-pulse-sample-count`, `data-pulse-entity-*`, `data-pulse-peaks-count`) preserved; `data-pulse-peaks-count` now reflects indicator count.

### 4.3 Panel (`pulse-panel.tsx`)
- Cards are now **vertical analytical fields** (glyph on top, information below), much larger: prominent glyph `h-48 w-48`, standard `h-36 w-36`.
- Grid: `grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3` (more responsive than the previous fixed 3-col).
- All testids/aria/button semantics preserved (`pulse-entity-card`, `pulse-peak-chips`, `pulse-peak-chip`, `pulse-peak-label`, `pulse-peak-more`, `pulse-card-prominent`, `pulse-card-selected`, empty/loading states, legend, markers).

### 4.4 Tests
- `tests/pr18-pulse-design.test.tsx` — 8 tests: single large center node (r=34) with no radial bars; continuous organic aura path; per-category indicators with counts + leader lines + code-only labels; the four documented peak data attributes; no dates/bars anywhere; vertical field layout; accessible `<title>`; prominent large field.
- `tests/pulse-model.test.ts` — 2 obsolete dated-label cases updated to code-only.
- Locked `tests/pulse-panel.test.tsx` (13) + `tests/pulse-rail.test.tsx` (5) pass unchanged — all testids/attrs/regex contracts preserved.

---

## §5 Regression + full-suite status

| Check | Result |
|---|---|
| Full suite `npx vitest run` | **1056/1056 passing (97 files)** (+30 net over pre-F-PR18 1026) |
| `npx tsc --noEmit` | Clean |
| Production build | EXIT 0 |
| `pr17-graph-focus-lifecycle` / `pr17-timeline-fit` | Passing (corrected contract) |
| `pulse-panel` / `pulse-rail` / `pulse-model` | Passing (locked contracts preserved) |
| `pr2-graph-control-center` / `pr9` / `pr10` | Passing (band class + tabpanel a11y intact) |

---

## §6 Manual visual validation

Recommended pass at 1440×900, 1600×900, 1920×1080 (graph route):
- **Ring motion**: focus a node (keyboard, click, rail Focus) — the dotted circle vanishes instantly on any movement and returns exactly on the node once still. Selection emphasis stays on the node body throughout.
- **Timeline fit**: the parent band is visibly shorter and the timeline fills it edge-to-edge — no dead gap below, no scrollbar.
- **Pulse redesigned**: large entity node with an organic aura and labelled category indicators around the perimeter; no radial bars, no dates; chips show code-only labels.

## §7 Deliverables

**Commits (pushed to `origin/main` from `packages/web`):**
- `706b218` `fix(web): F-PR18 graph focus ring is focus-only; selection is body-persistent`
- `1f796b6` `feat(web): F-PR18 Entity Pulse redesign — large node, organic aura, category indicators`
- `16d2798` `fix(web): F-PR18 timeline parent workspace height — no unused vertical gap`

---

## §8 F-PR19 — equal semantic sectors + sector-driven wave

A follow-up corrective pass on the Pulse glyph (contained to `pulse-glyph.tsx` + tests):

### 8.1 Equal sectors
The field's perimeter is now divided into **equal angular sectors** — one per active activity indicator — `span = 2π / sectorCount`, laid out in stable indicator order. Labels sit at each sector's **arc centre**, so they are **equally spaced** around the field regardless of how clustered the raw observation angles are (Voronoi-by-angle was replaced).

### 8.2 Sector-driven wave
`buildSectorRadii(sectors)` derives the 96 field radii directly from the sectors: every sample belongs to exactly one equal sector, and its radius grows from the calm baseline by `sector.strength × raised-cosine wave` (0 at the sector edges, peak at its centre). Stronger activity ⇒ a larger local expansion; weaker activity stays near baseline; adjacent sectors meet at the baseline so the whole contour remains **one smooth, closed, organic curve** (Catmull-Rom, no `A` arcs / no circle / no radial bars / no regular ring). Sector hues blend via the same raised-cosine intensity ramp, and each sector's colour+deformation colocate with its own label.

### 8.3 Determinism
Sector geometry is `useMemo`-keyed on the indicators list, so the morph target stays stable between recomputes: **same data + same timeRange ⇒ identical geometry**. No random breathing, no per-frame noise. Labels are code-only (`FIN`/`COM`/`LOC`/`IDN`/`XCS`/`OTH`) — no dates/calendar positions (the Timeline remains the only temporal display). The Timeline is unchanged.

### 8.4 Validation
- Full suite: **1067/1067 passing (97 files)** (+11 over F-PR18's 1056).
- `tsc --noEmit` clean · production build EXIT 0.
- Locked `pulse-panel`/`pulse-rail`/`pulse-model` contracts preserved; all data attributes untouched.
- New tests: `pr18-pulse-design.test.tsx` equal-spacing test + `pulse-model.test.ts` F-PR19 determinism block.

### 8.5 Deliverables (this follow-up)
- `packages/web/src/components/graph/control-center/pulse/pulse-glyph.tsx` — equal sectors, sector-driven radii, arc-centre labels
- `packages/web/tests/pr18-pulse-design.test.tsx` — equal-spacing / organic-contour / hue-blend tests
- `packages/web/tests/pulse-model.test.ts` — F-PR19 determinism block

**Report:** `f-pr18-corrective-pass.md` (this file)

**Files (this release):**
- `packages/web/src/components/graph/graph-canvas.tsx` — `bodyEmphasis`/`ringVisible` split (focus-only ring)
- `packages/web/src/lib/layout/control-center.ts` — retuned `bottomBandHeightClass()`
- `packages/web/src/components/graph/control-center/temporal-context-panel.tsx` — vertical flex chain for the Time tab
- `packages/web/src/lib/network/pulse/pulse-model.ts` — `EntityPulseIndicator` + `buildEntityIndicators`, code-only peak labels
- `packages/web/src/components/graph/control-center/pulse/pulse-glyph.tsx` — full redesign (node + aura + category indicators)
- `packages/web/src/components/graph/control-center/pulse/pulse-panel.tsx` — analytical-field vertical layout
- `packages/web/tests/pr18-graph-focus-lifecycle.test.tsx` (17) · `pr18-pulse-design.test.tsx` (8) · `pr18-timeline-workspace-height.test.tsx` (5)
- `packages/web/tests/pr17-graph-focus-lifecycle.test.tsx` · `pulse-model.test.ts` · `pr2-graph-control-center.test.tsx` — updated to the corrected contracts
