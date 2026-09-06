# PR-9 — Cigarettes After Sex Visual Refinement

**Status:** DELIVERED. The shell is re-lit on **one semantic color layer**: night-black charcoal material, soft monochrome text tiers, warm-white highlight/lowlight, dusty blue for foreign data, and exactly one saturated rose-red reserved for contradiction. The graph canvas, the five-zone control center, and both docks now share a single set of `--color-semantic-*` tokens defined in Tailwind v4 `@theme`; every `data-*` hook, icon, label, and primitives contract from PR-0–8 survives verbatim. New suites: **`pr9-theme-tokens.test.ts` (29 tests)** and **`pr9-theme-render.test.tsx` (14 tests)** — **43 tests, 43 passed**. Regression: pr2–pr8 filtered **338/338**; full web suite **77 files / 851 tests / 851 passed** (the previously parallel-attributed 7 failures are gone — the parallel stream merged and the branch is now fully green); `tsc --noEmit` **EXIT=0**.

---

## A. Scope & Goal

PR-9 is a **presentation-only** re-encoding of the entire investigative shell onto one visual grammar:

- **A single material + semantic palette.** `@theme` tokens replace ad-hoc grade values across the canvas, panels, rail, temporal/intelligence surfaces, and docks. A state's *meaning* is fixed; only its *expression* changes, and only inside the semantic layer.
- **Honest roles.** Selection `#ece4d7`, focus `#f0e9dc`, support `#cfc6b7`, contradiction `#a35053`, unresolved `#948c80`, foreign `#7f92a3`, attention `#c79a8f`, material paper in four dark steps. No two semantic states share a token.
- **One red.** The only saturated rose-red on screen is contradiction. Keyboard focus is now warm-white (rose was a false affordance). Amber is retired from node silhouettes and reserved for grounding markers alone.
- **Typography tiers that clear WCAG AA** (4.5:1) against the near-black background, including the previously sub-threshold faint tier (corrected `#756d62` → `#8d8579`, ≈5.6:1).
- **Reduced motion is honored at every animation sink** on the canvas under `prefers-reduced-motion: reduce`.

## B. Frozen Contract (untouched by this deliverable)

- **Provider/capability/governance seams** (`auth-boundary`, `providers/demo`, `providers/live`, `getDataModeConfig`, capabilities table, `ProviderError` codes): untouched.
- **Semantics** — graph topology, five-zone geometry, D3 physics, selection behavior, context bridge, operational-action *semantics* (PR-4 matrix), temporal/version pipeline (PR-7), relation-authority state machine (PR-8), evidence, support/contradiction meaning, attention meaning (ordinal 0–3, ordinal purity preserved — intensity is expressed via the single pale-blush gradient family, never via numeric badges), deep-dive link behavior: unchanged.
- **Primitives the suites lock**: `data-graph-*` hooks (pr6), exact utility classes (`bg-danger/10`, `bg-accent-rose/10`, `animate-breathe`, `type-section`, `type-caption`, `hover:bg-surface-100`, `p-8`, `h-8`) (pr2/pr3), testids and behavior hooks (pr4/pr7/pr8). All preserved.
- `RelationHypothesis`/`GraphEdge`/`Observation`/`Hypothesis`/`TemporalVersion` contracts in `@indago/contracts`: read as-is.

## C. Files Added

| File | Purpose |
|---|---|
| `packages/web/src/lib/theme/tokens.ts` | **Pure, React-free token contract.** `GRAPH_SEMANTIC_STATES` (name ⇄ meaning ⇄ `data-*` hook), `GRAPH_SEMANTIC_TOKENS`, `PANEL_SEMANTIC_NAMES`, `ALL_SEMANTIC_NAMES`, `semanticCssVar`/`semanticUtility`, `CONTRAST_BACKGROUND_CSS_VAR` (`--color-semantic-background`), `REDUCED_MOTION_MEDIA_QUERY`, `MOTION_TOKENS`, `relativeLuminance`/`contrastRatio` (WCAG 2.x math the tests re-use). |
| `packages/web/tests/pr9-theme-tokens.test.ts` | **29 tests** — §A name/hook universe (unique state names, one role per token, hook linkage to the graph-stroke vocabulary); §B globals.css presence (fs-parsed via `tokenValue`, material + graph tokens, `type-caption`/`type-label`/.status-tag/.cc-panel classes defined, global reduced-motion rule); §C WCAG AA contrast of all text tiers + selection/focus against `background`, luminance ordering of material ramp and text tiers; §D state-role honesty (unresolved is smoky neutral not purple/red, contradiction is the sole saturated red, selection/focus are warm-white and mutually distinct, no role aliasing). |
| `packages/web/tests/pr9-theme-render.test.tsx` | **14 tests** — `WorkspaceBoundary`-style render of the canvas and control-center surfaces (pr6 harness pattern incl. hoisted reduced-motion pref and ResizeObserver/matchMedia stubs): bridge silhouette keeps the honest restrained-rose identity with semantic fill; selection turns nodes warm-white with `data-*` hooks intact; contradicted shells keep the dashed ring (now single semantic red); contradicted edges stroke the contradiction token; reduced motion collapses the foreign-halo pulse class path; §E paper-material contracts for the dossier, authority panel (status tag, semantic focus rings, restraint-until-confirm danger), operational rail, temporal/intelligence bottom band (warm-white active-tab underline), deep-dive continuation links, floating docks + archival status tags, and the legend that now names the semantic encoding (plus source-guard: default/ENTITY silhouettes are semantic silver, never amber). |

## D. Files Changed

- `packages/web/src/app/globals.css` — semantic token layer added inside `@theme` (§A table below), global `*:focus-visible` → `var(--color-semantic-focus)` (old accent-rose keyboard ring removed), `type-caption`/`type-label` utilities **now actually defined** (previously written but never generated), `cc-panel`/`cc-panel-floating` (blur only on floating, 14px)/`cc-panel-header`/`hairline`/`status-tag` shared classes added, `--color-semantic-background` used by the canvas/workspace body background.
- `packages/web/src/components/graph/graph-canvas.tsx` — container `bg-semantic-background`; grid/fog quieted; **foreign-halo, attention gradient, arrow markers** → semantic tokens; edge color branches (`contradiction`/`supported`/`selection`/`foreign*`/`foreground-faint` base, amber reserved for grounding markers); node **fill/stroke** switch to semantic materials (bridge keeps restrained-rose identity; selection = warm-white halo; foreign = blue-silver; default/ENTITY = semantic silver — no amber wash); contradicted dashed ring + contradicted label tint → `var(--color-semantic-contradiction)`; icon/label re-tints; foreign-halo pulse gated `reducedMotion ? "" : "animate-slow-pulse"`. All `data-graph-*` hooks unchanged.
- `packages/web/src/components/graph/control-center/contextual-panel.tsx` — dossier re-frame: `cc-panel`/`cc-panel-header`/hairline `divide-y`/`border-y` rows; `data-context-row-value` kept on every row value.
- `packages/web/src/components/graph/control-center/contextual-panel-footer.tsx` — paper shell + `status-tag`; authority/reject-reverse chrome re-tinted (semantics untouched).
- `packages/web/src/components/graph/control-center/relation-authority-panel.tsx` — status chip → `.status-tag`; per-action tones (accept neutral / reject-reverse contradiction-subtle) with the existing confirm + reason flow intact; `ring-semantic-focus`; stale/error/unsupported notes re-tinted. **No authority semantics changed** (pr8 suites stay green).
- `packages/web/src/components/graph/control-center/deep-dive-bridges.tsx` — continuation-link treatment: border + `semantic-foreign`-hover underline info; real-anchor / greyed-note distinction untouched.
- `packages/web/src/components/graph/control-center/operational-rail.tsx` — paper material, quiet active slot, `ring-semantic-focus`.
- `packages/web/src/components/graph/control-center/temporal-context-panel.tsx` / `investigative-intelligence.tsx` / `intelligence/shared.tsx` — `cc-panel`/`cc-panel-header`, active tab `border-semantic-selection`, `.status-tag` chips. *Additive-only to the shared rail file.*
- `packages/web/src/components/graph/control-center/panel-toggle.tsx` — semantic focus + surface tokens.
- `packages/web/src/components/graph/graph-panel.tsx` — telemetry/zoom chips + **legend re-encoded to the semantic states** (contradiction/selection/attention/foreign/warning/faint swatches); foreign-boundary overlay accents → `semantic-foreign`. *Additive-only.*
- `packages/web/src/components/graph/control-center/context-details-slices.tsx` — evidence/lead/gap rows re-tinted; contradiction/selection/value deltas use semantic tokens.
- `packages/web/src/components/layout/app-nav-dock.tsx` / `workspace-nav-dock.tsx` — `cc-panel-floating` + `.status-tag` chips (brand mark kept; item vocabulary untouched).

## E. Files Removed

None. All old ad-hoc styling was replaced in place; grep-verified the pre-PR-9 `accent-rose` focus rule is gone and no node-silhouette amber stroke remains.

## F. Files Intentionally Untouched (scope discipline)

- Parallel workstreams / parallel-agency surfaces — `src/lib/network/matrix/`, `pulse/`, `flow/`, `representation-switcher.tsx`, `page.tsx`, `capabilities.ts`, `nav.ts`, `timeline-panel.tsx`, `src/lib/network/flow/flow-model.ts`: never opened for PR-9 (known legacy `ring-brand-500` occurrences inside `matrix/`/`flow/`/`pulse/` remain there, out of PR-9 scope).
- Graph engine, physics, five-zone geometry, temporal pipeline, activity feed internals, relation-authority store: untouched (all PR-0–8 suites re-run green).
- Everything outside `packages/web/**`, contracts, platform, intelligence: untouched.

## G. The honest-data thread

- **One role per token** is asserted, not just claimed: `PR-9 §D no graph-state token aliases a panel/text token in the same role`. Selection is a *selection* highlight; focus is the *keyboard* ring — two warm-whites kept distinct. Attention-subtle and selection-subtle are separate tokens so ordinals can never masquerade as state.
- **Contradiction owns the only saturated red.** `#a35053` appears nowhere for decorative emphasis; its subtle partner `#a3505326` is the *surface wash* under reject/reverse and contradicted shells — the meaning (this contradicts/this reverses) is unchanged.
- **Unresolved is genuinely neutral** (`#948c80`: r−g=8, g−b=12 — smoky warm-gray), asserted to be neither "suspicious purple" nor red; **foreign is a cool dusty blue** so cross-case data reads as a *different jurisdiction*, not a warning.
- The **legend now labels the encoding**, not the removed visuals — contradictory, selected, attention, foreign, warning, faint each map to their token, so the interface explains itself; legend items never claim a visual PR-9 deleted.
- Bridge identity stays honest: a bridge node wears its restrained rose in the silhouette, carrying the PR-0/6 `isBridge` semantics forward rather than washing it silver.

## H. Capability & lifecycle honesty

- Presentation never changes capability: the relation-authority flow, temporal filtering, operational command enablement, and deep-dive availability all keep their stated gates and reason strings — only their paint changed.
- Reduced-motion is treated as an *accessibility affordance, not a visual choice*: the entire pale cinematic grammar is motion-light by construction; the only looping decoration (foreign-halo pulse in a cross-case view) collapses at every sink under `prefers-reduced-motion`, and the canvas transition tokens honor it too.

## I. Accessibility

- Text tiers clear **4.5:1** against `--color-semantic-background` (asserted per-tier in `§C`): foreground `#dad3c6`, muted `#a9a195`, faint `#8d8579` (fixed from 3.9:1 sub-threshold), plus selection/focus highlights. Metadata may be quiet — never unreadable.
- Keyboard focus is a **semantic focus token**: unique, 2px, warm-white, declared once globally (`*:focus-visible`) so it survives every surface and panel.
- Reduced motion: canvas animation guards tested in both test files (runtime collapse + source-contract presence), plus the pre-existing global `prefers-reduced-motion` media rule is asserted present.
- States are expressed through **meaning + value text**, never color-only; the monochrome hierarchy guarantees the palette arms even without hue.

## J. Test-context facts locked by the suite

- Token table in effect (globals.css `@theme`): background `#0a0908`, surface `#141210`, surface-elevated `#1b1815`, surface-soft `#211e1a`; foreground `#dad3c6`, foreground-muted `#a9a195`, foreground-faint `#8d8579`; border `#efe9e025`, border-subtle `#efe9e012`; selection `#ece4d7`, selection-subtle `#ece4d720`; focus `#f0e9dc`; supported `#cfc6b7`; contradiction `#a35053`, contradiction-subtle `#a3505326`; unresolved `#948c80`; foreign `#7f92a3`; attention `#c79a8f`, attention-subtle `#c79a8f26`.
- Graph distinctness is asserted numerically: unresolved vs contradiction have clearly divergent hue; selection vs focus differ from every other state; foreground > muted > faint in luminance; material ramp background < surface < elevated < soft.
- `pr9-theme-render` renders the **real** canvas/components (no mock seam) through the demo `WorkspaceBoundary`, with `GN_VICTOR`/`GN_BANK` identified via `data-graph-node-id` — the same fixtures the pr6 suite trusts.

## K. Source guards

- `tokens.ts` is pure (no React/providers/imports from fixtures); the canvas reaches semantic values only through utility classes / `var(--…)` references — no hard-coded hex in components.
- Tests parse `globals.css` and `graph-canvas.tsx` **by fs read** and assert exact class/token strings, so accidental re-painting (amber silhouette, accent-rose focus, sub-threshold faint) is a test failure. Collection-order hazard eliminated — all `tokenValue` calls are lazy inside `it` bodies (the original `const bg = tokenValue(...)` in a `describe` body ran at collection before `beforeAll`, which is what the first red run caught).
- Additive-only files (`graph-panel.tsx`, `operational-rail.tsx`, `temporal-context-panel.tsx`, `investigative-intelligence.tsx`, `graph-control-center.tsx`) gained paint, not seams.

## L. De-scoped (explicitly NOT in this part)

- Badge-grammar normalization and systemic fixes (duplicate badges, semantic-red on attribute text, attribute-color semantics) — layout/grammar work, not the theme layer.
- Dark/light mode variant; iconography redrawing; actual new animations beyond reduced-motion gating; micro-interaction choreography.
- Re-theming the parallel `matrix/`/`pulse/`/`flow/` representations (parallel workstream owns them).
- Historical temporal view vs. relation-authority footer mutual exclusivity (PR-8 residual) — a focused hardening item for a later part, do not reopen PR-8.

## M. Risks & residual

- The PR-8 "historical mode + authority footer" mutual-exclusivity hardening remains **explicitly de-scoped**; this PR-9 pass re-lit both surfaces without merging them. Users are still never mutating through the window for other reasons (footer only exists in current mode) — the follow-up is a deliberate, focused part, not this one.
- Alpha-composite tokens (8-digit hex, e.g. `selection-subtle`) are contrast-asserted by their **base pair**, not the composited-on-surface value; the AA numbers in the suite are the conservative opaque-pair numbers.
- The suite re-reads source/CSS from disk — a proxy for the compiled output; final contrast is governed by the same tokens the compiler consumes, so CI risk is low.
- On this engine the branch is now **fully green** (851/851, `tsc` clean); any future parallel WIP resume should re-attribute, not assume.

## N. Verification

```
packages/web pr9      vitest run pr9-theme-tokens pr9-theme-render → 2 files, 43 tests, 43 passed
Regression            vitest run pr2 pr3 pr4 pr5 pr6 pr7 pr8       → 26 files, 338 tests, 338 passed
full web suite        vitest run                                   → 77 files, 851 tests, 851 passed
typecheck             tsc --noEmit (packages/web)                  → EXIT=0
```

PR-0–8 across the codebase remain green; every frozen contract, `data-*` hook, and primitives class survives untouched. The visual layer now speaks one language — night-black paper, monochrome tiers, warm-white highlights, dusty blue foreign data, and a single restrained rose-red reserved for contradiction — encoded as one shared semantic token set the tests lock in place.

---

PR-10 can now begin.