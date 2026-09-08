# P2: Phase-1 Intelligence — Real-Case Derivation Report

## Status: COMPLETE

---

## 1. Objective

PASS 2 of 4 of the INDAGO real-case demo. Phase 1 of PASS 2 proves that the
PASS 1 real-case datasets **independently derive** the Phase-1 intelligence
chain, with NO hardcoded answer:

```
cross-case spark
  → security-chief lead (H. Paul Rico)      → LEAD_B3
  → "security function may be a pathway"     → HYP_B2
  → graph hole (missing WJA↔Wheeler edge)    → HOLE_B3 / GAP_B4
  → evidence request (NBE target class)       → EREQ_B4
  → prediction freeze                          → FREEZE_B1
```

Scope boundary honored: the derivation **stops before** Exhibit 719 dawning,
the Martorano hearsay chain, and any Phase-2 evidential workflow. The fenced
`breakthrough-phase-1` package is never read by the derivation.

Every score is an investigative-relevance estimate labeled
`DERIVED_BY_DEMO_LOGIC` — never a probability of guilt or truth.

---

## 2. What Was Delivered

### 2.1 Pure derivation module — `real-case/phase1.ts` (NEW)

Consumes ONLY the PASS 1 fixture sets (observations, entities, relations and
graph edges) and derives, deterministically and in order:

1. **Spark detection** — ≥2 shared entities with an ORGANIZATIONAL edge to the
   WJA node in BOTH graphs.
2. **Candidate scoring** — five weighted features over the shared-entity
   universe.
3. **Artifact chain** — lead, hypothesis, gap, graph hole, evidence request,
   prediction freeze.
4. **Event streams** — Case A (2) + Case B (9) transport events.

`RealCasePhase1Derivation` (the return type) carries the derivation result
plus the two per-case `phase1` envelopes for enrichment.

### 2.2 Types — `providers/types.ts` (MODIFIED)

`Phase1Alternative`, `BridgeCandidateRanking`, `CrossCaseSignal`,
`PredictionFreeze`; optional `crossCaseSignal?` / `predictionFreeze?` on
`WorkspaceProviders`.

### 2.3 Envelope — `demo/demo-fixtures/index.ts` (MODIFIED)

`RealCasePhase1` interface (`crossCaseSignal`, `predictionFreeze`, and the five
`derived*Id` pointers) + optional `phase1?` field on `DemoFixtureSet`. The OFS
demo set leaves `phase1` unset.

### 2.4 Assembly — `real-case/index.ts` (MODIFIED)

- `REAL_CASE_PHASE1` — the module-level deterministic derivation.
- `RAW_CASE_FIXTURES` — pre-derivation PASS 1 sets (still what `validate.ts`
  validates; the raw `case-a`/`case-b` exports are untouched).
- `caseAEnriched` / `caseBEnriched` / `REAL_CASE_FIXTURES` /
  `getRealCaseFixtureSet` — PASS 1 content + `events` replacement + `phase1`
  envelope + derived `leads`/`hypotheses`/`gaps`/`evidenceRequests`/`graphHoles`
  appended.
- `REAL_CASE_GRAPH_HOLES` — PASS 1 holes + the derived Phase-1 hole.

### 2.5 Provider seams — `demo/providers.ts` + `factory.ts` (MODIFIED)

`createWorkspaceDemoProviders` / `createAutoWorkspaceProviders` forward
`crossCaseSignal` / `predictionFreeze`; `CaseListProviders.topology` + per-case
topology built in `createCaseListProviders`.

---

## 3. Files Changed / Created

| File | Change |
| --- | --- |
| `providers/real-case/phase1.ts` | **Created** — pure `deriveRealCasePhase1` |
| `providers/types.ts` | Added Phase-1 types + optional workspace fields |
| `demo/demo-fixtures/index.ts` | Added `RealCasePhase1` + `phase1?` |
| `providers/real-case/index.ts` | Added derivation + enrichment maps |
| `providers/demo/providers.ts`, `providers/factory.ts` | Forward `crossCaseSignal`/`predictionFreeze`/`topology` |
| `components/intel/cross-case-signals.tsx` | `Phase1SignalBanner` (existing design, real data) |
| `app/investigations/[id]/investigation-overview.tsx` | "Phase-1 frozen" badge (no layout change) |
| `components/case-list/case-list.tsx` | Mini topology restored with real-case nodes/edges |
| `app/page.tsx` | Forwards `providers.topology` |
| `tests/real-case-boundaries.test.ts` | Updated for derived event streams |
| `tests/real-case-phase1.test.ts` | **Created** — 22 tests (below) |
| `docs/reports/p2-phase1-intelligence.md` | This report |

---

## 4. Derivation Logic

### 4.1 Spark detection

```
sharedEntityIds = entities present in BOTH cases (factual intersection)
orgMemberIds(case) = entity ids of nodes whose organzational edge touches the
                     WJA node in that case's graph
sparkMembers = sharedEntityIds ∩ orgMemberIds(A) ∩ orgMemberIds(B)
sparkFired = sparkMembers.length >= 2
```

For the PASS 1 data: `orgMembers(A) = {Callahan, Rico}`,
`orgMembers(B) = {Callahan, Rico}` → `sparkMembers = [Callahan, Rico]` → fires.

When the spark does NOT fire the chain **downgrades**: no hypothesis, no lead,
no gap, no hole, no evidence request, no freeze — only the
`CROSS_CASE_ANALYSIS_STARTED` event per case remains.

### 4.2 Candidate scoring

Candidates = the shared entities (`[Callahan, Rico, WJA, FBI Boston]`). Each
candidate is scored with fixed relevance weights:

| Weight | Value | Feature |
| --- | --- | --- |
| `presence` | 1.0 | `0.5·(mentionsA/maxA + mentionsB/maxB)` |
| `orgBothCases` | 1.6 | `1` if org member of WJA in BOTH graphs |
| `temporalThroughHomicide` | 1.8 | `1` if no recorded WJA-role termination before 1981 |
| `directFlow` | 2.2 | `min(directFlowCount,3)/3` via "shared with `<alias>`" / "`<alias>` entertained" |
| `themeOverlap` | 0.8 | `themePositive/(mentionsA+mentionsB)` against the theme lexicon |

`score = Σ(feature·weight)`, rounded 4dp; tie-break by label ascending.

### 4.3 Verified candidate table (runtime values)

| Rank | Candidate | Score | Status | Features (presence / org / temporal / flow / theme) |
| --- | --- | --- | --- | --- |
| 1 | H. Paul Rico | **6.0917** | SELECTED | 0.425 / 1 / 1 / 0.667 / 1.000 |
| 2 | World Jai Alai | 3.9048 | REJECTED | 0.800 / 0 / 1 / 0.333 / 0.714 |
| 3 | FBI Boston Field Office | 2.8250 | REJECTED | 0.225 / 0 / 1 / 0.000 / 1.000 |
| 4 | John "Jack" Callahan | 2.7583 | REJECTED | 0.625 / 1 / 0 / 0.000 / 0.667 |

Rico: `0.425·1.0 + 1.0·1.6 + 1.0·1.8 + 0.6667·2.2 + 1.0·0.8 = 6.0917`.

### 4.4 Why Rico is selected

`selectedBy` (feature thresholds on the top candidate):
1. organizational tie to WJA in both case graphs (`orgBoth = 1`);
2. no recorded WJA-role termination before the 1981 homicide window (`temporal = 1`);
3. recorded direct information-flow contacts shared with the candidate
   (`flow ≥ 0.5`) — A5: the loan-shark information was "shared with H. Paul
   Rico"; A6: "Rico and WJA personnel entertained …"; produces `flow = 2/3`;
4. content overlap with the security/thematic signal (`theme = 1.0`) — every
   Rico mention hits the theme lexicon;
5. named presence spans both investigations (`presence = 0.425`).

Callahan (rank 4) is beaten decisively by `temporal = 0`: his employment is the
one explicitly recorded as "ended before" the 1976 hearing, resolved by the
possessive-attribution window immediately before "employment" → his WJA role did
NOT persist to the 1981 homicide window.

---

## 5. Evidence Sets

Derived by `deriveHypothesisSets` over the spark members
(`{Callahan, Rico}`); the member-entity filter is on the observation's entity
IDs, so observations naming only WJA/Wheeler/FBI contribute to **neither** set.

| Set | Observations |
| --- | --- |
| Supporting | `OBS_A4` (WJA employed Callahan + Rico as security director/consultant), `OBS_A5` (loan-shark info shared with Rico), `OBS_A6` (Bahamas hospitality), `OBS_B5` (security function in WJA records) |
| Contradicting | `OBS_A1` (request "met with silence"), `OBS_A3` (Callahan's employment "ended before" 1976) |

Candidate-level sets are broader (all observations mentioning the candidate,
with the `CONSTRAINT_LEXICON && !FLOW_LEXICON` rule applied per candidate — the
code is authoritative; the tests assert membership and determinism, not an
exact enumeration in prose).

### 5.1 Lexicons

- `THEME_LEXICON` — `/security|winter hill|shared with|entertained|fbi|skim|audit|loan shark|organized crime|murder|homicide|tip|stonewall/i`
- `CONSTRAINT_LEXICON` — `/allegation|met with silence|ended before|unverified|tip|stonewall/i` (deliberately **excludes** "former FBI" / "not verified" — neutral context, not caveats)
- `FLOW_LEXICON` — `/shared with|entertained/i` (elevates a caveated observation to supportive when it also records a direct flow event)

---

## 6. Derived Artifacts (all schema-parsed; only the top-ranked candidate is consulted)

| Artifact | Id | Key content |
| --- | --- | --- |
| Lead | `LEAD_B3` | "Trace the WJA security function around the Wheeler homicide (top candidate: THE SECURITY CHIEF)", NEW / HIGH / `T1_INVESTIGATIVE_LEAD`, confidence 0.42, `gapIds [GAP_B4]`, `relatedEvidenceIds [EVID_HR_CT, EVID_HR_WJA]` |
| Hypothesis | `HYP_B2` | Title "WJA internal security function as a possible information/operational pathway"; statement: "The company's internal security function may have provided an information/operational pathway connecting the World Jai Alai network to the people surrounding the Wheeler homicide." Status ACTIVE, confidence 0.21; `relatedEntityIds [Rico, Callahan, WJA]` |
| Gap | `GAP_B4` | `UNRESOLVED_RELATION` / `IDENTIFIED` / HIGH, impact 0.72, expectedInformationValue 0.75, `relatedEntityIds [Callahan, Rico, Wheeler]`, `evidenceRequestIds [EREQ_B4]` |
| Graph hole | `HOLE_B3` | `MISSING_EDGE`, `investigationGapId GAP_B4`, `nodeIds [GN_B_WJA, GN_B_WHEELER]`, `expectedEdgeType "case-link"`, significance 0.75, suggested evidence types = operational/purchase/travel records. **NOT an edge** — Case B `graphEdges` stay 4. `GraphHole` has no `id` field; `HOLE_B3` is the constant used wherever an id string is needed. |
| Evidence request | `EREQ_B4` | `RECORD` / `SUBMITTED`, `hypothesisIds [HYP_B2, HYP_B1]`, description names the target class "WORLD JAI ALAI PURCHASE REPORT (May 11, 1981)" **without** the fenced artifact id; utility `{eig 0.8, relevance 0.9, feasibility 0.35, cost 0.4, score 0.72}`; `createdBy "analyst.phase1"` |

---

## 7. Prediction Freeze — `FREEZE_B1`

- `frozenAt {2024-07-01T18:00:00.000Z, exact}`, `runId "phase1-2024-07-01"`,
  `stage "PHASE_1_PREDICTION_FREEZE"`.
- `rankedLead { rank 1, candidateScore 6.0917, roleLabel "THE SECURITY CHIEF",
  entityId ENT_RICO, entityLabel "H. Paul Rico", leadId LEAD_B3, selectedBy: 5
  feature reasons }`.
- `nodeIds`/`edgeIds` mirror the Case B graph (6 nodes / 4 edges).
- Alternatives H2 (legitimate consultancy, basis `[OBS_A4, OBS_B5]`), H3
  (external associations, basis `[OBS_A2, OBS_A5, OBS_A6]`), H4 (shared context
  no operational link, basis `[OBS_A1, OBS_A3, OBS_B6]`).
- `fingerprint = fnv1a64(stable::phase1-freeze) + fnv1a64(stable::phase1-salt)`
  over key-sorted `stableStringify` — 32 hex chars. Verified value for the
  current corpus: `14a4ba6701059dcbcf417cf6f2c65348`. Changing any snapshot
  input changes the fingerprint.

---

## 8. Event Streams

Actor `intel.phase1.v1`, hourly 09:00–17:00Z, `delayMs = 250·index`.

- **Case A (2)**: `CROSS_CASE_ANALYSIS_STARTED` (09:00) →
  `CROSS_CASE_SIGNAL_DETECTED` (10:00, target `P1_ANALYSIS_A`).
- **Case B (9)**: `CROSS_CASE_ANALYSIS_STARTED` (09:00) →
  `CROSS_CASE_SIGNAL_DETECTED` (10:00) → `LEAD_GENERATED` (11:00, `LEAD_B3`) →
  `HYPOTHESIS_CREATED` (12:00, `HYP_B2`) → `EVIDENCE_FOR_ATTACHED` (13:00) →
  `EVIDENCE_AGAINST_ATTACHED` (14:00) → `GRAPH_HOLE_DETECTED` (15:00,
  `HOLE_B3`) → `EVIDENCE_REQUEST_CREATED` (16:00, `EREQ_B4`) →
  `PREDICTION_FROZEN` (17:00, `FREEZE_B1`).

The no-spark path returns only the `CROSS_CASE_ANALYSIS_STARTED` event per case.

---

## 9. Enrichment & UI Surfaces

- `caseBEnriched` carries the derived lead/hypothesis/gap/ER appended to the
  PASS 1 lists, the derived hole in `graphHoles`, the 9-event stream, and the
  `phase1` envelope (`crossCaseSignal + predictionFreeze + derived*Id`).
  `caseAEnriched` carries the 2-event stream and its signal envelope.
- `CrossCaseSignal` / `PredictionFreeze` are forwarded to workspace providers
  and rendered by:
  - `Phase1SignalBanner` (new, on the cross-case page) — uses only existing
    primitives (glass-panel, Badge, existing typography); includes the
    candidate ranking with a SELECTED badge; renders nothing when absent.
  - A single existing-style "Phase-1 frozen" accent badge in the
    investigation-overview header row (only when
    `predictionFreeze.caseId === investigation.caseId`).
- **No UI design change**: only real data is plugged into existing surfaces.
- Realtime recap needs no change: `demo/realtime.ts` `setupEventsOf()` returns
  `state.fixtures.events ?? getSetupEvents()`, so enriched events replay
  automatically. `DemoGraphProvider` reads `fixtures.graphHoles` (the derived
  hole flows), and `validate.ts` continues to validate the RAW PASS 1 sets.

---

## 10. Dashboard Minimap — Restored with Real Topology

`createCaseListProviders` serves both real cases as a 2-card grid; previously
the command-center minimap never rendered because `featured` required a single
item, and `MINI_LAYOUT` held only OFS node ids. Now:

- `MINI_LAYOUT` carries deterministic hub-and-spoke positions for Case A
  (WJA hub; Callahan / Rico / SOCTF / FBI / McGuigan) and Case B (WJA hub;
  Callahan / Rico / Wheeler / SHC; **FBI Boston at [280,290] as the genuinely
  isolated node**).
- The `CaseCard` grid variant renders the existing `NetworkMiniMap` + a
  "Topology · N nodes / M edges" footer when real nodes are supplied.
- `CaseList` accepts a `topology` map; `app/page.tsx` forwards
  `providers.topology` built per case from the real fixture graphs.

Timeline needed no change — the real fixture sets already carry genuine
`timeline` bands (`case-a.ts`, `case-b.ts`) consumed by `DemoTimelineProvider`.

---

## 11. Negative Gates (the chain is NOT hardcoded)

Proven in `tests/real-case-phase1.test.ts` by re-deriving over modified
fixture copies (the PASS 1 module exports are never mutated):

1. **Structural gate** — remove the WJA→Rico organizational edge from the
   Case B graph copy: `sparkMembers` falls to `[Callahan]` (length 1) →
   `sparkFired false`, no hypothesis/lead/gap/hole/ER/freeze, one event per
   case, empty envelopes.
2. **Shared-set gate** — remove Callahan and Rico from the Case B entity copy:
   shared set reduces to `{WJA, FBI}`; no org member is shared → spark does not
   fire and the top candidate is no longer Rico.

---

## 12. Leak-Token Hygiene

Tests scan the `JSON.stringify` of both envelopes + both event streams and
assert the absence of: `martorano`, `bulger`, `flemmi`, `connolly`, `exhibit`,
`dowd`, `forrester`, `guilty`, `convicted`, `conviction`, `conspiracy`,
`connected`, `breakthrough`. The evidence-request description names the target
class ("WORLD JAI ALAI PURCHASE REPORT (May 11, 1981)") without the fenced
artifact id or the "Exhibit" label. Field boundaries in `real-case-boundaries`
(no fenced ids in initial corpus, no Martorano/Bulger/Flemmi/Connolly entities,
no guilty/proven statuses) continue to pass on the enriched sets because
enrichment only **appends** derived artifacts.

---

## 13. Tests

`tests/real-case-phase1.test.ts` — 22 tests:

- Positive chain: spark fired; 4 typed candidates; Rico SELECTED with
  `score ∈ (6, 7)`; strict ordering; `DERIVED_BY_DEMO_LOGIC` labels; verbatim
  hypothesis; exact supporting/contradicting sets.
- Artifact cross-reference: lead→gap→hole→ER→hypothesis links; hole is a
  `MISSING_EDGE`/`case-link` and **not** a graph edge (Case B `graphEdges` stay
  4); NBE wording without the fenced id; exact Case A/B event sequences; signal
  envelope ids.
- Freeze: structure, "THE SECURITY CHIEF", ranking statuses, H2/H3/H4 bases.
- Determinism: repeated derivation is `JSON.stringify`-identical; fingerprint
  stable and input-sensitive.
- Leak-token hygiene.
- Negative gates (both above).
- Enrichment/factory: enriched Case B carries derived artifacts + 9 events;
  demo-mode `createCaseListProviders` serves 2 cases with per-case topology.

`tests/real-case-boundaries.test.ts` — updated: the derived fixtures now ship a
2-event (A) / 9-event (B) stream with the exact action sequence.

---

## 14. Verification

- `npm run typecheck` — **clean** (zero errors).
- `npm test` — **99 files / 1093 tests pass**, including the 22 new
  `real-case-phase1` tests and the updated boundaries suite.
- `npm run build` — **succeeds**; all routes compile.

---

## 15. Pass 3 Dependencies

Passes 3–4 are unblocked but intentionally deferred:

- **Exhibit 719 dawning** — the class named by `EREQ_B4` ("WORLD JAI ALAI
  PURCHASE REPORT (May 11, 1981)") is the fenced artifact; surfacing it as the
  breakout requires opening the `breakthrough-phase-1` fence.
- **Martorano hearsay chain** — still hard-fenced; feeds the later-historical
  validation UI.
- **Evidential workflows** — `EREQ_B4`/`GAP_B4` become the seam for the Phase-2
  evidence lifecycle (request → ingest → confirm/reverse) over real data.
- **Freeze replay** — `FREEZE_B1` fingerprint is the anchor for comparing any
  post-freeze state against the Phase-1 snapshot.