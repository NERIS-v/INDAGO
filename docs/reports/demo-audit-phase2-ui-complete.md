# INDAGO Real-Case Demo — Full Demo Audit (PASS 4 Integration Complete)

- **Scope:** `packages/web` real-case demo (PASS 1 Phase-1 intelligence, PASS 2
  cross-case derivation, PASS 3 Exhibit-719 breakthrough ingestion, PASS 4
  Phase-2 motive investigation + its UI surface).
- **Status:** COMPLETE — all four demo passes green, UI integration finished,
  full-suite verification below.
- **Date:** 2026-09-08

---

## 1. Executive summary

The final deferred item of the real-case demo — the PASS 4 **Phase-2 motive
investigation UI** — is now integrated and verified. The Phase-2 analysis
("why was Roger Wheeler killed?") renders as a read-only projection on the
investigation overview **only** for the enriched Case B workspace; live/OFS
workspaces render nothing (never fabricated).

The audit confirms the complete demo surface end to end:

- **PASS 1** — real-case 2-card dashboard (Case A + Case B), per-case topology
  previews, `predictionFreeze` badge.
- **PASS 2** — Phase-1 cross-case signal banner + `crossCaseSignal`/
  `predictionFreeze` seams.
- **PASS 3** — Exhibit-719 live breakthrough ingestion (match gate, supply
  chain, idempotent session hydration); seams forwarded to AUTO.
- **PASS 4** — Phase-2 motive investigation: H1/H2/H3 derivation, pre-evidence
  freeze, BLOCKED-audit honesty contract, `LATER_HISTORICAL_KNOWLEDGE` overlay,
  EREQ_P2-gated S1 ingestion, and now the **freeze-vs-after score panel** +
  header badge on the investigation overview.

Verification: 102 test files / **1149 tests pass**, typecheck clean,
`next build` succeeds.

---

## 2. PASS 4 UI integration (this pass)

### 2.1 New component — `src/components/intel/phase2-motive-panel.tsx`

A read-only Phase-2 assessment panel that consumes only `WorkspaceProviders`
seams — never Demo/Live implementations:

- **Gated render:** returns `null` unless `workspace.phase2AssessmentFreeze`
  exists, so live/OFS workspaces render nothing (no fabricated analysis).
- **Comparison surface:** the three canonical hypotheses (H1 protect the
  financial operation / H2 regain-control / H3 personal) as a freeze-vs-after
  score grid with `DERIVED_BY_DEMO_LOGIC` progress bars, exclusive-observation
  counts, and (when the S1 delta projection is present) the post-ingest
  re-ranking (H1 → 0.68 SUPPORTED, H2 held 0.32) and the
  `freeze→after` fingerprint compare.
- **Honesty block:** the physical corporate audit document is BLOCKED; the
  derived reference is the House-report public account (`REPORT_TEXT_ACCOUNT`);
  the panel states explicitly that no score establishes who killed Roger
  Wheeler, and shows the reference class from `delta.leakSafeClass`.
- **Historical-validation overlay:** `LATER_HISTORICAL_KNOWLEDGE` /
  `PARTIALLY_CORROBORATED` badge row, the `nonMeeting` note, each hearsay-chain
  hop, and stance/manner-of-proof provenance — rendered as an overlay only,
  never PROVEN/CONFIRMED.

### 2.2 Wiring — `src/app/investigations/[id]/investigation-overview.tsx`

- Header badge **"Phase-2 motive assessment"** shown only when the workspace
  carries `phase2AssessmentFreeze` for the current case (mirrors the existing
  "Phase-1 frozen" badge).
- Panel mounted as a section after "Current picture", rendered only on
  workspaces that genuinely carry the seams.

### 2.3 Tests — `tests/real-case-phase2-ui.test.tsx` (5 tests)

- Enriched Case B workspace → panel + heading + caveat + BLOCKED/fallback +
  H1/H2 labels + historical overlay + LATER_HISTORICAL_KNOWLEDGE render.
- S1 delta projection present → "H1 promoted to SUPPORTED", "H2 held at 0.32",
  freeze fingerprint compare strings render.
- OFS demo workspace → nothing rendered.
- Live-mode workspace (no phase-2 seams) → nothing rendered.
- Dashboard case-list surface still exposes the 2-card real-case catalogue,
  confirming the audit did not regress PASS 1.

---

## 3. Pass-by-pass audit results

| Pass | Surface / capability | Verified by | Result |
| --- | --- | --- | --- |
| PASS 1 | Real-case 2-card dashboard, topology previews, Case B 9 events / 4 edges | `real-case-phase1`, `real-case-boundaries`, `case-list` | ✅ |
| PASS 2 | Phase-1 cross-case signal banner; `crossCaseSignal`/`predictionFreeze` seams (incl. AUTO) | `real-case-phase1`, `provider-factory` | ✅ |
| PASS 3 | Breakthrough match gate, supply chain, session hydration, idempotency, negatives | `real-case-phase3` | ✅ |
| PASS 4 (data) | H1/H2/H3 derivation, freeze, BLOCKED honesty, delta, historical overlay, S1 ingestion | `real-case-phase2` (29 tests) | ✅ |
| PASS 4 (UI) | Freeze-vs-after score panel + header badge on overview | `real-case-phase2-ui` (5 tests, NEW) | ✅ |
| Demo flow | Evidence submission, realtime, session reset, no generic/breakthrough cross-talk | `demo-evidence-flow`, `demo-realtime` | ✅ |
| Boundaries | RAW/derived/phase1/phase2 fenced ids stay sealed pre-ingest; mock-leakage tokens | `real-case-boundaries`, `mock-leakage` | ✅ |

---

## 4. Full verification commands

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | ✅ clean |
| Full suite | `npx vitest run` | ✅ **102 files / 1149 tests pass** |
| Demo + real-case focused | `npx vitest run tests/{real-case-phase1,real-case-phase2,real-case-phase3,real-case-boundaries,demo-evidence-flow,demo-realtime,provider-factory,data-mode,mock-leakage,real-case-phase2-ui,case-list}.*` | ✅ **123 tests pass** |
| Build | `npm run build` | ✅ succeeds, all 18 routes compile |

### 4.1 Leak-token scan

The new UI surfaces were scanned for fenced tokens (`martorano`, `bulger`,
`flemmi`, `connolly`, `guilty of`, `convicted`, `conspiracy`, `target sheet`):
**no leaks** in `phase2-motive-panel.tsx` or `investigation-overview.tsx`.

### 4.2 Seam hygiene

- `phase2` envelope lives **only** on the enriched Case B fixture set
  (`real-case/index.ts` → `enrichedCaseB()`); Case A and the OFS demo set carry
  no `phase2`.
- Factory forwards `phase2AssessmentFreeze` / `phase2EvidenceDelta` /
  `phase2HistoricalValidation` / `phase2Ledger` from the demo bundle onto
  both pure-demo and AUTO workspaces (present only when the fixture carries
  them).
- The panel's gated render means the non-enriched workspaces display no badge
  and no section.

---

## 5. Honesty & boundary guarantees re-confirmed

- No substantive score claims "guilt" or "proof": the motive panel emits the
  `Never confirmed` footer and the standing BLOCKED / REPORT_TEXT_ACCOUNT
  fallback contract.
- The later-historical hearsay stays an **overlay**: classification
  `LATER_HISTORICAL_KNOWLEDGE`, verdict `PARTIALLY_CORROBORATED`, manner of
  proof `UNRESOLVED`, with the never-met-the-chief and died-before-questioned
  caveats surfaced in the panel.
- RAW PASS-1 corpora remain clean pre-ingest: EVID_S1_AUDIT / OBS_P2_A* /
  REL_B_AUDIT never appear in a raw or non-Case-B workspace (boundary +
  phase2 tests).

---

## 6. Files touched by this pass (PASS 4 UI)

| File | Change |
| --- | --- |
| `components/intel/phase2-motive-panel.tsx` | **Created** — Phase-2 motive assessment panel (gated, read-only seams) |
| `app/investigations/[id]/investigation-overview.tsx` | Header "Phase-2 motive assessment" badge + panel section |
| `tests/real-case-phase2-ui.test.tsx` | **Created** — 5 UI tests (render / delta / negatives / dashboard smoke) |

No lib/provider changes were required for the UI pass: the PASS 4 data layer
and seams shipped earlier were already complete.

---

## 7. Outstanding (non-blocking)

- **No lint script** exists in `packages/web` (`package.json` scripts are
  dev/build/start/typecheck/test/test:watch/clean); typecheck serves as the
  static gate. A dedicated lint pass would need a script to be added first.
- The dashboard case cards do not yet carry phase-2-driven chips; the panel
  surface on the investigation overview is the canonical PASS-4 UI touchpoint.