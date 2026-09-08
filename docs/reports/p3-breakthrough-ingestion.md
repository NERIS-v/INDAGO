# P3: Live Breakthrough / Evidence Ingestion — Real-Case Report

## Status: COMPLETE

---

## 1. Objective

PASS 3 of 4 of the INDAGO real-case demo. When an analyst submits a
document carrying the class named by the Phase-1 evidence request — `EREQ_B4`
titled the target class **"WORLD JAI ALAI PURCHASE REPORT (May 11, 1981)"** —
the Case B workspace **ingests the fenced Exhibit-719 material live**, as a
deterministic, idempotent, provenance-complete run:

```
submission matches EREQ_B4 class
  → source + artifact + evidence        (EVID_EXHIBIT_719, RECORD/PROCESSED)
  → three observations                  (OBS_B7/B8/B9, FINANCIAL)
  → entity resolution                   (→ existing FBI Boston, no new entities)
  → relation + graph edge               (REL_B_WJA_FBI / GE_B_WJA_FBI, financial)
  → hypothesis refinement               (HYP_B3, child of HYP_B2, SUPPORTED)
  → gap + graph hole reassessment       (GAP_B4 → PARTIALLY_ADDRESSED)
  → evidence request completion         (EREQ_B4 → COMPLETED)
  → freeze comparison                   (fingerprint before ≠ after)
  → 10-event transport choreography     (EVT_BT_01..EVT_BT_10, trigger-only)
```

Everything is **data-only** and **honest**: scores are
`DERIVED_BY_DEMO_LOGIC` investigative-relevance estimates; the gap is
`PARTIALLY_ADDRESSED` (the case-link to the homicide persons stays open); every
record carries mandatory provenance; the post-ingest fingerprint is compared
stridently against the Phase-1 freeze rather than silently overwritten.

---

## 2. What Was Delivered

### 2.1 Core module — `real-case/breakthrough.ts` (NEW)

A pure, deterministic module that builds the entire breakthrough supply chain
from the Phase-1 derivation. It exposes:

- `BREAKTHROUGH_CLASS` — the canonical EREQ_B4 target class string
  (`"WORLD JAI ALAI PURCHASE REPORT (May 11, 1981)"`), also the leak-safe class
  label used in derived JSON (never the fenced "Exhibit 719" id verbatim alone
  — the report is called by class, not by exhibit number).
- `matchesBreakthroughClass(title, fileNames)` — normalized substring match gate
  (lowercased, whitespace-collapsed). Only a submission that carries this class
  in its title or a file name triggers ingestion.
- `deriveBreakthroughSupport(input)` — documented weighted support score for the
  WJA ↔ FBI financial relationship (see §5).
- Canonical builders: `buildSource`, `buildArtifact`, `buildEvidence`,
  `buildObservationB7/B8/B9`, `buildRelation`, `buildEdge`, `buildRefinement`
  (HYP_B3), `reassessGap`, `completeEvidenceRequest`.
- `computePostFreezeFingerprintAfter(phase1, edgeIdsAfter)` — recomputes the
  freeze fingerprint over the Phase-1 snapshot plus the new edge, **without
  mutating** the original freeze.
- `buildDelta` / `buildRecord` — the `Phase1PostFreezeDelta` and
  `BreakthroughRecord` projections (see §7 / §8).
- `buildBreakthroughEvents()` — the 10 deterministic transport events (see §9).
- `buildBreakthroughCatalog(edge)` — the graph overlay deltas
  (`GRAPH_EDGE_ADDED` + `GRAPH_HOLE_RESOLVED`) driving the realtime graph with no
  UI change.
- `buildBreakthroughPackage(phase1 = deriveRealCasePhase1(caseAFixtureSet,
  caseBFixtureSet))` — assembles everything plus the `BreakthroughRunResult`
  (`{ patch, record, delta }`).
- `applyBreakthroughRunToState(state)` — applies a run to a demo workspace
  state, idempotently (map-guarded: any record id that already exists is
  skipped).
- `runBreakthroughIngestion(state)` — builds the package and applies it.

### 2.2 Types — `providers/types.ts` (MODIFIED)

`GraphHoleResolutionStatus` (`"PARTIALLY_RESOLVED" | "RESOLVED"`),
`Phase1PostFreezeDelta` (+ entries `Phase1GraphHoleResolution`,
`Phase1GapStatusChange`), `BreakthroughRecord`, `BreakthroughStatePatch`
(+ entries `BreakthroughGapReassessment`,
`BreakthroughEvidenceRequestCompletion`), `BreakthroughRunResult`; optional
`postFreezeDelta?` / `breakthroughRecord?` on `WorkspaceProviders`.

### 2.3 Envelope — `demo/demo-fixtures/index.ts` (MODIFIED)

`RealCasePhase1` gains optional `postFreezeDelta?` / `breakthroughRecord?`.

### 2.4 Assembly — `real-case/index.ts` (MODIFIED)

- `REAL_CASE_BREAKTHROUGH = buildBreakthroughPackage(REAL_CASE_PHASE1)` —
  module-level deterministic package export.
- `enrichedCaseB()` now also carries `phase1.postFreezeDelta` /
  `breakthroughRecord`, `namedSequences: { upload, breakthrough }` (the 10 events
  each), and `graphRealtimeCatalog`. The breakthrough stream is **not** part of
  `fixtures.events` — `DemoRealtimeProvider.scheduleNext` only auto-plays
  `fixtures.events`, so the 9 Phase-1 Case B events still replay at connect and
  the breakthrough choreography fires **only** via `triggerSequence("upload")`
  (and `breakthrough`) after the analyst submits the class.

### 2.5 Session persistence — `demo/session.ts` (MODIFIED)

`addDemoSessionBreakthrough` / `listDemoSessionBreakthrough` registry (kept
separate from generic session evidence so `listByInvestigation` shows the
breakthrough evidence exactly once). `resetDemoSession()` clears both maps.

### 2.6 Provider hook — `demo/providers.ts` + `factory.ts` (MODIFIED)

`DemoEvidenceProvider.submit` branches **before** the generic path:
`tryBuildBreakthroughRun` checks the workspace is Case B, the submission is in
request state, and the class matches; when it fires it applies the patch,
persists a session breakthrough record, logs an `evidence.uploaded` event, and
returns the acceptance response. `hydrateDemoSessionBreakthroughs(state)` is
exported and called by `createWorkspaceDemoProviders` and
`createIntakeProviders` so a freshly built bundle replays the persisted run
exactly once. The AUTO bundle forwards `postFreezeDelta` / `breakthroughRecord`
from the demo bundle onto `WorkspaceProviders`.

---

## 3. Files Changed / Created

| File | Change |
| --- | --- |
| `providers/real-case/breakthrough.ts` | **Created** — full breakthrough module |
| `providers/real-case/lookup.ts` | PASS 3 ids (`SRC/EVID_EXHIBIT_719`, `OBS_B7..B9`, `REL_B_WJA_FBI`, `GE_B_WJA_FBI`, `HYP_B3`, `EVT_BT_01..10`) |
| `providers/types.ts` | PASS 3 types + optional workspace seams |
| `demo/demo-fixtures/index.ts` | `RealCasePhase1.postFreezeDelta?`/`breakthroughRecord?` |
| `demo/session.ts` | Breakthrough session registry + reset |
| `providers/demo/providers.ts` | `submit` breakthrough branch, `tryBuildBreakthroughRun`, `hydrateDemoSessionBreakthroughs`, seams |
| `providers/factory.ts` | Intake hydration + AUTO seam forwarding |
| `providers/real-case/index.ts` | `REAL_CASE_BREAKTHROUGH`, `enrichedCaseB` choreography |
| `tests/real-case-phase3.test.ts` | **Created** — 22 tests (below) |
| `docs/reports/p3-breakthrough-ingestion.md` | This report |

---

## 4. Match Gate

`matchesBreakthroughClass(title, fileNames)`:

```
needle   = normalize(BREAKTHROUGH_CLASS)
haystack = normalize(title + " " + fileNames.join(" "))
match    = haystack.includes(needle)
```

Normalization lowercases and collapses whitespace, so
`"wja-purchase-report-may-11-1981.pdf"` and
`"World Jai Alai   Purchase   Report (May 11, 1981)"` both match while
`"Ledger rows for shell"` and a bare `"WORLD JAI ALAI"` do not. A matching title
in a **non-Case-B** workspace, or a generic Case B submission, never fires the
breakthrough (proven by tests).

---

## 5. Support Score

The WJA ↔ FBI Boston financial support is derived, not baked:

```
support = 0.5 · hospitality record strength
        + 0.3 · financial-context strength
        + 0.2 · institutional fit (1 = organizational security function,
                else < 1 by hospitality observation strength)
```

Defaults: `0.5·0.7 + 0.3·0.7 + 0.2·1.0 = 0.76` (`deriveBreakthroughSupport({})`).
Weights/strengths are exported constants (`BREAKTHROUGH_SUPPORT_WEIGHTS`,
`BREAKTHROUGH_STRENGTH`) and overridable per call — the 0.76 lands identically
in the relation, the edge, the delta, the record, and the catalog.

---

## 6. Ingestion Supply Chain (all schema-parsed)

| Artifact | Id | Key fields |
| --- | --- | --- |
| Source | `SRC_EXHIBIT_719` | `type FILE_UPLOAD`, `active` |
| Artifact | derived | PDF, `demo-contenthash`, stored at `ingest/breakthrough/...` |
| Evidence | `EVID_EXHIBIT_719` | `type RECORD`, `status PROCESSED`, `posture T1_INVESTIGATIVE_LEAD`, `strength 0.7`, `entityIds {ENT_RICO, ENT_WJA, ENT_FBIBOSTON}`, `hypothesisIds {HYP_B2, HYP_B3}`, provenance `intel.breakthrough.v1`, `observedAt 1981-05-11 (day)`, `ingestionTime 2024-07-02T09:00:00Z` |
| OBS_B7 | — | financial: Rico in WJA role within the corporate record — candidateMentions `[]` |
| OBS_B8 | — | financial: WJA-funded hospitality to FBI Special Agents **Dowd and Forrester** — candidateMentions `["FBI Special Agents", "Dowd", "Forrester"]` |
| OBS_B9 | — | financial (strength 0.6): the record documents spending and institutional relationships; **nothing in it connects the security function to the people around the Wheeler homicide** |
| Relation | `REL_B_WJA_FBI` | `financial`, directed, `status proposed`, support 0.76, basis `[OBS_B7, OBS_B8]`, contradiction `[OBS_B9]`, `derivedFrom = [OBS_B7, OBS_B8]` |
| Edge | `GE_B_WJA_FBI` | WJA → FBI Boston, `financial`, support 0.76, `structuralImportance 0.55`, observationCount 2, versioned to the live graph version |
| Hypothesis | `HYP_B3` | `SUPPORTED`, confidence 0.31, parent `HYP_B2`, supporting `+= OBS_B7/B8`, contradicting `+= OBS_B9`, `supportingEvidenceIds += EVID_EXHIBIT_719`, `relatedEntityIds += ENT_FBIBOSTON`, provenance = parent entries + appended Exhibit-719 entry **whose `derivedFrom` contains ONLY observation ids** (no hypothesis ids) |
| Gap | `GAP_B4` | `IDENTIFIED → PARTIALLY_ADDRESSED`; resolution text names exactly what advanced (financial edge + partially resolved hole) and what remains open (case-link to the homicide persons) |
| Evidence request | `EREQ_B4` | `SUBMITTED → COMPLETED`, `resultingEvidenceIds: [EVID_EXHIBIT_719]`, `createdBy` preserved |

Entity resolution adds **no** new entities: Dowd/Forrester resolve to the
existing `ENT_FBIBOSTON` (event `EVT_BT_04`).

---

## 7. Prediction-Freeze Comparison & Delta

`computePostFreezeFingerprintAfter` recomputes the freeze fingerprint over the
Phase-1 snapshot plus the new edge id (key-sorted stable stringify over the
Phase-1 inputs, fingerprint inputs extended by the added edge) without touching
`FREEZE_B1`. Verified values for the current corpus:

- `freezeFingerprintBefore = 14a4ba6701059dcbcf417cf6f2c65348` (the Phase-1
  freeze) → `freezeFingerprintAfter = d88f8a16429d3cd1d3d379e00a03a196`.

`Phase1PostFreezeDelta` records the comparison: ids grouped by stage
(`evidenceIngestedIds`, `observationExtractedIds`, `entityResolvedIds`,
`relationCreatedIds`, `graphEdgesAdded`), `graphHolesResolved[HOLE_B3 →
PARTIALLY_RESOLVED, derivedFrom EVID_EXHIBIT_719]`, `hypothesisRefinement:
HYP_B3`, `evidenceRequestIdsCompleted`, `gapStatusChanges[GAP_B4: identified →
partially_addressed]`, both fingerprints and the leak-safe class.

---

## 8. Breakthrough Record

`BreakthroughRecord` (`determinismLabel: "indago-exhibit-719"`) carries the
ingest timestamp, the evidence class/status, extracted observation ids, resolved
entity ids, relation/edge/hypothesis/gap/ER ids + statuses, both fingerprints,
and an **honest summary** that ends:

> "...does not establish who killed Roger Wheeler."

---

## 9. Event Stream (10 deterministic events, trigger-only)

Actor `intel.breakthrough.v1`, timestamps `2024-07-02T09:MM:00.000Z`, `delayMs =
350·index`:

`EVIDENCE_INGESTED` → `OBSERVATION_EXTRACTED` (×2) →
`ENTITY_HYPOTHESIS_RESOLVED` (→ existing FBI Boston, "no new entities
required") → `RELATION_CREATED` → `GRAPH_EDGE_ADDED` →
`GRAPH_HOLE_RESOLVED` (HOLE_B3 **partially** — "the case-link to the homicide
persons remains open") → `HYPOTHESIS_PROMOTED` (HYP_B3, child of HYP_B2) →
`GAP_ADDRESSED` (PARTIALLY_ADDRESSED) → `FREEZE_COMPARED`
("fingerprint changed by the new edge").

The stream is served as `namedSequences` on the enriched Case B set and only
replays through `triggerSequence` — never auto-played at connect. The graph
catalog wires `GE_B_WJA_FBI` for `GRAPH_EDGE_ADDED` and a
`hole-resolve` entry for `HOLE_B3` (resolves hole `GAP_B4`, carries the edge),
so the realtime overlay updates with **no UI change**.

---

## 10. Session Persistence & Hydration

The submission path persists `addDemoSessionBreakthrough`; breakthrough
evidence is intentionally NOT added to generic session evidence, so
`evidenceByInvestigation` lists `EVID_EXHIBIT_719` exactly once. A fresh bundle
built through `createWorkspaceDemoProviders` / `createIntakeProviders` calls
`hydrateDemoSessionBreakthroughs`, replaying the persisted run: evidence +
hypothesis + gap/ER statuses reappear, each id present exactly once. A repeated
submission of the same class is idempotent (no duplicate records), and
`applyBreakthroughRunToState` is map-guarded so re-applying a fully-applied run
is a no-op.

---

## 11. Leak-Token Hygiene & Honesty

- Derived run JSON is scanned for guarded tokens: `martorano`, `bulger`,
  `flemmi`, `connolly`, `guilty`, `convicted`, `conviction`, `conspiracy`,
  `target sheet` (and the fenced exhibit label as a standalone claim). The
  report is always named by its **class**, never asserted as authorship of a
  target sheet or responsibility for the homicide; OBS_B9 / the gap resolution /
  the record summary each state what is NOT established.
- RAW PASS 1 corpora still contain no Exhibit-719 material: the phase3
  boundaries test asserts the pre-ingest Case B workspace (9 events, 4 edges,
  GAP_B4 `IDENTIFIED`, EREQ_B4 `SUBMITTED`) is clean, and `real-case-boundaries`
  / `real-case-phase1` continue to pass on the enriched sets because enrichment
  only appends derived artifacts.
- Focus is an investigative lead (`T1_INVESTIGATIVE_LEAD`), not an accusation:
  the refinement is a structural financial relationship, score 0.76, honest
  about the open case-link.

---

## 12. Negative Gates (never fires unless it should)

Proven in `tests/real-case-phase3.test.ts`:

1. **Generic submission** — Case B, non-matching title/file names → normal
   generic evidence path, no breakthrough records.
2. **Wrong workspace** — matching class submitted in a non-Case-B workspace →
   no breakthrough (the run builder requires the Case B ids).
3. **Strict match** — `"Ledger rows for shell"`, bare `"WORLD JAI ALAI"`, bare
   `"receipt.jpg"` do not match; the canonical class (normalized) does.
4. **Idempotency** — re-submitting the class never duplicates any patch record;
   `applyBreakthroughRunToState` on a fully-applied state changes nothing.
5. **State integrity** — running the ingestion never corrupts the RAW corpora.

---

## 13. Tests

`tests/real-case-phase3.test.ts` — 22 tests:

- Pre-ingest boundary: raw corpora clean; enriched Case B starts with 9 events,
  4 edges, GAP_B4 `IDENTIFIED` / EREQ_B4 `SUBMITTED`, no breakthrough records;
  choreography + catalog + projections exist but as on-demand/overlay only.
- Match gate (strict + normalized).
- Supply chain: verbatim records, documented support 0.76, provenance on every
  observation, relation/edge exactness, HYP_B3 refinement + **parent chain** (no
  hypothesis ids in any `derivedFrom`), gap/ER transitions, fingerprint compare
  without mutating the freeze, determinism (JSON-stringify-identical reruns),
  10 events.
- Live ingestion through `DemoEvidenceProvider`: class submission ingests the
  full patch; evidence lists exactly once; fresh-bundle hydration exactly once;
  idempotent re-submission; generic and wrong-workspace negatives.
- Honesty: run JSON free of guilt/conspiracy/target-sheet/hearsay tokens;
  summary stays partial (never resolution of the homicide); the RUNS apply
  without corrupting the RAW corpora.

`tests/real-case-boundaries.test.ts`, `tests/real-case-phase1.test.ts`,
`tests/demo-evidence-flow.test.ts` — unchanged assertions, still green on the
enriched sets.

---

## 14. Verification

- `npm run typecheck` — **clean** across all 7 workspaces.
- `npm test` — **100 files / 1115 tests pass**, including the 22 new
  `real-case-phase3` tests and the regression surface (pr10 width/act stderr
  warnings are pre-existing noise; all tests pass).
- `npm run build` — **succeeds**; lint + type validation clean; all 17 routes
  compile.

---

## 15. Pass 4 Dependencies (deferred)

- **Martorano hearsay chain** — remains hard-fenced; it is the later-historical
  validation surface, never part of the ingest run.
- **Confirm/reverse lifecycle** — `EREQ_B4`/`GAP_B4` now carry
  `resultingEvidenceIds`/`PARTIALLY_ADDRESSED` as the seam for Phase-2-style
  validation over real data.
- **UI wiring** — exists as seams (`postFreezeDelta`, `breakthroughRecord`,
  named-sequences choreography, graph catalog); rendering the run in a surface
  (e.g., a breakthrough timeline/activity entry) is a UI pass, not data.