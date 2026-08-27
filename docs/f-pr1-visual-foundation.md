# F-PR1: Visual Foundation + Design System

## Overview

F-PR1 establishes the **visual foundation of the INDAGO frontend**: a warm-dark, restrained, cinematic design language. It turns the existing Tailwind v4 CSS-first theme into a coherent, token-driven system without introducing any runtime provider/state/graph architecture.

This phase answers: **"WHAT SHOULD INDAGO LOOK AND FEEL LIKE?"**

- Visual direction: hazy, warm-dark, intimate, unhurried, restrained (Cigarettes After Sex mood — reference only, no assets copied).
- The judge should feel: **"this is a serious investigation tool."**
- Frontend only. `packages/platform`, `packages/contracts`, `packages/intelligence` are **untouched** (verified via `git status`).

## Scope

In scope:
- Token layer (warmed surfaces, restrained accents, semantic aliases, motion vocabulary)
- Typography scale utilities
- Motion + film grain + reduced-motion handling
- UI primitive polish (Button, Card, Badge, Input/Textarea/Select, EmptyState, ErrorDisplay, LoadingSpinner)
- New semantic presentation primitives (StatusIndicator, ConfidenceIndicator, ProvenanceChip)
- StateBadge refactor to reuse Badge; light page polish
- Dev-only Design Lab at `/design`
- Behavior-focused tests

Explicitly out of scope (not shipped): GSAP, Framer Motion, radix/shadcn, MUI, Chakra, state libraries, graph libraries, DemoProvider/LiveProvider, DataMode, SSE experiments, KPP.

## Design decisions

- **One design system.** Everything extends the existing Tailwind v4 `@theme`; no second design system was introduced.
- **Fonts**: Inter + JetBrains Mono wired via `next/font/google` as `--font-inter` / `--font-jbmono`, mapped through `@theme inline`. Serif display font not introduced (deferred).
- **Primary button** is solid dusty rose with dark text — a rare, strong accent moment. Hover is a subtle tonal shift only (no scale/bounce/glow), `duration-fast` + `ease-restrained`.
- **Loading** is replaced with three gently-breathing dots (`animate-breathe`). `LoadingSpinner` keeps its `size/label/className` API.
- **Badge** gained an `accent` variant, a leading `dot` (shape+text+color), `dotPulse`, and full HTML prop spreading. `StateBadge` now renders through `Badge`.
- **Select** uses a custom `.select-chevron` helper instead of the native arrow.
- **Grain** reuses the existing SVG `feTurbulence`; z-index lowered 9999 → 40 (below future modal chrome); opacity wrapper 0.4.
- **Reduced motion**: global `prefers-reduced-motion` zeroes animation/transition durations, stills grain, and collapses `slow-pulse`/`breathe` to static opacity 1.
- **Accent restraint**: accent only on important actions/emphasis, not every card/border/icon.
- **Confidence** is never labeled "probability", is never animated, and is rendered from a 0–1 value. Its accessible label reads `Confidence: 0.82, on a scale from zero to one; analytical confidence, not a probability` — never "percent".
- **StateBadge processing semantics**: only genuinely active pipeline stages breathe (`INGESTING`, `NORMALIZING`, `ANALYZING`, `DISCOVERING`, `REASSESSING`). `WAITING_FOR_EVIDENCE` and `CREATED` are shown as static (dotted, not pulsing); terminal/held states (`COMPLETED`, `FAILED`, `PAUSED`, `REVIEW_REQUIRED`) are static.
- **Motion token namespace**: Tailwind v4 only generates `duration-*` utilities from the `--transition-duration-*` namespace, so the motion durations are defined as `--transition-duration-fast/normal/slow` (a bare `--duration-*` is silently ignored by the compiler).

## Files

### Source — token layer

| File | Purpose |
|------|---------|
| `src/app/globals.css` | `@theme` extension: warmed `surface` ramp, `accent-rose`/`accent-amber` (+ `-subtle`), semantic `background-*`/`text-*`/`border-*` aliases, `--transition-duration-*` (fast/normal/slow) + `--ease-restrained`; `@theme inline` font mapping; type-scale `@utility` classes; `breathe` keyframe; refined `.grain`; `.select-chevron`; `prefers-reduced-motion` block; rose focus/selection |
| `src/app/layout.tsx` | Wire Inter + JetBrains Mono via `next/font/google`, expose `--font-inter` / `--font-jbmono` on `<html>` |

### Source — primitives

| File | Purpose |
|------|---------|
| `src/components/ui/button.tsx` | Hierarchy `primary/secondary/ghost/danger/quiet`, sizes `sm/md/lg`, breathing-dot loading, restrained tonal transitions |
| `src/components/ui/card.tsx` | Token borders, `interactive` hover (warm shift, no lift), `CardTitle`/`CardDescription` via type scale |
| `src/components/ui/badge.tsx` | `accent` variant, `dot`/`dotPulse`, exports `BadgeVariant`, full HTML prop spread |
| `src/components/ui/input.tsx` | Input/Textarea/Select to tokens, rose focus ring, `.select-chevron` |
| `src/components/ui/empty-state.tsx` | Softer icon circle, dashed emphasis border, type utilities |
| `src/components/ui/error-display.tsx` | Calmer `bg-danger/5`, retains `role="alert"` + Retry |
| `src/components/ui/loading-spinner.tsx` | Three breathing dots (staggered 180ms), same API |
| `src/components/ui/status-indicator.tsx` | Tone dot (idle/processing/success/warning/danger/info) + label; processing breathes; not color-only |
| `src/components/ui/confidence-indicator.tsx` | 0–1 value, static, never "probability", never animated, optional restrained bar |
| `src/components/ui/provenance-chip.tsx` | Mono chip for source/reference ids |

### Source — status / pages / design lab

| File | Purpose |
|------|---------|
| `src/components/status/state-badge.tsx` | Refactored to render through `Badge` (tone map + `dot` + `dotPulse`). Only active pipeline stages breathe; `WAITING_FOR_EVIDENCE` + `CREATED` + terminal states are static. Keeps `data-testid="state-badge"` |
| `src/components/status/investigation-status.tsx` | Polish to type utilities/token colors; `role="alert"` on error |
| `src/app/page.tsx` | Dashboard polish to type utilities; `ANALYZING → accent`; rose accent on Active count |
| `src/app/investigations/new/page.tsx` | Header polish to type utilities |
| `src/app/investigations/[id]/investigation-detail.tsx` | Header polish to type utilities/mono id |
| `src/app/design/page.tsx` | Development-only visual verification surface (typography, tokens, buttons, cards, badges, inputs, states, primitives, motion, grain) |

### Tests

| File | Coverage |
|------|----------|
| `tests/button.test.tsx` | Variants, sizes, loading dot + disable, disabled, className merge |
| `tests/badge.test.tsx` | Variant classes, dot, dotPulse, HTML props, className merge |
| `tests/card.test.tsx` | Padding, interactive hover classes, type-scale title/description |
| `tests/status-indicator.test.tsx` | Tones, label, breathing for processing, accessible label, color+text conveyance |
| `tests/confidence-indicator.test.tsx` | Value clamp, label, static (not animated), never "probability", accessible label preserves [0,1]/no "percent" |
| `tests/provenance-chip.test.tsx` | Source, detail, mono type |
| `tests/loading-spinner.test.tsx` | Three dots, stagger delays, label |
| `tests/state-badge.test.tsx` | Labels, testid, className; breathing for 5 active states; static for `WAITING_FOR_EVIDENCE`/`CREATED`/terminal states |

## Verification

- `pnpm test` — **16 files, 121 tests passed** (was 69 before F-PR1; includes existing `state-badge`/`investigation-status` suites still green after the refactor, plus new primitive tests and processing-semantics/confidence-a11y cases).
- `pnpm typecheck` — clean (`tsc --noEmit` exit 0).
- `pnpm build` — compiled successfully; `next/font/google` fetched (network available). All routes present and returning **HTTP 200** on the built app: `/`, `/design`, `/investigations/new`, `/investigations/[id]`.
- **Design-token render verification**: grepped the compiled Tailwind CSS output to confirm actual generation of `text-text-primary/secondary`, `bg-text-secondary`, `border-border-standard/subtle/emphasis`, `bg-accent-rose` (+`/10`,`/70`,`-subtle`) and hover/focus/active accent variants, `text-accent-rose`, `ease-restrained`, `animate-breathe`, `.grain` (z-40, opacity .4, reduced-motion stilled), `.select-chevron`, `type-*`, and `duration-fast/normal` (after the namespace fix).

## Scope / x-package audit

`git status` confirmed changes are confined to `packages/web`:

- **Modified (15)**: `globals.css`, `layout.tsx`, `page.tsx`, `investigations/new/page.tsx`, `investigations/[id]/investigation-detail.tsx`, `status/state-badge.tsx`, `status/investigation-status.tsx`, `ui/{badge,button,card,empty-state,error-display,input,loading-spinner}.tsx`, `tests/state-badge.test.tsx`
- **New**: `app/design/`, `ui/{confidence-indicator,provenance-chip,status-indicator}.tsx`, 6 test files, `docs/f-pr1-visual-foundation.md`
- **Untouched**: `packages/contracts`, `packages/intelligence` (clean), `packages/platform` (only pre-existing untracked `test-db.mjs`).
- User files `opencode.json` and `packages/platform/test-db.mjs` left untouched.

## Deferred (documented, not introduced)

- Serif display font (a future refinement, not needed for this core direction).

## Acceptance checklist

- **Was a second design system installed?** NO — everything lives in the single Tailwind v4 `@theme`.
- **Was GSAP installed?** NO
- **Was Framer Motion installed?** NO
- **Was a graph/state library installed?** NO
- **Was shadcn/Radix/MUI/Chakra installed?** NO
- **Was a provider architecture introduced?** NO
- **Was DataMode / SSE / KPP touched?** NO
- **Were `packages/platform`, `packages/contracts`, or `packages/intelligence` changed?** NO
- **Do all prior tests still pass after the StateBadge refactor?** YES (121/121)
- **Typecheck clean?** YES
- **Production build (incl. fonts + all routes)?** YES
- **Do the design-token utilities (text-text-*, bg-text-*, border-*, accent, motion, type-*) actually render?** YES — verified in compiled Tailwind CSS output.
