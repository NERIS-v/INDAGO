# F-PR9 — Hypothesis workspace: previous pipeline preserved + Reverse Hypothesis added as a second mode

**Status:** COMPLETE. Typecheck EXIT=0. Build EXIT=0. Full web suite **89 files / 958 tests, 958 passed**. New F-PR9 suites green and stability-repeated 3×: `hypothesis-model.test.ts` (16), `reverse-hypothesis.provider.test.ts` (10), `reverse-hypothesis-engine.test.tsx` (7).

---

## 1. Objective

Deliver Reverse Hypothesis on `/investigations/[id]/hypothesis` as an **added mode**, explicitly **without replacing** the previous hypothesis surface. The prior pipeline UI (`components/intel/hypothesis-engine.tsx`) is restored byte-for-byte and keeps being the page's primary/default mode:

- **Hypothesis generation (mode 1, default)** — the existing hypothesis pipeline UI, preserved and untouched (its AI-synthesized dossier, confidence, evidence matrix, print output, and the `investigationId` context remain exactly as before). This is the "previous flow" the product owner required back.
- **Reverse Hypothesis (mode 2, new)** — the deterministic reverse-test engine. The analyst writes a hypothesis in their own words; the model reads exactly one structured condition, retrieves saved observations in semantic reach, and classifies each as SUPPORTING / CONTRADICTING / UNRESOLVED **as counts with reasons** — never TRUE/FALSE, never a probability/confidence/score, never an AI Verdict. The engine records four analyst decisions per tested text without mutating canonical evidence. (Prior PR rules were scoped to the reverse surface and are not retrofitted onto the preserved pipeline.)

Both modes resolve under DEMO/AUTO; the reverse engine renders an honest typed-unavailable panel under explicit live while the preserved pipeline keeps its pre-seam behavior.

## 2. What F-PR9 delivers

**Pure model (`lib/intel/reverse-hypothesis/hypothesis-model.ts`).** Deterministic pipeline — `interpretHypothesis` → `buildInverseConditions` → `classifyReverseHypothesis` → `assembleAssessment`:

- **Interpretation:** entity resolution through a deterministic alias dictionary (`resolveBestAlias`, `orderedByAppearance`); predicate detection (TRANSFER / LOCATED_AT / CONTACT / OWNERSHIP / OTHER); verb-aware TRANSFER role parsing (`parseTransferParties` — "received funds from" ⇒ subject=sender) with first-appearance ordering as the tie-break; temporal bound `<year|month|day|range>`. Unresolved tokens are surfaced honestly, never silently guessed.
- **Inverse conditions (predicate-aware):** TRANSFER → REVERSE_DIRECTION (contradicting) + DIFFERENT_DESTINATION / DIFFERENT_SENDER (not contradicting — no rebuttal without asserted exclusivity) + EXPLICIT_NEGATION (contradicting); LOCATED_AT → DIFFERENT_LOCATION + EXPLICIT_NEGATION; CONTACT / OWNERSHIP → EXPLICIT_NEGATION (± OWNERSHIP's DIFFERENT_SENDER as non-contradicting). Absence is never a contradiction.
- **Classification three-way:** an observation is SUPPORTING (assertion matches), CONTRADICTING (matches an inverse condition — verified against the canonical contradiction registry for LOCATED_AT), or UNRESOLVED (in reach, no match). Every finding carries a deterministic `why`. Registry-confirmed `LOCATED_AT` pairs are classified through the contradiction branch (support pass skips registry members); `canonicalContradictionId` propagates the real registry UUID.
- **Assessment:** `status ∈ {SUPPORTED, SUPPORTED_WITH_CONFLICT, CONTRADICTED, UNRESOLVED}` or `null` on a terminal parse error; completed run-stage trail (`IDLE→INTERPRETING→RETRIEVING_SUPPORT→BUILDING_INVERSE→RETRIEVING_CONTRADICTION→VALIDATING→READY|ERROR`) as facts — no simulated progress; `retrieval {pool, supporting, contradicting, unresolved}` counts only; informational `notices`.
- **Time:** `observationInWindow` is inclusive; temporal granularity is respected (month/day bounds never widened).

**Provider seam.** `IntelligenceProvider` extended with `testHypothesis(investigationId, {hypothesis})`, `recordHypothesisDecision(investigationId, {hypothesis, decision})` → session trail, `listHypothesisDecisions(investigationId)`. Demo implementation path: `buildEntityCatalog` over the real fixtures + `HYPOTHESIS_ALIASES`, observations → `ObservationInput`, contradictions → `ContradictionRecord`, all string-time fields from `createdNow().value`. Decisions live in a session-scoped `reverseHypothesisDecisions` map on demo state (create + reset wired) and never touch canonical evidence. Live provider returns typed `providerUnsupported("intelligence.*")` for all three; capability gate is intelligence demo-only.

**Views** under `components/intel/`:
- `hypothesis-workspace.tsx` — shell with a **Hypothesis generation / Reverse hypothesis** segmented toggle (`role="tablist"`, `aria-selected`); **mode 1 renders the preserved `HypothesisEngine` (default)** with `investigationId` threaded from the workspace context; mode 2 renders the reverse engine. Nav label stays "Hypothesis" since the page hosts both modes.
- `reverse-hypothesis-engine.tsx` — verbatim textarea; **Test hypothesis** action; structured-interpretation panel (reading, predicate/subject→object, temporal window, unresolved tokens); inverse-condition trace with `contradicting` / `not a contradiction` labels and reasons; three-way count cards; finding cards grouped SUPPORTING / CONTRADICTING / UNRESOLVED with `why`, inverse-match note, canonical-registry contradiction id, an **Evidence trail** drill (`evidence.get` → title/description/sourceRef/artifactIds), and **Open in graph** (deep link preserving `caseId`); completed run-trail strip; **HYPOTHESIS CHANGED — RUN AGAIN** invalidation that hides decisions when the tested text is edited; four decision actions ([Accept as working hypothesis] [Revise hypothesis] [Keep unresolved] [Open evidence]) recorded for the tested text with the session trail listed; PROVIDER_UNAVAILABLE panel when `capabilities.intelligence === "not-ready"`. Restrained colors (no truth-green/lie-red), non-chatbot language, keyboard/aria, no fake typing or scanning.
- `hypothesis-engine.tsx` — **restored** (git HEAD) legacy pipeline, unchanged; not shown in the F-PR9 file delta.

**Routing.** `app/investigations/[id]/hypothesis/page.tsx` renders `HypothesisWorkspace`.

## 3. Locked demo scenarios (verified by the suite)

| Scenario | Predicate | Subject→Object | Window | Retrieval | Status |
|---|---|---|---|---|---|
| A: "Intermediary account 0093 received funds from Aldridge Holdings in February 2024." | TRANSFER | `ENT_SHELL_ONE`→`ENT_BANK` | 2024-02 | 4 · 2 · 0 · 2 (support OBS_2+OBS_3; unresolved OBS_1+OBS_4) | **SUPPORTED** |
| B: "Victor Aldridge shares a residential address with the nominee director of Aldridge Holdings." | LOCATED_AT | `ENT_VICTOR`/`ENT_SHELL_ONE` | none | 2 · 1 · 1 · 0 (support OBS_8; contradicting OBS_9 via registry `CONTRADICTION_1`) | **SUPPORTED_WITH_CONFLICT** |

A is 2/0/2 (support/unresolved); the two in-reach-but-unmatched observations are left UNRESOLVED, not verdict-ed. B's contradicting count comes from the canonical contradiction registry, and its id is shown in the UI.

## 4. Files

**Changed**
- `packages/web/src/lib/providers/types.ts` — the three new `IntelligenceProvider` methods.
- `packages/web/src/lib/providers/capabilities.ts` — `intelligence` and `hypotheses` seam declaration (demo-served).
- `packages/web/src/lib/providers/demo/providers.ts` — `testHypothesis` / `recordHypothesisDecision` / `listHypothesisDecisions` over the real fixtures.
- `packages/web/src/lib/providers/demo/state.ts` — `reverseHypothesisDecisions` map + reset.
- `packages/web/src/lib/providers/live/providers.ts` — typed `providerUnsupported` stubs.
- `packages/web/src/app/investigations/[id]/hypothesis/page.tsx` — render `HypothesisWorkspace`.
- `packages/web/src/components/intel/hypothesis-workspace.tsx` — two-mode shell; **mode 1 is the preserved pipeline** (`HypothesisEngine investigationId={workspace.investigationId}`), mode 2 the reverse engine.

**Added** (reverse surface only)
- `packages/web/src/lib/intel/reverse-hypothesis/hypothesis-model.ts` — the pure model.
- `packages/web/src/lib/providers/demo/demo-fixtures/hypothesis-aliases.ts` — deterministic alias dictionary.
- `packages/web/src/components/intel/reverse-hypothesis-engine.tsx`.
- `packages/web/tests/hypothesis-model.test.ts` (16), `reverse-hypothesis.provider.test.ts` (10), `reverse-hypothesis-engine.test.tsx` (7).

**Restored (no delta)** — `packages/web/src/components/intel/hypothesis-engine.tsx` (the previous pipeline UI; an earlier incorrect approach deleted it and was reverted via `git restore`).

## 5. Protected areas confirmation

- Only `packages/web/**` changed. No backend/contracts/platform/judge/Prisma/workers/SSE files; no new routes or dependencies (no LLM/network calls — the reverse engine is a local deterministic model over the existing providers).
- Graph implementation, Network visualizations, five-zone shell, cross-case auth, temporal system, and Judge untouched.
- The previous hypothesis pipeline is preserved byte-for-byte — its revert is feature work, not a regression.
- Canonical evidence is never mutated by the reverse engine; decisions are session-scoped only.
- Untracked local configuration and unrelated prior-PR reports remain untracked/untouched.

## 6. Honest-data thread

```
pipeline       = preserved legacy surface (pre-existing behavior, not touched by F-PR9)
interpretation = resolveEntities + detectPredicate + parseTransferParties + parseTemporalRef  (deterministic)
inverse        = predicate-aware conditions; contradicting only for genuine rebuttals (no exclusivity ⇒ no rebuttal)
classification = SUPPORTING (assertion) / CONTRADICTING (inverse + registry) / UNRESOLVED (in reach, unmatched)
why            = a deterministic reason per finding; no probability, no score, no verdict
stages         = completed run trail (facts; labelled "no simulated processing")
decisions      = recorded per tested text; trail persists for the session; "HYPOTHESIS CHANGED" invalidates on edit
live           = reverse engine: typed UNSUPPORTED/PROVIDER_UNAVAILABLE — never fabricated
```

## 7. Capability & surface honesty

| Surface | DEMO / AUTO-demo | LIVE (effective live) |
|---|---|---|
| Hypothesis pipeline (mode 1, preserved) | previous pipeline UI | previous pipeline UI (pre-seam behavior, untouched) |
| Reverse hypothesis (`capabilities.intelligence`) | `demo` — deterministic engine | `providerUnavailable` — honest typed panel |

The reverse engine has **no confidence output by construction**: the model emits categories and counts; the view never renders a `CONF`-style score, an AI Verdict, a truth/lie verdict, or a guarantee. (The preserved pipeline's own statistical output is pre-existing and out of F-PR9 scope.)

## 8. Test-context facts locked by the suite

- Model (16): parse-role ordering; alias resolution; unresolved tokens surfaced; temporal parsing + `temporalLabel`; inclusive windowing; absence ≠ contradiction; no rebuttal without exclusivity (A→C does not rebut A→B); TRANSFER inverse set contradicting flags; LOCATED_AT registry branch (registry members classified in the contradiction branch, support pass skips them); scenario A & B assessments with exact retrieval; stage trail ends READY; parse error → `status:null` + `HYPOTHESIS_PARSE_ERROR`.
- Provider (10): demo A (SUPPORTED, subject `ENT_SHELL_ONE`/object `ENT_BANK`, 4/2/0/2, OBS_2+OBS_3 support, OBS_1+OBS_4 unresolved, no contradicting, READY); demo B (SUPPORTED_WITH_CONFLICT, 2/1/1/0, `CONTRADICTION_1`); live `testHypothesis` / `recordHypothesisDecision` / `listHypothesisDecisions` typed-unsupported (never fabricated); decision recording session-scoped + trail round-trip; canonical evidence mutation guard.
- View (7): **mode 1 defaults to the preserved pipeline** — `Initialize Investigative Synthesis` button, `INDAGO // Hypothesis Generation Pipeline` header, `Operation Financial Shadow`, `SYSTEM_READY`, and no reverse engine mounted; mode toggle **adds** the reverse panel (pipeline unmounts, button gone); scenario A on screen (SUPPORTED, `4 pool · 2 supporting · 0 contradicting · 2 unresolved`, `window during 2024-02`, `Structured as: … transferred funds to`, OBS_2/OBS_3, REVERSE_DIRECTION + `not a contradiction`, READY + "no simulated processing", no `CONF \d+%` / `AI Verdict` / `guaranteed`); scenario B on screen (`SUPPORTED WITH CONFLICT`, `2 pool · 1 supporting · 1 contradicting · 0 unresolved`, `CONTRADICTION_1`); HYPOTHESIS CHANGED banner + decisions hidden after editing the tested text; `ACCEPT_AS_WORKING_HYPOTHESIS` recorded into the visible session trail; live seam leaves the preserved pipeline rendering and shows the reverse engine's `reverse-hypothesis-provider-unavailable` panel with zero demo content.
- Stability: F-PR9 trio (33 tests) run 3× consecutively — 33/33 each run.

## 9. Verification evidence

- `npx tsc --noEmit` (packages/web) — EXIT 0.
- `npm run build` (packages/web) — EXIT 0 (stale `.next` from the earlier legacy-page deletion cleared first).
- `npx vitest run` (packages/web) — 89 files / 958 tests, 958 passed (pre-existing `act()` stderr warnings in older pr2/pr4/evidence suites only; none from F-PR9).