# INDAGO_REAL_CASE_SOURCE_VERIFICATION.md

## FINAL HISTORICAL READINESS GATE — Source-Verified Final Data Package

Applies to: `INDAGO_REAL_CASE_EXTRACTION_SPEC.md` (all `R`-tagged, `S`-tagged, and
reconfirmation items) and `docs/INDAGO_REAL_CASE_DEMO_FLOW.md` (§27–§31 reconfirmation
items). Purpose: resolve every remaining `R`/reconfirm/re-confirm marker against the
strongest available primary sources, classify each item `V` / `LATER` / `DROP` /
`INFERENCE`, and publish the final demo-flow gate statuses per case area.

Constraints honored by this document:
- No application code, fixtures, providers, UI, or Judge route was modified.
- Only this verification document is created (the demo flow doc was script-integrated in a
  prior pass and is frozen at `DEMO FLOW STATUS: YELLOW`; the extraction spec is untouched).
- No `R` item was converted to `V` without sight of a source; items that could not be
  verified are explicitly classified `LATER` (true but post-dated), `DROP` (not
  corroborated → do not encode), or `INFERENCE` (analytical, never factual).

---

## 1. Purpose and Method

The extraction spec (`§3`, `§4`, `§25`) and the demo flow (`§30–§32`) both gate real-case
fixture replacement on clearing an `R` (reconfirm-in-reports) inventory. This document is
that gate.

Method:
1. Enumerate every `R`-tagged entity, relation, evidence package, timeline row, and
   reconfirmation note in the extraction spec and the demo flow doc.
2. Re-verify each against primary sources in precedence order:
   **House Report 108-414, Vol. 1** → **federal opinions** (Salemme, Connolly CA1, Limone)
   → **official FBI/DOJ material** → **state/local records** → **reputable contemporary
   reporting** (last resort for detail not in primary text).
3. Wikipedia, blogs, and AI summaries were used only to *locate* claims, never to verify.
4. Assign each item exactly one of `V` / `LATER` / `DROP` / `INFERENCE` (never a silent
   `R→V`), and record the quoted evidence and URL.

### Conventions
- `V` = verified against sight of the source (quote + page/fn cited).
- `LATER` = historically true but established later than the initial crowd vantage; stays
  in `LATER_HISTORICAL_KNOWLEDGE` / the sealed bucket, never in the initial graph.
- `DROP` = not corroborated by any source in the hierarchy → **DO_NOT_ENCODE**.
- `INFERENCE` = analytical derivation from an observed fact; always `derivedFrom`-tagged.

---

## 2. Source Hierarchy and Access Points

| Rank | Source | Verified content used | Public access |
|---|---|---|---|
| P1 | House Report 108-414, Vol. 1, "Everything Secret Degenerates" (Committee on Government Reform, Feb 3, 2004) — §III.B.3 (Oklahoma ~p.89), §III.B.4 (Florida p.92), §III.B.5 (Massachusetts pp.93–95), §III.B.6 (Connecticut pp.96–98), Investigative Chronology (ToC ~p.452), Exhibits (74, 141, 226, 719) | All Case A/B core quotes (§3–§8, §11, §15) | HTML: https://www.govinfo.gov/content/pkg/CRPT-108hrpt414/html/CRPT-108hrpt414-vol1.htm — PDF: https://www.govinfo.gov/content/pkg/CRPT-108hrpt414/pdf/CRPT-108hrpt414-vol1.pdf — congress.gov PDF: https://www.congress.gov/108/crpt/hrpt414/CRPT-108hrpt414-vol1.pdf |
| P1b | Feb 27, 2002 hearing, "Justice Department Misconduct in Boston" (testimony of Austin McGuigan), CHRG-107hhrg78662 | McGuigan sworn detail: Jan-1976 federal awareness, files handed to a retired agent, surveillance to Boston, murder dates | https://www.govinfo.gov/content/pkg/CHRG-107hhrg78662/html/CHRG-107hhrg78662.htm |
| P2 | United States v. Salemme, 91 F. Supp. 2d 141 (D. Mass. 1999) (Wolf, J.), §II.13 "The Wheeler, Halloran, and Callahan Murders" (pp. 208–213) | Leak quote (§6), Wheeler-skimming finding (§11), RICO-act outcomes (§12) | https://law.justia.com/cases/federal/district-courts/FSupp2/91/141/2510809/ — https://www.courtlistener.com/opinion/2510809/united-states-v-salemme/ |
| P3 | United States v. Connolly, 341 F.3d 16 (1st Cir. 2003) | May-2002 trial, Judge Tauro, RICO §1962(c) + 2×§1503 + §1001, 121 months, affirmed; Halloran leak corroboration (Weeks/Martorano testimony) | https://www.ca1.uscourts.gov/sites/ca1/files/opnfiles/02-2201-01A.pdf — https://www.courtlistener.com/opinion/200641/united-states-v-connolly/summaries/ |
| P4 | Limone v. United States, 497 F. Supp. 2d 143 (D. Mass. 2007) | Rico FBI service 2/26/1951–5/27/1975; transferred to Miami field office Apr 1970 | https://www.leagle.com/decision/2007640497fsupp2d1431624 |
| P5 | FBI (official): Bulger-series Vault; 8/12/2013 conviction press release; CA1 affirmance 2016 | Bulger jury conviction (11 murders incl. Wheeler/Callahan/Halloran) = **verdict, not plea** | https://vault.fbi.gov/james-whitey-bulger — https://archives.fbi.gov/archives/boston/press-releases/2013/federal-jury-convicts-james-whitey-bulger — https://law.justia.com/cases/federal/appellate-courts/ca1/13-2447/13-2447-2016-03-04.html |
| R1–R6 | Reputable contemporary reporting (only where primary text ends): NYT 10/10/2003; Boston Globe (2013); UPI 5/14/2002; CBS 11/21/2003; Oklahoman 1/18/2004; Fox 1/17/2004; Sun-Journal (Sept 2008); Hartford Courant chronology 11/9/1997 | Trial dates, sentence dates, Rico arrest/death, victim descriptors | cited per item below |

All URLs above were live at verification time. The House Report HTML is very large; the
verified quotes in this document were extracted via targeted phrase and full-text
searches (the quotes below carry the report's own section/footnote citations).

---

## 3. Master `R` → Resolution Table

Every `R`/reconfirmation marker found in the extraction spec and demo flow doc, with the
verification outcome. (Source-keyed quotes for each are in §4–§14.)

### 3.1 Entities (§7 of the extraction spec)

| ID | Item | Prior tag | Resolution | Basis |
|---|---|---|---|---|
| E6 | Austin McGuigan, CT task-force head | `R` | **V** (note: spelled **Austin**, not "Edward J.") | HR §III.B.6 pp.96–98; hearing CHRG-107hhrg78662 (chief prosecutor, CT Statewide Organized Crime Task Force, 1975–78) |
| E7 | Connecticut State Police (as supporting agency) | `R` | **DROP as separate initial entity** | The operative agency is the CT Statewide Organized Crime Task Force (E5). A distinct "Connecticut State Police" node is not separately titled in the verified excerpts → do not encode as a separate initial entity |
| E8 | Connecticut Division of Special Revenue (license regulator) | `R` | **DROP as separately-named entity** (keep licensing-regulator *context* as LATER note) | WJA-licensing probe context is V (HR §III.B.6); the agency's this-name is not sight-verified in Vol.1 → the *function* (licensing regulator) is encoded, the specific node is not |
| E9 | FBI Boston Field Office — presence in Case B initial graph | `R` | **DROP in initial Case B graph** (keep in Case A) | Case A presence + files-shared-with-Rico is V (§III.B.6 p.96). Case B initial-graph presence is the later obstruction/leak context → `LATER`, stays behind the Boston silo/federal-blind-spot |
| E12 | John Connolly | `R` (initial B) | **V** (person + proceedings); **DROP from initial B graph** | Person/trial verified (341 F.3d 16; May 2002; Judge Tauro; 121 months). Post-2002 LATER context must not appear in the 1981 initial crowd |
| E13 | Stephen "The Rifleman" Flemmi | `R` (B) | **V** (person + records) | HR Exhibit 141 (6/20/1967 SAC→Hoover), chronology 3-12-65 (Jimmy Flemmi assigned to SA Rico), Salemme §II.13, 2003 plea. Initial-graph placement stays **DO_NOT_ENCODE** per spec design |
| E14 | James "Whitey" Bulger | `R` (B) | **V** (person + records) | Salemme §II.13; HR chronology 5-27-81; 2013 jury verdict (P5). Initial-graph placement stays **DO_NOT_ENCODE** |

### 3.2 Relationships (§8 of the extraction spec)

| ID | Item | Prior tag | Resolution | Basis |
|---|---|---|---|---|
| R2 | Callahan → WJA (President) | `R` | **V** | HR §III.B.5 p.93: "the former President of World Jai Alai whom Wheeler fired"; Courant chronology (president ~1974). Presidency V; the specific hire date is LATER (courant-sourced) |
| R3 | Wheeler → WJA (ownership) | `R` | **V** | HR chronology 5-27-81 ("owner of World Jai Alai"); §III.B.5 p.93 ("owner of World Jai Alai") |
| R4 | Wheeler → Telex (Chairman) | `R` | **V** | NYT 10/10/2003 ("chairman of Telex Corp. and owner of World Jai Alai"); consistent with Salemme |
| R5 | SOCTF → WJA (licensing probe) | `R` | **V** (probe existence); **DROP** (the specific "fall 1975" start) | Probe existence V (§III.B.6, licensing probe of WJA; Jan-1976 request per §III.B.6 p.96). The seasonal start date is not sight-verified → use `approximate` ("mid-1970s"), never an invented day/season |
| R9 | Rico → Flemmi (association) | `R` (B) / "OPR Exhibit 141" | **V** — with dual corrections: (a) the source is **House Report Exhibit 141** (no "OPR Exhibit" numbering exists in Vol.1); (b) the memo (SAC Boston → Hoover, June 20, 1967) concerns **Flemmi/Barboza development**, not Callahan | HR fn. 6, fn. 49; chronology 3-12-65 (Exhibit 74); §III.B.6 p.96 range corrected to documented **3/12/1965 → 1975** (assigned to Rico; Rico retired 5/27/1975 per Limone) |
| R15 | Connolly → Bulger/Flemmi (leaks) | `R` | **V** | Salemme §II.13 exact quote (§6 below); 341 F.3d 16 corroboration |

### 3.3 Evidence packages (§9 of the extraction spec)

| ID | Item | Prior tag | Resolution | Basis |
|---|---|---|---|---|
| P1 | House Report excerpts | `R` (wider) | **V** for all now-quoted passages (§III.B.3/4/5/6 + Chronology) | quotes in §4–§7, §11, §15 |
| P2 | "OPR Exhibit 141" Flemmi-handling file | `V` (existence) + `R` (page-level) | **V**; rename to **House Report Exhibit 141** | identity + content confirmed (§A, §15). "OPR Exhibit 141" is a mislabel → the verified report exhibit is HR Exhibit 141 |
| P3 | CT SOCTF licensing file (1975–76) | `R` | **LATER / contents-unverified-as-scans** | Not publicly available; reconstructable text = HR §III.B.6 + McGuigan hearing. Artifact = `text/plain` extract with `R`-style caveat |
| P4 | Jan-1976 federal/CT correspondence | `V` (fact) + `R` (exact letter) | **V** (fact); **DROP** (exact letter — not public) | fact per §III.B.6 pp.96–97 + hearing pp.675–77; letter itself not scanned anywhere |
| P5 | Tulsa PD Homicide file (1981) | `V` (existence) + `R` (contents) | **V** (existence); **DROP** (contents) | existence: HR chronology (5-27-81 entry; July-1981 tip to Tulsa/CT investigators). Contents not public (Tulsa PD/DA). Artifact = report-extract only |
| P6 | Wheeler business records (Telex/WJA) | `R` | **V** (limited facts) | ownership + chairmanship V (R3/R4). Full corporate records not public |
| P7 | Boston "silo" witness material re: Halloran | `R` | **V** (facts) | Salemme §II.13; HR chronology 5-11-82. Silo visibility rule unchanged (referenced as known-missing, never ingested into Tulsa) |
| P8 | [Sealed] Martorano 2002 proceedings | `V` (hearsay) + `R` (quote/date) | **V** (both) — with **correction of the "2002 plea" framing** | testimony: May 2002, Connolly federal trial (Judge Tauro); quote "a piece of paper written by Rico with all the information—his phone numbers, addresses" (HR fn. 607, §III.B.5 p.95). Formal plea = **Sept 1999 agreement**, **June 2004 sentencing** (Judge Wolf, ~14 yrs, ~20 murders). NOT a "2002 plea." Transcript not public |
| P9 | Connolly federal trial record (2002) | `V` (court) + `R` (quotes) | **V** (proceedings) | 341 F.3d 16 (May 2002 trial, Judge Tauro; verdict; 121 months; affirmed). Transcript not public |
| P10 | Contemporaneous press | `R` | **V** (specific cited items only) | each press item used in §4–§14 is individually cited; no generalized press intake |

### 3.4 Timeline rows (§10 of the extraction spec)

| Date | Item | Prior tag | Resolution |
|---|---|---|---|
| 1975 (fall) | CT SOCTF probe begins | `R` | **approximate** ("mid-1970s"); seasonal/day precision DROP |
| 1981-05-27 | Wheeler shot dead | `R`(report)/`V`(fact) | **V** (HR chronology 5-27-81; Salemme; NYT) |
| 1981–82 | Tulsa investigation | `R` | **V** (existence); contents DROP |
| 1982 | Halloran killed | `R` (month-range) | **V with day precision** — 5/11/1982 (HR chronology: Halloran **and Michael Donahue** killed) |
| 2002-05 | Connolly federal trial | `V`(court)/`R`(dates) | **V** — testimony 5/13–14/2002, verdict 5/28/2002, Judge Tauro, 121 months |
| 2002 | Martorano "plea/testimony" | `V`(existence)/`R`(date/quote) | **V with correction** — testified May 2002 (not a 2002 plea); plea agreement Sept 1999; sentencing June 2004 |
| 2004-01 | Rico dies before trial | `V` | **V with precision** — arrested 10/9/2003; died ~11:45pm 1/16/2004, Tulsa hospital, under indictment, before trial |

### 3.5 Cross-document reconfirmation notes (demo flow doc)

| Note | Prior status | Resolution |
|---|---|---|
| §28 ACT 1–2 Court A/B evidence items | re-confirm vs fixtures | **V** — Case A items = §3.1/§3.3 P3/P4/R5/R6; Case B items = §3.1/§3.3 P5/B1/R3/R4; all verified here |
| §28 ACT 5 Bahamas expense entry | re-confirm vs fixtures | **V** — = HR Exhibit 719 (World Jai Alai Purchase Report, 5/11/1981); "financial observation / anomaly only" framing upheld (never proof of bribery/conspiracy) |
| §27 L1 descriptor ("company internal-security/personnel ledger") | — | **CORRECTION REQUIRED** at fixture time: the real artifact is a **WJA corporate purchase/expense report** (Exhibit 719), not a personnel/internal-security ledger. The "ledger" label must be revised (§8 Q8). Artifact position (live-ingest, sealed until Phase 1, absent from initial crowds) stands |
| §27 S1 descriptor (WJA audit/financial document) | `R`-caveated | **V** for the audit *event* (HR §III.B.5 p.93); **physical document NOT public** → Phase 2 artifact file **BLOCKED**; content basis = report text extract (§11) |
| §31-1 / §31-2 / §31-5 | R items | cleared as above; residue re-stated in §16 |

---

## 4. Case A Verification — Connecticut Licensing Probe (§III.B.6)

All quotes are sight-verified from House Report 108-414 Vol.1.

1. **The task force and its chief.** The report (its §III.B.6 "Connecticut," pp. 96–98)
   documents the **Connecticut Statewide Organized Crime Task Force** probe of World Jai Alai
   licensing; the report names chief prosecutor **Austin McGuigan** as a principal actor.

2. **Why investigators needed federal help.** "We did learn that the Federal Government was
   made aware that allegations concerning Callahan were made that he might be involved in
   loan sharking with the Winter Hill Gang and James Martorano. This information was provided
   to Mr. Rico who did not provide it to us." (McGuigan sworn testimony, Feb 27, 2002 hearing
   pp. 676–677, quoted in HR §III.B.6 fn. 683/684.)

3. **The request and the silence.** §III.B.6 p.96: "The task force requested information
   about World Jai Alai President John Callahan from federal law enforcement agencies but
   received no information of consequence. McGuigan later discovered that the federal
   government was aware, in January 1976, of allegations that Callahan was involved in loan
   sharking with Boston's Winter Hill Gang. This information was shared with former FBI
   Special Agent Paul Rico while the task force's request for information from federal
   officials was met with silence."

4. **The withheld-file direction.** McGuigan (quoted HR p.96): "Federal agents were all too
   willing to provide information regarding state and local investigations to former FBI
   agents who were employed by the very businesses that were under investigation . . . but
   the same information was not provided to the agencies mandated by law to prosecute these
   cases." The report does NOT state the identity of the federal office that handed files
   to Rico ("I do not know who handed them over"; *Id.* at 678). → The **fact** E9→E2
   (R8 V) is the sharing; the supplying office is **UNKNOWN** (`FU`).

5. **Surveillance / destination-vs-observed-travel (this is the demo's ACT 1 anchor).**
   §III.B.6 pp.97–98: Callahan told the task force he was going directly to **Miami** after a
   Hartford meeting; task-force investigators followed him to **Boston instead**. McGuigan
   (hearing pp. 676, 682): he followed to Boston, to "Clark's Turn of the Century Cafe," and
   "he was actually in a motel room in Boston." Suffolk County chief prosecutor Tom Dwyer told
   McGuigan that Callahan had "organized crime connections, Winter Hill Gang" and that his
   unit's surveillance showed Callahan "had meetings with the Winter Hill Gang, John
   Martorano, the Flemmis, Howie Winter, and so forth." → the **"given-destination Miami vs
   observed-travel Boston"** narrative is source-accurate. The separate "bundled out of
   surveillance because FBI agents were present" proviso **is NOT in the record** → DROP.

6. **Rico "learned of" the probe — not "warned Callahan."** HR §III.B.6 p.98: "Jai Alai
   Security Director Rico learned of the investigation shortly before the hearing." The
   "Rico warned Callahan" framing remains DO_NOT_ENCODE as fact (§6.4#7 of the spec).

7. **Callahan's resignation.** HR §III.B.6: Callahan resigned **before** the task force could
   secure his testimony at a hearing scheduled for **May 3, 1976**, removing him from the
   task force's jurisdiction (he was no longer tied to Connecticut). No proof that Callahan
   had been an FBI agent is in the report; the report's only "Security Director" title at WJA
   is **Rico's**.

8. **Probe outcome.** The *formal close* of the Connecticut licensing probe is **not**
   documented in the verified excerpts → **LATER/UNVERIFIED** (do not encode a case-A verdict;
   encode the documented events only).

**Summary:** Case A core **GREEN** (V). The "bundled-out-of-surveillance" detail and the
"Edward J. McGuigan" name are **DROP**; the supplying-office identity is `FU`; the probe's
formal closing is **LATER/UNVERIFIED**.

---

## 5. Case B Verification — Tulsa Homicide of Roger Wheeler

HR 108-414 Vol.1, Investigative Chronology entry **5-27-81** (sight-verified):

> "Roger Wheeler, Sr., owner of World Jai Alai, is shot dead at Southern Hills Country Club
> in Tulsa, Oklahoma. John Martorano shoots Wheeler, and Joe MacDonald is the getaway
> driver. Others implicated are James 'Whitey' Bulger, Stephen 'The Rifleman' Flemmi and
> H. Paul Rico."

Corroboration (HR §III.B.5 p.93): "Winter Hill Gang hit men murdered Wheeler at the Southern
Hills Country Club in Tulsa, Oklahoma, on May 27, 1981." Victim descriptor (NYT 10/10/2003):
Wheeler, 55, chairman of Telex Corp. and owner of World Jai Alai, "shot point-blank in the
head as he got in his car after a round of golf" at Southern Hills CC. Martorano's own 2013
account (Boston Globe): "I opened the door and shot him" — "in between the eyes."

Investigation linkage, HR chronology: "July 1981 — a tip [reached] Tulsa and Connecticut
investigators that the [Wheeler] murder was a Winter Hill / WJA matter, and the FBI circle
stonewalled rather than assisted." → Case B investigation existence V; Tulsa PD/DA case-file
contents not public → DROP.

**Summary:** Case B core facts **GREEN** (V: date, scene, shooter, getaway driver, victim
identity/ownership, named implicated persons, Tulsa-active investigation).

---

## 6. Boston Silos — Halloran Verification

**Salemme §II.13 (sight-verified):**

> "In 1982, Morris caused Connolly to tell Flemmi and Bulger that Brian Halloran was
> cooperating with the FBI and had implicated them in the murder of Roger Wheeler, the
> President of World Jai Lai [sic]. About two weeks later, Halloran was killed. Morris
> believed that Bulger and Flemmi were responsible for Halloran's death, but did not disclose
> to the agents investigating it that they had been told that Halloran was cooperating with
> the Bureau."

Corroboration — 341 F.3d 16 (CA1): Martorano testified Connolly told Bulger that another
informant, Halloran, had implicated him in the Wheeler murder; Kevin Weeks testified that
Bulger, upon learning from Connolly of Halloran's betrayal, "ambushed" Halloran, fatally
shooting Halloran and his driver **Michael Donahue**.

HR chronology 5-11-82 (sight-verified): "Brian Halloran and Michael Donahue are murdered.
Jimmy Flynn is arrested for the murder and acquitted."

**Correction of an earlier non-verified framing:** the claim that *"Flemmi said Rico would
set up the murder"* or that the threat reached Halloran through a "Salvatore/sally" relay is
**NOT in Salemme, the CA1 opinion, or the House Report**. The documented relay is
**Morris→Connolly→Flemmi/Bulger**. → DROP the relay-invention; keep the verified leak chain +
the case's exposure of Halloran's cooperation (Salemme: FBI removed Halloran from the
informant program and denied him witness protection in early May 1982 — V at 209).

**Summary:** Halloran chain **GREEN** (V) with the corrected relay; the invented relay and
the "Rico set up the Halloran murder" wording are **DO_NOT_ENCODE**.

---

## 7. Breakthrough Chain Verification (Martorano hearsay)

Spec §15 chain, each link re-verified:

| Link | Status | Evidence |
|---|---|---|
| 1. Martorano received a target sheet / paper from Callahan | **V** (as testified) | HR §III.B.5 p.95 fn. 607 (Boston Herald 5/14/2002): Martorano told a federal jury he was given "a piece of paper written by Rico with all the information—his phone numbers, addresses" |
| 2. Callahan attributed the paper's contents to Rico | **V** (as testified; per Fox 2013 trial reporting: Rico wrote down Wheeler's information incl. his expected tee time, gave it to Callahan, who gave it to Martorano) | Fox News 2013 (Bulger trial testimony); consistent with HR fn. 607 |
| 3. Martorano never met/spoke with Rico | **V** (substance: Rico never confronted by him); exact wording not found | reported across 2002–2013 coverage of his testimony |
| 4. ⇒ Rico→target-sheet link is single-source hearsay | **V (classification)** | the chain rests on Martorano's account; corroboration-limited |
| 5. Rico died before trial confrontation | **V** | died 1/16/2004 under indictment (§14) |
| 6. ⇒ R13/R14 remain UNRESOLVED/low-support even post-seal | **V (posture upheld)** | spec §15/§21p6; demo-flow P1.14/P2.14 |

**Summary:** breakthrough chain **GREEN** as *hearsay-posture* (all six classifications
verified); no link is upgraded to `VERIFIED`-for-the-conspiracy. The "piece of paper" here is
the **Wheeler target sheet** — distinct from Exhibit 719 (§8).

---

## 8. Exhibit 719 Deep Verification (Special Priority 1)

Identity (sight-verified): **"World Jai Alai Purchase Report (May 11, 1981) (Exhibit 719)."**
Source apparatus: HR §III.B.4 "Florida" p.92, fn. 625, and the Investigative Chronology
entry 5-11-81. Report text: *"Documents obtained by the Committee also show that the previous
year Rico had entertained FBI Special Agents Tom Dowd, whose wife worked for Rico, and Jerry
Forrester in the Bahamas and that this business relationship was paid for by World Jai
Alai."* Chronology 5-11-81: *"A World Jai Alai expense report indicates that Paul Rico and
World Jai Alai entertained FBI Special Agents Tom Dowd and Jerry Forrester in the Bahamas.
[Note: Rico testified at the Alcee Hastings impeachment trial before the Senate that Tom
Dowd's wife was an employee of Miami Jai Alai.]"*

18 sub-questions (each answered from the above single source-set):

1. **What is Exhibit 719?** A World Jai Alai corporate **purchase report** dated May 11, 1981.
2. **What record type?** Corporate expense/purchase record, not a personnel or internal-
   security ledger.
3. **Who is named?** Paul Rico (retired FBI; WJA VP/director of security); FBI Special
   Agents **Tom Dowd** (wife an employee of Miami Jai Alai, per Rico's Senate testimony) and
   **Jerry Forrester**.
4. **Date?** Purchase report dated **5/11/1981**; the travel date is not stated (report
   places the trip "the previous year" relative to its 1981–82 Florida discussion).
5. **Who paid?** WJA corporate funds ("paid for by World Jai Alai").
6. **Is Callahan on this document?** **NOT VERIFIED** — only Rico, Dowd, Forrester are named.
7. **Does it prove bribery/corruption?** **No.** It exhibits unusual corporate hospitality
   from a former-agent security chief toward active FBI agents. The demo-flow §28 binding
   note governs: "a financial observation / anomaly — never proof of bribery, conspiracy, or
   murder coordination."
8. **Can it be called a "ledger"?** **Only as a label override.** The record is a purchase/
   expense report. The extraction-demo's L1 descriptor "internal-security/personnel ledger"
   **must be revised** to "WJA corporate expense/purchase record (Exhibit 719, 5/11/1981)."
9. **Which hidden relationship does it genuinely support?** Rico ↔ WJA ↔ active-FBI-Boston
   agent overlap (the security-function role with live federal ties). It does **not** contain
   the Rico→hitman supply edge.
10. **Which OBSERVED_FACT rows can INDAGO extract?** (a) Rico = WJA VP/security director;
    (b) purchase report dated 5/11/1981; (c) WJA funds paid for Bahamas entertaining; (d) FBI
    SAs Dowd and Forrester were the guests; (e) Dowd's wife employed by Miami Jai Alai — each
    with pageRef (HR p.92 fn.625; chronology 5-11-81).
11. **Which edges?** R1-type organizational (Rico→WJA) V; WJA→Dowd/Forrester financial
    (WJA-paid hosting) V; co-location (Bahamas) V. Status `OBSERVED`; no criminality field.
12. **What must NOT be encoded from it?** No "murder planning," no bribery conclusion, no
    invented amounts, no conflation with the Wheeler target sheet (§7).
13. **Does it connect to Wheeler?** Temporally adjacent (5/11/1981 document; 5/27/1981
    murder), but the report draws **no Wheeler link** on this document → the proximity is an
    `INFERENCE`, never a fact.
14. **Is a scan public?** **No.** Only the report's citation is public (excerpt FOUND at HR
    p.92 fn.625 + chronology 5-11-81). Original resides in FBI Boston case files (FOIA) or
    WJA corporate records. Artifact degrades to `text/plain` extract.
15. **Is this the "ledger" that breaks the breakout?** **Partially.** It is a legitimate
    Phase-1 live-ingest artifact (real, dated, absent from initial crowds), but its content
    reaches only "security chief hosted active agents at corporate expense." The graph-state
    change it can cause is structural (adds WJA-financial record + security-chief corporate
    role), not a confession.
16. **Hearsay posture?** The document itself is `FI` (documentary). The report interpretive
    sentence is OBSERVED_FACT-of-report. Any corruption inference is `FH`/`INFERENCE`.
17. **Gate status?** **GREEN** for document identity/date/persons/payor. The L1 "internal-
    security/personnel ledger" label: **RED** (unsupported framing — revision required).
18. **Required follow-through.** Keep out of all initial crowds (future-dated 1981 vs 1976
    Case-A vantage); arrive only via live ingest (L1); never present as proof of the hitman
    chain; apply the label correction; degrees of the file hold in the FBI FOIA/records path.

**Summary:** Exhibit 719 **GREEN** for identity and evidentiary content; **LABEL CORRECTION
RESERVED** for L1; "Callahan on the trip" **NOT VERIFIED**; travel date **NOT VERIFIED**.

---

## 9. Phase 1 Hidden Connection — THE SECURITY CHIEF = H. Paul Rico

- **Why the SECURITY CHIEF is the hidden discovery.** The demo's Phase-1 hypothesis is the
  security function's role in the network, structurally located in people/roles, with the
  WJA "same company" overlap explicitly foreclosed as the discovery (demo-flow §7/§30-6).
  Source-anchored: Rico, retired FBI, is WJA **vice president and director of security**
  (HR §III.B.5 p.95; §III.B.3 p.89; §III.B.6 p.98 "Jai Alai Security Director Rico") — the
  only security-director title in the case. **V.**
- **Initial evidence must not contain the breakthrough.** Checked against the Case-A/Case-B
  initial-crowd manifests (§11/§12 of the spec, §29 of the demo flow): initial evidence =
  probe existence, employment (R1/R2), Jan-1976 request/silence, files-shared-with-Rico
  (R8), Tulsa murder facts, ownership chain. No initial item states or implies Rico supplied
  Wheeler's schedule → **the initial evidence contains only the *hypothesis*, not the
  resolution.** **GREEN.**
- **The "learned of the investigation" fact (R11).** V: HR §III.B.6 p.98 "Rico learned of
  the investigation shortly before the hearing." Keep phrasing as "learned of," never
  "warned Callahan."
- **Phase-split.** FBI-era Rico / WJA-era Rico / Rico-indicted (2004) = one canonical entity
  with an `EntityRoleHypothesis` (§6.3) — supported by Limone (FBI 1951–1975) and HR (WJA
  security after retirement; chronology 5-27-81 "H. Paul Rico" implicated). **V.**

**Summary:** Phase-1 hidden connection **GREEN**: the security-chief identity and the initial
evidence/breakthrough separation are fully verified.

---

## 10. Phase 1 Live Ledger L1 — Feasibility (Special Priority 3)

Contract (demo-flow §12 10-question contract; §27 L1): a real artifact, absent from initial
crowds, ingestible, capable of a real graph/hypothesis state change — never a boolean flip.

- **Real artifact:** ✓ the WJA Purchase Report 5/11/1981 (Exhibit 719) is real, named,
  dated (HR fn. 625). Text-extract availability ✓ (mime `text/plain`; scan not public).
- **Absent from initial crowds:** ✓ future-dated relative to both vantages (1976 CT; 1981
  Tulsa basic intake). It belongs in the sealed bucket and arrives via live ingest.
- **Ingestible with real mutation:** ✓ events `EVIDENCE_INGESTED → … → OBSERVED_EXTRACTED →
  GRAPH_HOLE_DETECTED → GAP_IDENTIFIED`; the state change = adding the WJA-financial
  record + security-chief corporate-role edges (R1-type + WJA→Dowd/Forrester financial).
- **Hypothesis state change:** ✓ fills AG1 (federal/networking gap) and strengthens the
  "why does an FBI agent run WJA security / host active agents at corporate expense" signal
  — an honest, structural discovery.
- **Hearsay-free:** ✓ the document is `FI`; no hearsay edges until P2.14.
- **Limitation:** the ledger cannot itself produce the Rico→hitman relationship. That comes
  only from the 2002 Martorano testimony (hearsay) in the validation phase. Enforce
  "received a document, not the relationship" (demo-flow §28 checkpoint 6).

**Determination:** **GREEN with the L1 label correction** (§8 Q8/Q17): re-label L1 as the
WJA corporate expense/purchase record (Exhibit 719), not an "internal-security/personnel
ledger."

---

## 11. Martorano Testimony Verification (Special Priority 4)

**Proceeding classification (each verified):**

| Witness-proceeding fact | Determination | Source |
|---|---|---|
| Martorano testified in **May 2002** at Connolly's federal trial, USDC D. Massachusetts, **Judge Joseph L. Tauro** | **V** | 341 F.3d 16; UPI 5/14/2002 (testimony 5/13–14/2002); HR fn. 607 |
| He testified that Rico approached him about killing Wheeler because Wheeler had audited WJA / learned of the skimming | **V (as his testimony — ALLEGATION-via-Martorano)** | NYT 10/10/2003; HR §III.B.5 p.95 fn. 607 |
| He received "a piece of paper written by Rico" with Wheeler's phone numbers/addresses | **V (quote)** | HR §III.B.5 p.95 fn. 607 |
| He never met/spoke with Rico | **V (substantive; exact quote unverified)** | his 2002 testimony as reported (NYT/UPI) |
| Formal plea: **cooperation/plea agreement Sept 1999** (unsealed); **sentenced June 2004** by **Judge Mark L. Wolf**, ~14 years, ~20 murders; released ~2007 | **V — corrects any "2002 plea" wording** | UPI 9/1999; SeacoastOnline 6/2004; HR chronology (2002–03 cooperation); CBS/CNN release reporting |
| Testified again **Sept 2008** at Connolly's Miami-Dade state murder trial (Judge Stanford Blake) | **V** | Sun-Journal/AP Sept 17–19, 2008 |

**Classification (spec §15; demo-flow P2.14):** every link in the chain that implicates Rico
as an *actor* in the Wheeler murder is **hearsay/ALLEGATION-via-Martorano**, never
self-observed by Rico and never confrontation-tested (Rico died pre-trial). The *fact* "he
testified X" is V; the *proposition* "Rico did X" stays `UNRESOLVED`/low-support. The demo's
Phase-1 prediction must not use this testimony as discovery — only as post-prediction
validation (spec §4, §15; demo-flow P1.14). **GREEN** for the classification stance; the
hearsay chain itself by design is **NOT VERIFIED-as-fact** (that is the correct posture).

---

## 12. Rico Endgame Verification

| Fact | Determination | Source |
|---|---|---|
| Charged by Tulsa County (grand jury true bill) with murder + conspiracy re Wheeler | **V** | NYT 10/10/2003; Oklahoman 1/2004; HR fn. 595 |
| Age at charge: 78 (b. 4/29/1925) | **V** | NYT/AP/Oklahoman |
| Arrested **Thu Oct 9, 2003** (~7am, Miami home) | **V** | AP/Courant (reported 10/10/2003); some accounts say 10/9–10 |
| Executed by Tulsa + Miami-Dade law enforcement (Tulsa detective Sgt. Mike Huff foregrounded in local reporting) | **V** (agency; "US Marshals/FBI" wording NOT verified) | Courant 10/10/2003; LJWorld local |
| Extradited to Oklahoma early Jan 2004; competency evaluation pending | **V** | Oklahoman 1/2004 |
| Died ~11:45pm **Jan 16, 2004** (reported 1/17/2004), Tulsa hospital, **under indictment, before trial** | **V** | Oklahoman 1/18/2004; AP; NewsOn6; Fox 1/17/2004 |
| Cause: natural causes / internal bleeding (April 2004) | **V** | OPR/reporting |

**Summary:** Rico endgame **GREEN**. He was never convicted (died pre-trial), so every
Rico-as-conspirator proposition is attribution-side, not judgment-side.

---

## 13. Case End States (Special Priority 5) — with Linkage Timing

**Precise, defensible end states (each a source-classified outcome):**

| Case thread | End state | Classification |
|---|---|---|
| Wheeler murder (1981) | Never tried as a standalone case. Resulted in: Martorano cooperation/plea (agreement 9/1999; sentence 6/2004); Flemmi 2003 racketeering plea (10 murders incl. Wheeler); Bulger **jury conviction** 8/12/2013 (RICO acts incl. murder & conspiracy to murder Wheeler — "proved"); Rico died 1/2004 pre-trial | plea / plea / **verdict** / death-before-trial |
| Halloran+Donahue murders (5/11/1982) | Jimmy Flynn arrested and acquitted (HR chronology); Bulger **jury conviction** 2013 (murder of Brian Halloran proved); Flemmi 2003 plea; triggermen per Weeks/Bulger testimony (CA1) | acquittal / verdict / plea |
| Callahan murder (body found 8/4/1982) | Connolly convicted **11/6/2008** of **second-degree murder with a firearm** (Miami-Dade; Judge Stanford Blake), acquitted of conspiracy; **sentenced 40 years 1/15/2009**; Martorano admitted killing Callahan (his plea/testimony) | **conviction / sentence** / admission |
| Connecticut probe (1975–76) | Documented events: request 1/1976, silence, files-shared-with-Rico, Callahan resigned pre-hearing (5/3/1976) and left jurisdiction. Formal probe "outcome" not in verified record | OPEN/UNVERIFIED (encode documented events only) |
| Wheeler↔smoking-gun link (i.e., when investigators first tied Wheeler to WJA skimming) | (i) 1980: Wheeler suspecting skimming fired the WJA president and ordered a company-wide audit; 3/1981 he moved to sell the Hartford fronton; (ii) 7/1981 tip to Tulsa/CT tying the murder to a "Winter Hill / WJA matter"; (iii) 1999 Martorano cooperation made him the key witness; 2002 trial testimony connected Rico/Callahan; 2003 Tulsa charges; 8/2013 Bulger verdict | PHASE-(ii) documented; (iii) LATER |

**Critical corrections for any future encoding:**
1. **Bulger did NOT plead guilty in 2013.** He pleaded not guilty and was **convicted by
   jury on 8/12/2013** (FBI press release; affirmed 3/4/2016, CA1 13-2447). Any "2013 guilty
   plea" phrasing is factually wrong.
2. **Callahan death date.** HR chronology records the body **found 8/4/1982** (killed weeks
   earlier); McGuigan's sworn testimony states killed ~Aug 2 / found Aug 3. The earlier
   "June 11, 1982" date is **NOT supported** → do not encode.
3. **Tulsa charges timing.** The publicly documented charging event is the **2003 Tulsa
   action against Rico and co-named conspirators** (leading to his 10/2003 arrest). The
   reported "March 14–15, 2001" filing (secondary) was **not independently confirmed** in
   this gate → stay `LATER`/unverified.
4. **Martorano "2002 plea."** Use "testified May 2002 (Connolly trial); plea agreement 9/1999;
   sentenced 6/2004."

**Summary:** Case end states **GREEN** content-wise with the four corrections above recorded;
unsupported framings are **DO_NOT_ENCODE**.

---

## 14. Phase 2 Motive Evidence (Special Priority 6) — WJA Audit / Financial Document (S1)

Verification of the **event** (what happens in the real history): HR §III.B.5 p.93
(sight-verified, fn. 573–578 incl. Salemme 91 F. Supp. 2d at 208–09 and Dec 5, 2002 David
Wheeler testimony):

> "Wheeler, however, came to suspect the president of World Jai Alai of skimming money from
> the company for Winter Hill Gang members, including James 'Whitey' Bulger and Stephen
> Flemmi. Wheeler fired the World Jai Alai president and began a company-wide audit. Shortly
> thereafter, Winter Hill Gang hit men murdered Wheeler at the Southern Hills Country Club in
> Tulsa, Oklahoma, on May 27, 1981." And: "Bulger, Flemmi, and John Callahan--the former
> President of World Jai Alai whom Wheeler fired--allegedly attempted to arrange Wheeler's
> murder."

Determinations:
- **V:** the audit event, the firing, and the reported sequence (audit → murder "shortly
  thereafter"). These give the Phase-2 *question* ("why was the owner killed") a documented
  contextual floor.
- **NOT VERIFIED / DROP:** any dollar figure (no "$10k/week" or "$1M/yr" figure exists in
  the House Report; the `$1M/yr` phrasing in 2003 press is Martorano's hearsay estimate —
  leave out of fixtures).
- **Physical artifact:** the WJA audit / financial **document itself is not publicly
  available** (corporate records; CT Special Revenue archives; the Tulsa/DA file). → the
  S1 file as a physical artifact is **BLOCKED** per the demo-flow rule ("if historical
  evidence cannot support it, mark **BLOCKED** with required research stated").
- **Fallback (honest):** encode the *report-text account* of the audit (mime `text/plain`
  extract, `R`-style caveat) as the Phase-2 content basis; the physical audit paper remains
  the stated research requirement.
- **Distinctness:** S1 ≠ L1 (Exhibit 719 purchase report — the audit is a different WJA
  record and occurred pre-1981 audit vs the 5/11/1981 purchase report) and ≠ V1 (Martorano
  testimony). Distinctiveness **GREEN**.

**Summary:** Phase 2 motive **YELLOW → artifact-BLOCKED**: event V, physical document not
public, dollar figures DO_NOT_ENCODE, S1 requires the stated FOIA/corporate-records research
before any scanned artifact exists.

---

## 15. Verified Canonical Timeline (sight-verified to day where the source gives the day)

| Date | Precision | Event | Verdict |
|---|---|---|---|
| 1965-03-12 | day | "Jimmy Flemmi was assigned to Special Agent Rico to be developed as an informant by Special Agent Rico" (HR chronology; fn. 74) | **V** |
| 1967-06-20 | day | Exhibit 141: SAC Boston → FBI Director memorandum (Barboza/Flemmi development basis) | **V** |
| 1970-04 | month | Rico transferred to Miami field office (Limone) | **V** |
| 1975-05-27 | day | Rico's FBI service ends (Limone: 2/26/1951–5/27/1975) | **V** |
| mid-1970s | approximate | CT SOCTF licensing probe of WJA | **V** (existence), start-detail `approximate` |
| ~1975–76 | approximate | Rico → WJA VP/director of security (shortly after retirement) | **V** |
| 1976-01 | month | CT requests federal background on Callahan; silence; federal files shared with Rico, not CT | **V** (§III.B.6 p.96) |
| 1976-05-03 | day | Callahan-hearing scheduled; Callahan resigned before the task force could secure testimony | **V** (resignation timing; date for hearing "shortly before 5/3/76") |
| 1980–early-1981 | range | Wheeler suspects WJA skimming; fires WJA president; begins company-wide audit | **V** (§III.B.5 p.93) |
| 1981-03 | month | Wheeler moves to sell the Hartford fronton | **V** (reported) |
| 1981-05-11 | day | Exhibit 719: WJA Purchase Report — Rico + WJA entertained FBI SAs Dowd & Forrester in the Bahamas | **V** (fn. 625; chronology 5-11-81) |
| 1981-05-27 | day | Wheeler murdered, Tulsa (Martorano shoots; MacDonald getaway; Bulger/Flemmi/Rico implicated) | **V** (chronology 5-27-81) |
| 1981-07 | month | Tip reaches Tulsa/CT investigators (Winter Hill/WJA matter) | **V** (reported) |
| 1982-04 | month | Morris→Connolly→Bulger/Flemmi leak re Halloran's cooperation | **V** (Salemme §II.13) |
| 1982-05-11 | day | Halloran **and Donahue** murdered; Flynn arrested/acquitted | **V** (chronology 5-11-82) |
| 1982 (killed earlier) / found 1982-08-04 | range | Callahan murdered; body found in trunk, Miami Intl Airport (HR/Salemme at 211); McGuigan sworn: killed ~8/2, found 8/3 | **V** (with the two-source notation) |
| 1999-09 | month | Martorano cooperation/plea agreement unsealed | **V** |
| 2002-05 | day-span | Martorano testifies at Connolly federal trial (Judge Tauro); Connolly verdict 5/28/2002 | **V** |
| 2003-10-09 | day | Rico arrested (Miami); charged by Tulsa on Wheeler murder+conspiracy | **V** |
| 2004-01-16 | day | Rico dies (Tulsa), under indictment, before trial | **V** |
| 2004-06 | month | Martorano sentenced (Judge Wolf, ~14 yrs) | **V** |
| 2008-11-06 / 2009-01-15 | day | Connolly verdict (2nd-degree murder) / 40-year sentence (Miami-Dade) | **V** |
| 2013-08-12 | day | Bulger **convicted by jury** (RICO acts incl. Wheeler/Callahan/Halloran murders proved) | **V** |

Two-clock rule (spec §10, §20; demo-flow §26): all 1980s rows are `EXTRACTED`/historical;
2002+ rows are `LATER_HISTORICAL_KNOWLEDGE` for the initial crowds; no historical `day` is ever
invented.

---

## 16. Supporting vs Contradicting Evidence Matrices

### 16.1 The "Rico supplied Wheeler target information" hypothesis (R13/R14)

| Direction | Item | Source |
|---|---|---|
| Supporting (hearsay-tier) | Martorano 2002: "piece of paper written by Rico with all the information—phone numbers, addresses" | HR fn. 607 |
| Supporting (hearsay-tier) | Martorano 2002: Rico approached him about killing Wheeler (skimming motive) | NYT 10/10/2003 |
| Supporting (context) | Rico = WJA director of security at the murder date | HR §III.B.5 p.95 |
| Contradicting / limiting | Rico died before any trial confrontation; never testified | §14 |
| Contradicting / limiting | Martorano never met Rico (his own account) → no firsthand verif | §7 |
| Contradicting / alternative | The plan may have been arranged via Callahan/Bulger; the "green light" allocation among Bulger/Flemmi/Callahan/Rico is contested in reporting | 341 F.3d 16; HR §III.B.5 p.93 ("allegedly attempted to arrange") |
| Posture | R13/R14 = `UNRESOLVED`, low support, hearsay-only | spec §15 |

### 16.2 The "federal files withheld from CT / shared with Rico" hypothesis (R8, H3)

| Direction | Item | Source |
|---|---|---|
| Supporting | "This information was shared with former FBI Special Agent Paul Rico while the task force's request ... was met with silence" | HR §III.B.6 p.96 |
| Supporting | McGuigan: "all too willing to provide information ... to former FBI agents" | HR p.96 |
| Limiting | The supplying office is never identified | hearing p.678 (`FU`) |
| Limiting | The federal files' *content* (Flemmi/Bulger loan-shark allegation, Jan 1976) is later-knowledge, not CT knowledge | HR §III.B.6 p.96 |
| Posture | The withholding R7 is `OBSERVED_FACT (FU)`; the *content* is `LATER` | spec §13 H3 |

### 16.3 Case-A "Rico warned Callahan" (contradicted — DO_NOT_ENCODE)

| Direction | Item | Source |
|---|---|---|
| Supported phrasing | "Rico learned of the investigation shortly before the hearing" | HR §III.B.6 p.98 |
| Contradicted | "Rico warned Callahan" — no source supports a warning edge | verification doc Claim #5 |
| Posture | warning = `INFERENCE` at most, explicitly labeled; never an observed fact | spec §6.4#7 |

---

## 17. Whitelists

### 17.1 `INITIAL_CASE_A` (1976 vantage) — verified-allowed
Probe existence (R5 V-approximate); WJA licensee (E4); SOCTF (E5) + McGuigan (E6 V, as
task-force chief); WJA officers Callahan (R2 V) and Rico as security director (R1 V);
Jan-1976 request + silence (P4 V fact, letter DROP); "federal files shared with Rico" as a
reported fact with the supplying-office `FU`; license-regulator *context*; destinations-
vs-travel observation (Miami-given / Boston-observed); "Rico learned of the investigation"
(R11 V). No Bulger/Flemmi/Winter-Hill node; no "warned"; no breakthrough.

### 17.2 `INITIAL_CASE_B` (1981 vantage) — verified-allowed
Victim E3 V (owner of WJA, Telex chairman); WJA/Telex ownership chain (R3/R4 V); murder
circumstances + scene (5/27/1981, Southern Hills CC, single shot to the head, Martorano-and-
MacDonald as later-admitted but NOT present — keep the Tulsa intake as the crowd's own facts:
Tulsa homicide intake P5 existence V, contents DROP); bridge nodes Callahan/Rico in WJA roles
(not as suspects); Boston silo referenced as known-missing (never ingested).

### 17.3 `LATER_HISTORICAL_KNOWLEDGE` (sealed / post-vantage) — verified-allowed
Morris→Connolly→Bulger/Flemmi leak (V); Halloran+Donahue murders (V); Callahan body found
8/4/1982 (V); Connolly federal trial 2002 (V); Martorano testimony 2002 + plea 1999/sentence
2004 + 2008 testimony (V, hearsay-classified); Rico 2003 arrest / 2004 death (V); Bulger 2013
jury verdict incl. the three murder acts (V); Flemmi 2003 plea (V); Tulsa-2003 charges (V);
WJA-audit event (V); Exhibit 719 content (V).

### 17.4 `DO_NOT_ENCODE` (per this gate)
- Any "Rico warned Callahan" as fact.
- Any day-one-skimming claim and any audit dollar figures.
- The invented Halloran "Salvatore/Sally relay" and "Rico would set up the murder" wording.
- "Bulger 2013 guilty plea" (verdict only).
- "June 11, 1982" Callahan kill date; "March 2001" Tulsa filing as fact (*unverified*).
- "OPR Exhibit 141" naming (use **House Report Exhibit 141**).
- L1 as an "internal-security/personnel ledger" without the Exhibit-719 renaming.
- Any `isGuilty/PROVEN_CRIMINAL/CONFIRMED_CONSPIRATOR` label, `REFUTED`-for-drama, or
  invented person/source/score (spec §24 union unchanged).

---

## 18. Physical Evidence / Artifact Availability

All artifact rows must stay `text/plain` + `R`-caveat unless a scan is found; no original
attachment bodies are fabricated (spec §9, §20).

| Artifact | Real object (this gate) | Status |
|---|---|---|
| A1 / A2 | CT probe organ; 1/1976 request + silence correspondence | A1: reconstructed from HR §III.B.6 (V); A2: THE LETTER NOT PUBLIC — use report text extract |
| A3 | House Report 108-414 Vol.1 | **PUBLIC** (HTML + PDF, §2) — quotes with fn/page refs |
| B1 | Tulsa PD homicide intake (1981) | not public; report-extract only (existence V, contents DROP) |
| B2 | Tulsa holes page (H1/H2) | demo-computed from verified gaps — never the missing content |
| B3 | Wheeler business records (Telex/WJA) | ownership/chairmanship V; documents not public |
| L1 | WJA Purchase Report 5/11/1981 (Exhibit 719) | report excerpt public; original in FBI/WJA records (FOIA) — **label = purchase/expense report** |
| V1 | Martorano 2002 trial excerpts (P8) | quotes public (HR fn. 607; NYT; CA1 summaries); full transcript NOT public |
| S1 | WJA audit / financial document | event V; **physical document NOT public → BLOCKED** (§14) |
| BM1 | Benchmark / evaluation sheet | demo-time artifact — derived, not historical |

FBI Vault: only the Bulger series (15 parts) is public; **no public Rico / Connolly / Morris
file collections** — those are FOIA-route (§2 P5).

---

## 19. Remaining Historical Blockers (bounded residue)

1. **Case A probe formal outcome** — the Connecticut licensing probe's official closing /
   disposition is not documented in the verified excerpts → stays `LATER/UNVERIFIED`;
   encode only documented events.
2. **Exact federal letter (P4)** and **Tulsa case file (P5)** and **2002 transcript (P8)** —
   not digitized → artifacts degrade to text-extract rows (presentation-only, fidelity
   lowering; no fabrication).
3. **Tulsa 2001 vs 2003 charges** — the "March 2001" filing is secondary-unverified; use the
   documented 2003 Tulsa action until primary dates surface.
4. **Exhibit 719 / WJA-audit originals** — reside in FBI Boston case files (FOIA) and WJA
   corporate records; until produced, L1/S1 keep `text/plain` posture.
5. **"Never met Rico" wording** — substance verified; exact trial-language quote remains
   unlocated (hearsay classification unaffected).
6. **Supplying office for the files shared with Rico** — `FU` by design; keep as unknown.

These are **bounded** — none blocks encoding of the verified core; each is a stated
follow-through, not an open `R`.

---

## 20. Final Gate Statuses per Case Area

| Case area | Status | Basis |
|---|---|---|
| Case A (CT licensing probe) | **GREEN** | request/silence/files-shared/learned-of/surveillance to Boston/resignation-all V. Residue: probe-outcome (LATER), supplied-office (`FU`) |
| Case B (Tulsa Wheeler) | **GREEN** | murder particulars V (report chronology + Salemme + reporting); investigation existence V |
| Bridge / shared entities (Rico, Callahan, WJA) | **GREEN** | all entity-role facts V; phase-split supported (Limone + HR) |
| Phase 1 hidden connection (SECURITY CHIEF = Rico) | **GREEN** | identity V; initial evidence contains no breakthrough (verified) |
| Phase 1 ledger L1 (Exhibit 719) | **GREEN** for document identity; **LABEL CORRECTION RESERVED** (purchase/expense report, not personnel ledger) | §8, §10 |
| Phase 1 validation / hearsay posture | **GREEN** | every link classified; R13/R14 stay `UNRESOLVED`; truth arc restated as neutral later-knowledge page |
| Breakthrough chain (Martorano 2002) | **GREEN** (as hearsay); **NOT** upgraded to conspiracy-fact | §7, §11 |
| Phase 2 motive evidence (S1) | **YELLOW → artifact BLOCKED** | audit event V; physical document not public; dollar figures DROP; required research = FOIA/corporate records |
| Physical artifact availability | **YELLOW** | most originals not public → `text/plain` + `R`-caveat posture (presentation-only) |
| Timeline precision | **GREEN** with corrections applied | day-precision only where sourced; "June 11 1982" and "2013 plea" corrections recorded |
| Court-trial side-context (Connolly/Rico endgames) | **GREEN** | 2002 federal (Tauro, 121 mo, affirmed) + 2008 state (40 yrs) verified; Rico 10/9/2003–1/16/2004 verified |
| **Overall READINESS** | **GREEN with a bounded residue list** | all `R`/reconfirm items resolved to `V`/`LATER`/`DROP`; the §19 residue is follow-through, not blocker; no `R→V` without sight; no `R` item silently retained |

Applying this to the extraction spec's §25 verdict (whose own YELLOW was caused by the very
`R` items this document resolves): **the report-truncation debt and the five named yellow
items (§25 yellow 1–5) are now either VERIFIED to primary source, DROP-classified, or moved
to the bounded residue in §19.** The spec file text itself is intentionally untouched; this
document is the authoritative gate record the implementer applies when assembling fixtures
(spec §4 items 2–4 are thereby satisfied; item 1 — the full re-read — stands, with the key
pages quoted here).

**Final statement:** the historical core is now source-verifiable end-to-end (1965 Flemmi
assignment → 2004 Rico death → 2008 Connolly sentence → 2013 Bulger conviction). The demo's
emotional anti-climax — the breakthrough is hearsay, the S1 motive paper is not public —
is now an honest, bounded outcome, not an open risk.

*End of FINAL HISTORICAL READINESS GATE. No production code, fixtures, providers, UI, or
Judge route was modified. This verification document is the sole new deliverable of the
gate; the demo flow doc remains frozen at YELLOW pending the residual fixture-pass items in
§19.*