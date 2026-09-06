# F-PR14 — Deterministic Readability & Investigation-Intelligence Workstation

**Scope:** `packages/web/**` only. No backend/provider/contract changes.
**Boundary rule upheld:** this pass never fabricated backend capability — every
surface either consumes the provider seam, renders a typed `UNSUPPORTED` state,
or is explicitly demo-authored material.

---

## 1. Summative evidence

- **Full suite green at close:** `91 test files, 980 tests passed` (`npx vitest run`).
- `npx tsc --noEmit` clean on every commit.
- Commits (all pushed to `origin/main`):

  | Phase   | Subject                                                   | Commit  |
  | ------- | --------------------------------------------------------- | ------- |
  | Phase 2 | Timeline workspace removal + dock hierarchy               | `fed1fd4` |
  | Phase 3 | Deterministic filtering pipeline (`?support=` / `?hidec=`) | `0a45ebb` |
  | Phase 4 | Graph node compositing/z-order fix                        | `11d42c3` |
  | Phase 5 | Provider-backed graph editing UX (upload choreography)    | `b4d9f99` |
  | Phase 6 | Shared design-system primitives (`StatChip`, `SectionHeading`) | `25e9dda` |
  | Phase 7 | Dashboard chrome redesign                                  | `67c1d3a` |
  | Phase 8 | Investigation Overview redesign                            | `94bfba8` |
  | Phase 9 | Observations + Contradiction surfaces redesign            | `859ce79` |

## 2. What shipped, per phase

### Phase 3 — deterministic filtering
- `lib/workspace/url.ts`:
  - `NETWORK_SUPPORT_PARAM = "support"`, `NETWORK_HIDEC_PARAM = "hidec"`.
  - `readNetworkFilter` — absent/malformed URL params parse to
    `DEFAULT_GRAPH_FILTER`; `minSupport` is clamped to a ceiling of `0.6`
    (inverse-support; higher = more aggressive pruning).
  - `networkFilterToParams` — default values are **dropped on write**, so the
    URL stays canonical and predictable. No `0`-padding / fabricated params.
- `lib/network/use-network-workspace.tsx`:
  - Workspace-scoped `graphFilter` / `setGraphFilter`; URL↔state sync is ping-pong
    safe; `clearAnalyticalState()` (context reset) also resets the filter.
  - The pipeline is strictly **FILTER CONTROL → STATE → DERIVED DATASET →
    VISUALIZATION → SELECTION/FOCUS → CONTEXT → URL**. Nothing mutates the
    physics edge list: `use-graph-layout.ts` is untouched.
- `lib/layout/control-center.ts` — `filter` removed from `GraphControlCenterActions`
  (kept `filterOpen`). `graph-control-center.tsx` receives seam props
  (`graphFilter`, `setGraphFilter`, `filterOpen`, `setFilterOpen`) with a local
  fallback; rail, panel and matrix all read the same `effectiveFilter` — one
  source of truth.
- **Hidden-selection rule (locked decision):** an explicitly hidden selection is
  *never auto-cleared*. The selected node stays highlighted; the panel shows an
  honest **"N of M relations hidden by filter"** annotation with a
  **Reveal all** affordance and an authoritative `RENDERED` telemetry stat
  (distinct from total NODES/EDGES).
- **Matrix coherence:** `hideContradicted` ghosts the conflict cell via
  `data-matrix-state="suppressed"`, and `matrix-rail.tsx` renders an honest
  **"Conflict cells hidden by filter"** tally row instead of a misleading empty
  gap.

### Phase 4 — node compositing (corrective)
- `graph-canvas.tsx:748` multiplicative opacity chain dropped node bodies to
  `0.1 × 0.5 = 0.05` so edges rendered *through* opaque nodes. Now floor-clamped:
  - hover+focus `stateDim = 0.35`
  - hover-only `0.4`
  - focus-recede-only `0.65`
  - label recede floor raised `0.05 → 0.3`
- Paint order, bloom/entrance semantics, interaction layer and `data-graph-*`
  attributes unchanged. PR-10 simulation/visual + PR-2 remain green (33/33 at time of commit).

### Phase 5 — provider-backed graph editing UX
- Audit confirmed the authority model is already enforced end-to-end:
  `live/unsupported.ts` typed `UNSUPPORTED` seams, capability registry
  (`capabilities.ts`) exposing **only evidence submit as live-capable**, honest
  demo-vs-live gates, verified by PR-8/PR-10/mock-leakage tests.
- **Honesty fix** in `graph-panel.tsx` upload modal: previously
  `triggerOrQueueUploadSequence(workspace.realtime)` fired **fire-and-forget
  BEFORE** `await workspace.evidence.submit()`, and failures were swallowed by
  `.catch(console.error)` — so demo ingestion events kept playing (fabricated
  success) after a rejected submit. Now the submit is awaited first, rejections
  surface verbatim through the intake retry path, and the choreography only
  starts on success — matching `evidence/page.tsx:52-56` and the intake contract.

### Phases 6–9 — shared design system + screen adoptions
- New primitives:
  - `components/ui/stat-chip.tsx` — label/value `StatChip` (mono, uppercase
    tracking label, optional caption) — the canonical telemetry stat.
  - `components/ui/section-heading.tsx` — overline + title + optional action
    slot `SectionHeading` — the canonical editorial section header.
- Adoptions:
  - GraphPanel telemetry strip (NODES/EDGES/RENDERED) → `StatChip`.
  - Matrix rail "Matrix overview" → `SectionHeading`.
  - Dashboard hero (`src/app/page.tsx`) → workstation kicker overline + honest
    data-mode chip.
  - Investigation Overview → kicker header, in-flow `RecoveryRing`,
    `StatChip` gate counts (Unavailable vs empty still distinct),
    `SectionHeading` feed header.
  - Observations page → kicker header; contradiction / observations /
    resolution-queue cards → `SectionHeading`. **All canonical-feed behavior
    preserved verbatim.**

## 3. Known deviation / risk

- `pr10-realtime-lifecycle.test.ts` ("catch-up delivers every missed event") was
  observed flaking **only** under full-suite parallel load (once, at Phase 3);
  it passed 15/15 in isolation and passed in the final full-suite run. No code
  change was made; it is a timing sensitivity, unrelated to F-PR14 changes.