// ============================================================================
// Real-Case Fenced Packages — PASS 1
//
// Structured data that EXISTS in the system but is NEVER assembled into the
// initial fixture sets. Physically present in the repo; accessible to the UI
// when the fence is opened; never fed to INITIAL_CASE_A / INITIAL_CASE_B
// computation (spec §4, §15, §21p6).
//
// Four packages:
//   1. breakthrough-phase-1    Exhibit 719, Martorano hearsay chain, Rico S1 note
//   2. later-historical       1982 murders, 2002–2013 events
//   3. phase-2-evidence       Audit records, Tulsa file, Connolly transcript
//   4. counter-evidence       C1–C4
//
// All IDs are derived via deterministicUuid(NS_BREAKTHROUGH/NS_COUNTER:key)
// in lookup.ts.
// ============================================================================

import {
  ART_EXHIBIT_719,
  REC_MARTORANO,
  REC_RICO_NOTE,
  ART_WJA_AUDIT,
  ART_TULSA_FILE,
  ART_CONNOLLY_TRIAL,
  REC_HALLORAN_DONAHUE,
  REC_CALLAHAN_BODY,
  REC_CONNOLLY_2002,
  REC_RICO_2003,
  REC_CONNOLLY_2008,
  REC_BULGER_2013,
  CNTR_C1,
  CNTR_C2,
  CNTR_C3,
  CNTR_C4,
} from "./lookup";

// ============================================================================
// Package Type
// ============================================================================

export interface FencedRecord {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly dateRange: string;
  readonly sourceCitation: string;
  readonly classification: "HEARSAY" | "DOCUMENTARY" | "COURT_RECORD" | "REPORTED";
  readonly relationToInitialCrowd: "CONTRADICTS" | "EXTENDS" | "VALIDATES" | "CONTEXTUALIZES";
  readonly verifiedStatus: "V" | "V_HEARSAY" | "V_REPORTED" | "UNRESOLVED";
}

export interface FencedPackage {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly classification: "BREAKTHROUGH_PHASE_1" | "LATER_HISTORICAL" | "PHASE_2_EVIDENCE" | "COUNTER_EVIDENCE";
  readonly accessible: boolean;
  readonly records: readonly FencedRecord[];
}

// ============================================================================
// 1. Breakthrough Phase 1 — Exhibit 719, Martorano hearsay, Rico note
// ============================================================================
//
// §8/§9: Exhibit 719 = "World Jai Alai Purchase Report (May 11, 1981)".
//   Shows Rico = WJA VP/security director; WJA funds entertained FBI SAs
//   Dowd & Forrester in the Bahamas. NOT present in initial crowds (future-
//   dated 1981 vs 1976 Case-A vantage). Label correction: "WJA corporate
//   expense/purchase record", NOT "internal-security/personnel ledger".
//
// §7: Martorano hearsay chain — "a piece of paper written by Rico with all
//   the information—his phone numbers, addresses" (HR fn. 607). Single-source
//   hearsay. Rico died pre-trial. Chain stays UNRESOLVED/low-support.
//
// Rico S1 handwritten note — referenced as the physical target sheet; the
//   note itself is not publicly available. Only the Martorano testimony
//   describing it exists in the public record.

const breakthroughPhase1: FencedPackage = {
  id: "breakthrough-phase-1",
  title: "Phase 1 Breakthrough — Security Chief Identity",
  description:
    "The Phase 1 hidden connection: Rico, retired FBI, is WJA vice president and director of security. " +
    "Exhibit 719 documents the financial relationship; Martorano hearsay describes the target sheet. " +
    "NOT in initial crowds; arrives via live ingest.",
  classification: "BREAKTHROUGH_PHASE_1",
  accessible: false,
  records: [
    {
      id: ART_EXHIBIT_719,
      label: "Exhibit 719 — WJA Purchase Report (May 11, 1981)",
      description:
        "World Jai Alai corporate purchase/expense report. Documents that Rico and WJA " +
        "entertained FBI Special Agents Tom Dowd and Jerry Forrester in the Bahamas with " +
        "WJA-funded hospitality. Dowd's wife employed by Miami Jai Alai. " +
        "Label: WJA corporate expense/purchase record.",
      dateRange: "1981-05-11",
      sourceCitation: "HR §III.B.4 p.92 fn.625; Investigative Chronology 5-11-81",
      classification: "DOCUMENTARY",
      relationToInitialCrowd: "EXTENDS",
      verifiedStatus: "V",
    },
    {
      id: REC_MARTORANO,
      label: "Martorano Hearsay Chain — Target Sheet",
      description:
        "Martorano testified (May 2002, Connolly federal trial) he received 'a piece of paper " +
        "written by Rico with all the information—his phone numbers, addresses' for the Wheeler " +
        "target. Single-source hearsay. Rico died 1/16/2004 pre-trial (never confronted). " +
        "Chain stays UNRESOLVED/low-support.",
      dateRange: "2002-05 (testimony) re: 1981 event",
      sourceCitation: "HR §III.B.5 p.95 fn.607; NYT 10/10/2003; 341 F.3d 16",
      classification: "HEARSAY",
      relationToInitialCrowd: "EXTENDS",
      verifiedStatus: "V_HEARSAY",
    },
    {
      id: REC_RICO_NOTE,
      label: "Rico Handwritten Note (S1) — Wheeler Target Sheet",
      description:
        "The physical target sheet allegedly written by Rico. Not publicly available. " +
        "Referenced only through Martorano's hearsay testimony. " +
        "Distinct from Exhibit 719 (purchase report vs. target information).",
      dateRange: "1981 (pre-May 27)",
      sourceCitation: "Inferred from Martorano testimony; physical document BLOCKED",
      classification: "REPORTED",
      relationToInitialCrowd: "EXTENDS",
      verifiedStatus: "UNRESOLVED",
    },
  ],
};

// ============================================================================
// 2. Later Historical Validation — 1982 murders, 2002–2013 events
// ============================================================================
//
// §6: Halloran+Donahue murders 5/11/82; Morris→Connolly→Bulger/Flemmi leak.
// §12: Rico arrested 10/9/2003; died 1/16/2004 Tulsa, under indictment.
// §13: Bulger jury conviction 8/12/2013 (NOT guilty plea); Connolly convicted
//   11/6/2008 Miami-Dade; Martorano plea 9/1999, sentenced 6/2004.

const laterHistorical: FencedPackage = {
  id: "later-historical",
  title: "Later Historical Validation",
  description:
    "Events occurring after the 1981 vantage that subsequently validated or " +
    "extended the initial investigation. Present for post-prediction validation " +
    "only; NOT available to initial computation.",
  classification: "LATER_HISTORICAL",
  accessible: false,
  records: [
    {
      id: REC_HALLORAN_DONAHUE,
      label: "Halloran & Donahue Murders (May 11, 1982)",
      description:
        "Brian Halloran and Michael Donahue murdered. Morris told Connolly that Halloran " +
        "was cooperating; Connolly relayed to Bulger and Flemmi. Jimmy Flynn arrested " +
        "and acquitted. Halloran had been removed from FBI informant program and denied " +
        "witness protection.",
      dateRange: "1982-05-11",
      sourceCitation: "Salemme §II.13; HR chronology 5-11-82; 341 F.3d 16",
      classification: "COURT_RECORD",
      relationToInitialCrowd: "EXTENDS",
      verifiedStatus: "V",
    },
    {
      id: REC_CALLAHAN_BODY,
      label: "Callahan Murder — Body Found (August 1982)",
      description:
        "John Callahan murdered; body found in trunk at Miami International Airport, " +
        "August 4, 1982. McGuigan sworn testimony: killed ~Aug 2, found Aug 3. " +
        "HR chronology records found 8/4/1982.",
      dateRange: "1982-08-04",
      sourceCitation: "HR chronology; Salemme at 211; McGuigan sworn testimony",
      classification: "REPORTED",
      relationToInitialCrowd: "EXTENDS",
      verifiedStatus: "V",
    },
    {
      id: REC_CONNOLLY_2002,
      label: "Connolly Federal Trial (May 2002)",
      description:
        "John Connolly federal trial, USDC D. Massachusetts, Judge Joseph L. Tauro. " +
        "Verdict 5/28/2002. 121 months. Martorano testified 5/13–14/2002. " +
        "Affirmed 341 F.3d 16.",
      dateRange: "2002-05",
      sourceCitation: "341 F.3d 16; UPI 5/14/2002",
      classification: "COURT_RECORD",
      relationToInitialCrowd: "VALIDATES",
      verifiedStatus: "V",
    },
    {
      id: REC_RICO_2003,
      label: "Rico Arrest & Indictment (October 2003)",
      description:
        "H. Paul Rico arrested ~7am Thu Oct 9, 2003 at Miami home. Charged by Tulsa " +
        "County (grand jury true bill) with murder + conspiracy re Wheeler. Age 78. " +
        "Extradited to Oklahoma early Jan 2004. Died ~11:45pm Jan 16, 2004, Tulsa " +
        "hospital, under indictment, before trial.",
      dateRange: "2003-10-09 to 2004-01-16",
      sourceCitation: "NYT 10/10/2003; Oklahoman 1/2004; AP 1/17/2004",
      classification: "COURT_RECORD",
      relationToInitialCrowd: "VALIDATES",
      verifiedStatus: "V",
    },
    {
      id: REC_CONNOLLY_2008,
      label: "Connolly Miami-Dade Murder Conviction (Nov 2008)",
      description:
        "John Connolly convicted 11/6/2008 of second-degree murder with a firearm " +
        "(Miami-Dade; Judge Stanford Blake). Acquitted of conspiracy. " +
        "Sentenced 40 years 1/15/2009.",
      dateRange: "2008-11-06",
      sourceCitation: "Sun-Journal/AP Sept 2008; sentencing 1/15/2009",
      classification: "COURT_RECORD",
      relationToInitialCrowd: "VALIDATES",
      verifiedStatus: "V",
    },
    {
      id: REC_BULGER_2013,
      label: "Bulger Jury Conviction (August 12, 2013)",
      description:
        "James 'Whitey' Bulger CONVICTED BY JURY on RICO acts including murder and " +
        "conspiracy to murder Roger Wheeler, Brian Halloran, and John Callahan. " +
        "He pleaded NOT GUILTY. Affirmed 3/4/2016 (CA1 13-2447). " +
        "DO NOT encode as 'guilty plea'.",
      dateRange: "2013-08-12",
      sourceCitation: "FBI press release; CA1 13-2447",
      classification: "COURT_RECORD",
      relationToInitialCrowd: "VALIDATES",
      verifiedStatus: "V",
    },
  ],
};

// ============================================================================
// 3. Phase 2 Evidence — Audit records, Tulsa file, Connolly transcript
// ============================================================================
//
// §14: WJA audit = event V; physical document NOT public → BLOCKED.
// §18: Tulsa PD homicide intake = existence V; contents DROP.
// Connolly trial transcript = not public.

const phase2Evidence: FencedPackage = {
  id: "phase-2-evidence",
  title: "Phase 2 Evidence — Blocked Artifacts",
  description:
    "Physical documents and records referenced by the investigation but NOT " +
    "publicly available. Present for research-requirement tracking; never " +
    "fabricated or synthesized.",
  classification: "PHASE_2_EVIDENCE",
  accessible: false,
  records: [
    {
      id: ART_WJA_AUDIT,
      label: "WJA Audit / Financial Document",
      description:
        "The WJA company-wide audit initiated by Wheeler before his murder. " +
        "Event documented in HR §III.B.5 p.93. Physical document NOT publicly " +
        "available (corporate records; CT Special Revenue archives; Tulsa/DA file). " +
        "BLOCKED per demo-flow rule.",
      dateRange: "1980–early-1981",
      sourceCitation: "HR §III.B.5 p.93 fn.573–578; Salemme at 208–09",
      classification: "REPORTED",
      relationToInitialCrowd: "CONTEXTUALIZES",
      verifiedStatus: "V_REPORTED",
    },
    {
      id: ART_TULSA_FILE,
      label: "Tulsa PD Homicide Intake (1981)",
      description:
        "Tulsa Police Department / DA homicide file for the Wheeler murder. " +
        "Existence V (HR chronology 5-27-81; July-1981 tip). Contents not public. " +
        "Artifact degrades to report-extract only.",
      dateRange: "1981-05-27 onward",
      sourceCitation: "HR chronology 5-27-81, 7-81; §18 of verification doc",
      classification: "REPORTED",
      relationToInitialCrowd: "CONTEXTUALIZES",
      verifiedStatus: "V_REPORTED",
    },
    {
      id: ART_CONNOLLY_TRIAL,
      label: "Connolly Trial Transcript (2002 federal / 2008 state)",
      description:
        "Full transcripts from Connolly's federal trial (May 2002, Judge Tauro) " +
        "and Miami-Dade state trial (Sept 2008, Judge Blake). Not publicly available. " +
        "Excerpts quoted in HR, CA1 341 F.3d 16, and news reporting.",
      dateRange: "2002–2008",
      sourceCitation: "341 F.3d 16; Sun-Journal/AP 2008",
      classification: "COURT_RECORD",
      relationToInitialCrowd: "VALIDATES",
      verifiedStatus: "V",
    },
  ],
};

// ============================================================================
// 4. Counter-Evidence — C1–C4
// ============================================================================
//
// §16.1: Evidence matrix showing contradicting/limiting items for the
// "Rico supplied Wheeler target information" proposition.
// C1: Rico died pre-trial (never confronted).
// C2: Martorano never met Rico (no firsthand verification).
// C3: The plan may have been arranged via Callahan/Bulger (alternative path).
// C4: The "green light" allocation among Bulger/Flemmi/Callahan/Rico is contested.

const counterEvidence: FencedPackage = {
  id: "counter-evidence",
  title: "Counter-Evidence Package",
  description:
    "Contradicting and limiting signals for the Rico-as-target-sheet-supplier " +
    "proposition. Not fed to initial computation; available for analyst review.",
  classification: "COUNTER_EVIDENCE",
  accessible: false,
  records: [
    {
      id: CNTR_C1,
      label: "C1: Rico died before trial confrontation",
      description:
        "H. Paul Rico died January 16, 2004, under indictment, before trial. " +
        "He never testified or was cross-examined. The hearsay testimony cannot " +
        "be confrontation-tested.",
      dateRange: "2004-01-16",
      sourceCitation: "Oklahoman 1/18/2004; AP 1/17/2004",
      classification: "COURT_RECORD",
      relationToInitialCrowd: "CONTRADICTS",
      verifiedStatus: "V",
    },
    {
      id: CNTR_C2,
      label: "C2: Martorano never met Rico",
      description:
        "Martorano's own account: he never met or spoke with Rico. The target " +
        "sheet was received through an intermediary (Callahan). No firsthand " +
        "verification of Rico's involvement from the alleged actor.",
      dateRange: "2002 (testimony)",
      sourceCitation: "NYT 10/10/2003; UPI 5/14/2002",
      classification: "HEARSAY",
      relationToInitialCrowd: "CONTRADICTS",
      verifiedStatus: "V_HEARSAY",
    },
    {
      id: CNTR_C3,
      label: "C3: Alternative arrangement path via Callahan/Bulger",
      description:
        "The plan may have been arranged via Callahan and/or Bulger rather than " +
        "directly by Rico. HR §III.B.5 p.93: 'Bulger, Flemmi, and John Callahan—" +
        "the former President of World Jai Alai whom Wheeler fired—allegedly " +
        "attempted to arrange Wheeler's murder.' The allocation of roles among " +
        "Bulger/Flemmi/Callahan/Rico is contested.",
      dateRange: "1981",
      sourceCitation: "HR §III.B.5 p.93; 341 F.3d 16",
      classification: "REPORTED",
      relationToInitialCrowd: "CONTRADICTS",
      verifiedStatus: "V",
    },
    {
      id: CNTR_C4,
      label: "C4: Contested 'green light' allocation",
      description:
        "The allocation of decision-making authority ('green light') among " +
        "Bulger, Flemmi, Callahan, and Rico for the Wheeler murder is contested " +
        "across sources. No single source establishes Rico as the sole decision-maker.",
      dateRange: "1981",
      sourceCitation: "341 F.3d 16; HR §III.B.5 p.93",
      classification: "REPORTED",
      relationToInitialCrowd: "CONTRADICTS",
      verifiedStatus: "UNRESOLVED",
    },
  ],
};

// ============================================================================
// Exports
// ============================================================================

export const FENCED_PACKAGES: readonly FencedPackage[] = [
  breakthroughPhase1,
  laterHistorical,
  phase2Evidence,
  counterEvidence,
];

export const FENCED_BY_ID: Record<string, FencedPackage> = {
  "breakthrough-phase-1": breakthroughPhase1,
  "later-historical": laterHistorical,
  "phase-2-evidence": phase2Evidence,
  "counter-evidence": counterEvidence,
};

export const ALL_FENCED_RECORD_IDS: readonly string[] = FENCED_PACKAGES.flatMap(
  (pkg) => pkg.records.map((r) => r.id),
);
