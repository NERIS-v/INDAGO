# F-PR17 — Analytical Focus-Aura Lifecycle + Temporal Timeline Fit

**Scope:** `packages/web` only · **Series:** graph focus lifecycle (motion-driven analytical overlay) + temporal timeline redesign (fit-first)

**Validation:** 94 test files / 1026 tests passing · `tsc --noEmit` clean · production build EXIT 0
**Commits:** `0118fb4` (focus-aura lifecycle) · `2672623` (timeline fit redesign) — pushed to `origin/main`

---

## §1 Objective

Two independent workstreams on the analyst surface:

1. **Analytical FOCUS AURA** — the thin dashed ring + selection treatment that marks the node under analytical atten­tion must be a *physical contract*: it hides the instant the graph wakes (drag / data reposition / focus-triggered movement), stays hidden for the whole motion, and returns at the node's **current settled position** — never a stale snapshot. Committed **selection** (a node *state*) stays lit throughout; the **focus/hover** aura (an *overlay*) dismisses during movement.
2. **Temporal Timeline** — the timeline must **fit** the fixed-height bottom band (`h-[clamp(14rem,34vh,26rem)]`) with no internal vertical scroll, a compact single-row header, three data bands, a mono time axis, honest data, and reduced-motion-safe playback — without weakening the existing `pr6-timeline-default-scope`, `pr2`, `pr9` or graph physics contracts.

---

## §2 Design constraints honored

- **Settlement is read from real simulation state** — `alpha`, `velocity`, the d3 `tick`/`idle` edges — never a wall-clock timeout. A timeout is used only for the *final visual* commit delay (160 ms fade re-arm).
- No new physics/force redesigns, no drag/D3 re-architecture, no data-model changes, no parallel focus system — the existing focus layer is *modified*.
- Timeline data seams (fetch, live listener, domain padding, restore seeding, debounce gating, `applyRange`) are **byte-identical** — only the render surface was re-skin­ned.
- Tests keep passing: `graph-physics` (`isActive`/`settled`), `pr6-living-graph` (node states, `animate` = 0 under reduce), `pr9-theme-render` (reduced-motion guards), `pr6-timeline-default-scope` (play frames anchored at padded domain start, monotonic ends, no fresh-mount auto-publish, restore round-trip).

---

## §3 Workstream A — motion state seam (`use-graph-layout.ts`)

### 3.1 `GraphMotionState`
- `"moving" | "settled"`, exposed on `LayoutResult` as `motionState`.
- Set via guarded `syncMotion()` in exactly two places:
  - **tick handler** → `moving` (the live sim is moving every per-frame tick),
  - **`markIdle`** → `settled` (the existing genuine-rest latch: `alpha < 0.001 && maxVelocity < 0.15`).
- `isActive()`/`settled`/`apiRef` semantics untouched, so `graph-physics` needs no edits.

### 3.2 The `setFocus` correction (design flaw found by the new tests)
The previous implementation kept `alphaTarget(HOVER_ALPHA)` while focused — hover-style **breathing**:
- alpha converges to 0.07 and **never drops below 0.001** while the node stays focused,
- `markIdle` therefore can never fire → `motionState` sticks on `"moving"` → the aura could never commit.

**Fix:** focus is a **one-shot analytical wake** —
`alpha(HOVER_ALPHA)` (only if below), `alphaTarget(0)`, `restart()`.
The graph flexes toward the target through the existing `focusBias` force, then **decays to genuine rest**, the settled edge fires, and the aura commits at the node's current position. Hover keeps its breathing path (`setHover`) unchanged; drag semantics unchanged.

---

## §4 Workstream A — aura machine (`graph-canvas.tsx`)

### 4.1 Constants & state
`AURA_FADE_OUT_MS = 150`, `AURA_FADE_IN_MS = 250`, `AURA_SETTLE_DELAY_MS = 160`, `focusAuraOn` + machine effect keyed on `motionState` edges with full unmount cleanup.

```
 moving ─▶ setFocusAuraOn(false)          # dismiss now (fade 150ms)
 settled ─▶ arm 160ms timer ─▶ setFocusAuraOn(true)   # commit (fade 250ms)
 reduced-motion: transition:none — no fade, no <animate>, no hidden phase
```

### 4.2 Aura ring
Thin **dashed** ring (`strokeDasharray="1.5 4"`) — deliberately restrained: no pulsing, no glow explosion. Rendered at `cx={nx} cy={ny} r={radius + 8}` with **live per-tick `nx`/`ny`** — the ring trails the node, never a snapshot. Exposes `data-graph-aura="selection" | "focus" | "hidden"` and `data-graph-aura-x/y`.

`auraLit = isSelectedNode || (focusAuraOn && (isFocusTarget || isHovered))`
- **selection** (committed node state): lit immediately, stays lit through motion;
- **focus / hover** (overlays): lit only while `focusAuraOn` (i.e. graph genuinely settled);
- ring fade transition is **direction-dependent** (`focusAuraOn ? 250ms : 150ms`), `reducedMotion ? "none"`.

### 4.3 Focus wiring (`applyFocus`)
- `focusNode` (rail/drawer Focus action — camera dive) **and** interaction-circle `onFocus`/`onBlur` → `applyFocus(id)` → `setFocusedNode(id)` + `apiRef.setFocus(id)` (wakes the one-shot flex).
- `focusPair` and hover **deliberately unchanged** — hover stays presentation-only (never wakes), preserving existing behavior and the `pr6` contracts.

### 4.4 Root diagnostics
`data-graph-motion="moving|settled"` and `data-focus-aura="visible|hidden"` for deterministic test/DOM assertions.

---

## §5 Workstream A — tests (`tests/pr17-graph-focus-lifecycle.test.tsx`, 8 passing)

1. **Hook motion state** — `renderHook(useGraphLayout)`: starts `"moving"`, settles to genuine rest; a `beginDrag`/`moveNode`/`endDrag` cycle wakes → `moving` → re-settles. Asserts real drag-triggered motion, not a simulation.
2. **Reduced-motion static rest** — no wake, reports `"settled"`.
3. **Keyboard focus commit at current position** — focus → wake → `moving`/hidden → re-settle → aura `focus` at the canvas live coords, ring `data-graph-aura-x/y` **equal** to the body circle `cx/cy`.
4. **Selection stays lit while focused aura hides** — a clicked (committed) selection's ring remains `selection` while a *focused* neighbor's ring goes `hidden` during motion.
5. **Rail Focus action (camera dive)** — commits selection state, stays `selection` through the resulting motion.
6. **Reduced-motion instant commit** — transition is `none`, ring is `focus` immediately, and it never dips into a `hidden` phase.
7–8. **Determinism + reduced-motion guard** — source contract: ring reads live `nx/ny`; `transition: reducedMotion ? "none"`.

---

## §6 Workstream B — timeline fit design (`timeline-panel.tsx`)

### 6.1 Fit architecture
- Wrapper: `flex w-full min-h-0 flex-1 flex-col` + `overflow-hidden` — fills the tab body inside the fixed-height band, **no internal scroll** (`overflow-y-auto`/`overflow-scroll` absent from the fit path).
- Track+axis block: `relative flex min-h-0 flex-1 flex-col`; lanes are `flex-1` (with `min-h-[9px]`) so bounded hosts compress and standalone renders don't collapse.
- Compact header: fixed `h-[46px]`, single row — play button (path `M8 5v14l11-7z` retained), `INVESTIGATION WINDOW` + date range, inline M/E/O legend (keeps `MILESTONES`/`EVIDENCE`/`OBSERVATIONS` for `pr2`/`pr6`).

### 6.2 Three honest bands
- `DISPLAY_KINDS` derived **from** `BAND_KIND_ORDER` (filter `relationship`), so the data seam (`BAND_KIND_ORDER`/`BAND_LABELS`/`BAND_COLORS`) stays canonical.
- Every fixture item (9) renders once on its lane (diamonds keep `role="button"` + `aria-label="Activate …"`); relationship bands are supported but **off-surface by design** — never a hidden/empty render.

### 6.3 Mono time axis + now
- Axis row `h-[34px]`: `<3px>` activity density strip (bin heights proportional via `maxDensity`), 17 minor ticks, 5 major ticks with mono date labels derived live from `domain`.
- `NOW` marker at `nowPct` (latest item time), mono label.

### 6.4 Analytical window overlay
- Plain `left: ${rangePct[0]}% / right: ${100-rangePct[1]}%` over the **whole** track block — the legacy 140px sidebar offset is gone from the geometry.
- Tinted range + thin rose boundaries + compact `FOCUS: <date> — <date>` chip (`data-timeline-window`, `data-timeline-focus-label`).

### 6.5 Keyboard-accessible drag handles
- Two buttons spanning the track height, `aria-label` start/end handles, arrow-key nudge (1%/step) + pointer drag via the unchanged `handleDrag`, published through the existing 50ms debounce. No `pointer`-only interaction — fully keyboard reachable.

### 6.6 Reduced-motion playback
- `matchMedia` read once at mount, guarded by `typeof window.matchMedia === "function"` (unstubbed jsdom keeps **stepped** playback → `pr6` frame assertions intact).
- Under `prefers-reduced-motion: reduce`, play **publishes the full analytical frame immediately** (start = padded domain start, end = latest item) — no rAF stepping, no sweeping intermediate frames.

---

## §7 Workstream B — tests (`tests/pr17-timeline-fit.test.tsx`, 7 passing)

1. **Three lanes, honest data** — exactly 3 `[data-timeline-lane]` (milestone/evidence/observation), zero `relationship` lane, diamond count === fixture item count (9).
2. **Fit contract (source)** — `min-h-0 flex-1`, `w-full min-h-0 flex-1 flex-col`, block `relative flex min-h-0 flex-1 flex-col`, header `h-[46px]`, and **no** `overflow-y-auto`/`overflow-scroll`.
3. **Compact header** — play path, INVESTIGATION WINDOW, M/E/O legend all present.
4. **Overlay + axis honesty** — overlay framed at plain `%` (0%/0% at rest), FOCUS chip, mono axis source (`text-[7px] font-mono`, live `formatDate(domain.start + span * (f / 100))` major ticks), NOW marker.
5. **Keyboard handles** — 2 `role=button` handles; Arrow-Right on the start handle advances and **publishes** the window via debounce; overlay follows.
6. **Reduced-motion full frame** — single full-width frame — start ≈ domain.start, end ≈ latest item — no intermediate frames.

---

## §8 Regression + full-suite status

| Check | Result |
|---|---|
| Full suite `npx vitest run` | **1026/1026 passing (94 files)** (+15 net tests over pre-F-PR16 1011) |
| `npx tsc --noEmit` | Clean |
| Production build | EXIT 0 |
| `pr6-timeline-default-scope` / `pr2` / `pr9` | Passing (no edits to hosts/theme) |
| `graph-physics` / `pr6-living-graph` | Passing (drag + node-state + reduced-motion contracts) |

---

## §9 Manual visual validation

Recommended pass at 1440×900, 1600×900, 1920×1080 (graph route):
- Focus a node (keyboard + rail Focus): ring hides during the flex, returns **exactly on the node** post-settle.
- Click-select a node, then focus a neighbor: the selection ring never dims while the focused aura hides.
- Toggle reduced motion (OS): focus commits instantly, timeline play publishes the full window in one frame.
- Timeline: header stays one row, three lanes + axis visible, no scrollbar, handles reachable with Tab/arrows, FOCUS chip tracks the window.

## §10 Deliverables

**Commits (pushed to `origin/main`):**
- `0118fb4` `feat(web): F-PR17 analytical focus-aura lifecycle — motion-driven graph commit ring`
- `2672623` `feat(web): F-PR17 temporal timeline fit redesign — fills the band, three honest lanes`

**Files:**
- `packages/web/src/components/graph/use-graph-layout.ts` — `GraphMotionState`, one-shot `setFocus`
- `packages/web/src/components/graph/graph-canvas.tsx` — aura machine + ring + `applyFocus`
- `packages/web/src/components/timeline/timeline-panel.tsx` — fit-first redesign
- `packages/web/tests/pr17-graph-focus-lifecycle.test.tsx` (8 tests)
- `packages/web/tests/pr17-timeline-fit.test.tsx` (7 tests)