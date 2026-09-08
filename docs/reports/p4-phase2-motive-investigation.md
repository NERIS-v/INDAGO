# P4: Phase-2 Motive Investigation — Live WJA Audit Ingestion — Real-Case Report

## Status: COMPLETE

---

## 1. Objective

PASS 4 of 4 of the INDAGO real-case demo. Where PASS 3 (P3) ingested the
breakthrough Exhibit-719 material live, PASS 4 ingests the **second evidence**
named by the Phase-2 motive investigation's evidence request — `EREQ_P2`, whose
target class is

> **"WJA AUDIT / FINANCIAL DOCUMENT (HOUSE REPORT III.B.5)"**

as a deterministic, idempotent, provenance-complete run:

```
submission matches EREQ_P2 class
  → source + artifact + evidence        (EVID_S1_AUDIT, RECORD/PROCESSED, T1_INVESTIGATIVE_LEAD)
  → three observations                  (OBS_P2_A1/A2/A3)
  → entity resolution                   (→ existing WJA + Wheeler, no new entities)
  → relation + graph edge               (REL_B_AUDIT PROPOSED / GE_B_AUDIT_WJA ACTIVE, financial)
  → hypothesis re-scoring               (H1 0.32 → 0.68 SUPPORTED, promoted; H2 → 0.32; H3 → 0)
  → gap + graph hole reassessment       (GAP_AG2 → PARTIALLY_ADDRESSED; HOLE_P2_MOTIVE → PARTIALLY_RESOLVED)
  → evidence request completion         (EREQ_P2 → COMPLETED)
  → freeze comparison                   (fingerprint before ≠ after, rankingChanged)
  → 10-event transport choreography     (EVT_P2S_01..EVT_P2S_10, trigger-only)
```

Everything stays **data-only** and **honest**:

- The physical corporate audit record is **BLOCKED**; what is ingested is the
  House-report **public account** of it (`REPORT_TEXT_ACCOUNT` fallback), which
  explicitly "does not name who killed Roger Wheeler".
- The relation stays **PROPOSED** — a machine score is a discriminator, never an
  auto-accept (the graph edge materializes the hypothesis as an ACTIVE overlay,
  mirroring the P3 edge decision).
- Scores are `DERIVED_BY_DEMO_LOGIC` motive-discrimination estimates; the
  standing RULE OF EVIDENCE ("No proof language … never PROVEN") is the first
  ledger entry.

---

## 2. What Was Delivered

### 2.1 Core module — `real-case/phase2.ts` (NEW)

A pure, deterministic module that derives the Phase-2 motive investigation and
builds the S1 ("second evidence") supply chain. It exposes:

- `PHASE2_SECOND_EVIDENCE_CLASS` — the canonical EREQ_P2 target class string
  (`"WJA AUDIT / FINANCIAL DOCUMENT (HOUSE REPORT III.B.5)"`), used as the
  leak-safe class label in derived JSON.
- `derivePhase2()` — the full **pre-evidence** derivation: three canonical
  hypotheses (H1 protect-operation / H2 regain-control / H3 personal with
  confidence 0.3 and zero supporting observations), the lead/gap/hole/ER set,
  an 8-event (`EVT_P2_01..08`) choreography, the 7-entry reasoning ledger
  (RULE OF EVIDENCE first), and the `PHASE_2_PRE_EVIDENCE_FREEZE`.
- `buildPhase2Frames()` / `computeMotiveScores()` — frame-based scoring; the
  pre-evidence comparison **ties H1 ≈ H2 at 0.32** on the shared narrative
  (both support `[OBS_B4]`), with H3 weakest at 0.
- `derivePhase2Support(input)` — documented weighted support for the WJA ↔
  Wheeler financial relation (see §5).
- Canonical S1 builders: `buildS1Source/Artifact/Evidence/A1/A2/A3` (the three
  audit observations), `buildS1Relation` (`PROPOSED`), `buildS1Edge`
  (`ACTIVE`), plus post-ingest re-scoring via `buildPhase2Delta`.
- `matchesPhase2Class(title, fileNames)` — normalized substring match gate
  (see §4). Only a submission carrying the EREQ_P2 class fires the ingestion.
- `buildPhase2S1Package(phase2 = derivePhase2())` — assembles the full package
  (source→artifact→evidence→observations→relation→edge→delta→record→events→
  catalog→ledgerEntries→run patch) with a `Phase2RunResult`.
- `applyPhase2RunToState(state)` — idempotent application (map-guarded).
- `runPhase2S1Ingestion(state)` — build + apply in one call.
- `buildPhase2HistoricalValidation()` — the hard-fenced later-historical
  overlay (`LATER_HISTORICAL_KNOWLEDGE`, never PROVEN/CONFIRMED) that lives as
  a marker/projection only; see §11.

### 2.2 Types — `providers/types.ts` (MODIFIED)

`Phase2AssessmentFreeze`, `MotiveScoreRow`/`MotiveScoreRows`/`KYPOOL`,
`Phase2EvidenceDelta`, `Phase2HistoricalValidation`, `Phase2LedgerEntry`,
`Phase2RunResult`, `Phase2Record`, `Phase2StatePatch`; optional
`phase2*` seams on `WorkspaceProviders`.

### 2.3 Envelope — `demo/demo-fixtures/index.ts` (MODIFIED)

`RealCasePhase2` envelope type with the phase2 assessment/freeze, evidence
delta, historical validation, ledger, and named-sequences pointers.

### 2.4 Assembly — `real-case/index.ts` (MODIFIED)

- `REAL_CASE_PHASE2 = derivePhase2()` and
  `REAL_CASE_PHASE2_S1 = buildPhase2S1Package(REAL_CASE_PHASE2)` — module-level
  deterministic exports.
- `enrichedCaseB()` now carries the phase2 envelope (`assessmentFreeze`,
  `evidenceDelta`, `historicalValidation`, `ledger`), the derived lead/gap/hole/
  hypotheses/ER, the `phase2` (8) and `phase2-s1` (10) named-sequences, and
  appends `HOLE_P2_MOTIVE` to `REAL_CASE_GRAPH_HOLES`. The pre-ingest envelope
  keeps the 9 Case B events and 4 graph edges — S1 records never enter it.
- Phase-1 derived additions (`GAP_B4`, etc.) are preserved alongside the
  Phase-2 derived records so the earlier passes stay green.

### 2.5 Session persistence — `demo/session.ts` (MODIFIED)

`addDemoSessionPhase2` / `listDemoSessionPhase2` registry (kept separate from
generic session evidence so `listByInvestigation` shows `EVID_S1_AUDIT` exactly
once). `resetDemoSession()` clears all three registries (generic,
breakthrough, phase2).

### 2.6 Provider hook — `demo/providers.ts` + `factory.ts` (MODIFIED)

`DemoEvidenceProvider.submit` branches **before** the generic path (after the P3
breakthrough branch): `tryBuildPhase2Run` checks the workspace is Case B, the
ER is in request state, and the class matches; when it fires it applies the
patch, persists a session phase2 run, logs an `evidence.uploaded` event
(`targetId EVID_S1_AUDIT`), and returns the acceptance response.
`hydrateDemoSessionPhase2(state)` is exported and called by
`createWorkspaceDemoProviders` / `createIntakeProviders` so a freshly built
bundle replays the persisted run exactly once. The AUTO bundle forwards
`phase2AssessmentFreeze` / `phase2EvidenceDelta` / `phase2HistoricalValidation`
/ `phase2Ledger` from the demo bundle onto `WorkspaceProviders`.

---

## 3. Files Changed / Created

| File | Change |
| --- | --- |
| `providers/real-case/phase2.ts` | **Created** — full Phase-2 module |
| `providers/real-case/lookup.ts` | PASS 4 ids (`EREQ_P2`, `HYP_P2_H1..3`, `OBS_P2_A1..3`, `SRC/ART/EVID_S1_AUDIT`, `REL_B_AUDIT`, `GE_B_AUDIT_WJA`, `EVT_P2_01..08`, `EVT_P2S_01..10`, `LEAD_P2`, `GAP_AG2`, `HOLE_P2_MOTIVE`, `LEDGER_P2`, `REASON_P2_01..11`, `REC_P2_LATER_WITNESS`, `ENT_CALLAHAN`, `REC_CALLAHAN_BODY`) |
| `providers/types.ts` | PASS 4 types + optional workspace seams |
| `demo/demo-fixtures/index.ts` | `RealCasePhase2` envelope |
| `demo/session.ts` | Phase2 session registry + reset |
| `providers/demo/providers.ts` | `submit` phase2 branch, `tryBuildPhase2Run`, `hydrateDemoSessionPhase2`, seams |
| `providers/factory.ts` | Intake hydration + AUTO seam forwarding |
| `providers/real-case/index.ts` | `REAL_CASE_PHASE2`, `REAL_CASE_PHASE2_S1`, `enrichedCaseB` phase2 envelope + choreography |
| `tests/real-case-phase2.test.ts` | **Created** — 29 tests (below) |
| `docs/reports/p4-phase2-motive-investigation.md` | This report |

---

## 4. Match Gate

`matchesPhase2Class(title, fileNames)`:

```
needle   = normalize(PHASE2_SECOND_EVIDENCE_CLASS)
haystack = normalize(title + " " + fileNames.join(" "))
match    = haystack.includes(needle)
```

Normalization lowercases and collapses whitespace, so `"wja-audit-house-report-
iii-b5.txt"` and `"WJA AUDIT / FINANCIAL DOCUMENT (HOUSE REPORT III.B.5)"` both
match, while `"Ledger rows for shell"`, a bare `"WJA AUDIT"`, and a bare
`"House Report"` do **not** (the full class, including the "HOUSE REPORT
III.B.5" discriminator, is required). A matching title in a **non-Case-B**
workspace never fires the ingestion (proven by tests).

---

## 5. Support Score

The WJA ↔ Wheeler financial relation support is derived, not baked:

```
support = 0.5 · audit-narrative strength
        + 0.3 · timing-context strength
        + 0.2 · structural fit (position of the WJA entity / operational reading)
```

Defaults: `0.5·0.7 + 0.3·0.7 + 0.2·1.0 = 0.76` (`derivePhase2Support({})`).
Setting `auditStrength: 0` yields `0.41` — the honest low-support scenario.
Weights/strengths are exported constants (`PHASE2_SUPPORT_WEIGHTS`,
`PHASE2_SCORE_WEIGHTS`) and overridable per call; the 0.76 lands identically in
the relation, the delta, and the record. The relation stays **PROPOSED** — a
machine score never auto-accepts.

---

## 6. Ingestion Supply Chain (all schema-parsed)

| Artifact | Id | Key fields |
| --- | --- | --- |
| Source | `SRC_S1_AUDIT` | `type FILE_UPLOAD`, `status ACTIVE`, BLOCKED-doc description |
| Artifact | `ART_S1_AUDIT` | House-report / financial figure, `ingest/phase2-s1/...` |
| Evidence | `EVID_S1_AUDIT` | `type RECORD`, `status PROCESSED`, `posture T1_INVESTIGATIVE_LEAD`, `entityIds {ENT_WHEELER, ENT_WJA}`, `hypothesisIds {H1, H2, H3}`, provenance, `observedAt` short before the homicide, `ingestionTime 2024-07-02T09:00:00Z`; description honestly states the sealed document is BLOCKED and the account "does not name who killed Roger Wheeler" |
| OBS_P2_A1 | — | financial: audit investigated money being skimmed from the company |
| OBS_P2_A2 | — | financial: the audit's timing — ordered just before the homicide — is narrow — `candidateMentions` structural |
| OBS_P2_A3 | — | financial: audit records are private/tightly held (needed for the H1/H2 discriminator), supporting 3 exclusive observations total |
| Relation | `REL_B_AUDIT` | `financial`, directed, `status PROPOSED`, support 0.76, `derivedFrom = [OBS_P2_A1, OBS_P2_A2, OBS_P2_A3]`, source `ENT_WJA` → target `ENT_WHEELER` |
| Edge | `GE_B_AUDIT_WJA` | WJA → Wheeler, `financial`, `status ACTIVE`, support 0.76, `relationHypothesisId REL_B_AUDIT`, versioned to the live graph version |
| Gap | `GAP_AG2` | `IDENTIFIED → PARTIALLY_ADDRESSED`; resolution names exactly what advanced (audit-document financial evidence + partially resolved hole) and what remains open (no one is named) — text explicitly says "NOT resolved" |
| Evidence request | `EREQ_P2` | `SUBMITTED → COMPLETED`, `resultingEvidenceIds: [EVID_S1_AUDIT]`, `createdBy` preserved |

Entity resolution adds **no** new entities: the audit connects the existing
`ENT_WJA` ↔ `ENT_WHEELER` nodes (the graph hole `HOLE_P2_MOTIVE` names exactly
that missing edge).

---

## 7. Pre-Evidence Freeze vs Post-Ingest Delta

`derivePhase2().freeze` is the deterministic **pre-evidence** comparison:
`PHASE_2_PRE_EVIDENCE_FREEZE`, 3 rows (H1 0.32, H2 0.32, H3 0), MD5 fingerprint,
caveat "None of them has won yet".

The S1 run re-scores with the audit observations and records a
`Phase2EvidenceDelta`:

- `rankingChanged = true`; `hypothesisPromotedIds = [HYP_P2_H1]`.
- H1: `0.32 → 0.68`, 3 exclusive observations, `SUPPORTED`.
- H2: `0.32 → 0.32` (no exclusive support gained), `ACTIVE`.
- H3: `0 → 0`, no supporting observations.
- `before.fingerprint ≠ after.fingerprint`.
- `holeStatusChanges[HOLE_P2_MOTIVE → PARTIALLY_RESOLVED,
  derivedFrom EVID_S1_AUDIT]`; `gapStatusChanges[GAP_AG2: identified →
  partially_addressed]`.

The original pre-evidence freeze is **never mutated** — the delta carries both
fingerprints for explicit comparison.

---

## 8. Phase-2 Record

`Phase2Record` carries the ingest timestamp, evidence class/status, extracted
observation ids, relation/edge/hypothesis/gap/ER ids + statuses, both
fingerprints, and the honest summary that ends:

> "...NOT proof of who killed Wheeler — the audit establishes a financial-exposure
> operation reading (H1) over the control reading (H2), but does not establish who
> killed Roger Wheeler."

---

## 9. Event Streams

- **`phase2`** (8 events, `EVT_P2_01..08`): hypotheses proposed, boundary sentinel
  (pre-evidence tie / "None of them has won yet"), gap + hole + ER derived,
  freeze recorded, ledger recorded.
- **`phase2-s1`** (10 events, `EVT_P2S_01..10`): `EVIDENCE_INGESTED` →
  `OBSERVATION_EXTRACTED` (×3) → `ENTITY_HYPOTHESIS_RESOLVED` (→ existing WJA /
  Wheeler, "no new entities") → `RELATION_CREATED` (PROPOSED) →
  `RELATION_MATERIALIZED` / `GRAPH_EDGE_ADDED` (`GE_B_AUDIT_WJA` ACTIVE) →
  `GRAPH_HOLE_RESOLVED` (HOLE_P2_MOTIVE **partially**) → `HYPOTHESIS_PROMOTED`
  (H1, SUPPORTED) → `GAP_ADDRESSED` (PARTIALLY_ADDRESSED) →
  `FREEZE_COMPARED` ("fingerprint changed by the new edge").

Both streams are served as `namedSequences` on the enriched Case B set and only
replay through `triggerSequence` — never auto-played at connect (the 9 Phase-1
events still replay). The graph catalog wires `GE_B_AUDIT_WJA` for
`GRAPH_EDGE_ADDED` (kind `edge`) and the `RELATION_CREATED` overlay for
`REL_B_AUDIT`.

---

## 10. Session Persistence & Hydration

The submission path persists `addDemoSessionPhase2`; phase2 evidence is
intentionally NOT added to generic session evidence, so `evidenceByInvestigation`
lists `EVID_S1_AUDIT` exactly once. A fresh bundle built through
`createWorkspaceDemoProviders` / `createIntakeProviders` calls
`hydrateDemoSessionPhase2`, replaying the persisted run: evidence + H1
`SUPPORTED` + gap/ER statuses reappear, each id present exactly once. A repeated
submission of the same class is **idempotent** (no duplicate patch records), and
`applyPhase2RunToState` is map-guarded so re-applying a fully-applied run is a
no-op. (The session registry accumulates runs on repeat submission, mirroring
the P3 breakthrough behavior; idempotency is asserted at the state level.)

---

## 11. Leak-Token Hygiene & Honesty

- **No second-evidence leak in RAW / pre-ingest surfaces.** The PASS-1 corpus
  legitimately discusses the audit as a fact (a pre-existing gap/lead); what
  must NOT exist is the S1 layer: no `EVID_S1_AUDIT` / `OBS_P2_A*` /
  `REL_B_AUDIT` records and no "SECOND EVIDENCE" class in the raw corpora or the
  pre-ingest enriched workspace (asserted by the boundary tests). Enrichment
  only ever **appends** derived artifacts — it never mutates RAW corpora.
- **Physical doc BLOCKED.** The corporate audit record is `BLOCKED`;
  `fallback: "REPORT_TEXT_ACCOUNT"`. The ingested fallback is a House-report
  public account that reproduces nothing sealed and "does not name who killed
  Roger Wheeler". No guilt/proof/motive-proven/conspiracy language appears in the
  derived run JSON (`guilty of`, `motive is proved`, `confessed`, `was the
  killer` are guarded tokens).
- **Later-historical hearsay fenced.** The later witness's account (attributed to
  THE SECURITY CHIEF, who died before he could be questioned; the witness never
  met him) is rendered `LATER_HISTORICAL_KNOWLEDGE` /
  `PARTIALLY_CORROBORATED` / `SOURCE_CREDIBILITY` / `UNRESOLVED` — an overlay
  projection only, released via `buildPhase2HistoricalValidation()` / the phase2
  envelope, never in the pre-ingest or S1 record streams. The record summary
  never contains "later"; the overlay's `derivedFrom` ids are opaque (`REC_`
  record ids), never human names or witness account text.

---

## 12. Negative Gates (never fires unless it should)

Proven in `tests/real-case-phase2.test.ts`:

1. **Generic submission** — Case B, non-matching title/file names → normal
   generic evidence path, no Phase-2 records, `GAP_AG2` stays `IDENTIFIED`.
2. **Wrong workspace** — matching class submitted in a non-Case-B workspace →
   no phase2 run (`demoFixtures.case.id !== CASE_B_ID` asserted).
3. **Strict match** — `"Ledger rows for shell"`, bare `"WJA AUDIT"`, and bare
   `"House Report"` do NOT match; the canonical class (normalized) does.
4. **Idempotency** — re-submitting the class never duplicates any patch record;
   the evidence lists exactly once.
5. **State integrity** — running the ingestion never corrupts the RAW corpora or
   the pre-ingest enriched envelope (9 events / 4 edges).

---

## 13. Tests

`tests/real-case-phase2.test.ts` — 29 tests:

- Pre-ingest boundary: raw corpora free of S1 records; enriched Case B keeps
  9 events / 4 edges with no S1 evidence/relations/edges but carries the
  **pre-evidence H1/H2/H3** (derived from PASS-1 observations); phase2 streams +
  projections (freeze, delta, historical validation) exist but as
  choreography/overlay only.
- Pre-evidence derivation: three canonical hypotheses (H1 statement /
  H2 "restored / preserved" wording / H3 confidence 0.3, zero supporting obs);
  the pre-evidence comparison ties H1 ≈ H2 at 0.32 on `[OBS_B4]`; lead/gap/hole/ER
  derivation; 8-event stream; deterministic freeze (MD5, "None of them has won
  yet"); 7-entry ledger with the RULE OF EVIDENCE first.
- S1 supply chain: verbatim source/artifact/evidence/observations; BLOCKED doc +
  `REPORT_TEXT_ACCOUNT` fallback + "does not name who killed" disclaimer; relation
  `PROPOSED` support 0.76 (0.41 when `auditStrength: 0`); ACTIVE edge + run patch;
  post-ingest H1 promotion (0.68 SUPPORTED) + `rankingChanged`; gap/ER transitions
  + `PARTIALLY_RESOLVED` hole; 10-event stream + graph catalog; ledger entries 8-11
  with `OPEN_NEW_LEAD` final action.
- Match gate: canonical class in title or file name (normalized) accepted;
  partial strings rejected.
- Live ingestion through `DemoEvidenceProvider`: matching submission completes
  `EREQ_P2` and applies the full patch; evidence lists exactly once; fresh-bundle
  hydration exactly once; idempotent re-submission; generic and wrong-workspace
  negatives.
- Honesty gates: derived JSON free of guilt/proof/conspiracy tokens; summary =
  "NOT proof of who killed Wheeler"; `LATER_HISTORICAL_KNOWLEDGE` overlay fully
  fenced (never PROVEN/CONFIRMED, hearsay chain of 2, never-met-the-chief +
  died-before-questioned notes, opaque derivedFrom); phase2-s1 scope leak-safe
  (no "witness" / "later" / "sheet identifying"); documented weight constants.

Existing suites (`real-case-phase1`, `real-case-phase3`, `real-case-boundaries`,
`demo-evidence-flow`) remain green on the enriched sets because enrichment only
appends derived artifacts and preserves the Phase-1 derived additions.

---

## 14. Verification

- `npm run typecheck` (package `packages/web`) — **clean**.
- `npx vitest run tests/real-case-phase2.test.ts` — **29/29 pass**.
- `npx vitest run` (full suite, `packages/web`) — **101 files / 1144 tests
  pass** (1144 = 1115 pre-existing + the 29 new phase2 tests), including the P3
  breakthrough and prior regression surfaces.
- `npm run build` — unchanged surface; seams are optional projections, no UI
  break.

---

## 15. Pass 4 Dependencies (deferred)

- **UI wiring** — exposes seams (`phase2AssessmentFreeze`, `phase2EvidenceDelta`,
  `phase2HistoricalValidation`, `phase2Ledger`, named-sequences choreography,
  graph catalog). Rendering the motive investigation in a surface (e.g., a
  freeze-vs-after score panel or a "you ingested the WJA audit" activity entry)
  is a UI pass, not data.
- **Confirm/reverse lifecycle** — `EREQ_P2` / `GAP_AG2` now carry
  `COMPLETED` / `PARTIALLY_ADDRESSED` as the seam for explicit analyst
  confirmation or reversal of the PROPOSED relation over time.
- **Later-witness follow-up** — the `LATER_HISTORICAL_KNOWLEDGE` overlay is the
  seam for a future PASS that re-opens the motive evaluation if the fenced
  hearsay is ever admissible; today it is hard-fenced and overlay-only.