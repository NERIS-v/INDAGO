# INDAGO_REAL_CASE_EXTRACTION_SPEC.md

# Historical Data Extraction Specification
## Replacing the "Operation Financial Shadow" demo case with real historical cases

- **Case A** — Connecticut / World Jai Alai licensing & regulatory investigation
- **Case B** — Tulsa homicide of Roger Wheeler
- **BREAKTHROUGH** — sealed evidence (2022–2004-era testimony and trial records)

Authoring constraint: **code-free**. This document specifies *what* to extract, *how* to
classify and encode it, and *what must never be encoded*. No production code is modified.

Source precedence (per project convention):

1. `EVIDENTIARY CLAIM VERIFICAITON.md` — adversarial verification pass. **Takes precedence.**
2. `INDAGO CASE RECONSTUCTION REPORT.md` — reconstruction with source ledger. Subordinate.
3. Neither report is infallible. Any discrepancy is re-verified against the cited primary
   source (principally **House Report 108-414, Vol. 1** (§III.B.3 Oklahoma, §III.B.6
   Connecticut, Chronology) and **OPR Exhibit 141**).

> **READ-BEFORE-USE (implementer's duty).** Both reports contain many specifics beyond the
> verified core listed in this spec. This spec deliberately marks every item that must be
> reconfirmed against the full text of the two reports before encoding (tags: `V` verified,
> `R` reconfirm-in-reports, `S` see-source). Truncation of my earlier report reads is the
> reason these tags exist. **Do not encode a `R` item from memory.**

---

## 1. Scope-Setting: "Data Before Mechanism"

The INDAGO demo mechanism (SEE → SUSPECT → TEST → PROVE → CHALLENGE, discovery waves,
graph-hole detection, next-best-evidence suggestions) must **serve** the data, never drive it.

Rules:

1. **Data first.** Every fact enters a fixture because a source supports it — not because a
   surface would look better with it.
2. **Mechanism derives.** All scores, rankings, "next best evidence", graph holes, and
   cross-case signals are *computed* from the encoded facts, or explicitly stubbed as
   `NOT_COMPUTED`. No score, match, or signal is seeded to a known "true" outcome.
   (Enforcement per §17/§22.)
3. **No retroactive knowledge.** The two initial crowds (`INITIAL_CASE_A`,
   `INITIAL_CASE_B`) reflect what investigators plausibly *had* at the time —
   **not** what history later established. Later knowledge lives in
   `LATER_HISTORICAL_KNOWLEDGE` annotations and in the sealed BREAKTHROUGH bucket.
4. **Six-way classification is mandatory.** Every encoded fact is tagged exactly one of:
   - `OBSERVED_FACT` — the source states it.
   - `INFERENCE` — derived by INDAGO or an analyst; never equal to an observed fact.
   - `CANDIDATE_RELATIONSHIP` — a relationship hypothesis, not a finding.
   - `SUPPORTED_RELATIONSHIP` — evidence supports the existence of the relationship.
   - `LATER_HISTORICAL_KNOWLEDGE` — known today, not to the investigators then.
   - `DEMO_ANALYTICAL_DERIVATION` — produced by demo analytics (score, ranking, wave).
5. **Buckets.** `BUCKET_A` (INITIAL_CASE_A), `BUCKET_B` (INITIAL_CASE_B),
   `BREAKTHROUGH` (sealed), `COUNTER_EVIDENCE`, `DO_NOT_ENCODE`.
6. **No fabricated precision.** Historical dates use real dates; where the source is
   approximate, the EventTime precision is `approximate`/`range` — never invented.

---

## 2. Repository-Field Map

Extraction targets and the canonical schemas that define their fields.

| Fixture collection (target) | File (canonical) | Encoded by |
|---|---|---|
| `case` | `packages/contracts/src/domain/case.ts` (CaseSchema) | 2 cases |
| `investigation` | `domain/investigation.ts` | 2–3 active investigations |
| `claim` (in-hypothesis) | `domain/hypothesis.ts` (ClaimIdSchema refs) | optional |
| `source` | `domain/source.ts` (SourceSchema, SourceCatalog M-A06) | one per unique source |
| `evidence` | `domain/evidence.ts` (EvidenceSchema) | §9 primary corpus |
| `observation` | `domain/observation.ts` (ObservationSchema) | extracted facts |
| `entity` | `domain/entity.ts` (EntitySchema) | §7 canonical entities |
| `entity-hypothesis` / `entity-role-hypothesis` | `domain/entity.ts` | phase/role splits (§7) |
| `relation` | `domain/relation.ts` (RelationHypothesisSchema) | §8 relationship notes |
| `entity-resolution` | `intelligence/entity-resolution.ts` (CandidateResolution, EntityResolutionResult) | §18 |
| `hypothesis` | `domain/hypothesis.ts` (HypothesisSchema) | §17 (TBAxx — see below) |
| `lead` | `domain/lead.ts` (LeadSchema; status/priority) | §15 |
| `investigative-gap` | `domain/investigative-gap.ts` (GapTypeSchema; status) | §16 |
| `evidence-request` | `domain/evidence-request.ts` (EvidenceRequestSchema, EvidenceUtility) | §16 |
| `review-task` | `domain/review-task.ts` (ReviewTaskSchema) | §16/§23 |
| `graph` (nodes/edges/versions) | `graph/graph-*.ts`, `graph/graph-analysis.ts` | §6/§13 |
| `graph-holes` | `intelligence/graph-holes.ts` (GraphHoleSchema) | §13 |
| `counter-evidence` | `intelligence/counter-evidence.ts` | §14 |
| `cross-case` | `intelligence/cross-case.ts` (CrossCaseMatchSchema) | §6/§10 |
| `robustness` | `intelligence/robustness.ts` (RobustnessResultSchema) | §22 |
| `intelligence-results` | `intelligence/intelligence-results.ts` | do-not-write (§24) |
| `timeline` | `web/.../demo-fixtures/timeline.ts` | §10 |
| `events` | `events/base-event.ts` + event-types | §23 ledger |
| `artifacts` | `domain/artifact.ts` (ArtifactSchema) | §9 |
| search corpus / `events.json` / `hypothesis-aliases.ts` | web demo fixtures | metadata-only (§5/§24) |

All IDs are **deterministic UUIDs** (schema: `z.string().uuid()`), generated exactly like the
current demo: `deterministicUuid(namespace, key)` from `demo/submit.ts`. The spec defines new
namespaces so real-case IDs never collide with the replaced demo IDs.

### UUID plan

| Namespace | UUID | Purpose |
|---|---|---|
| `NS_CASE_A` | `6a1c4a6a-0000-4000-8000-0000000000a1` | Case A records |
| `NS_CASE_B` | `6a1c4a6a-0000-4000-8000-0000000000b1` | Case B records |
| `NS_SHARED` | `6a1c4a6a-0000-4000-8000-0000000000c1` | dual-case entities/graph shared |
| `NS_BREAKTHROUGH` | `6a1c4a6a-0000-4000-8000-0000000000c2` | sealed bucket only |
| `NS_COUNTER` | `6a1c4a6a-0000-4000-8000-0000000000c3` | counter-evidence |
| `NS_DEMO` | `6a1c4a6a-0000-4000-8000-0000000000c4` | demo-analytic artifacts only |

Key anchors (deterministic via `deterministicUuid(<NS>, <key>)`, key = stable slug):

| Object | Proposed key | Notes |
|---|---|---|
| Case A | `case:connecticut-jai-alai` | status ACTIVE → CLOSED (§17) |
| Case B | `case:tulsa-wheeler` | status ACTIVE |
| Investigation A | `invest:ct-soctf-licensing` | SOCTF licensing probe |
| Investigation B | `invest:tulsa-homicide-unit` | Tulsa PD Homicide |

Concrete entity/evidence/observation IDs: `deterministicUuid(NS_x, '<family>:<slug>')`
(e.g. `entity:john-callahan`, `evidence:house-report-108-414-vol1`). Deterministic, no
collisions, reproducible.

**Demo-only override.** The demo "clock" fixtures (events.json events dated 2024/2025,
operationFinancialShadow narrative in search corpus and hypothesis-aliases.ts) are **not**
extraction targets (§5).

---

## 3. Sourcing Rules

Every extraction inherits the four-tier `FI / FU / FO / FH` provenance classification of
`packages/contracts/src/common/provenance.ts` (sourceId, documentRef, pageRef, spanRef,
rowRef, extractor, derivedFrom):

| Tier | Meaning | Policy |
|---|---|---|
| `FI` Fact | Source states it | Encode as OBSERVED_FACT; always cite pageRef |
| `FU` Fact-Unknown | Source omits/deliberately withholds | Encode absence honestly; drive UNRESOLVED statuses |
| `FO` Fact-Other | Contradictory/alternate accounting | Encode in COUNTER_EVIDENCE or as CONTRADICTED |
| `FH` Fact-High | Inference claiming fact status | Encode as INFERENCE, never as observed |

Extraction rules:

1. **Everything cites its provenance.** No observation, relation, or hypothesis is created
   without at least `sourceId` + `pageRef`/`documentRef`. `derivedFrom` is mandatory on any
   LATER_HISTORICAL_KNOWLEDGE or INFERENCE item (the observed fact it derives from).
2. **Respect the verification precedence** at every step; where reports conflict, choose the
   verification report's reading and record the conflict in the reasoning ledger (§23).
3. **Unsupported specifics.** Where a detail exists only in the reconstruction report and is
   not corroborated, tag `R` (reconfirm) and keep it in `LATER_HISTORICAL_KNOWLEDGE` until
   re-verified.
4. **Include by default, annotate, implement**; defer only items tagged `R`-unconfirmed.

---

## 4. Readiness Gate

This spec is *ready to execute* when all of the following hold (`IMPLEMENT` later):

- [ ] Both reports fully re-read paragraph-by-paragraph (implementer pass 1);
- [ ] Every `R`-tagged item below resolved to `V` or dropped;
- [ ] Source ledger from the reconstruction report cross-checked against the verification
      report's claim table (verify pages exist / quote single lines);
- [ ] House Report 108-414 Vol 1 (esp. §III.B.3 p.89, Chronology p.622, §III.B.6 p.96) and
      OPR Exhibit 141 lines cited in Claims verified **by sight of the report text**;
- [ ] Physical demo page plan (§21) accepted;
- [ ] Do-not-write list (§24) frozen.

Verdict at end (§25).

---

## 5. Metadata Files — "Do-Not-Write" List

These files are **present in the demo and are NOT historical extraction targets**. They are
treated as metadata / demo-operations only. They must not be sources of raw historical
content, nor may historical content be injected into them:

| File | Reason |
|---|---|
| `web/.../demo-fixtures/events.json` | demo run simulation + bulk upload events |
| search corpus / any `corpus` content string | demo search surface; content synthesized at implementation from §9 (never from memory) |
| `web/.../demo-fixtures/hypothesis-aliases.ts` | demo hypothesis-engine name roster; aliases generated code-free from canonical entity list |
| `web/.../demo-fixtures/intelligence-results.ts` (if present as fixture) | computed results only; see §17/§24 |
| `packages/contracts/src/intelligence/intelligence-results.ts` | result type; not a data stove |

Self-evident corollary: the demo narrative ("Operation Financial Shadow", banker/courier
storyline) is replaced in its entirety by §7–§10 content.

---

## 6. Graph Topology: Bridge Nodes, Shared-Low-Signal Pairs, Nuanced Splits, and the "DO-NOT" List

### 6.1 Bridge nodes (dual-citizen, shared graph)

These persons are **canonically the same human** in both cases. They appear as graph nodes in
*both* case graphs, sharing **one** canonical EntityId (registered under `NS_SHARED`):

| Entity | Case A role (graph edges) | Case B role (graph edges) |
|---|---|---|
| **John "Jack" Callahan** | WJA President; subject of CT licensing probe | WJA President; person of interest in Tulsa; breakthrough informant bridge |
| **H. Paul Rico** | WJA Director of Security; former FBI Boston | WJA security; breakthrough supply-chain informant (hearsay) |

Shared graph visibility: **edges are per-case.** An edge observed in Case A does not imply the
same edge in Case B (§6.4 Blackout Rule).

### 6.2 Shared-but-low-signal node pairs

`sharedEntityCount`-style cross-case matches must be **subtle** at demo runtime. The judge
first sees a cross-case score that says: *"these investigations may warrant comparison"* —
**never** *"these investigations are connected."* Concretely:

- `CrossCaseMatch.matchScore` between Case A and Case B nodes is derived (§17), not injected,
  and thresholds keep the top pair (Callahan↔Callahan, Rico↔Rico) medium-to-strong but
  marked `DERIVED_BY_DEMO_LOGIC`, with the cross-case *narrative* phrased as opportunity, not
  conclusion.
- No `CrossCaseMatch` proposes Bulger/Flemmi/Winter Hill joining tuples out of band — those
  pairings exist **only** inside the sealed breakthrough (or an explicitly-labeled
  LATER_HISTORICAL_KNOWLEDGE note).

### 6.3 Nuanced entity splits that are NOT broken topology

- **Rico phase-split.** FBI-era Rico vs WJA-era Rico (and "Rico in custody" in 2004) is an
  `EntityRoleHypothesis` on one canonical EntityId — **not** two entities, and **not**
  `RESOLVED_MATCH` fanfare.
- **"Jack" Callahan alias resolution.** CT mentions and Tulsa mentions of "Jack Callahan" are
  `RESOLVED_MATCH` only where sources tie them (WJA presidency in both). Absent an explicit
  source link, status is `COMPARED_AND_UNRESOLVED` (§18).
- **WJA-as-licensee vs WJA-as-organization.** The Connecticut licensee and the corporate
  entity are one `ORGANIZATION` entity; the Connecticut-specific regulatory context is role
  (licensee) — see EntityRoleHypothesis.

### 6.4 The critical "DO-NOT" list (graph)

1. **No `isGuilty` / `PROVEN_CRIMINAL` / `CONFIRMED_CONSPIRATOR`** on any node or edge.
   Relationship statuses are `OBSERVED / CANDIDATE / SUPPORTED / CONTRADICTED / UNRESOLVED`.
2. **No breakthrough edges in the initial crowds** — no Rico→hit-team supply edge, no
   Callahan→hit-team handoff edge, no Martorano node anywhere (§15).
3. **No cross-case conspiracy edges** before the breakthrough: Case A and Case B graphs in
   the initial state connect only through the shared bridge nodes Callahan and Rico.
4. **No retro-fit.** No edge dated post-2002 in a crowd snapshot dated 1981/1982.
5. **No invented phone/various-medium records.** `communication` edges exist only where the
   source establishes the medium (e.g., federal files shared with Rico; Connolly leaks).
6. **No day-one theft claim.** Nothing implies WJA skimming began the day Rico was hired
   (Claim 1 expressly disclaims it). Absence of early-theft evidence is an honest
   `TEMPORAL_GAP`/`FINANCIAL_GAP`, not a contradiction.
7. **No "Rico warned Callahan" encoding** — the record supports Rico *learning of* the probe,
   not warning Callahan (verification finding). The warning is `DO_NOT_ENCODE` as a fact; it
   may appear only as an `INFERENCE` attributed to an analyst, clearly labeled.
8. **No weapon/speculation-by-mechanism.** Physical particulars beyond what the source states
   are `R`-tagged and withheld until reconfirmed.

---

## 7. Canonical Entity Inventory

Entity types use `Entity`/`EntityTypeSchema` (PERSON, ORGANIZATION, LOCATION, ...), with
`DO_NOT_ENCODE` applied per §6.4. "Membership" = which case graph contains the node in the
**initial** state; breakthrough-only nodes are marked `BT`.

| # | Entity | Type | Bucket | Case graph | Status / note | ID key |
|---|---|---|---|---|---|---|
| E1 | John "Jack" Callahan | PERSON | SHARED (A+B) | both | bridge node; WJA President | `entity:john-callahan` |
| E2 | H. Paul Rico | PERSON | SHARED (A+B) | both | bridge node; WJA Security; former FBI Boston | `entity:h-paul-rico` |
| E3 | Roger Wheeler | PERSON | B | B | victim; Telex chairman, WJA owner | `entity:roger-wheeler` |
| E4 | World Jai Alai (WJA) | ORGANIZATION | SHARED | A (licensee) + B (work site/ownership) | one entity, dual role | `entity:world-jai-alai` |
| E5 | Connecticut Statewide Organized Crime Task Force | ORGANIZATION | A | A | licensing probe owner | `entity:ct-soctf` |
| E6 | Austin McGuigan | PERSON | A | A | CT Chief Prosecutor / task force head (`R`) | `entity:austin-mcguigan` |
| E7 | Connecticut State Police | ORGANIZATION | A | A | supporting agency (`R`) | `entity:ct-state-police` |
| E8 | Connecticut Division of Special Revenue | ORGANIZATION | A | A | license regulator (`R`) | `entity:ct-special-revenue` |
| E9 | FBI Boston Field Office | ORGANIZATION | SHARED | A (responded to CT) + B (Connolly/ER context) | presence in Case B initial graph is `R` | `entity:fbi-boston` |
| E10 | Tulsa Police Department – Homicide Unit | ORGANIZATION | B | B | investigating agency | `entity:tulsa-homicide` |
| E11 | Telex Corporation | ORGANIZATION | B | B | Wheeler's company | `entity:telex-corp` |
| E12 | John Connolly | PERSON | B | B (federal trial context only; `R` for initial) | former Boston FBI | `entity:john-connolly` |
| E13 | Stephen "The Rifleman" Flemmi | PERSON | SHARED | A: **not in initial graph** (files withheld from CT); B: `R` | Winter Hill; FBI informant | `entity:stephen-flemmi` |
| E14 | James "Whitey" Bulger | PERSON | SHARED | A: **not in initial graph**; B: `R` | Winter Hill boss | `entity:whitey-bulger` |
| E15 | Winter Hill Gang | ORGANIZATION | SHARED | **not in initial graphs** | breakthrough cross-link + federal loan-shark allegation context | `entity:winter-hill` |
| E16 | John Martorano | PERSON | BT | breakthrough only | Wheeler-murder confessor; hearsay supplier | `entity:john-martorano` |
| E17 | Brian Halloran | PERSON | B | B — **Boston silo, hidden from Tulsa** (§13 hole) | witness; killed 1982 | `entity:brian-halloran` |
| E18 | Southern Hills Country Club | LOCATION | B | B | murder scene | `entity:southern-hills-cc` |

Shared-entity membership rule: E1/E2/E4/E9/E13/E14/E15 are "shared case" participants **only
where the evidence supports membership in the specific case graph** (§6.1, §7 "Case graph"). E13–E15
do **not** enter the initial Case A crowd (the federal allegations were withheld from CT);
E16 never leaves the sealed bucket; E17 stays in the Boston silo.

---

## 8. Relationships

`RelationHypothesis` (domain/relation.ts): `RelationTypeSchema` = communication / financial /
ownership / co-location / association / organizational / transport / family / vehicle /
case-link / other. Statuses: `PROPOSED / ACCEPTED / REJECTED / REVERSED`; belief state is
carried by `support` (`RelationSupportSchema`) and the six-way classification tags. **No
criminality field is touched.**

| # | Source→Target | Type | Case | Belief | Tag | Basis |
|---|---|---|---|---|---|---|
| R1 | Rico → WJA | organizational (Security Director) | A+B | supported | OBSERVED_FACT | House Report §III.B.3 p.89 (`V`) |
| R2 | Callahan → WJA | organizational (President) | A+B | supported | OBSERVED_FACT | `R` |
| R3 | Wheeler → WJA | ownership | B | supported | OBSERVED_FACT | `R` |
| R4 | Wheeler → Telex | organizational (Chairman) | B | supported | OBSERVED_FACT | `R` |
| R5 | SOCTF → WJA | association (licensing probe) | A | supported | OBSERVED_FACT | fall-1975 probe (`R`) |
| R6 | SOCTF → Callahan | association (probe target) | A | supported | OBSERVED_FACT | Jan 1976 request (`V`) |
| R7 | FBI Boston → SOCTF | communication (withheld response) | A | supported (silence) | OBSERVED_FACT (`FU`) | Jan 1976 silence (`V`) |
| R8 | FBI Boston → Rico | communication (shared federal files) | A | supported | OBSERVED_FACT | §III.B.6 p.96 (`V`) |
| R9 | Rico → Flemmi | association | A (federal record) / B (`R`) | supported | OBSERVED_FACT | OPR Exhibit 141 (1964–75) (`V`) |
| R10 | Callahan ↔ Winter Hill | financial (loan-shark allegation) | A: federal-only, withheld → **UNKNOWN to CT** | CANDIDATE (CT) | LATER_HISTORICAL_KNOWLEDGE note | §III.B.6 p.96 (`V`) |
| R11 | Rico → CT probe | co-location/association ("learned of") | A | supported | OBSERVED_FACT | 1976 (`V`-phrase) |
| R12 | Halloran → Wheeler murder evidence | association | B | CANDIDATE/UNRESOLVED | LATER_HISTORICAL_KNOWLEDGE | Boston silo (§13) |
| R13 | Rico → Wheeler (schedule supply) | communication/financial | B | **UNRESOLVED** pre-breakthrough | INFERENCE, hearsay-only | breakthrough (§15) |
| R14 | Callahan → hit team (target-sheet handoff) | communication | B | **UNRESOLVED** pre-breakthrough | avoid: breakthrough hearsay | §15 |
| R15 | Connolly → Bulger/Flemmi (leaks) | communication | B | supported (post-2002 records) | LATER_HISTORICAL_KNOWLEDGE | `R` (federal trial) |

Dual-role contextualization: where the same pair has different truth in each case (e.g.,
R10 in CT vs federal world), every per-case relation row carries its own belief state and
`supports` field — **no leakage across cases** (Blackout rule).

---

## 9. Primary Corpus (Evidence + Artifacts)

Target cadence: **6–10 evidence packages per case**, each with 1+ artifact rows
(`ArtifactSchema`: type, mime, sizeBytes, hash of extraction — real extracted text). Each
package groups by **intake set** (what would have been dumped into a real evidence vault at
the time), not by narrative.

| # | Evidence package | Case | Intake set | Artifact types | Tag |
|---|---|---|---|---|---|
| P1 | House Report 108-414 Vol 1 — excerpts (§III.B.3, §III.B.6, Chronology) | A+B | single authoritative volume | DOCUMENT | `V` (quoted claims), `R` (wider excerpts) |
| P2 | OPR Exhibit 141 — Flemmi handling file | A/B context | federal internal | DOCUMENT | `V` (existence/relationship), `R` (page-level) |
| P3 | CT SOCTF licensing investigation file (1975–76) | A | CT task force | DOCUMENT/RECORD | `R` |
| P4 | Jan-1976 federal/CT correspondence (request + silence) | A | CT↔federal | DOCUMENT/EMAIL-equivalent RECORD | `V` (fact), `R` (exact letter) |
| P5 | Tulsa PD Homicide case file (1981) | B | Tulsa PD | RECORD/DOCUMENT | `R` (contents), `V` (existence implied by investigation) |
| P6 | Wheeler business records (Telex, WJA ownership) | B | corporate | RECORD/FINANCIAL-ADJACENT | `R` |
| P7 | Boston "silo" witness material re: Halloran (1982) | B | Boston federal | DOCUMENT/RECORD | `R` — **do not place in Tulsa intake** |
| P8 | [Sealed] Martorano plea + testimony transcript (2002) | BT | sealed | DOCUMENT/AUDIO (transcript) | `V` (hearsay finding), `R` (exact quote/date) |
| P9 | [Context] Connolly federal trial record (2002, U.S. District Court MA) | B | trial record | DOCUMENT | `V` (court correction), `R` (transcript quotes) |
| P10 | Contemporaneous press / public reporting | A+B | public | DOCUMENT | `R` |

Post-extraction steps per package: transcription of only the fact-bearing passages; one
annotation row per claim with `OBSERVED_FACT | INFERENCE | LATER_HISTORICAL_KNOWLEDGE`
tag; and an **Evidence status** that stays `INGESTED → PROCESSED → VERIFIED` only where a
claim is verified (Martorano-target-sheet chain **cannot** be `VERIFIED` — it is hearsay).

**"Evidence found by Case A in Case B" pattern** — none in the initial state. Case A's
crowd has no reason to reach into Case B's materials; the only legitimate cross-case read is
the bridge nodes (§6.1). Anything else belongs to the breakthrough (§15).

---

## 10. Timeline

Six event classes (all rendered in the UI timeline):

1. `EXTRACTED` — historical event the source observes (1975–1982 core).
2. `REPORTED` — "as reported by [report]" (possibly different calendar date than
   occurrence; preserve both: `EventTime` observed + `ReportedTime`).
3. `INVESTIGATION/INGESTION` — anytime the demo investigation begins/hears (demo clock).
4. `INFERRED` — analyst/INDAGO inference, always `INFERENCE` + derivedFrom.
5. `LATER_HISTORICAL_KNOWLEDGE` — post-closure knowledge (e.g., 2002 testimony) with a
   **visual "later" marker**, never merged into the 1981/82 flag timeline.
6. `DEMO_SIMULATION` — demo-analytic event (wave, robustness run) with explicit stamp.

| Date | Precision | Class | Event | Tag |
|---|---|---|---|---|
| 1975-05-27 | day | EXTRACTED | Rico retires from FBI | `V` (§III.B.3 p.89) |
| 1975 (fall) | approximate | EXTRACTED | CT SOCTF licensing probe of WJA begins | `R` |
| 1975–76 | range | EXTRACTED | Rico→WJA Security Director | `V` (shortly after retirement) |
| 1976-01 | month | EXTRACTED | CT requests federal background on Callahan; met with silence; feds share files with Rico (not CT) | `V` (§III.B.6 p.96) |
| 1964–1975 | range | LATER note | Rico handling of Flemmi (OPR Exhibit 141) | `V` |
| 1981-05-27 | day | EXTRACTED | Wheeler shot dead, Tulsa | `R` (report), `V` (fact) |
| 1981–82 | range | EXTRACTED | Tulsa Homicide investigation | `R` |
| 1982 | month-range | LATER (silo) | Halloran killed, Boston | `R` |
| 2002-05 | month | LATER | Connolly federal trial (U.S. District Court, Massachusetts) | `V` (court), `R` (dates) |
| 2002 | month-range | LATER | Martorano plea/testimony (breaks breakthrough seal) | `V` (existence), `R` (date/quote) |
| 2004-01 | month | LATER | Rico dies in custody before trial | `V` |
| [demo] | … | INGESTION/DEMO | when the real-case crowds enter the demo vault | demo |

Timeline rule: **preserve temporal uncertainty** — no EventTime is assigned a `day`
precision unless the source gives the day.

---

## 11. INITIAL Case A Crowd → Critical Early Evidence Bank → Non-Critical Pool → Final Crowd

- **Critical early bank (paint-minimum to make Case A legible):** probe existence (R5, R6),
  Rico and Callahan employment (R1, R2), the Jan-1976 request+silence correspondence (P4),
  license context (E8). Enough to render a co-location/organizational graph and the obvious
  `MISSING_DATA` gap (§16-AG1).
- **Non-critical pool (fills Out):** SOCTF structure (E6/E7), federal file existence (P2),
  press (P10), wider House Report excerpts.
- **Final crowd:** all of the above minus any `R`-unconfirmed item.

### 12. INITIAL Case B Crowd → Critical Early Evidence Bank → Non-Critical Pool → Final Crowd

- **Critical early bank:** victim + ownership + org chain (E3/E4/E11, R3/R4), murder
  circumstances (E18), Tulsa Homicide intake (E10, P5), Rico/Callahan bridge roles (E1/E2).
- **Non-critical pool:** Boston silo (Halloran P7 — **referenced as a known-other-does-not-
  have file; not ingested into Tulsa**), corporate records (P6), press.
- **Final crowd:** all above; any Halloran/Connolly/Bulger/Flemmi node beyond the silo
  reference is `DO_NOT_ENCODE` in the initial state (§6.4, §13).

---

## 13. Graph-Hole Criteria

A graph hole is **candidate missing relationship** — never a fact. Honest addendum: a detected
hole is an *analytical artifact*, not evidence a conspiracy hid data (§13 you-must-know).

| # | Hole | Type | Evidence for it | Significance | Suggested fill | Tag |
|---|---|---|---|---|---|---|
| H1 | Rico ↔ Wheeler "schedule" supply | MISSING_EDGE / BROKEN_CHAIN | Wheeler known to have routine schedule; Rico as security chief; no source ties them pre-2002 | high (structural) | testimony/trial transcripts | INFERENCE (pre-seal); `V`-resolved via breakthrough (§15) |
| H2 | Callahan ↔ Rico-Wheeler loop | MISSING_PATH | WJA president + security chief; no documented coordination re: Wheeler routine | medium | records of the Tulsa/CT plane | INFERENCE |
| H3 | CT's federal blind spot (Bulger/Flemmi loan-shark files withheld) | COMMUNITY_BOUNDARY | federal possessed files (§III.B.6 p.96, `V`); CT never saw them | high | federal disclosure records | OBSERVED_FACT (the withholding) as `FU`; the *files'* content is LATER note |
| H4 | Boston silo / Halloran dead-end | ISOLATED_NODE | Halloran witness material exists outside Tulsa intake | medium-high | Boston federal file (post-seal) | LATER note |
| H5 | Post-1975 WJA skimming "gap" | TEMPORAL_GAP / FINANCIAL_GAP | no source supports day-one theft; honest absence | low | financial audit subs | OBSERVED-absence |

**Where-required rule:** every GraphHole has `investigationGapId` linking to §16 gap after
classification (§16-AG1 etc.); holes must NOT carry `isCriminal`/`isHiddenByCriminal`.

---

## 14. Counter-Evidence

- **Explicit scope:** each advanced hypothesis needs ≥1 counter-evidence candidate where
  sources genuinely conflict — never invented "balance" (`COUNTER_EVIDENCE` bucket).
- Mandatory entries:
  - **C1** – No-day-one-theft: absence of early-skimming evidence → `TEMPORAL_IMPOSSIBILITY`
    (weak) vs the suggestion "theft began on hiring" (§6.4#6).
  - **C2** – "Rico warned Callahan" claim: record says Rico *learned of* the probe → the
    warning is `SOURCE_CREDIBILITY`/`INCOMPLETE_INFORMATION` contradiction item (`COUNTER
    _EVIDENCE`), tagged INFERENCE not fact.
  - **C3** – Martorano hearsay chain (post-seal): Rico died before testifying; only secondhand
    attribution exists → `SOURCE_CREDIBILITY`, keeping R13/R14 `UNRESOLVED`.
  - **C4** – CT/federal handled-the-sector divergence: `LOGICAL_INCONSISTENCY` guard that the
    CT graph never shows knowledge of the withheld Winter-Hill files.
- **Never refuted-by-fiat.** Counter-evidence updates a hypothesis's
  `contradictingEvidenceIds` / status (`CHALLENGED`, `INCONCLUSIVE`), using
  `CounterEvidenceReport.hypothesisStatus` only via compute (§17), never hardcoded `REFUTED`
  for drama.

---

## 15. Breakthrough Evidence (sealed)

**Entry gate:** breakthrough evidence must **not** appear in the initial graph, in either
final crowd, in any cross-case suggestion, or in any GraphHole *resolution* text. It is
reachable only via a sealed, deliberately "later" vantage (§21 page 6).

Chain (verified reading, per `EVIDENTIARY CLAIM VERIFICAITON.md`):

1. Martorano (2002 testimony) states he received a **target sheet** from **Callahan**;
2. Callahan attributed the sheet's contents to **Rico**;
3. Martorano **never met/spoke with Rico**;
4. ⇒ the Rico→target-sheet link is **single-source hearsay** (corroboration-limited);
5. Rico died in custody **Jan 2004** before any trial confrontation ⇒ hearsay stands;
6. ⇒ post-breakthrough relationships R13/R14 are **UNRESOLVED** even after the seal lifts
   (`support` low; posture not `VERIFIED`).

Extraction notes:
- Bind to the 2002 Martorano proceeding record (tag `R` for exact date/quote; do not invent).
- Mark the breakthrough **display quality** per §21 page 6 (an analyst "looks back" from 2002
  — a later-knowledge overlay, never a 1981 timeline entry).
- `validate.ts` guard (implementation): `validateDemoFixtures()` asserts **zero** references
  from any non-sealed fixture to any breakthrough entity/evidence ID (fence; code-free data
  contract, mirrored in §24).

---

## 16. INVESTIGATION_NOTES / Disposition-Only Notes

- Cross-reference notes (e.g., to the federal file in §84, the Boston silo) may exist as
  `LATER_HISTORICAL_KNOWLEDGE` annotations with **identical evidentiary value to their
  observed fact** — but they must be **explicitly dated and marked later**, and they must
  **not** feed the initial crowd's witness list.
- Disposition-only notes: e.g., "Case A licensing probe outcome (`R`)" / "Case B open" —
  allowed only as `INVESTIGATION_NOTES`, never as evidence status, and only where the
  reconstruction report supplies the wording.
- **Do-not-write** for this section: any note that would leak the breakthrough or the
  withheld-files existence into a pre-seal surface. §24 pins these.

---

## 17. Result Schema → Fields → Behavior

"Seeding guard": every numeric/ranking field is **either** `OBSERVED` (extracted), `INFERRED`
(computed), `DERIVED_BY_DEMO_LOGIC` (heuristic), or `NOT_COMPUTED` (stub). Nothing is seeded to
a known truth. Per assembly:

| Result schema | Field | Behavior |
|---|---|---|
| Lead (`domain/lead.ts`) | `priority / confidence / posture` | `DERIVED_BY_DEMO_LOGIC` with explicit rule notes; `relatedEvidenceIds` → extracted |
| InvestigativeGap (`domain/investigative-gap.ts`) | `type / priority / impact / expectedInformationValue` | `impact`, `expectedInformationValue`, `priority` → `DERIVED_BY_DEMO_LOGIC`; `type` → OBSERVED (from the honest gap) |
| Hypothesis (`domain/hypothesis.ts`) | `status / confidence / supporting* / contradicting*` | status pre-seal **never** `SUPPORTED` for conspiracy hypotheses; conflicting sets reflect real counter-evidence |
| EntityResolution (`intelligence/entity-resolution.ts`) | `score`, `comparisonStatus`, `resolutionStatus` | `COMPARED_AND_UNRESOLVED` vs `RESOLVED_MATCH` only per §18 evidence; scores `DERIVED_BY_DEMO_LOGIC` |
| Relation (`domain/relation.ts`) | `support / strength` | `strength` = structural signal (computed), `support` = belief from evidence (OBSERVED/inferred) |
| CrossCaseMatch (`intelligence/cross-case.ts`) | `matchScore`, `sharedEvidenceTypes` | derived from shared-bridge + evidence type overlap; narrative phrased as opportunity (§6.2) |
| RobustnessResult (`intelligence/robustness.ts`) | `robustnessScore`, `sensitiveObservations` | computed only (§22); `robustnessScore` NOT truth probability |
| CounterEvidenceReport | `hypothesisStatus` | computed from contradicting sets; never hardcoded `REFUTED` |
| Discovery/intelligence results | all | **NOT_COMPUTED** stubs only when unimplementable at demo scope |

---

## 18. Entity Resolution (ER)

- **Compare, don't merge.** Judge flow sees `CANDIDATE` → compare → accept/reject; an
  "accepted" merge is **only** shown where two sources independently corroborate identity
  (e.g., WJA President "Jack Callahan" = "John Callahan" via P1/P4 pages).
- *UNKNOWN BECAUSE NOT COMPARED ≠ UNKNOWN BECAUSE DIFFERENT*. Statuses carry
  `NOT_COMPARED` vs `COMPARED_AND_UNRESOLVED` honestly; never assert "different" for
  uncompared pairs.
- Callahan alias ("Jack"/"John") handling: evidence-based match (§6.3) — if source page
  gives both names for the WJA president, `RESOLVED_MATCH` with that citation; else
  `COMPARED_AND_UNRESOLVED`.
- Rico phase-split as `EntityRoleHypothesis` (FBI-era vs WJA-era) — never status
  `SPLIT`/`MERGED` for phase roles.
- No cross-case merge of CIDB-person-spaces except via the real shared bridge (§6.1).

---

## 19. Cross-Case Fixture Data

- **Not hand-authored.** The cross-case fixture derives from the shared bridge + evidence
  overlap; it is *computed at runtime* from the seeded sets (or `DERIVED_BY_DEMO_LOGIC` rules
  when demo compute is unavailable). No CrossCaseMatch row is literal extraction content.
- Judge wording stays diagnostic: "these investigations may warrant comparison" (§6.2).
- Bulger / Flemmi / Winter Hill enter cross-case tuples **only** in sealed/breakthrough state.

---

## 20. Source-Aware Wall Clock

Three clocks, non-mergeable:
1. **Observed/reported time** — the *source's* date (1975–2002).
2. **Ingestion time** — when the demo Vault ingests the crowd (demo clock).
3. **EventTime precision** — exact only where the source is exact.

Rules:
- Artifacts: MIME + size + hash of the **real extracted text** only. No fabricated
  file attachment bodies. If a physical scan is not available, use the transcript/
  report-extract text with mime `text/plain` and flag `R`.
- Never assign `IngestionTime` to a historical event; never assign a historical `day` to an
  approximate fact.
- Upload-time rule: the bulk "take this intake set into the vault" event is the **only**
  mechanism by which old documents get a modern vault timestamp (§10 class 3).

---

## 21. Mechanism Constraints & Demo-Only Content (the three "impossible but addressed" points)

1. **No invented demo-only content.** No placeholder "real" people, businesses, or events
   are invented to make a surface look alive. Every surface-consuming row traces to §7–§10.
2. **DemoAdapter breaks.** Signals that the demo adapters cannot model without fabrication
   (e.g., live-call feeds, tower pings, GPS breadcrumbs) are **deliberately inoperable** in
   the real-case crowds: the surface shows `NOT_COMPUTED`, never a fake feed. Physics
   invariants per §22b.
3. **Staff/extraction capacity.** Extraction of real transcript pages is bounded by what the
   reports actually expose (FREED-access telemetry = single source of truth); capacity claims
   beyond that are flagged `R` and deferred. The server-only path adds nothing and is not
   used.

### Physical demo evidence pages (per case)

| Page | Case | Content | Visibility |
|---|---|---|---|
| 1 | A | CT licensing probe — org graph + critical-crowd manifest | 1976 vantage |
| 2 | A | Jan-1976 request/silence + federal files (LATER marker) | 1976 vantage (+later note) |
| 3 | B | Tulsa intake — murder facts, victim, org/ownership | 1981 vantage |
| 4 | B | Tulsa looming holes (H1/H2) — NOT filled | 1981 vantage |
| 5 | B | Boston silo / Halloran — referenced as known-missing | 1982 vantage (silo note) |
| 6 | cross | **Sealed breakthrough page** — Martorano 2002 (hearsay overlay) | sealed; only "look-back" view |

Each page's "when it enters demo" is explicit (vantage column), 3–5 per case + 1 sealed.

---

## 22. Robustness Band

- `RobustnessResult` computed (perturbation over the real observation set) is **realizable**
  in demo compute: `robustnessScore`/`sensitiveObservations` derived; **never invented**
  (no "92/100").
- **Legal no-op (risk-register):** real-world cross-case detection and candidate-ER scaling
  are outside demo fidelity → `NOT_COMPUTED` stubs + risk-register line.
- Derivation order rule: robustness runs **after** data ingestion; no perturbation statistic
  may feed back into fixture content (no circularity).

---

## 23. Reasoning Ledger (event-trace + inference-flag)

- Backed by `events/base-event.ts` + `event-types.ts`: each decision surfaces as an event
  row (`OBSERVATION_EXTRACTED`, `HYPOTHESIS_PROMOTED`, `RELATION_CONTRADICTED`,
  `GRAPH_HOLE_DETECTED`, `GAP_IDENTIFIED`, `RUN_*`), each with `domainEventTime`.
- Every inference-carrying row additionally carries the `INFERENCE` tag + `derivedFrom`
  pointer to its observed-fact root; every LATER/annotation row carries the later marker.
- Code-free design: the ledger is **emitted from fixture data + compute events**, not a
  hardcoded transcript; nothing is retro-authored to make the final breakthrough appear
  "pre-ordained."

---

## 24. Do-Not-Write List — Final Composition (with implement gate)

Code-free data contract; the implementation gate asserts these **before** any surface change.

1. No `isGuilty`/`PROVEN_CRIMINAL`/`CONFIRMED_CONSPIRATOR` fields or statuses.
2. No breakthrough entity (E16), edge (R13/R14), or testimony (P8) in any non-sealed
   collection (mirror `validate.ts` fence §15).
3. No Bulger/Flemmi/Winter-Hill **initial** graph presence in Case A; no cross-case
   conspiracy suggestion pre-seal (§6.2, §19).
4. No invented dates, scores, robustness figures, or search-corpus content (§5, §20, §22).
5. No "Rico warned Callahan" as fact; no day-one-skimming claim (§6.4).
6. No cross-case readings between the initial crowds beyond the shared bridge (§6.1, §13).
7. No keys/pii invented; no real personal identifiers beyond what the source states.
8. `events.json` / `hypothesis-aliases.ts` / search corpus remain metadata/demo-only (§5).

Items 1–8 are the `DO_NOT_ENCODE` union. The gate runs during the implementation pass and is
recorded in the readiness verdict.

---

## 25. Implementation Readiness

### Verdict: **YELLOW**

**Green components** (buildable now from the verified core):
- Full contract/schema mapping (§2, §17) — every target schema read and pinned.
- Case scaffolds, bridge nodes E1/E2/E4, `V`-tagged facts (R1, R6–R9, R11; §III.B.3 p.89,
  chronology p.622, §III.B.6 p.96; OPR Exhibit 141) reusable verbatim.
- Sealed-bucket architecture + `validate.ts` fence contract (§15, §24) — no code change
  needed to spec it; the fence is a data law.
- Physical page plan and timeline classes fixed (§10, §21).

**Yellow items (explained):**
1. **Report-truncation debt.** My reads of both reports were truncated; every `R` item
   (exact Martorano/Connolly dates, artifact lists, §III.B.6 page spans past p.96 prose,
   probe-outcome text, press items) must be reconfirmed paragraph-by-paragraph by the
   implementer (Readiness Gate §4). Errs on the side of *less*, never *more*.
2. **Breakthrough posture is hearsay-bound.** The very "Aha!" — Rico supplying the target
   sheet — stays `UNRESOLVED`/low-support even post-seal (C3), which changes the demo's
   emotional arc vs the fictional case: the breakthrough page (§21 p6) must be a *neutral
   "this is what 2002 testimony establishes (and does not)"* page, not a confetti reveal.
3. **Physical transcripts may be absent.** If 1976 letters / 1981 Tulsa casefile / 2002
   transcripts are not digitized, artifacts degrade to text-extract rows (mime
   `text/plain`, `R` flags). This limits §9 P4/P5/P8 fidelity.
4. **"LATER-knowledge" overlay must be visually distinct**; a naive timeline merge would
   violate §10/§20. Requires the demo's timeline surface to render class-5 separately —
   a *presentation* only change, but flagged because it gates the "later" marker concept.
5. **Several `R` items conflict-risk**: Halloran-timeline (1982), precise CT probe closing,
   and the exact Connolly-trial connection to Wheeler before P9 is quoted. Each stays
   `LATER`/silo until quoted.

**No red items.** There is no verified fact that the contracts cannot express, and no
prescribed mechanism that corrupts the historical data.

### Minimum change plan (all flagged for a *separate* implementation pass, no code here)
1. Read both reports fully (gate §4); resolve every `R`.
2. Generate the fixture set per §2/§7–§10 with the §6.4/§24 guards; run
   `validateDemoFixtures()`-analog assertions.
3. Rewire the demo surfaces to consume the fixture-derived rows (leads, gaps, review, ledger,
   robustness) so no hardcoded dossier remains (per delivered audit plan A–F, out of this
   spec's scope but prerequisite to surfacing real data).
4. Implement the sealed-page + "later" overlay presentation (§21 p6).

### Risk register
| Risk | Mitigation |
|---|---|
| Report truncation → wrong `R` resolution | §4 gate; marker stays `R` until quoted |
| Breakthrough anti-climax (hearsay) | §15/§21 p6 neutral framing |
| Fabrication creep (scores/dates/search) | §24 gate + derive-only strips |
| Two-clock leakage | §10/§20 classing + timeline visual rule |

### Optional report-only annexes (no extraction)
- Claim-by-claim verification matrix (reconstruction vs verification).
- Discrepancy log (court correction; Rico-learned-of vs warned; CT/federal divergence).

*End of specification. All IDs, tags, and guardrails above are contracts for the extraction
implementation pass; none require a change to contracts or production code.*