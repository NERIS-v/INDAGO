# INDAGO_REAL_CASE_DEMO_FLOW.md

# Real-Case Demo — Authoritative Behavioral Specification

## Purpose

This is the single authoritative implementation document describing exactly how the **real-case
demo** must behave from start to finish. It replaces the fictional **"Operation Financial
Shadow"** demo narrative with two real historical investigations:

- **Case A** — Connecticut / World Jai Alai (WJA) licensing & regulatory investigation (1975–76)
- **Case B** — Tulsa homicide of Roger Wheeler (1981)

and a deliberately sealed/later-knowledge layer.

The demo runs in **two phases**:

- **PHASE 1 — CONNECT.** The judge experiences the hidden *relationship linking two
  investigative contexts* — not "the same company," which is common, visible infrastructure.
- **PHASE 2 — EXPLAIN.** The judge experiences the competing explanations of *why the owner was
  killed*, and the later-knowledge validation layer that keeps the motive honest.

This document is a **behavioral specification** (how the demo must behave, state by state). It is
**not** a screenplay rewrite. Every sentence that touches facts must survive inspection against the
evidence sources below. **No application code, fixture, provider, graph implementation, Judge
route, or contract is modified by this document.**

---

## 1. Demos Fundamentals (Behavioral Contract)

1. **Data before mechanism.** Every fact enters a fixture because a source supports it — never
   because a surface would look better with it. (Extraction spec §1 rule 1.)
2. **Mechanism derives, never seeds.** All scores, rankings, "next best evidence", graph holes,
   cross-case signals, and robustness figures are *computed* from the encoded facts, or explicitly
   stubbed `NOT_COMPUTED`. Anything the UI paints as a number carries the tag
   `DERIVED_BY_DEMO_LOGIC`; nothing is seeded to a known "true" outcome. No hidden answer exists in
   fixture content, UI code, or event transcripts. (Extraction spec §17.)
3. **No retroactive knowledge in the initial crowds.** The initial Case A and Case B crowds
   reflect what investigators plausibly had at the time — not what history later established.
   Later knowledge lives only in `LATER_HISTORICAL_KNOWLEDGE` annotations and the sealed bucket.
   (Extraction spec §1 rule 3.)
4. **The witness serves as validation, not prediction.** The later witness testimony is a
   *validation layer* that appears only after Phase 1's prediction has been made and recorded. It
   is never initial evidence, never the source of the Phase 1 prediction, and never a weight on a
   pre-seal score.
5. **No fabrication.** Every physical page presented to the judge is either a real historical
   artifact (or an extract of one) or is explicitly labeled a *reconstructed/extracted* page — never
   an "original document." A fabricated document is a hard error.
6. **The live ledger is real ingestion.** During the demo, the ledged/corporate artifact enters
   INDAGO as a **new evidence object** through the normal submission upload path. Observations are
   extracted, the graph is updated, and the event ledger streams the real state transitions. This
   is never a `false → true` boolean flip and never a pre-written fake transcript.
7. **Three clocks, never merged.** HISTORICAL EVENT TIME / SOURCE-REPORTED TIME / DEMO INGESTION
   TIME are distinct. Later-knowledge content renders with an explicit "later" marker and never
   merges into the 1981/82 flag timeline. (Extraction spec §10/§20.)
8. **The "aha" is a role, not a verdict.** The connective discovery of Phase 1 is that *the
   company's internal security function* is the hidden pathway. It never resolves to
   guilt/proof-of-criminality. Relationship statuses are `OBSERVED / CANDIDATE / SUPPORTED /
   CONTRADICTED / UNRESOLVED`. No `isGuilty`, `PROVEN_CRIMINAL`, or `CONFIRMED_CONSPIRATOR`
   anywhere. (Extraction spec §6.4, §24.)
9. **Challenge is real.** Every major hypothesis can be challenged, and challenge can weaken it —
   `CHALLENGED` / `INCONCLUSIVE` are reachable states, never defeated-for-drama `REFUTED`.
   (Extraction spec §14.)
10. **No Operation Financial Shadow vocabulary, personnel, or narrative** anywhere in the surfaces,
    search corpus, hypothesis aliases, or events. (Extraction spec §5, §24-8.)
11. **Presentation order is the script's.** The approved performable script (§2.1, §28) governs
    what happens, in what order, and under which narration; its delivery notes are binding.
    Evidence integrity always outranks a script beat.

---

## 2. Authoritative Sources

Source precedence, in descending order of authority:

| # | Source | Role in this spec | Status |
|---|---|---|---|
| 1 | `INDAGO_REAL_CASE_EXTRACTION_SPEC.md` (repo root) | **Governing evidentiary source.** Dictates factual/evidentiary behavior, six-way classification, UUID namespaces, bridge nodes, hole/counter-evidence inventory. | READ (full). Verdict **YELLOW**; `V` verified vs `R` reconfirm tags apply below. |
| 2 | `INDAGO Demo — Final Performable Script` (the approved demo script) | Governs **presentation order** only, and only where it does not violate evidentiary integrity. | **READ.** Supplied in full (BEAT 0–0.5, ACT 0–19, delivery notes). Its delivery notes are binding constraints (§28). Where script presentation-order conflicts with evidence integrity, evidence wins. |
| 3 | `INDAGO CASE RECONSTUCTION REPORT.md` (repo root) | Reconstruction with source ledger. Subordinate to verification. | Present; **not fully re-read** (truncation debt, see §33). |
| 4 | `EVIDENTIARY CLAIM VERIFICAITON.md` (repo root) | Adversarial verification pass. **Takes precedence** over the reconstruction report. | Present; **not fully re-read** (truncation debt, see §33). |
| 5 | Primary sources cited therein | House Report 108-414 Vol 1 (§III.B.3 Oklahoma, §III.B.6 Connecticut, Chronology p.622); OPR Exhibit 141; 2002 Martorano plea/testimony; 2002 Connolly federal trial record (U.S. District Court, Massachusetts). | Verified at the claims level; page-level quotes re-verify. |

**Resolving rule.** If this spec and the extraction spec disagree, the verification report wins; if
neither report is decisive on a fact required to present the demo, the fact is omitted rather than
invented, and the gap is listed in §33.

### 2.1 Presentation order — script beats mapped to demo states

The script's BEAT/ACT structure is the authoritative presentation order. Mapping to the behavioral
state machines:

| Script item | Demo state/material | What the judge experiences |
|---|---|---|
| BEAT 0 / 0.5 | Pre-demo title + plain-language problem | Admin slide (Team [X], Problem Statement 26189); the "fragmented evidence → connected, evidence-backed network → what's still unproven" pitch |
| ACT 0 — Cold open | P1.0 framing | 1975 CT vs 1981 Tulsa, "nobody has any reason to think these are the same story"; *this actually happened*; sealed envelope visible, unopened |
| ACT 1 — Case A | P1.0 (Case A board) | Prospectus → surveillance log (given destination vs observed travel to Boston) → surveillance/intelligence record (Boston associations) → subpoena record (hearing scheduled; no appearance; resigned, left the state) |
| ACT 2 — Case B | P1.1 (Case B board) | Incident report → internal audit ledger (money disappearing; president removed; audit ordered) → state police teletype (looking toward a Boston network; the transfer of information unresolved) |
| Transition | P1.2–P1.3 | "Two states. Five years apart. Zero shared system. The same company is already obvious — that's not the problem." |
| ACT 3 — Observations + Entity Pulse | P1.2–P1.3 | Company = a known overlap, not a discovery; INDAGO looks at the structure around it (people, roles, time, evidence) |
| ACT 4 — Cross-Case Matrix: THE SPARK | P1.2/P1.6 | A cell lights up on the **security chief** (not the company); kept genuinely uncertain — Spark, not payoff |
| ACT 5 — Graph: "show me how" | P1.6–P1.7 | Node/edge structure (president, security chief, company, owner, emerging Boston investigative context); dashed/muted candidate relationship; Bahamas expense entry flagged as a financial outlier — a pattern, not proof |
| ACT 6 — Lead + Graph Hole | P1.7/P1.8 | Lead card = possible security conduit inside the company; hole = "did the security chief have an operational connection to the people around the murder?" — says what's unresolved, not yes |
| ACT 7 — Next Best Evidence | P1.8 | Request: the company's internal security, communication, and financial records for the relevant period — *not yet in the workspace* |
| ACT 8 — LIVE EVIDENCE INGESTION | P1.9–P1.10 | Sealed envelope = historical WJA ledger/corporate record; INGEST → EXTRACT → RESOLVE → UPDATE; "INDAGO didn't receive the relationship. It received a document." |
| ACT 9 — THE LEDGER REVEAL | P1.11–P1.12 | Observations highlighted; Verify/Apply Evidence; graph hole updates; candidate relationship develops; "the graph just changed because the evidence changed" |
| ACT 10 — PHASE 2 question | P1.16/P2.0 | "Why was the owner killed?"; Hypothesis Lab; H1/H2/H3 generated and ranked; "the highest score is not truth" |
| ACT 11 — Evidence FOR / AGAINST | P2.1–P2.6 | Both sides of the leading hypothesis (✓ supporting stack and ⚠ contradicting/limitations stack) |
| ACT 12 — Next Best Evidence (Phase 2) | P2.7–P2.8 | The evidence request has *changed*: from hidden relationship to **evidence that distinguishes motives** → WJA audit and financial records |
| ACT 13 — PHASE 2 BREAKTHROUGH | P2.9–P2.11 | Second historical document (financial/audit) ingested; leading hypothesis changes; "financial-exposure explanation now substantially better supported" — never "proved murder motive" |
| ACT 14 — HISTORICAL VALIDATION | P2.14 | The later historical record (murder arising from the WJA conflict, the owner's financial-loss investigation, those who stood to lose) + later testimony (how information about Wheeler reached the attackers); INDAGO's reconstruction vs the later record shown as two separate things |
| ACT 15 — CHALLENGE | P2.12–P2.13 | "Try to break it" — poor bookkeeping? legitimate relationships? personal/control? Alternatives stay visible; no deletion because one scores higher |
| ACT 16 — Reasoning Ledger | all | Every step traceable — observation, entity resolution, relation, structural signal, lead, gap, evidence request, ledger evidence, hypothesis generation, supporting, contradicting, second evidence request, reassessment, historical validation |
| ACT 17 — Benchmark / proof | P2.14/P2.15 | Printed benchmark/evaluation sheet |
| ACT 18 — Historical conclusion | P2.15 | Reconstructed chain from fragmented evidence; what was missing; competing explanations tested; assessment updated as evidence arrived |
| ACT 19 — Close | P2.15 | "INDAGO did not decide who was guilty… That's the job." |

Emotional structure (binding): two discoveries — first **WHO/WHAT is the hidden bridge** (Phase 1,
ends at the ledger-derived relationship), then **WHY the murder becomes the leading explanation**
(Phase 2). **The graph update at ACT 9 is what causes Phase 2 to begin.** A demo that only shows
INDAGO being triumphantly right is less convincing than one that correctly represents a real,
still-imperfect piece of evidence — staged as a feature, not a disappointment.

---

## 3. Cast & Role Vocabulary

The judge must never be forced to memorize nine surnames. Names **reinforce** roles; roles are the
cognitive load-bearing labels. Every surface that shows these people shows the role-first label
with the name as reinforcement.

| Role label (always shown) | Person | Case presence | Why the role, not the name |
|---|---|---|---|
| **THE PRESIDENT** | John "Jack" Callahan | A + B (bridge node E1) | Head of the licensed/local company; subject of the CT licensing probe; later the informant bridge. |
| **THE SECURITY CHIEF** | H. Paul Rico | A + B (bridge node E2) | Former FBI Boston agent; hired as WJA Director of Security shortly after his 1975-05-27 retirement (House Report §III.B.3 p.89). The Phase 1 hidden relationship. |
| **THE OWNER** | Roger Wheeler | B (E3) | Telex chairman; WJA owner; murdered 1981-05-27, Tulsa, at Southern Hills Country Club. |
| **THE BOSTON NETWORK** | James "Whitey" Bulger, Stephen "The Rifleman" Flemmi, Winter Hill Gang (E13–E15) | Post-seal / later-knowledge only; the name becomes visible only when the sealed vantage opens. | A known-but-withheld community across the federal files; never in the initial crowds. |
| **THE LATER WITNESS** | John Martorano (E16) | Sealed bucket only (breakthrough); artifact P8. | 2002 plea/testimony; the hearsay-limited source of the target-sheet chain; appears only as validation. |

Entity anchors (deterministic IDs, from extraction spec §7): `entity:john-callahan`,
`entity:h-paul-rico`, `entity:roger-wheeler`, `entity:world-jai-alai`, `entity:ct-soctf`,
`entity:tulsa-homicide`, `entity:john-martorano`, `entity:brian-halloran`,
`entity:stephen-flemmi`, `entity:whitey-bulger`, `entity:winter-hill`.

---

## 4. Case A State (Initial Crowd)

**Concept.** The Connecticut room: a state licensing & regulatory probe into WJA and its officers.

| Dimension | Content |
|---|---|
| Case | `case:connecticut-jai-alai` — status ACTIVE (status closes only on the disposition note, never during the observed window; extraction spec §2 anchor). Jurisdiction: Connecticut. |
| Investigation | `invest:ct-soctf-licensing` — CT Statewide Organized Crime Task Force licensing probe (E5). |
| Critical early bank | Probe existence (R5 SOCTF→WJA association, `R`), Rico employment (R1, `V`), Callahan presidency (R2, `R`), the Jan-1976 federal background request + silence correspondence (P4, `V` fact), license regulator context (E8, `R`). |
| Presentation evidence (ACT 1, script) | (1) licensing application / corporate prospectus; (2) surveillance log — a destination given (Miami) vs observed travel to Boston; (3) surveillance/intelligence record — separately-established Boston associations; (4) subpoena record — a hearing scheduled, no appearance; disposition `R`: THE PRESIDENT resigned and left the state thereafter. Each line is a defensible observation; none says "went to Boston to meet criminals" (§28). |
| Entities present | THE PRESIDENT (E1), THE SECURITY CHIEF (E2), WJA (E4), SOCTF (E5), CT State Police (E7, `R`), CT Division of Special Revenue (E8, `R`), FBI Boston File Office (E9). Optional `R`: Austin McGuigan (E6). |
| Relationships (encoded) | R1 Rico→WJA organizational (Security Director) `V`; R2 Callahan→WJA organizational `R`; R5 SOCTF→WJA association `R`; R6 SOCTF→Callahan association `V`; R7 FBI Boston→SOCTF communication (withheld response) `V`; R8 FBI Boston→Rico communication (shared federal files) `V`. |
| Evidence packages | P1 House Report excerpts; P3 CT SOCTF file (1975–76) `R`; P4 Jan-1976 correspondence `V`; P2 OPR Exhibit 141 as a *referenced* existence note only (`V` existence, not ingested content); P10 press `R`. |
| What is NOT present | THE BOSTON NETWORK (E13–E15) **not** in the initial graph; federal loan-shark files content (R10) described only as a `LATER_HISTORICAL_KNOWLEDGE` note to the withholding fact; no conspiracy edge. |
| Graph | Case A crowd graph with bridge nodes THE PRESIDENT + THE SECURITY CHIEF. |

**The judge-visible state must render no path whose implied conclusion is "these cases are the
same scandal."** The CT room is a licensing probe; the federal withholding is visible as *silence*,
not as a smoking gun. (Extraction spec §6.2, §11.)

---

## 5. Case B State (Initial Crowd)

**Concept.** The Tulsa room: a homicide investigation with no reason (yet) to reach into the
Connecticut licensing world.

| Dimension | Content |
|---|---|
| Case | `case:tulsa-wheeler` — status ACTIVE. Jurisdiction: Tulsa, Oklahoma; investigating agency Tulsa PD Homicide Unit (E10). |
| Investigation | `invest:tulsa-homicide-unit`. |
| Critical early bank | THE OWNER + ownership chain (E3/E4, R3 `R`), Telex Corporation (E11, R4 `R`), murder circumstances + scene (E18), Tulsa intake (P5 `R`), bridge-node presence (E1/E2 via their WJA roles). |
| Entities present | THE OWNER (E3), WJA (E4), Telex (E11), Southern Hills Country Club (E18), Tulsa PD Homicide (E10), THE PRESIDENT (E1), THE SECURITY CHIEF (E2). |
| Relationships (encoded) | R3 Wheeler→WJA ownership `R`; R4 Wheeler→Telex organizational `R`; bridge contact edges via WJA employment (R1/R2) as *co-employment context*, not as accusation. |
| Evidence packages | P5 Tulsa PD homicide file (1981) `R`; P6 Wheeler business records `R`; P1 House Report excerpts; P10 press `R`. |
| Presentation evidence (ACT 2, script) | (1) Tulsa PD first-responder incident report — one shot, broad daylight, outside the country club; (2) internal audit ledger — the owner suspected money was disappearing, fired THE PRESIDENT, and ordered an audit two months before the murder; (3) state police teletype — investigators looking toward the Boston crime network, with the reason for the connection and how information about the owner reached anyone targeting him unresolved. |
| Referenced but NOT ingested | Boston "silo" material on Brian Halloran (P7) — the existence of a known-other-does-not-have file is noted (as a `LATER` silo annotation), the file's contents are never ingested into Tulsa (extraction spec §12). |
| What is NOT present | No Halloran node past the silo reference in the initial graph (extraction spec §6.4; §12 final crowd); no Connolly (E12) in the murder investigation (`R`); no THE BOSTON NETWORK nodes; no breakthrough edges (R13/R14) anywhere; no THE LATER WITNESS node. |
| Graph | Case B crowd graph; THE SECURITY CHIEF sits inside the security/organization ring, not connected to THE OWNER's routine. |

---

## 6. PHASE 1 State Machine (P1.0 – P1.16)

State definition template — **every** phase-1 state carries all of these fields: STATE ID, NAME,
JUDGE SEES, CASES, ENTITIES, RELATIONSHIPS, EVIDENCE, HYPOTHESIS, GAP, UI SURFACES, PROVIDER DATA,
GRAPH TOPOLOGY, NARRATION, PHYSICAL ACTION, EXIT CONDITION.

---

### P1.0 — Enter the Connecticut Room (seed state)

- **NAME:** Demo open: Case A only.
- **JUDGE SEES:** The CT licensing probe graph and its case board. Cross-case dock is present but
  shows a single workspace.
- **CASES:** Case A only.
- **ENTITIES:** THE PRESIDENT, THE SECURITY CHIEF, WJA, SOCTF (+`R` support agencies).
- **RELATIONSHIPS:** R1, R2, R5, R6, R7, R8 encoded (initial Case A crowd).
- **EVIDENCE:** P1/P3/P4/P2-existence/P10 for Case A.
- **HYPOTHESIS:** none stored.
- **GAP:** none pre-seeded beyond ordinary probe gaps; silence is an honest `FU`, not a hole.
- **UI SURFACES:** investigations list, case board, graph, evidence, observations, leads, gaps,
  timeline (historical clock only), judge page.
- **PROVIDER DATA:** Case A collections for the deterministic Case A namespace (`NS_CASE_A` /
  `NS_SHARED` for E1/E2/E4).
- **GRAPH TOPOLOGY:** Single connected Case A crowd; no Case B node exists yet; no hidden
  relationship anywhere in the fixture.
- **NARRATION:** "You are entering the first investigative context: the Connecticut licensing
  probe of a company called the World Jai Alai fronton."
- **PHYSICAL ACTION:** Page A1 shown (1976 vantage).
- **EXIT CONDITION:** Judge opens the second context (Case B) → P1.1.

### P1.1 — Enter the Tulsa Room

- **NAME:** Case B becomes visible.
- **JUDGE SEES:** The Tulsa homicide board: THE OWNER, the company's ownership ring, the murder
  facts, the investigating unit.
- **CASES:** A + B visible; separate boards.
- **ENTITIES:** Case B crowd (E3, E4, E10, E11, E18; E1/E2 as WJA officers).
- **RELATIONSHIPS:** R3, R4; bridge co-employment only.
- **EVIDENCE:** P5/P6/P1/P10 for Case B; Boston silo existence note (P7) rendered as an
  "known file not in this intake" annotation.
- **HYPOTHESIS:** none stored.
- **GAP:** H1 is first surfaced as a *CANDIDATE* graph hole (Rico ↔ Wheeler schedule; INFERENCE,
  pre-seal). (Extraction spec §13 H1.)
- **UI SURFACES:** case switch; timeline gains the second historical clock; graph now renders two
  islands.
- **PROVIDER DATA:** Case B collections (`NS_CASE_B`; E1/E2/E4 still shared canonical rows).
- **GRAPH TOPOLOGY:** Two disconnected subgraphs sharing exactly three canonical entities (E1/E2/E4).
- **NARRATION:** "The second context is a murder: the owner of the company, shot outside his club
  in Tulsa in 1981."
- **PHYSICAL ACTION:** Page B1 shown (1981 vantage).
- **EXIT CONDITION:** Judge views the cross-case dock → P1.2.

### P1.2 — Shared Bridge Detected

- **NAME:** The cross-case dock activates.
- **JUDGE SEES:** A derived cross-case signal: medium-to-strong `matchScore` between E1↔E1 and
  E2↔E2, phrased as opportunity — *"these investigations may warrant comparison"* — never
  "these investigations are connected." (Extraction spec §6.2, §19.)
- **CASES:** A + B.
- **ENTITIES:** E1, E2 (shared), E4 (shared org).
- **RELATIONSHIPS:** no new edges; only a computed `CrossCaseMatch` row.
- **EVIDENCE:** unchanged.
- **HYPOTHESIS:** none stored; the dock explicitly does not conclude.
- **GAP:** none new.
- **UI SURFACES:** cross-case matrix / graph dock overlays.
- **PROVIDER DATA:** `CrossCaseProvider.listMatches` + `listForeignOverlays`; match rows are
  computed/derived, not literal extraction content (§19).
- **GRAPH TOPOLOGY:** THE SPARK (script ACT 4) — the security-chief cell lights up at the
  intersection of the two investigative contexts; the company cell is muted as known context; no
  new edges.
- **NARRATION:** "Two investigations, and the only clear overlap is two people and the company
  itself. The company overlap is unremarkable. The people are not."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge inspects the bridge members → P1.3.

### P1.3 — Bridge-As-Company Foreclosed

- **NAME:** Same company is common infrastructure.
- **JUDGE SEES:** INDAGO explicitly classifies the E4 (WJA) overlap as **common, expectable
  infrastructure** — the AI discovery must NOT be "same company."
- **CASES:** A + B.
- **ENTITIES:** E4 flagged; E1/E2 remain the interesting overlap.
- **RELATIONSHIPS:** unchanged.
- **EVIDENCE:** unchanged.
- **HYPOTHESIS:** a *candidate idea* is framed by the analyst UI (not a stored hypothesis yet):
  the connective tissue is **people inside the organization's security function**.
- **GAP:** none new.
- **UI SURFACES:** graph annotation layer; observation cards for co-employment.
- **PROVIDER DATA:** no structural change; a `DERIVED_BY_DEMO_LOGIC` focus rule suppresses the
  company-name red herring.
- **GRAPH TOPOLOGY:** unchanged.
- **NARRATION:** "The license and the murder are different boards. INDAGO will not waste the
  judge's attention on the expected overlap — the company name. It concentrates on what is
  unusual: the people."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Analyst drafts the Phase 1 hypothesis → P1.4.

### P1.4 — Phase 1 Hypothesis Drafted & Stored

- **NAME:** The formal hypothesis enters the case.
- **JUDGE SEES:** A `Hypothesis` record with the exact Phase 1 wording (below), status
  `CANDIDATE`/`PROPOSED`, `confidence`/`score` fields all `DERIVED_BY_DEMO_LOGIC`.
- **CASES:** A + B (shared hypothesis workspace).
- **ENTITIES:** E1, E2, E4, E3 (context).
- **RELATIONSHIPS:** no edge changes; hypothesis references R1/R2/R6-R8 as supporting rows.
- **EVIDENCE:** P1/P4 remain the grounding packages; nothing new ingested yet.
- **HYPOTHESIS:** **THE PHASE 1 HYPOTHESIS (exact wording)** —
  > "The company's internal security function may have provided an information/operational
  > pathway connecting the World Jai Alai network to the people surrounding the Wheeler homicide."
- **GAP:** none new; H1/H2 remain open (`INFERENCE`).
- **UI SURFACES:** judge page hypothesis panel; evidence/observations side panel; robustness dock.
- **PROVIDER DATA:** Hypothesis collection row (id `hyp:p1-connective-pathway` in a `NS_DEMO` /
  shared namespace); `relatedEvidenceIds` extracted.
- **GRAPH TOPOLOGY:** unchanged.
- **NARRATION:** "INDAGO does not conclude. It hypothesizes: the company's internal security
  function may be the pathway that connects these two worlds."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge runs the reverse-hypothesis test → P1.5.

### P1.5 — Hypothesis Tested Against Encoded Observations

- **NAME:** Compute the evidentiary posture.
- **JUDGE SEES:** `SUPPORTING / CONTRADICTING / UNRESOLVED` observation sets for the Phase 1
  hypothesis, computed by the reverse-hypothesis engine from the *encoded* observations. No
  truth/confidence verdict.
- **CASES:** A + B.
- **ENTITIES:** unchanged.
- **RELATIONSHIPS:** unchanged.
- **EVIDENCE:** supporting = employment/probe/federal-sharing rows (R1/R2/R6-R8); unresolved =
  schedule/access rows that would tie the security function to the homicide context.
- **HYPOTHESIS:** status still `CANDIDATE`; `confidence` derived.
- **GAP:** the unresolved set points at H1/H2.
- **UI SURFACES:** reverse-hypothesis verdict panel (`testHypothesis` → `HypothesisAssessment`).
- **PROVIDER DATA:** `DemoIntelligenceProvider.testHypothesis` over `state.observationById` +
  `HYPOTHESIS_ALIASES`; classifications SUPPORTING/CONTRADICTING/UNRESOLVED.
- **GRAPH TOPOLOGY:** unchanged.
- **NARRATION:** "Here is what the encoded record says *for* the pathway and what it cannot yet
  say."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** The judge drills into the security-function role → P1.6.

### P1.6 — The Security Function Is Flagged

- **NAME:** The hidden relationship is a role, not a shotgun.
- **JUDGE SEES:** THE SECURITY CHIEF lifted as a **high-value role node** — the only
  bridge-adjacent role with no encoded link to the homicide context. This is a structural
  derivation (missing-edge significance), never an accusation.
- **CASES:** A + B.
- **ENTITIES:** E2 promoted to role focus; `EntityRoleHypothesis` (FBI-era vs WJA-era) on the one
  canonical entity — **not** a second entity, **not** `RESOLVED_MATCH` fanfare (extraction spec
  §6.3).
- **RELATIONSHIPS:** R13 (Rico→Wheeler schedule) must still be **absent** here.
- **EVIDENCE:** none new.
- **HYPOTHESIS:** Phase 1 hypothesis strengthens to `SUPPORTED`-leaning *only via derived
  structural signal* (`strength` = computed; `support` tracked separately).
- **GAP:** H1 (schedule supply) significance marked high (structural) — still unfilled.
- **UI SURFACES:** graph role-highlight; entity detail; entity-resolution dock.
- **PROVIDER DATA:** Entity/role collections; graph `structuralImportance` computed; no fixture
  seeding of the outcome (extraction spec §17 guard).
- **GRAPH TOPOLOGY:** E2 node emphasized; still zero edges to THE OWNER's routine; an emerging
  Boston-investigative-context node (case-link entity) renders edge-less except where encoded
  (script ACT 5).
- **NARRATION:** "The security chief is a former federal agent who now runs the company's
  internal security. Of every person shared between these cases, his role is the one with no
  bridge — and the one with the access."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Graph-hole engine highlights the missing edge → P1.7.

### P1.7 — Graph Hole Surfaced

- **NAME:** H1 — the missing schedule edge.
- **JUDGE SEES:** Graph hole **H1** — `MISSING_EDGE / BROKEN_CHAIN`: the owner's routine and the
  security chief have no documented connection in the pre-seal record. Presented as an
  *analytical artifact*, not evidence a conspiracy hid data.
- **CASES:** A + B.
- **ENTITIES:** E2, E3 at the hole ends.
- **RELATIONSHIPS:** H1 is the candidate missing edge (Rico↔Wheeler schedule).
- **EVIDENCE:** the hole cites the absence, honestly.
- **HYPOTHESIS:** unchanged.
- **GAP:** gap AG1 (missing-data / evidence request) is raised tied to the hole
  (`investigationGapId` linkage, extraction spec §13).
- **UI SURFACES:** gaps + evidence-request boards; graph hole visual (overlay, not a live edge).
- **PROVIDER DATA:** GraphHole/GraphAnalysis + Gap/EvidenceRequest collections; hole fields carry
  no `isCriminal`/`isHiddenByCriminal`.
- **GRAPH TOPOLOGY:** hole overlay only; no phantom edge.
- **NARRATION:** "The graph is honest about its shape: the one connection the pathway hypothesis
  needs is the one the visible record does not show."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge requests next best evidence → P1.8.

### P1.8 — Next Best Evidence (Phase 1)

- **NAME:** What should the demo ask the record for?
- **JUDGE SEES:** A derived, `DERIVED_BY_DEMO_LOGIC` next-best-evidence proposal for Phase 1: an
  evidence class that would establish the security function's **operational role** — corporate/
  personnel/internal-security records of the company (access, schedule, reporting chain) — with an
  `expectedInformationValue`, priority, and supporting/contradicting expectation rows.
- **CASES:** A + B.
- **ENTITIES:** E2 (target entity).
- **RELATIONSHIPS:** expected edge type: association/organizational (role authority) + the
  candidate schedule pathway.
- **EVIDENCE:** proposal lists the corporate/ledger artifact class (this is the Phase 1 live
  artifact).
- **HYPOTHESIS:** unchanged.
- **GAP:** gap AG1 advanced to `REQUEST_EVIDENCE`.
- **UI SURFACES:** evidence-request cards; lead board.
- **PROVIDER DATA:** EvidenceRequest (with `EvidenceUtility`), Lead (`priority`/`confidence`
  derived, `relatedEvidenceIds` extracted).
- **GRAPH TOPOLOGY:** unchanged.
- **NARRATION:** "INDAGO proposes the smallest piece of the record that could change the picture:
  the company's own internal security record."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** The judge moves to satisfy the request → P1.9.

### P1.9 — The Ledger Is Presented

- **NAME:** Physical artifact enters the room.
- **JUDGE SEES:** The Phase 1 artifact: **one sealed/corporate-record page** (see §29.1).
- **CASES:** A + B.
- **ENTITIES:** E2; artifact bound to the security function.
- **RELATIONSHIPS:** none yet — the artifact has NOT been ingested.
- **EVIDENCE:** artifact presented on the physical page before any digital mutation.
- **HYPOTHESIS:** unchanged (no score moves yet).
- **GAP:** unchanged.
- **UI SURFACES:** artifact preview overlay; evidence submission CTA.
- **PROVIDER DATA:** no provider mutation.
- **GRAPH TOPOLOGY:** unchanged.
- **NARRATION:** "Here is a company record from the era. It has not been digitized into INDAGO yet.
  The judge will now feed it to the system while you watch."
- **PHYSICAL ACTION:** Page **L1** (Phase 1 ledger / corporate record) physically shown, labeled
  as a real-or-extract artifact per §29.
- **EXIT CONDITION:** Judge submits the artifact → **P1.10 (LIVE EVIDENCE INGESTION)**.

### P1.10 — LIVE EVIDENCE INGESTION (Phase 1 Ledger Contract)

**This is the critical Phase 1 transition. Full contract in §13.**

- **NAME:** The ledger enters INDAGO as a new evidence object — live, not preloaded.
- **JUDGE SEES:** The submit path runs in real time: progress, then the event ledger streaming
  real transitions (`EVIDENCE_INGESTED`, `OBSERVATION_EXTRACTED`, `ENTITY_CREATED`,
  `GRAPH_HOLE_DETECTED`, `GAP_IDENTIFIED`), then the graph visibly mutating.
- **CASES:** A + B (artifact ingested under the Case A/company namespace; its observations bridge
  where the derived node lands).
- **ENTITIES:** extraction **creates** zero new persons; it may create record-level nodes
  (e.g., a schedule/security-log artifact entity) and re-asserts E2.
- **RELATIONSHIPS:** the ledger's observations encode the security function's operational role
  (authority to control access to reporting/schedule) — this is the fill candidate for H1, added
  as a **new candidate edge** (`support` low-moderate), never as truth.
- **EVIDENCE:** new `Evidence` row (status `INGESTED → PROCESSED`), new `Source` + `Artifact`
  rows, new `Observation` rows — all through the normal submission builders.
- **HYPOTHESIS:** the hypothesis's `supportingEvidenceIds`/`resolvedEvidenceIds` update from the
  new observations; `confidence` re-derived.
- **GAP:** gap AG1/H1 marked fillable; resolution status `CANDIDATE-RESOLVED` pending judge
  acceptance (relation authority route), **not** auto-cleared.
- **UI SURFACES:** evidence submission UI; ledger page; realtime event stream; graph canvas
  animated by the realtime overlay catalog.
- **PROVIDER DATA:** `DemoEvidenceProvider.submit` (deterministic ids via `demoSubmissionIds`),
  `addDemoSessionEvidence`, `logDemoEvent`, then the `upload` named sequence via
  `triggerSequence("upload")` + `getOverlayCatalog()` node/edge/hole catalog rows — the existing
  seam (§23), scaled to this artifact. Exact before/after in §13.
- **GRAPH TOPOLOGY:** G4 → G5 (§27); belongs to the realtime overlay catalog, persisting into the
  per-workspace store on submission.
- **NARRATION:** "The system is reading a company record the room didn't have five minutes ago.
  Watch what it makes of it."
- **PHYSICAL ACTION:** L1 page consumed.
- **EXIT CONDITION:** Ingestion events drain; judge reviews the extracted observations → P1.11.

### P1.11 — Post-Ingestion Reconciliation

- **NAME:** Before/after is visible.
- **JUDGE SEES:** A side-by-side (or versioned) graph comparison and the observation list the
  ledger produced. The Phase 1 hypothesis now has real, sourced support rows — and the engine
  still does NOT declare a verdict.
- **CASES:** A + B.
- **ENTITIES:** unchanged count of persons; + artifact/record node(s).
- **RELATIONSHIPS:** H1 fill edge present as `PROPOSED`/`SUPPORTED` only after a judge-accept
  (PR-8 route); the disposition mirrors the relation lifecycle (accept/reject/reverse).
- **EVIDENCE:** new evidence visible in the evidence board.
- **HYPOTHESIS:** support posture computed from the new set.
- **GAP:** AG1 stays open until judge accepts; a `MISSING_DATA` gap class remains because the
  record is security-function internal, not homicide evidence.
- **UI SURFACES:** graph versioned view; evidence/observations boards; ledger timeline band.
- **PROVIDER DATA:** state mutation visible through normal list/get queries; graph versions
  appended deterministically.
- **GRAPH TOPOLOGY:** G5 fully materialized.
- **NARRATION:** "That is the change the record makes: the security function had the access the
  pathway hypothesis described. It is a supported fact — not a solved murder."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge runs the reassessment → P1.12.

### P1.12 — Reassessment

- **NAME:** Support, recomputed.
- **JUDGE SEES:** The Phase 1 hypothesis re-scored from the union of old + ingested observations:
  `SUPPORTING` grows; `CONTRADICTING` empty-or-minimal; `UNRESOLVED` shows exactly what the ledger
  cannot establish (any link to the homicide's people). No number equals confidence-in-truth.
- **CASES:** A + B.
- **ENTITIES:** unchanged.
- **RELATIONSHIPS:** the candidate fill edge evaluated.
- **EVIDENCE:** unchanged.
- **HYPOTHESIS:** status moves to `SUPPORTED` (evidentially-tied, never `PROVEN`).
- **GAP:** AG1 cleared; H2's medium gap and H3's record-gap remain.
- **UI SURFACES:** reverse-hypothesis panel re-run; robustness dock.
- **PROVIDER DATA:** `testHypothesis` re-run over the mutated store; `recordHypothesisDecision`
  trail appended (decision, not conviction).
- **GRAPH TOPOLOGY:** G6.
- **NARRATION:** "Phase 1 has its result: the pathway is supported by what the company record and
  the federal silence encode. That is an investigative conclusion — and the demo is only halfway."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge opens the counter-evidence pass → P1.13.

### P1.13 — Counter-Evidence Pass

- **NAME:** Force the honest contrary reading.
- **JUDGE SEES:** Mandatory counter-evidence candidates, genuinely sourced, never invented
  balance:
  - **C1** — no-day-one-theft: absence of early-skimming evidence vs "theft began on hiring"
    (`TEMPORAL_IMPOSSIBILITY`, weak) — guards the security role from being over-read as
    conspiracy.
  - **C2** — the record shows THE SECURITY CHIEF *learned of* the probe, not that he *warned*
    anyone: `SOURCE_CREDIBILITY`/`INCOMPLETE_INFORMATION` item; the "warned" reading is an
    analyst-labeled `INFERENCE`, never an observed fact.
- **CASES:** A + B.
- **ENTITIES:** unchanged.
- **RELATIONSHIPS:** unchanged.
- **EVIDENCE:** CounterEvidenceReport rows; hypothesis `contradictingEvidenceIds` populated.
- **HYPOTHESIS:** can reach `CHALLENGED`/`INCONCLUSIVE`; never defeated-for-drama `REFUTED`.
- **GAP:** none new.
- **UI SURFACES:** counter-evidence panel integrated with the hypothesis verdict.
- **PROVIDER DATA:** CounterEvidence collections; `hypothesisStatus` computed only.
- **GRAPH TOPOLOGY:** unchanged.
- **NARRATION:** "INDAGO obliges itself to the hardest reading: what would weaken this? Here is
  what the record genuinely raises against it."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge completes the pass; the prediction is frozen → P1.14.

### P1.14 — Prediction Freeze (the seal stays closed)

- **NAME:** The prediction is recorded; history is withheld.
- **JUDGE SEES:** The frozen Phase 1 prediction (hypothesis + derived posture) saved to the
  decision trail. The sealed later account remains in the room, acknowledged but **unopened** —
  script ACT 0 transition: *"We know how part of this was later described in a courtroom neither
  of these investigations ever reached. Not yet."*
- **CASES:** A + B (breakthrough bucket still sealed).
- **ENTITIES:** unchanged — E16 THE LATER WITNESS does **not** exist yet.
- **RELATIONSHIPS:** none new; no hearsay edges (R13/R14) anywhere until the ACT 14 reveal.
- **EVIDENCE:** unchanged; the later-testimony artifact is announced but not shown.
- **HYPOTHESIS:** Phase 1 posture `SUPPORTED (caveated)` frozen as the prediction. (`recorded`,
  never reopened without new evidence.)
- **GAP:** H1 filled-with-caveat (the ledger-derived fill edge, P1.11); validation deferred.
- **UI SURFACES:** decision-trail freeze panel; a "sealed · not yet" marker on the pending page.
- **PROVIDER DATA:** `recordHypothesisDecision` trail written; the `validate.ts` fence holds —
  zero references from any non-sealed fixture to any breakthrough id (extraction spec §15).
- **GRAPH TOPOLOGY:** G6 — hole fills finalized-with-caveat; **no** hearsay edges yet
  (they render only at the ACT 14 validation, §16/P2.14).
- **NARRATION:** "The prediction is recorded. There is a sealed account of part of this story,
  from a courtroom neither of these investigations ever reached. It stays closed — not yet."
- **PHYSICAL ACTION:** the envelope is marked, not opened.
- **EXIT CONDITION:** Judge advances on the frozen prediction → P1.15.

### P1.15 — Phase 1 Synthesis

- **NAME:** The connective tissue is established.
- **JUDGE SEES:** A synthesis panel: the Phase 1 claim, its support posture, its caveats, and the
  explicit statement that the discovery is a *relationship/pathway*, not a verdict.
- **CASES:** A + B.
- **ENTITIES:** unchanged.
- **RELATIONSHIPS:** consolidated list with statuses; hearsay edges still sealed (R13/R14 appear
  only at the ACT 14 validation, §16/P2.14).
- **EVIDENCE:** ledger + testimony artifact statuses final.
- **HYPOTHESIS:** final Phase 1 posture `SUPPORTED (caveated)`.
- **GAP:** H1 filled-with-caveat; H2 medium-open; H3 (financial gap) honest-absent.
- **UI SURFACES:** synthesis/judge board.
- **PROVIDER DATA:** fence re-run (no leaks); decision trail written.
- **GRAPH TOPOLOGY:** final Phase 1 topology frozen as a graph version.
- **NARRATION:** "Phase 1 done: these two worlds connect through the people in the company's
  security function — a connection history later acknowledged, weakly. Now the harder question."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge advances → P1.16.

### P1.16 — Phase 1 Exit

- **NAME:** Phase transition.
- **JUDGE SEES:** A one-screen recap of the Phase 1 journey (states, derived signals, caveats) and
  the prompt: **PHASE 2 — EXPLAIN. Why was the owner killed?**
- **CASES:** A + B.
- **ENTITIES:** unchanged.
- **RELATIONSHIPS:** unchanged.
- **EVIDENCE:** unchanged.
- **HYPOTHESIS:** Phase 1 hypothesis closed (remains editable via challenge).
- **GAP:** unchanged.
- **UI SURFACES:** phase banner; navigation to the Phase 2 board.
- **PROVIDER DATA:** none new.
- **GRAPH TOPOLOGY:** the P1 final graph becomes Phase 2's starting graph.
- **NARRATION:** "The connect is established. The explain begins."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge opens Phase 2 → **P2.0**.

---

## 7. Phase 1 Hypothesis (exact wording)

> "The company's internal security function may have provided an information/operational pathway
> connecting the World Jai Alai network to the people surrounding the Wheeler homicide."

Semantics obligations:
- The **subject** of the hypothesis is the *security function*; THE SECURITY CHIEF is its visible
  operator, a **high-value role**, not "the murderer."
- "May have provided an information/operational pathway" is deliberately modal — it does not claim
  the pathway's purpose or outcome.
- The hypothesis must be re-scored only from encoded observations via the reverse-hypothesis
  engine; it is never `SUPPORTED` by a fixture-seeded flag (extraction spec §17 guard).
- Nothing about the hypothesis implies the company *as a company* is the connection; that reading
  is closed at P1.3.

---

## 8. Phase 1 Evidence FOR

| Evidence | Tag | What it supports |
|---|---|---|
| R1 — THE SECURITY CHIEF hired as WJA Director of Security shortly after FBI retirement | `V` (§III.B.3 p.89) | Security-function existence; former-federal background |
| R8 — Federal files shared with THE SECURITY CHIEF (not CT) | `V` (§III.B.6 p.96) | Inside-channel access to federal knowledge |
| R6 — CT request on THE PRESIDENT + R7 — silence | `V` | The CT blind spot; the federal bar intervened |
| R9 — THE SECURITY CHIEF's handling relationship with THE BOSTON NETWORK (1964–75) | `V` (OPR Exhibit 141) | Bridge to an outside network — LATER-contextualized, never initial-evidence weighted |
| L1 ledger (Phase 1 corporate record) | real/extract artifact | Operational authority of the security function (schedule/access/reporting) |
| Bahamas expense outlier (ACT 5, script) | script-cited financial observation | A corporate-record expense entry, shortly before the murder, for company funds used to entertain active FBI agents in the Bahamas. Flagged as a financial pattern / anomaly contributing to the evidence picture — **not** proof of bribery, conspiracy, or murder coordination (§28). |

## 9. Phase 1 Evidence AGAINST / Contradicting

| Evidence | Tag | What it weakens |
|---|---|---|
| C1 — no-day-one-theft absence | OBSERVED-absence | Over-reading the security role as *profit* conspiracy from hiring date |
| C2 — "THE SECURITY CHIEF warned THE PRESIDENT" | INFERENCE (unsupported as fact) | The inferred warning step; only *learning of* the probe is observed |
| H5 — post-1975 skimming gap | honest `TEMPORAL_GAP`/`FINANCIAL_GAP` | Any claim that the pathway's purpose was financial in the observed window |
| The hearsay limitation itself (P8) | `SOURCE_CREDIBILITY` | Converting the pathway into a *proven* supply chain |

---

## 10. Phase 1 Graph Hole

**H1 — the missing schedule edge** (`MISSING_EDGE`/`BROKEN_CHAIN`, extraction spec §13):
- **Evidence for it:** THE OWNER has a known routine; THE SECURITY CHIEF controls security;
  no pre-2022 source ties them.
- **Significance:** high (structural).
- **Suggested fill:** corporate/internal-security records (→ the Phase 1 ledger).
- **Post-fill posture:** fill edge added only as a candidate; `UNRESOLVED` insisted per the
  hearsay chain (§6/P1.14). H1 "resolves-with-caveat," never as fact.
- **Honesty clause:** a detected hole is an *analytical artifact*, never evidence a conspiracy hid
  data (§6.4 note).

Related holes carried through Phase 1: H2 (president–security loop, medium), H3 (CT federal blind
spot, observed the withholding), H5 (skimming gap, absent-by-honesty).

---

## 11. Phase 1 Next Best Evidence

**Stage 1 (Phase 1). Purpose: test the hidden relationship.**

| Field | Value |
|---|---|
| Question | "Did the company's internal security function hold operational authority over the owner's routine (schedule/access/reporting)?" |
| Evidence class | The company's internal security, communication, and financial records for the relevant period (script ACT 7) — the **ledger artifact** is the internal-security/corporate-record portion (§13). |
| Target entity | THE SECURITY CHIEF (E2) |
| Time window | 1975–1981, source precision as held |
| Expected information value | High — directly marks the fill edge for H1 |
| If SUPPORTED | Pathway hypothesis gains sourced support; fill edge `PROPOSED` → judge-accept → `ACTIVE` |
| If CONTRADICTED | Hypothesis weakens toward `INCONCLUSIVE`/`CHALLENGED`; demo continues honestly (no fiat) |
| If UNRESOLVED | H1 stays open; the demo proceeds to Phase 2 with the gap visible |

Derivation: proposed by demo logic from the graph hole + hypothesis unresolved set
(`DERIVED_BY_DEMO_LOGIC`), never hand-authored into a fixture as a "true" score.

---

## 12. Phase 1 LIVE EVIDENCE CONTRACT — the ledger must answer these ten questions

The live upload **must** be a real historical artifact or an exact, source-grounded extraction. If
only an extract exists, the artifact row says so explicitly. The demo never fabricates a document.
The contract binds the implementation pass to specify, per artifact, answers to the following — the
**exact before/after** the demo must show:

1. **What is the artifact?** Identity — `sourceId`, `evidenceId`, `artifactIds` (from
   `demoSubmissionIds`), display title, provenance (`{ sourceId, extractor }`), file name, MIME,
   size.
2. **What is its historical date?** Which clock does it belong to (observed/historical), with what
   precision — never an invented day.
3. **What observations are extracted?** Exact `Observation` rows (id, type, entityIds, content,
   observedAt, source/page ref).
4. **What entities are resolved or created?** Zero new persons; record/artifact nodes allowed;
   each with canonical entity rows.
5. **What relationship(s) do the observations support?** Exact `RelationHypothesis` rows and their
   `support`/`strength` intent before any judge action.
6. **What edges change before→after?** Exact graph edge rows: ids, source/target node ids,
   relationType, status, `createdAt`, `updatedAt`. Include the "no change" claim for every edge
   that must NOT move.
7. **What hypothesis status changes?** The Phase 1 hypothesis's supporting/contradicting/
   unresolved/evidence-id sets as computed — with the note "computed, not seeded."
8. **What gap/lead is created or resolved?** AG1/H1 status transition; any `Lead` created.
9. **What remains unresolved?** Statement of what the artifact cannot establish (e.g., no homicide
   link, no motive).
10. **What does the event ledger emit?** Exact ordered `DemoStreamEvent`s (action, target, delay)
    produced during ingestion — matching actual state transitions (§23).

Hard rules: the change is a **data mutation** (records added to the per-workspace store via the
normal submit path), never a `false → true` boolean on a pre-existing record; nothing is
pre-written as a fake transcript; the artifact is ingested in **demo ingestion time** while its
content refers to **historical time**.

---

## 13. Phase 1 Graph Before / After (G4 → G5)

**BEFORE (G4, immediately pre-ingestion):**
- Nodes: Case A/B crowds; E2 (THE SECURITY CHIEF) with zero edges to THE OWNER (E3).
- Edges: R1, R2, R5–R8 (Case A), R3, R4 (Case B) — statuses `ACTIVE`.
- Holes: H1 open (overlay only). No edges to E3's routine in any direction.
- No evidence/observation/artifact rows referencing the ledger exist.

**AFTER (G5, post-ingestion + judge accept):**
- Added nodes: artifact/record node(s) for the ledger (e.g., security-log/schedule record) — no
  new person nodes.
- Added observation rows: the ledger's extracted facts, each referencing the new evidence + the
  existing source.
- **Added edge (the fill candidate):** E2 → THE OWNER's-routine (through the record node), type
  `association`/`organizational`, `support` low-moderate, status `PROPOSED` → `ACTIVE` only upon a
  judge `accept` via the PR-8 relation-authority route. On accept it is a *supported role access*,
  not a murder link.
- Status flicker prevented: H1's fill is one edge; the hearsay pathway edges (R13/R14) are still
  absent here.
- The realtime overlay catalog + per-workspace store reconcile so a refetch shows the same rows
  (no divergence between live canvas and persisted state).

---

## 14. Phase 1 Historical Validation (later-knowledge overlay)

- The prediction is **frozen at P1.14**; the validation material is **withheld until ACT 14 /
  P2.14** (script ACT 14), so it never influences the pre-seal or pre-reveal posture.
- Content at reveal: Page V1 — the **historical testimony excerpt** (script ACT 14), i.e., P8
  excerpts from THE LATER WITNESS's 2002 plea/testimony, bound to the hearsay chain: target sheet
  ← THE PRESIDENT ← (attribution) THE SECURITY CHIEF; never met; security chief died in custody
  Jan 2004; single-source hearsay; `UNRESOLVED` persists post-seal (extraction spec §15).
- The reveal presents **two separate things** (script ACT 14): INDAGO's evidence-driven
  reconstruction, and the later historical record used to test it.
- Rendering rules (extraction spec §10 class 5 / §20):
  - Distinct "LATER HISTORY" band in the timeline; never merged into 1981/82 flags.
  - The validation screen explicitly states what the testimony **establishes** (the chain exists
    in one witness's account) and what it **does not** (call chain unverified; no criminal
    finding; no corroboration).
  - Boss-narration tone: neutral, "this is what the later testimony establishes, and does not" —
    no confetti reveal.
- A validation pass that contradicts the prediction must be shown plainly (honest handling, same
  rules as the support case).

---

## 15. Phase 2 Starting State

Phase 2 opens with the **P1 final graph + state** (§6/P1.16) and introduces the central question.

| Dimension | Content |
|---|---|
| Central question | **"Why was Wheeler killed?"** |
| Inherited posture | Pathway hypothesis `SUPPORTED (caveated)`; H1 filled-with-caveat; the sealed later account stays **closed** until the ACT 14 validation reveal; the company-name red herring already closed. |
| Sealed bucket | E16 / P8 / R13–R14 remain sealed; they are released **only at the ACT 14 validation** (script ACT 14, §16/P2.14) — evidence of a chain, never a label on motive. |
| Gaps carried | H2 (president–security loop, medium), H3 (federal blind spot), H5 (skimming gap, absent-by-honesty). |
| New analytical requirement | Motive must be explained through competing hypotheses derived from the encoded record — never one forced "truth." |

---

## 16. Phase 2 State Machine (P2.0 – P2.15)

The same state template applies (STATE ID, NAME, JUDGE SEES, CASES, ENTITIES, RELATIONSHIPS,
EVIDENCE, HYPOTHESIS, GAP, UI SURFACES, PROVIDER DATA, GRAPH TOPOLOGY, NARRATION, PHYSICAL ACTION,
EXIT CONDITION).

---

### P2.0 — The Question Is Posed

- **NAME:** Phase 2 opening.
- **JUDGE SEES:** The recap of Phase 1, then the explicit prompt: **"Why was Wheeler killed?"**
- **CASES:** A + B.
- **ENTITIES:** E1–E3 (E16 still sealed; referenced only as the sealed later account).
- **RELATIONSHIPS:** inherited; no changes.
- **EVIDENCE:** all Phase 1 packages; no open-seal excerpts yet.
- **HYPOTHESIS:** none new yet.
- **GAP:** unchanged.
- **UI SURFACES:** phase banner; judge board question module.
- **PROVIDER DATA:** none new.
- **GRAPH TOPOLOGY:** P1 final graph (frozen version) as Phase 2 base.
- **NARRATION:** "Connect has told us who. Explain must tell us why — and INDAGO will hold three
  competing accounts, not one answer."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge drafts the motive landscape → P2.1.

### P2.1 — The Three Motive Hypotheses Are Drafted

- **NAME:** H1/H2/H3 entered.
- **JUDGE SEES:** Three `Hypothesis` records, all status `CANDIDATE`, none favored:
  - **H1 — Protect the financial operation.** The owner posed a threat to the company's financial
    operation (exposure/audit), and the security function's network acted to protect it.
  - **H2 — Regain / keep control.** The owner had removed THE PRESIDENT and asserted control over
    the company; the surrounding network acted to restore/keep operational control after that
    removal.
  - **H3 — Personal retaliation.** A personal/other grievance against the owner (unrelated to the
    operation) — the competing, lowest-signal reading.
- **CASES:** B-leaning (owner's context) with A/B connective context.
- **ENTITIES:** E3 (subject), E1/E2 (actors), E16 (still sealed; not yet present as a node).
- **RELATIONSHIPS:** unchanged.
- **EVIDENCE:** existing packages only.
- **HYPOTHESIS:** three rows; scoring derived later.
- **GAP:** the motive-distinguishing gap emerges implicitly.
- **UI SURFACES:** hypothesis comparison dock.
- **PROVIDER DATA:** Hypothesis collection rows for H1/H2/H3.
- **GRAPH TOPOLOGY:** unchanged.
- **NARRATION:** "Three explanations, each of which the record can test against itself. INDAGO
  will not pick for you."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge tests all three → P2.2.

### P2.2 — All Three Tested Against the Record

- **NAME:** Compute three postures.
- **JUDGE SEES:** SUPPORTING / CONTRADICTING / UNRESOLVED sets per hypothesis, computed from
  encoded observations. No truth verdict; ordering is not conclusion.
- **CASES:** A + B.
- **ENTITIES:** unchanged.
- **RELATIONSHIPS:** unchanged.
- **EVIDENCE:** existing packages.
- **HYPOTHESIS:** each now has a computed posture; all remain `CANDIDATE`.
- **GAP:** none new.
- **UI SURFACES:** reverse-hypothesis verdict panel, three tabs.
- **PROVIDER DATA:** `testHypothesis` × 3 over the store + aliases.
- **GRAPH TOPOLOGY:** unchanged.
- **NARRATION:** "Three portraits, sketched by the same record. None of them has won yet."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge inspects the strongest-distinguished dimension → P2.3.

### P2.3 — H1 Depth Pass (Protect the Financial Operation)

- **NAME:** H1 examined.
- **JUDGE SEES:** What supports H1 (the Case B audit record — money disappearing, audit ordered
  two months before the murder; the withheld federal files; the ledger-derived information
  pathway), what contradicts it (no day-one-skimming; no observed audit-threat document yet — some
  relationships have legitimate explanations), what stays unresolved (what exactly the owner was
  uncovering — the Phase 2 evidence request).
- **CASES:** A + B.
- **ENTITIES:** E1/E2/E3/E4.
- **RELATIONSHIPS:** unchanged.
- **EVIDENCE:** P1/P4/P8 + ledger.
- **HYPOTHESIS:** H1 posture updated.
- **GAP:** financial gap H5 referenced honestly.
- **UI SURFACES:** hypothesis focus panel.
- **PROVIDER DATA:** unchanged.
- **GRAPH TOPOLOGY:** unchanged (no forced edges).
- **NARRATION:** "H1 says the operation had to be protected from the owner. The record supports a
  protected operation — it does not yet show the owner as the threat."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge moves → P2.4.

### P2.4 — H2 Depth Pass (Regain / Keep Control)

- **NAME:** H2 examined.
- **JUDGE SEES:** What supports H2 (the Case B record — the owner removed THE PRESIDENT and
  ordered the audit; the state police teletype pointing toward the Boston network), what
  contradicts it (no pre-seal decision-edge), what stays unresolved (whether the removal motivated
  action, and by whom).
- **CASES:** A + B.
- **ENTITIES:** E1/E2/E3/E4.
- **RELATIONSHIPS:** the removal-edge is encoded **only** as a later-knowledge annotation with its
  `derivedFrom`, not as an initial edge.
- **EVIDENCE:** P1/P5/P6/P8.
- **HYPOTHESIS:** H2 posture updated.
- **GAP:** H2 (president–security loop) referenced.
- **UI SURFACES:** hypothesis focus panel; cross-case context.
- **PROVIDER DATA:** unchanged.
- **GRAPH TOPOLOGY:** unchanged.
- **NARRATION:** "H2 says control — of the company and the operation — had to be restored after
  the owner took it away. The record shows the removal; it does not show the shooter."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge moves → P2.5.

### P2.5 — H3 Depth Pass (Personal Retaliation / Other)

- **NAME:** H3 examined.
- **JUDGE SEES:** The record's support for a personal/other motive is **weakest by honest
  signal**: little encoded evidence, no distinct observation set; presented as the low-priority
  alternative so the judge can compare, never as a straw man to be knocked over.
- **CASES:** B-leaning.
- **ENTITIES:** E3 (subject).
- **RELATIONSHIPS:** unchanged.
- **EVIDENCE:** existing packages.
- **HYPOTHESIS:** H3 posture updated (lowest derived support).
- **GAP:** a genuine personal-motive record gap, honestly stated.
- **UI SURFACES:** hypothesis focus panel.
- **PROVIDER DATA:** unchanged.
- **GRAPH TOPOLOGY:** unchanged.
- **NARRATION:** "H3 — the personal-account reading — is where the record is thinnest. INDAGO
  keeps it visible so the comparison is honest."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge compares all three → P2.6.

### P2.6 — Comparison & Distinguishing Need

- **NAME:** What does not separate H1 from H2.
- **JUDGE SEES:** A computed comparison: H1 and H2 overlap on the same supporting observations
  (the protected operation IS the control stake; the owner's removal is the threat), and the record
  has **no discriminating evidence** yet. The engine derives what kind of evidence would separate
  them.
- **CASES:** A + B.
- **ENTITIES:** unchanged.
- **RELATIONSHIPS:** unchanged.
- **EVIDENCE:** unchanged.
- **HYPOTHESIS:** postures recomputed; the H1/H2 blur itself is the finding.
- **GAP:** a motive-distinguishing gap is derived.
- **UI SURFACES:** comparison matrix; evidence-utility panels.
- **PROVIDER DATA:** derived comparison rules (no hand-authored match).
- **GRAPH TOPOLOGY:** unchanged.
- **NARRATION:** "H1 and H2 are two faces of one fork: protect the operation versus control of the
  operation. Nothing in the visible record shoves them apart."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge requests the distinguishing evidence → P2.7.

### P2.7 — Graph Hole Deepens

- **NAME:** The motive hole.
- **JUDGE SEES:** A graph hole rendered as the analytical gap between the connective-tissue graph
  (what Phase 1 established) and any motive edge: the record shows *people with access*, not
  *people with motive*. Presented as an artifact of the analysis, not proof someone hid the answer.
- **CASES:** A + B.
- **ENTITIES:** unchanged.
- **RELATIONSHIPS:** gap on the motive relationships only.
- **EVIDENCE:** unchanged.
- **HYPOTHESIS:** unchanged.
- **GAP:** AG2 (motive discrimination) opened, tied to the hole.
- **UI SURFACES:** gap/evidence-request board; graph hole overlay.
- **PROVIDER DATA:** GraphHole/Gap collections; no criminality fields.
- **GRAPH TOPOLOGY:** unchanged (no phantom motive edge).
- **NARRATION:** "The graph can show access. It cannot yet show purpose. That distinction is the
  hole."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge requests next best evidence → P2.8.

### P2.8 — Next Best Evidence (Phase 2)

- **NAME:** What would separate motive? (Stage 2.)
- **JUDGE SEES:** A derived, `DERIVED_BY_DEMO_LOGIC` proposal: **the WJA audit and financial
  records** for the period the owner was investigating — the evidence that shows *what the owner
  was uncovering and what financial exposure that created* (script ACT 12). The evidence request
  has explicitly *changed*: no longer a hidden relationship, but a motive discriminator.
- **CASES:** A + B.
- **ENTITIES:** E1/E2/E3/E4 (evidence-bearing persons/orgs only, as the artifact supports).
- **RELATIONSHIPS:** expected: financial/association records around the audit and its fallout.
- **EVIDENCE:** the proposal lists the second artifact class (distinct from the Phase 1 ledger and
  from the later-witness testimony): the **historical financial/audit document** (see §20).
- **HYPOTHESIS:** unchanged.
- **GAP:** AG2 advanced to `REQUEST_EVIDENCE`.
- **UI SURFACES:** evidence-request cards; lead board.
- **PROVIDER DATA:** EvidenceRequest/Lead collections; derived utility values.
- **GRAPH TOPOLOGY:** unchanged.
- **NARRATION:** "The system is now asking a different question: what exactly was the owner
  investigating, and what financial exposure would that create?" (script ACT 12)
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge moves to present the second artifact → P2.9.

### P2.9 — The Second Artifact Is Presented

- **NAME:** Physical artifact enters Phase 2.
- **JUDGE SEES:** **Page S1** — the second historical evidence artifact (the **historical WJA
  audit / financial document**, `LATER` overlay), satisfying AG2 (script ACT 13).
- **CASES:** B-leaning with A context.
- **ENTITIES:** unchanged except evidence-bearing artifacts (E1/E2/E4 context strengthened).
- **RELATIONSHIPS:** none while not yet ingested.
- **EVIDENCE:** artifact preview on the physical page before mutation.
- **HYPOTHESIS:** unchanged.
- **GAP:** unchanged.
- **UI SURFACES:** artifact overlay; submission CTA.
- **PROVIDER DATA:** none.
- **GRAPH TOPOLOGY:** unchanged.
- **NARRATION:** "Here is the second record — what the owner was uncovering, and the exposure it
  would create. Whether it breaks the motive fork is answered honestly."
- **PHYSICAL ACTION:** Page S1 shown.
- **EXIT CONDITION:** Judge submits → **P2.10 (SECOND EVIDENCE INGESTION)**.

### P2.10 — SECOND EVIDENCE INGESTION (Phase 2 Contract)

- **NAME:** The second artifact enters as a new evidence object.
- **JUDGE SEES:** The same live-ingestion behavior as P1.10 (submit path, event ledger, graph
  mutation) applied to artifact S1.
- **CASES:** A + B.
- **ENTITIES:** unchanged except evidence-bearing artifacts; no new persons from S1 alone.
- **RELATIONSHIPS:** the artifact's observations encode the audit's findings, the owner's
  expanding financial exposure, and the network's interest — candidate motive-context edges, all
  `PROPOSED`, judge-acceptable only.
- **EVIDENCE:** new Evidence + Source + Artifact + Observations via normal builders (contract §20).
- **HYPOTHESIS:** H1/H2/H3 re-scored from the new set (derived).
- **GAP:** AG2/H-motive transition per judge acceptance.
- **UI SURFACES:** evidence submission; ledger page; event stream; graph canvas.
- **PROVIDER DATA:** the same seam as P1.10 (`submit` + named sequence + overlay catalog) — scaled,
  never a boolean flip, never a prewritten transcript.
- **GRAPH TOPOLOGY:** G7 → G8 (§27).
- **NARRATION:** "Feeding the second record to the system — the same ingestion discipline as the
  first, nothing pre-cooked."
- **PHYSICAL ACTION:** S1 consumed.
- **EXIT CONDITION:** Ingestion drains; reassessment → P2.11.

### P2.11 — Post-Ingestion Reassessment

- **NAME:** Motive posture recomputed.
- **JUDGE SEES:** Re-run of the three-hypothesis test. Expected honest outcome class:
  - **H1 (protect the financial operation) becomes the leading derived explanation** — the new
    evidence explains what the owner was trying to uncover (the audit) and why that would matter to
    the network (script ACT 13);
  - H2 (regain / keep control) retains partial overlap (the control conflict is the carrier of the
    financial stake);
  - H3 (personal retaliation) stays weakest.
  - **Formal motive status remains NOT-PROVEN**: the core attribution chain is hearsay-bound (`R`
    for exact quotes), so no hypothesis reaches a proven verdict. The UI says "substantially better
    supported," never "proved murder motive" (script ACT 13).
- **CASES:** A + B.
- **ENTITIES:** unchanged.
- **RELATIONSHIPS:** candidate edges re-evaluated per the record.
- **EVIDENCE:** second artifact ingested.
- **HYPOTHESIS:** H1/H2/H3 postures re-derived; no winner-by-fiat.
- **GAP:** AG2 clears; the motive caveat remains.
- **UI SURFACES:** hypothesis comparison ×3; robustness dock.
- **PROVIDER DATA:** `testHypothesis` ×3; decision trail appended.
- **GRAPH TOPOLOGY:** G8.
- **NARRATION:** "The second record tilts the comparison toward the financial-exposure reading —
  the owner was uncovering the losses, and that created the exposure. And the system says plainly:
  it does not prove it."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge runs the counter-evidence pass → P2.12.

### P2.12 — Counter-Evidence Pass (Phase 2)

- **NAME:** The honest contrary reading of motive.
- **JUDGE SEES:** Mandatory counter-evidence:
  - **C3** — testimonial-chain weakness: the later witness never met the security chief; security
    chief died before answering; secondhand attribution ⇒ H1/H2 classification is
    `SOURCE_CREDIBILITY`, and the motive under both readings stays `UNRESOLVED`.
  - **C1/C2** carried forward where still live.
- **CASES:** A + B.
- **ENTITIES:** unchanged.
- **RELATIONSHIPS:** unchanged.
- **EVIDENCE:** CounterEvidenceReport rows; hypothesis `contradictingEvidenceIds` populated.
- **HYPOTHESIS:** reachable `CHALLENGED`/`INCONCLUSIVE`; no hardcoded `REFUTED`.
- **GAP:** none new.
- **UI SURFACES:** counter-evidence panel.
- **PROVIDER DATA:** computed statuses only.
- **GRAPH TOPOLOGY:** unchanged.
- **NARRATION:** "The strongest account still rests on a single hearsay chain. INDAGO puts that
  limitation on the table, not in a footnote."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge runs the challenge/robustness pass → P2.13.

### P2.13 — Challenge & Robustness

- **NAME:** The system attacks itself.
- **JUDGE SEES:** The judge challenges each motive hypothesis (deliberate challenge route); the
  system runs a robustness pass over the observation set and shows
  `robustnessScore` + `sensitiveObservations` — all computed (perturbation over the real
  observation set), never a fixed "92/100."
- **CASES:** A + B.
- **ENTITIES:** unchanged.
- **RELATIONSHIPS:** challenge may archive edges (reject/reverse via PR-8).
- **EVIDENCE:** robustness result bound to the hypothesis id.
- **HYPOTHESIS:** can be weakened to `CHALLENGED`/`INCONCLUSIVE` and re-strengthened only by
  evidence, not by fiat.
- **GAP:** unchanged.
- **UI SURFACES:** challenge modal; robustness dock.
- **PROVIDER DATA:** `RobustnessProvider.getResult` (computed), relation-authority routes, ER
  routes; derivation-order rule: robustness runs after ingestion, never feeds back into fixture
  content (extraction spec §22).
- **GRAPH TOPOLOGY:** edge dispositions mirror the relation lifecycle.
- **NARRATION:** "INDAGO is built to be disagreed with. The judge has now weakened and
  re-strengthened the accounts against the same record."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Judge accepts the final posture → P2.14.

### P2.14 — Historical Conclusion & Validation (ACT 14 + ACT 17 + ACT 18)

- **NAME:** The capstone validation — INDAGO's account vs the later record.
- **JUDGE SEES:** The final later-knowledge overlay (Page V1 — the historical testimony excerpt),
  visually marked, in two separate frames (script ACT 14):
  - **The later historical record:** the murder was later described as arising from the conflict
    surrounding the World Jai Alai operation, the owner's investigation into the financial losses,
    and the people who stood to lose from that investigation;
  - **The later testimony's operational piece:** how information about the owner reached the people
    carrying out the attack.
  Then the printed **benchmark / evaluation sheet** (ACT 17) and the historical conclusion
  (ACT 18).
- **CASES:** A + B.
- **ENTITIES:** E16 THE LATER WITNESS created in the sealed/later bucket only.
- **RELATIONSHIPS:** R13/R14 (hearsay chain) become visible **here**, bound to the chain: target
  sheet ← THE PRESIDENT ← (attribution) THE SECURITY CHIEF; never met; security chief died in
  custody Jan 2004; single-source hearsay, `UNRESOLVED`, never `PROVEN`/`CONFIRMED` against THE
  SECURITY CHIEF (delivery note).
- **EVIDENCE:** S1 (already ingested) + P8 (later testimony excerpt) + the benchmark sheet.
- **HYPOTHESIS:** **H1 stands as the leading derived explanation** — status `SUPPORTED (caveated)`;
  honesty forbids `PROVEN`. (If the actual source/implementation cannot warrant even this posture,
  the UI downgrades, never upgrades.)
- **GAP:** AG2/H-motive closed-with-caveat.
- **UI SURFACES:** timeline class-5 band; sealed/later page; neutral narration.
- **PROVIDER DATA:** later-knowledge annotations with `derivedFrom`; the fence releases the
  breakthrough ids only here, asserting zero pre-reveal references.
- **GRAPH TOPOLOGY:** hearsay edges (R13/R14) render as hearsay-posture — flagged, low support —
  the answer arrives already labeled imperfect.
- **NARRATION:** "History later described this conflict as surrounding the operation, the owner's
  investigation into the losses, and those who stood to lose. The later testimony supplies how the
  information traveled. Two separate things: our reconstruction, and the record that tests it."
- **PHYSICAL ACTION:** Page V1 shown; benchmark sheet (ACT 17) presented.
- **EXIT CONDITION:** Judge reviews the final assessment → P2.15.

### P2.15 — Phase 2 Exit / Demo Close

- **NAME:** The honest end.
- **JUDGE SEES:** The final assessment panel (see §22), a recap of both phases, the caveat list,
  and the explicit closing statement that the demo's conclusion is a *supported, hearsay-limited
  analytical posture* — not a verdict.
- **CASES:** A + B.
- **ENTITIES:** unchanged.
- **RELATIONSHIPS:** summarized with final statuses.
- **EVIDENCE:** all artifacts finalized; `validate.ts` fence passes.
- **HYPOTHESIS:** H1 `SUPPORTED (caveated)` (leading), H2 overlapping, H3 weak — all editable via
  challenge, no `PROVEN`.
- **GAP:** open gaps re-listed honestly.
- **UI SURFACES:** final judge board; phase recap.
- **PROVIDER DATA:** decision trail complete; graph final version frozen.
- **GRAPH TOPOLOGY:** G8 frozen.
- **NARRATION:** "The demo closes the same way evidence does: with a supported finding, a named
  limitation, and a record you can go back to."
- **PHYSICAL ACTION:** none.
- **EXIT CONDITION:** Demo complete.

---

## 17. Phase 2 Hypotheses (H1 / H2 / H3 — exact wording)

The Hypothesis Lab generates H1/H2/H3 from the post-ledger network state and ranks them by initial
promise (script ACT 10):

- **H1 — Protect the financial operation.** "The owner was killed to protect the company's
  financial operation from the exposure that his audit would create."
- **H2 — Regain / keep control.** "The owner's removal of the president and his assumption of
  control over the company threatened the surrounding network's hold on the operation; the killing
  restored / preserved that control."
- **H3 — Personal retaliation / other.** "The owner was killed for a personal or non-operational
  reason unrelated to the company's operation."

Rules: all three are stored simultaneously (`CANDIDATE` → derived posture); the demo never forces
one "truth"; **every hypothesis shows both its supporting and its contradicting evidence** (script
ACT 11); evidence re-scoring is engine-derived; the final report shows each hypothesis's
SUPPORTING / CONTRADICTING / ALTERNATIVE EXPLANATIONS / REMAINING GAPS. After the Phase 2
breakthrough (ACT 13) **H1 is the leading derived explanation** ("substantially better supported,
never proved"); the others remain live and re-scorable.

---

## 18. Phase 2 Evidence FOR (script ACT 11 — supporting stack)

| Hypothesis | Evidence FOR | Posture |
|---|---|---|
| H1 | Case B audit record (money disappearing; audit ordered two months before the murder); federal file withholding; ledger-derived information pathway — the owner was actively uncovering losses | strongest derived support after ACT 13 ("substantially better supported") |
| H2 | Owner's removal of the president + control assumption; network response context; state police teletype toward the Boston network | partial-support; overlaps H1 |
| H3 | None distinct | weakest; kept honest |

## 19. Phase 2 Evidence AGAINST (script ACT 11 — contradicting stack)

| Hypothesis | Evidence AGAINST | Posture |
|---|---|---|
| H1 | No day-one-skimming; no observed audit-threat document before the second artifact | `INCOMPLETE_INFORMATION`; resolved only by S1 |
| H2 | No pre-seal decision-edge; hearsay-bound attribution; C3 | `SOURCE_CREDIBILITY` |
| H3 | Thinnest observation set | honest low signal |

## 20. Phase 2 Graph Hole & Second Evidence

- **Second artifact (S1):** the historical **WJA audit / financial document** — the financial and
  audit records of the operation for the period the owner was investigating: what the owner was
  uncovering, and the financial exposure that uncovered record created (script ACT 13). Distinct
  from the Phase 1 ledger **and** distinct from the later-witness testimony (P8). An alternative
  artifact may substitute (e.g., Tulsa-era follow-up records) only if equally historical and
  source-grounded.
- **If the historical evidence does not support this second breakthrough:** the state is marked
  **BLOCKED** — the UI shows the block, the reason (research required), and a `NOT_COMPUTED`
  posture for the discriminator. The demo continues with the honest three-hypothesis comparison
  rather than fabricating a deciding artifact. (Extraction-based posture: a historical WJA audit /
  financial document is real and can fairly be presented; its motive-bearing weight is the
  `R`-caveated part.)
- **Hole H-motive:** the analytical gap between "people with access" and "people with motive" (§6/
  P2.7), filled-with-caveat after S1.

---

## 21. Phase 2 Reassessment & Challenge Behavior

- Re-scoring is re-run of the reverse-hypothesis engine over the mutated store; ordinal shifts are
  shown, not asserted.
- **Challenge mechanics (both phases):** the judge may challenge any hypothesis; the challenge
  route records the decision, and the hypothesis may reach `CHALLENGED`/`INCONCLUSIVE`; upgrades
  back to `SUPPORTED` require new evidence (e.g., a re-submission), never a UI override.
- **Challenge must be able to weaken:** if the judge rejects the key candidate edge (PR-8 reject),
  downstream re-scoring visibly drops the affected hypothesis's support and raises contras — the
  demo's finale is not reachable by force.
- No robustness figure is fixed; no counter-evidence is invented for "balance."

---

## 22. Final Assessment (what the demo concludes)

| Question | Demo answer |
|---|---|
| Did the two investigations connect? | Yes — a **supported** pathway via the company's internal security function (people/roles), established by encoded evidence (R1/R2/R6–R8, L1) and later corroborated weakly by hearsay. |
| Was the answer "same company"? | Explicitly **no** — that overlap is common infrastructure, foreclosed at P1.3. |
| Who is the connective figure? | THE SECURITY CHIEF (a high-value role), not the murderer. |
| Why was the owner killed? | Competing accounts: H1 (protect the financial operation) becomes the **leading derived** explanation after the Phase 2 breakthrough, H2 overlapping, H3 weak — **formal motive `UNRESOLVED`** (hearsay-bound; no factual `PROVEN`). |
| What stays open? | R13/R14 (attribution chain), exact quote-level dates (`R`), the H5 financial gap, the personal-motive record gap. |
| Tone | Analytical, caveated, non-verdict. |

The final panel renders the statuses, the supporting/contradicting sets, the alternatives, and the
remaining gaps for H1/H2/H3 — all `DERIVED_BY_DEMO_LOGIC` or `OBSERVED`/`INFERENCE`, none seeded.

---

## 23. Graph-State Transition Table (G0 – G8)

| State | Name | Added | Removed / Changed | Covers |
|---|---|---|---|---|
| G0 | Seed: Case A only | Case A crowd nodes/edges (R1,R2,R5,R6,R7,R8) | none | P1.0 |
| G1 | Case B joins | Case B crowd (E3,E4,E10,E11,E18; R3,R4) | two islands | P1.1 |
| G2 | Shared bridge | computed bridge emphasis on E1/E2/E4; no new edges | none | P1.2–P1.3 |
| G3 | Hypothesis + role focus | role prominence (EntityRoleHypothesis on E2); Hypothesis row | none | P1.4–P1.6 |
| G4 | Hole surface | H1 hole overlay; gap AG1 | none | P1.7–P1.8 |
| G5 | Ledger ingestion | artifact/record node(s); observations; H1 fill edge `PROPOSED`→`ACTIVE` (judge accept) | none | P1.9–P1.12 |
| G6 | Reassessed + seal held | Decision trail; prediction freeze at P1.14; **no hearsay edges yet** | hole fills finalized-with-caveat; the later record stays sealed until ACT 14 | P1.12–P1.15 |
| G7 | Phase 2 exploration | H1/H2/H3 okay; motive hole (AG2) | no motive edges forced | P2.0–P2.8 |
| G8 | Second evidence + final | S1-derived candidate edges; **ACT 14 reveal** (hearsay R13/R14 rendered hearsay-posture, `UNRESOLVED`); final dispositions; robustness | hole AG2 filled-with-caveat; final statuses frozen | P2.9–P2.15 |

Every transition logs a graph version deterministicly; version ids follow the deterministic UUID
seam; no transition invents nodes/edges beyond the evidence contract above (§12/§20).

---

## 24. Provider / Fixture Mapping (behavioral contract)

Mapping rule: **every** demo state is served by the existing provider/fixture architecture; no
provider redesign, no new seam, and **no UI component imports Demo/Live collections directly**.
The fixtures referenced below are the real-case replacement sets in the same shapes as today's
`demo-fixtures/*`.

| Collection (canonical) | Serves | Provider route (existing) | Demo state coverage |
|---|---|---|---|
| `case` / `investigation` | Case A/B scaffolds | `DemoCaseProvider`, `DemoInvestigationProvider` | P1.0–P1.1, all ambassadors |
| `source` / `artifact` / `evidence` | Primary corpus P1–P9 + uploaded ledger/S1 | `DemoEvidenceProvider` (list/get/prepareUpload/submit), `DemoIntelligenceProvider.getSource/getArtifact` | P1.1, P1.9–P1.11, P2.9–P2.11 |
| `observation` | Extracted facts incl. live ledger extraction | `DemoObservationProvider` (list by investigation/entity) | P1.10, P2.10 |
| `entity` / `entity-role-hypothesis` | E1–E18 + role splits | `DemoEntityProvider`, ER seam | P1.3, P1.6 |
| `relation` | R1–R15 | `DemoRelationProvider` (list/get/accept/reject/reverse; PR-8) | P1.11–P1.12, P2.11–P2.13 |
| `entity-resolution` | alias/role/person identity handling | `DemoIntelligenceProvider` (list/get/accept/keepUnresolved/reverse) | P1.3, P1.6, P1.15 |
| `lead` | Next-best-evidence leads | `DemoLeadProvider` (list/get) | P1.8, P2.8 |
| `investigative-gap` / `evidence-request` | AG1/AG2, H-request | `DemoGapProvider` (gaps + evidenceRequests) | P1.7–P1.8, P2.7–P2.8 |
| `hypothesis` | P1 hypothesis + H1/H2/H3 | `DemoHypothesisProvider`, reverse-hypothesis test/record | P1.4–P1.5, P2.1–P2.6 |
| `counter-evidence` | C1–C4 | contradiction/contradicting sets in intel | P1.13, P2.12 |
| `timeline` | historical/reported/ingestion bands | `DemoTimelineProvider` (global ascending normalization) | all |
| `cross-case` | bridge-only match, wording as opportunity | `DemoCrossCaseProvider` (listMatches/listForeignOverlays) | P1.2, P2.4 |
| `graph` (nodes/edges/versions) + `graph-holes` | topology + holes | `DemoGraphProvider` (versions/nodes/edges/getGraphHoles/getOverlayCatalog) | all graph states |
| `review` | review tasks on ingestion | `DemoReviewProvider` | P1.10–P1.11, P2.10–P2.11 |
| `robustness` | computed robustness | `DemoRobustnessProvider` | P2.13 |
| `events` / ledger | live event streaming | `DemoRealtimeProvider` (NAMED_SEQUENCES + overlay catalog) | P1.10, P2.10, all transitions |
| `discovery` / intelligence results | structural-only candidates | `NOT_COMPUTED` stubs where unimplementable | P2.7–P2.8 |

Fixture assembly: real-case fixtures are assembled in the same immutable `demoFixtures` shape
(`index.ts`), with `validateDemoFixtures()` extended to assert the §12/§20 doc contracts (live
ledger/S1 are *not* in the initial immutable set; they arrive via the upload path).

Deterministic IDs: `deterministicUuid(NS, 'family:slug')` with the extraction-spec namespaces —
`NS_CASE_A`, `NS_CASE_B`, `NS_SHARED`, `NS_BREAKTHROUGH`, `NS_COUNTER`, `NS_DEMO` (§2 of the
extraction spec). The legacy `b1e0c9a6-…` demo ids are heritage and are not reused.

---

## 25. Event / Realtime Mapping

Event stream reflects **actual state transitions** — a pre-written transcript is forbidden.

| Transition | Event(s) on the ledger | Source of truth |
|---|---|---|
| Fixture intake into the vault (setup) | `EVIDENCE_INGESTED` (per package/group) | fixture-derived setup events |
| Live ledger ingestion (P1.10/P2.10) | `EVIDENCE_INGESTED`, `EVIDENCE_PROCESSED`, `OBSERVATION_EXTRACTED`, `ENTITY_CREATED` (record-level only), `GRAPH_HOLE_DETECTED`, `GAP_IDENTIFIED`, `LEAD_CREATED` | submit + named-sequence emit |
| Hypothesis work | `HYPOTHESIS_*` / decision-trail events | testHypothesis + recordHypothesisDecision |
| Reasoning Ledger traceability (P2.14 / ACT 16) | `REASONING_STEP_*` / decision-trail events replaying each judgment in order | decision trail + `derivedFrom` annotations |
| Relation authority | `RELATION_*`/edge disposition events | PR-8 accept/reject/reverse |
| Graph-hole detection | `GRAPH_HOLE_DETECTED` via gap linkage | GraphAnalysis/Gap |
| Live canvas | overlay catalog entries keyed by action+target | `getOverlayCatalog()` |

The existing `DemoRealtimeProvider` behavior (replay with `delayMs`, memory-bank history,
tab-switch survival, queue drain) is preserved. Named sequences are parameterized by artifact id
(`upload:<artifactKey>`), and after drain the per-workspace store holds the added rows so refetch
== live canvas.

---

## 26. Timeline / Clock Rules (three clocks)

1. **HISTORICAL EVENT TIME** — the source's date (1975–2002), precision exact only where the
   source is exact.
2. **SOURCE / REPORTED TIME** — as reported by a report, kept separate from occurrence.
3. **DEMO INGESTION TIME** — when the demo Vault ingests the crowds and the live artifacts (modern
   demo clock).

Rules:
- Never merge 1/2/3; render class 5 (`LATER_HISTORICAL_KNOWLEDGE`) in a distinct visual band.
- The bulk "take this intake set into the vault" event is the **only** mechanism by which old
  documents gain a modern ingestion timestamp (extraction spec §20).
- Never assign a historical `day` to an approximate fact; never assign ingestion time to a
  historical event.
- The Phase 1 ledger and Phase 2 second artifact enter at **demo ingestion time**, carrying their
  **historical** content dates on separate fields.

---

## 27. Physical Demo Plan (minimum artifacts)

For each physical page: **ID, Case, Document/source, Historical date, What the judge sees, What it
proves, What it does NOT prove, When it appears, UI state it triggers.** No page is called an
"original document" when it is a reconstruction/extract.

| Page ID | Case | Document / source | Historical date | Judge sees | Proves | Does NOT prove | Appears at | Triggers UI state |
|---|---|---|---|---|---|---|---|---|
| A1 | A | CT SOCTF licensing probe — org graph + critical-crowd manifest | 1976 | Probe structure, R5/R6, employment | Probe existed; target = WJA officers | Conspiracy; federal/content knowledge | P1.0 | Case A board + graph |
| A2 | A | Jan-1976 request + silence correspondence (P4) | 1976‑01 | Request + silence; later marker for shared files | The federal bar withheld; files shared with THE SECURITY CHIEF | The files' content; warning | P1.1 (later marker at P1.13) | Case A board + timeline note |
| A3 | A | House Report 108-414 excerpts (§III.B.3, §III.B.6, Chronology) | published era | Claims with page refs | Rico retirement→WJA employment; federal sharing | Page-level quotes beyond the verified core (`R`) | P1.1 | Evidence board |
| B1 | B | Tulsa PD homicide intake (P5) | 1981 | Murder facts, victim, scene, unit | Owner killed 1981‑05‑27, Southern Hills | Motive/actors | P1.1 | Case B board + graph |
| B2 | B | Tulsa holes page (H1/H2) | 1981 live | Open holes, NOT filled | What's missing | The missing content | P1.7 | Holes board |
| B3 | B | Wheeler business records (Telex/WJA) (P6) | 1980s | Ownership/org chain | Ownership + chairmanship | Any criminal reading | P1.1 | Evidence board |
| L1 | Phase 1 | **Sealed corporate record — company internal-security/personnel ledger (live artifact)** | 1975–81 | The ledger on a physical page | Security function's operational role/access | Any homicide link; motive | P1.9–P1.10 | **Live ingestion, G4→G5, AG1 fill, event stream** |
| V1 | Validation | **Later historical testimony page** — THE LATER WITNESS 2002 excerpts (P8) | 2002 | Hearsay chain overlay, shown as a distinct frame | Chain exists in one account | Verified chain; any criminal finding | P2.14 (ACT 14) | First release of the sealed/later record; R13/R14 render hearsay-posture here |
| S1 | Phase 2 | **Second historical artifact** — the historical **WJA audit / financial document** | era under investigation | What the owner was uncovering, and the financial exposure that created | Context for the leading H1 account (`R`-caveated) | A proven motive | P2.9–P2.10 | Second ingestion, G7→G8, AG2 |
| BM1 | Phase 2 | **Benchmark / evaluation sheet** (printed) | demo-time | The ACT 17 evaluation sheet | The demo's stated claims and open items, on one sheet | A verdict | P2.14 (ACT 17) | Final assessment context (P2.14–P2.15) |

Every physical page carries a visible "extract / reconstruction" badge where applicable; artifact
rows use `mime text/plain` + `R` flag when no scan exists. `validateDemoFixtures()` does **not**
contain L1/S1 identities in the initial set (they are live-ingested).

---

## 28. Judge Narration Checkpoints

- Token-count budget: role labels bear the cognitive load; names reinforce, never replace.
  The judge is never required to distinguish more than ~5 roles and 3 hypotheses.
- Checkpoints (boss voice, neutral, evidence-anchored):
  1. **P1.0** — enter Connecticut room.
  2. **P1.2** — "These investigations may warrant comparison" (opportunity, not conclusion).
  3. **P1.3** — company name is common infrastructure; people are the signal.
  4. **P1.4** — state the Phase 1 hypothesis verbatim (§7).
  5. **P1.6** — the security function is the high-value role; not a verdict.
  6. **P1.10 (ACT 8)** — announce live ingestion; narrate real events as they stream: "we received a
     document, not the relationship."
  7. **P1.14** — the Prediction Freeze: "the record we need is sealed — by design we do not open it
     before the prediction."
  8. **P2.0** — pose the motive question.
  9. **P2.11 (ACT 13)** — report the derived tilt and its limitation ("substantially better
     supported — not proved").
  10. **P2.14 (ACT 14)** — neutral "what the later record establishes, and does not"; two separate
      frames: our reconstruction vs the record that tests it.
  11. **P2.15** — closing: supported finding + named limitation + revisable record.
- Narration never prefixes any line with "The AI discovered… same company"; "Operation Financial
  Shadow" phrasing is prohibited everywhere.
- Binding delivery notes (script):
  - Role-first, name-second naming; names reinforce, never replace.
  - Never reveal WJA as the connection in the cold open (it is the journey, not the premise).
  - Never say THE PRESIDENT went to Boston "to meet criminals" — the defensible form is "given
    destination versus observed travel," with the Boston association established separately.
  - The Bahamas expense entry is a financial observation / anomaly — **never** proof of bribery,
    conspiracy, or murder coordination.
  - The hidden discovery is THE SECURITY CHIEF's role in the network.
  - The graph update at ACT 9 is what begins Phase 2.
  - Every Phase 2 hypothesis shows supporting + contradicting evidence together.
  - The stored scores are an analytical ranking — never a probability of guilt.
  - Never attach "proven / confirmed / guilty" to THE SECURITY CHIEF.
  - Build toward two discoveries (WHO/WHAT bridge at ACT 9, then the WHY explanation at ACT 13) —
    that arc is what the state machines above implement.
  - "Don't fight the imperfect ending — stage it as a feature."

---

## 29. Data That Must NOT Exist Before Each Stage

| Stage | Must not exist |
|---|---|
| P1.0–P1.1 (both initial rooms) | The final hidden relationship (pathway/schedule edge); no R13/R14; no THE LATER WITNESS node (E16); no THE BOSTON NETWORK nodes in Case A initial graph; no cross-case conspiracy suggestion; no "Rico warned" fact; no day-one-skimming claim; no fabricated dates/scores; no Operation Financial Shadow content. |
| P1.2–P1.6 | Same as above; plus no `CrossCaseMatch` naming Bulger/Flemmi/Winter Hill in tuples out of band. |
| P1.7–P1.11 | The live ledger does not exist in the immutable fixture set (it arrives live); no hearsay edges until P2.14 (ACT 14). |
| P1.12 | No `SUPPORTED`-as-truth status; no sealed content open. |
| P1.14 (pre-gate) | Sealed bucket closed (E16/P8/R13/R14 unreachable). |
| P2.0–P2.2 | No forced motive winner; all three hypotheses stored. |
| P2.9–P2.11 | S1 not in the immutable set; not pre-scored. |
| Every stage | No `isGuilty`/`PROVEN_CRIMINAL`/`CONFIRMED_CONSPIRATOR`; no `REFUTED`-for-drama; no invented person/evidence/source. |

`validate.ts` fence (mirrored in §24-8 of the extraction spec) asserts these before every surface
change.

---

## 30. Acceptance Criteria (implementer checklist — 17 questions)

1. For **every** P1.0–P1.16 and P2.0–P2.15 state, are all of the template fields defined and
   internally consistent (ID/name/JUDGE SEES/CASES/ENTITIES/RELATIONSHIPS/EVIDENCE/HYPOTHESIS/GAP/
   UI SURFACES/PROVIDER DATA/GRAPH TOPOLOGY/NARRATION/PHYSICAL ACTION/EXIT)?
2. Does the initial state (P1.0–P1.1) contain **no** trace of the final hidden relationship,
   motive, or hypothesis score?
3. Is every numeric/ranking surface `DERIVED_BY_DEMO_LOGIC` (or `OBSERVED`/`INFERENCE`/
   `NOT_COMPUTED`), with **no** hardcoded truth score anywhere?
4. Is THE LATER WITNESS testimony excluded from initial evidence, initial crowds, and the Phase 1
   prediction, appearing only as a post-prediction validation overlay?
5. Can the Phase 1 live ledger be traced through the 10-question contract (§12) with an exact,
   reviewable before/after data mutation — and is it a real artifact (or exact extract), never a
   boolean flip?
6. Is the WJA "same company" overlap explicitly foreclosed as the discovery (P1.3), with the
   hidden link located in people/roles via the security function?
7. Are the three clocks (historical/source/demo-ingestion) kept separate and rendered distinct,
   with later-knowledge always visually marked?
8. Does every physical page carry its ID, source, date, proves/does-not-prove, appearance point,
   and triggered UI state, and is every extract/reconstruction labeled as such?
9. Can the judge challenge any hypothesis and genuinely weaken it (CHALLENGED/INCONCLUSIVE), with
   no forced `REFUTED`?
10. Does the event ledger stream **actual** state transitions (no prewritten fake transcript)?
11. Is the "Operation Financial Shadow" narrative absent from every surface, corpus, alias, and
    event row?
12. Are there **no fabricated documents, dates, scores, robustness figures, or invented
    entities/sources** anywhere?
13. Does each of the P1 hypothesis and H1/H2/H3 show SUPPORTING, CONTRADICTING, ALTERNATIVE
    EXPLANATIONS, and REMAINING GAPS?
14. Does Next Best Evidence have exactly two stages (Phase 1: test the hidden relationship; Phase
    2: distinguish competing motives), with expectations for SUPPORTED/CONTRADICTED/UNRESOLVED?
15. Is the Phase 2 second artifact distinct from the Phase 1 ledger AND the later-witness
    testimony — and if historical evidence cannot support it, is the state marked **BLOCKED** with
    required research stated?
16. Is every state mapped to an existing provider/fixture collection (§24) with no provider
    redesign and no UI importing Demo/Live directly?
17. Can a developer answer every physical/evidence detail (page source, dates, what it proves) by
    reading this document and the extraction spec — without inventing any fact not in the cited
    reports?

A developer who answers **no** to any question must not begin real fixture replacement; the
blocker is recorded in §33 and the status stays below GREEN.

---

## 31. Open Historical Verification Blockers

1. **Missing authoritative source — RESOLVED (script supplied):** the approved **"INDAGO Demo —
   Final Performable Script"** was supplied and is incorporated as source #2 (READ) with the
   beat/act→state mapping in §2.1 and its binding delivery notes in §28. Remaining fidelity: the
   ACT 1–2 Court A/B evidence items and the ACT 5 Bahamas expense entry must be re-confirmed
   against the actual fixtures at the extraction pass.
2. **Report-truncation debt:** both root reports are not yet fully re-read paragraph-by-paragraph;
   every `R` item in the extraction spec (exact Martorano/Connolly dates, artifact lists,
   §III.B.6 page spans, Case A probe-outcome text, Halloran 1982 timeline, press items) remains
   `R` until re-verified by sight of the source. Errs toward *less* data until then.
3. **Digitized transcripts:** if the 1976 letters / 1981 Tulsa casefile / 2002 transcripts are
   not digitized, L1/V1/S1 degrade to `text/plain` extracts with `R` flags (presentation only,
   fidelity-lowering).
4. **"Later-knowledge" overlay presentation:** class-5 timeline rendering is required; the demo's
   timeline surface must render the later band separately. Currently a presentation-only gap that
   gates the "later" marker concept.
5. **Court-trial context:** Connolly-trial context items (R9, OPR Exhibit 141, the federal blind
   spot) remain `R` until quoted. These are Phase 1 side-context and the federal blind spot — **not**
   the Phase 2 S1 artifact, which is the WJA audit / financial document; if that document cannot be
   produced, S1 stays BLOCKED-safe.
6. **Extraction-spec verdict is YELLOW** — inherited; this flow doc does not change that verdict.

---

## 32. DEMO FLOW STATUS

**YELLOW**

- **Green:** two-phase structure, state machines, live evidence contracts, event/realtime mapping,
  provider/fixture mapping, three-clock rules, physical plan, fence (do-not-write) rules, challenge
  behavior — all specified against verified `V`-facts and the existing architecture with **no** code
  changes required by this document. The **performable script is supplied** and governs presentation
  order via the §2.1 beat/act→state mapping.
- **Yellow:** script fidelity remains dependent on re-confirming the ACT 1–2/Bahamas entries against
  fixtures (§31-1); report-truncation debt keeps every `R` item unconfirmed (§31-2); class-5
  later-knowledge timeline rendering is unimplemented (§31-4); the Phase 2 motive posture is
  hearsay-bound by design (H1 `SUPPORTED (caveated)` — leading, motive `UNRESOLVED`) — an honest
  anti-climax that must be narrated neutrally (P1.14/P2.14).
- **Red:** none — every verified fact is expressible in the existing contracts; no required
  mechanism corrupts the historical data.

### Blocker list before real fixture replacement begins
1. Re-confirm the script's ACT 1–2 Court A/B evidence items and the ACT 5 Bahamas expense entry
   against the extraction fixtures (§31-1).
2. Complete the extraction-spec Readiness Gate (§4): full report re-reads, resolve all `R` → `V` or
   drop.
3. Verify digitized transcripts/csv availability for L1/V1/S1 (§31-3).
4. Implement (in a *separate*, code-change pass — out of this document's scope) the class-5 timeline
   band and the live-ingestion named-sequence wiring for L1/S1.
5. Freeze the physical page set (§27) with the demo owner.

*End of demo flow specification. No production code is modified by this document.*