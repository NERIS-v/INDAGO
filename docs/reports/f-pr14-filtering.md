# F-PR14 — Deterministic Filtering Contract

## 1. Invariant

> **NOT DISPLAYED ≠ DOES NOT EXIST.**

Filtering in the graph workspace is a *projection* over the canonical dataset —
it never mutates the dataset, never silences contradicting evidence, and never
hides the fact that a selection has hidden relations.

Pipeline: **FILTER CONTROL → STATE → DERIVED DATASET → VISUALIZATION →
SELECTION/FOCUS → CONTEXT → URL**.

## 2. URL serialization

- Query params: `?support=` (min support, inverted: high = stricter) and
  `?hidec=` (hide contradicted cells), defined in
  `packages/web/src/lib/workspace/url.ts`.
- `readNetworkFilter(searchParams)`:
  - absent or malformed/corrupt params → `DEFAULT_GRAPH_FILTER` (unfiltered
    baseline). Never throws; never a partial/half-applied filter.
  - `minSupport` values are **clamped to a max of `0.6`** and coerced to the
    valid range — a nonsense URL cannot over-prune the network.
- `networkFilterToParams(filter)`:
  - **default values are dropped on write.** The URL only carries deviations
    from the default, so it round-trips canonically and stays shareable
    deterministic.
- Matrix `minSupport` semantics: cells expose **no per-cell support signal**, so
  `minSupport` is honestly scoped to the **edge lens** (labelled as such in the
  control panel). Matrix cells are governed by `hideContradicted` instead.

## 3. Hidden-selection rule (locked decision)

- An explicitly hidden **selection is NEVER auto-cleared**.
- The selected node remains highlighted on canvas.
- The panel shows a deterministic counter — **"N of M relations hidden by
  filter"** — plus a **Reveal all** affordance and the `RENDERED` telemetry stat.
- This keeps the operator informed that the visible graph is a projection and
  that their focus node has context not currently displayed.

## 4. Coherence between representations

- `graph-control-center.tsx` receives explicit seam props
  (`graphFilter`/`setGraphFilter`/`filterOpen`/`setFilterOpen`) and defaults to a
  local fallback so it never renders from a stale global.
- Rail, panel and matrix consume the **same `effectiveFilter`** — one source of
  truth; the action layer no longer holds its own `filter` payload
  (`control-center.ts`).
- Matrix contradict suppression is **ghosted** (`data-matrix-state="suppressed"`)
  rather than removed, and the rail shows an explicit
  **"Conflict cells hidden by filter"** tally so the operator knows why a cell
  is absent — the same honesty rule as the hidden-selection annotation.

## 5. Provenance & test evidence

- Behavior tests: `tests/f-pr14-filter-url.test.ts` (9 — read, clamp, write-drop,
  corrupt input), provider `graphFilter` cases in PR-4/workspace tests (7),
  matrix suppression (3). Matrix shell (PR-7) 34, provider boundary (PR-1) and
  dock tests stay green.
- Final full-suite state: **980/980 passing**; `npx tsc --noEmit` clean.