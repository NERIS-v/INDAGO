// ============================================================================
// Real-Case Deterministic ID Lookup — PASS 1
//
// All fixture IDs are derived via `deterministicUuid(NS:key)` so the two
// workspaces are fully deterministic and schema-valid (contracts require uuid).
//
// NAMESPACE MAP (from registry.ts):
//   NS_CASE_A       6a1c4a6a-0000-4000-8000-0000000000a1  (Connecticut / WJA)
//   NS_CASE_B       6a1c4a6b-0000-4000-8000-0000000000b1  (Tulsa / Wheeler)
//   NS_SHARED       6a1c4a6c-0000-4000-8000-0000000000c1  (bridge entities)
//   NS_BREAKTHROUGH 6a1c4a6c-0000-4000-8000-0000000000c2  (fenced P2 inputs)
//   NS_COUNTER      6a1c4a6c-0000-4000-8000-0000000000c3  (fenced counter-evidence)
// ============================================================================

import { deterministicUuid } from "../demo/submit";
import {
  NS_CASE_A,
  NS_CASE_B,
  NS_SHARED,
  NS_BREAKTHROUGH,
  NS_COUNTER,
} from "./registry";

// ── Helper ──────────────────────────────────────────────────────────────────

function id(ns: string, key: string): string {
  return deterministicUuid(`${ns}:${key}`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  SHARED BRIDGE ENTITIES (NS_SHARED)
// ══════════════════════════════════════════════════════════════════════════════

/** John "Jack" Callahan — former FBI agent, WJA security director. */
export const ENT_CALLAHAN = id(NS_SHARED, "entity:john-callahan");

/** H. Paul Rico — former FBI agent, WJA security consultant. */
export const ENT_RICO = id(NS_SHARED, "entity:h-paul-rico");

/** World Jai Alai — the Connecticut / national jai-alai organization. */
export const ENT_WJA = id(NS_SHARED, "entity:world-jai-alai");

/** FBI Boston Field Office. */
export const ENT_FBIBOSTON = id(NS_SHARED, "entity:fbi-boston-field-office");

// ══════════════════════════════════════════════════════════════════════════════
//  CASE A — Connecticut / World Jai Alai Licensing & Regulatory Probe
// ══════════════════════════════════════════════════════════════════════════════

// -- Top-level ---------------------------------------------------------------
export const CASE_A_ID = id(NS_CASE_A, "case:connecticut-jai-alai");
export const INVESTIGATION_A_ID = id(NS_CASE_A, "invest:ct-soctf-licensing");

// -- Sources -----------------------------------------------------------------
export const SRC_HR_VOL1_A = id(NS_CASE_A, "source:hr108-414-vol1");
export const SRC_SOCTF_A = id(NS_CASE_A, "source:soctf-file");
export const SRC_JAN76_A = id(NS_CASE_A, "source:jan-1976-request");
export const SRC_SURV_BOSTON_A = id(NS_CASE_A, "source:surveillance-boston");
export const SRC_HEARING_76_A = id(NS_CASE_A, "source:ct-hearing-1976");
export const SRC_BAHAMAS_A = id(NS_CASE_A, "source:bahamas-hospitality");

// -- Artifacts ----------------------------------------------------------------
export const ART_HR_CT = id(NS_CASE_A, "artifact:hr-vol1-connecticut-extract");
export const ART_JAN76 = id(NS_CASE_A, "artifact:jan-1976-request-note");
export const ART_SURV = id(NS_CASE_A, "artifact:surveillance-boston-log");
export const ART_HEARING = id(NS_CASE_A, "artifact:ct-hearing-1976-extract");
export const ART_BAHAMAS = id(NS_CASE_A, "artifact:bahamas-hospitality-note");

// -- Evidence -----------------------------------------------------------------
export const EVID_HR_CT = id(NS_CASE_A, "evidence:hr-vol1-connecticut");
export const EVID_JAN76 = id(NS_CASE_A, "evidence:jan-1976-request");
export const EVID_SURV = id(NS_CASE_A, "evidence:surveillance-boston-trip");
export const EVID_HEARING = id(NS_CASE_A, "evidence:ct-hearing-resignation");
export const EVID_BAHAMAS = id(NS_CASE_A, "evidence:bahamas-hospitality");

// -- Observations -------------------------------------------------------------
export const OBS_A1 = id(NS_CASE_A, "observation:jan-1976-request-silence");
export const OBS_A2 = id(NS_CASE_A, "observation:surveillance-boston-trip");
export const OBS_A3 = id(NS_CASE_A, "observation:callahan-resignation-1976");
export const OBS_A4 = id(NS_CASE_A, "observation:wja-employment-1970s");
export const OBS_A5 = id(NS_CASE_A, "observation:loan-shark-shared-rico");
export const OBS_A6 = id(NS_CASE_A, "observation:bahamas-hospitality");
export const OBS_A8 = id(NS_CASE_A, "observation:task-force-jai-alai");
export const OBS_A9 = id(NS_CASE_A, "observation:mcguigan-request-actor");

// -- Entities (case-A-specific) ----------------------------------------------
export const ENT_A_SOCTF = id(NS_CASE_A, "entity:ct-soctf");
export const ENT_A_MCGUIGAN = id(NS_CASE_A, "entity:austin-mcguigan");

// -- Relations ----------------------------------------------------------------
export const REL_A_WJA_CALLAHAN = id(NS_CASE_A, "relation:wja-callahan");
export const REL_A_WJA_RICO = id(NS_CASE_A, "relation:wja-rico");
export const REL_A_CALLAHAN_RICO = id(NS_CASE_A, "relation:callahan-rico");
export const REL_A_SOCTF_FBI = id(NS_CASE_A, "relation:soctf-fbi");
export const REL_A_MCGUIGAN_SOCTF = id(NS_CASE_A, "relation:mcguigan-soctf");
export const REL_A_FBI_RICO = id(NS_CASE_A, "relation:fbi-rico");
export const REL_A_CALLAHAN_FBI = id(NS_CASE_A, "relation:callahan-fbi");

// -- Graph --------------------------------------------------------------------
export const GRAPH_VERSION_A = id(NS_CASE_A, "graph:version-v1");

export const GN_A_CALLAHAN = id(NS_CASE_A, "graph:node:callahan");
export const GN_A_RICO = id(NS_CASE_A, "graph:node:rico");
export const GN_A_WJA = id(NS_CASE_A, "graph:node:wja");
export const GN_A_FBI = id(NS_CASE_A, "graph:node:fbi-boston");
export const GN_A_SOCTF = id(NS_CASE_A, "graph:node:soctf");
export const GN_A_MCGUIGAN = id(NS_CASE_A, "graph:node:mcguigan");

export const GE_A_WJA_CALLAHAN = id(NS_CASE_A, "graph:edge:wja-callahan");
export const GE_A_WJA_RICO = id(NS_CASE_A, "graph:edge:wja-rico");
export const GE_A_CALLAHAN_RICO = id(NS_CASE_A, "graph:edge:callahan-rico");
export const GE_A_SOCTF_FBI = id(NS_CASE_A, "graph:edge:soctf-fbi");
export const GE_A_MCGUIGAN_SOCTF = id(NS_CASE_A, "graph:edge:mcguigan-soctf");
export const GE_A_FBI_RICO = id(NS_CASE_A, "graph:edge:fbi-rico");
export const GE_A_CALLAHAN_FBI = id(NS_CASE_A, "graph:edge:callahan-fbi");

// -- Gaps / Holes -------------------------------------------------------------
export const GAP_A1 = id(NS_CASE_A, "gap:ct-request-disposition");
export const GAP_A2 = id(NS_CASE_A, "gap:rico-wja-role");
export const HOLE_A1 = id(NS_CASE_A, "hole:ct-request-disposition");
export const HOLE_A2 = id(NS_CASE_A, "hole:rico-wja-role");

// -- Hypothesis ---------------------------------------------------------------
export const HYP_A1 = id(NS_CASE_A, "hypothesis:wja-influence-ct");

// -- Leads --------------------------------------------------------------------
export const LEAD_A1 = id(NS_CASE_A, "lead:ct-request-pursuit");
export const LEAD_A2 = id(NS_CASE_A, "lead:rico-role-documentation");

// -- Evidence Requests --------------------------------------------------------
export const EREQ_A1 = id(NS_CASE_A, "evidence-request:ct-request-disposition");
export const EREQ_A2 = id(NS_CASE_A, "evidence-request:rico-wja-role");

// -- Review Tasks -------------------------------------------------------------
export const REVIEW_A1 = id(NS_CASE_A, "review-task:er-callahan");
export const REVIEW_A2 = id(NS_CASE_A, "review-task:qa-jan1976-request");

// -- ER (Entity Resolution) ---------------------------------------------------
export const EMC_A_JACK = id(NS_CASE_A, "emc:jack-callahan");
export const EMC_A_JOHN = id(NS_CASE_A, "emc:john-callahan");
export const PAIR_A1 = id(NS_CASE_A, "candidate-pair:callahan-jack-john");
export const HYP_RES_A1 = id(NS_CASE_A, "hypothesis:callahan-identity-resolution");
export const RES_A1 = id(NS_CASE_A, "entity-resolution:callahan-jack-john");

// -- Robustness ---------------------------------------------------------------
export const ROB_A1 = id(NS_CASE_A, "robustness:callahan-wja-influence");

// ══════════════════════════════════════════════════════════════════════════════
//  CASE B — Tulsa / Roger Wheeler Homicide
// ══════════════════════════════════════════════════════════════════════════════

// -- Top-level ---------------------------------------------------------------
export const CASE_B_ID = id(NS_CASE_B, "case:tulsa-wheeler");
export const INVESTIGATION_B_ID = id(NS_CASE_B, "invest:tulsa-homicide-unit");

// -- Sources -----------------------------------------------------------------
export const SRC_HR_TULSA_B = id(NS_CASE_B, "source:hr-vol1-tulsa");
export const SRC_HR_WJA_B = id(NS_CASE_B, "source:hr-vol1-wja");
export const SRC_NEWS_TULSA_B = id(NS_CASE_B, "source:tulsa-news-1981");

// -- Artifacts ----------------------------------------------------------------
export const ART_HR_TULSA = id(NS_CASE_B, "artifact:hr-vol1-tulsa-extract");
export const ART_NEWS_TULSA = id(NS_CASE_B, "artifact:tulsa-news-1981-extract");
export const ART_HR_WJA = id(NS_CASE_B, "artifact:hr-vol1-wja-extract");

// -- Evidence -----------------------------------------------------------------
export const EVID_HR_TULSA = id(NS_CASE_B, "evidence:hr-vol1-tulsa-murder");
export const EVID_NEWS_TULSA = id(NS_CASE_B, "evidence:tulsa-news-murder");
export const EVID_HR_WJA = id(NS_CASE_B, "evidence:hr-vol1-wja-ownership");

// -- Observations -------------------------------------------------------------
export const OBS_B1 = id(NS_CASE_B, "observation:tulsa-murder-1981");
export const OBS_B2 = id(NS_CASE_B, "observation:news-murder-1981");
export const OBS_B3 = id(NS_CASE_B, "observation:wja-acquisition-1978");
export const OBS_B4 = id(NS_CASE_B, "observation:skimming-audit-fired");
export const OBS_B5 = id(NS_CASE_B, "observation:wja-security-leadership");
export const OBS_B6 = id(NS_CASE_B, "observation:unsolved-initial-period");

// -- Entities (case-B-specific) ----------------------------------------------
export const ENT_WHEELER = id(NS_CASE_B, "entity:roger-wheeler");
export const ENT_SOUTHERN_HILLS = id(NS_CASE_B, "entity:southern-hills");
export const ENT_HITMAN = id(NS_CASE_B, "entity:unnamed-hitman");
export const ENT_WINTER_HILL = id(NS_CASE_B, "entity:winter-hill-gang");

// -- Relations ----------------------------------------------------------------
export const REL_B_WJA_WHEELER = id(NS_CASE_B, "relation:wja-wheeler");
export const REL_B_WHEELER_SHC = id(NS_CASE_B, "relation:wheeler-southern-hills");
export const REL_B_WJA_CALLAHAN = id(NS_CASE_B, "relation:wja-callahan");
export const REL_B_WJA_RICO = id(NS_CASE_B, "relation:wja-rico");
export const REL_B_HITMAN_WHEELER = id(NS_CASE_B, "relation:hitman-wheeler");
export const REL_B_WJA_WINTER_HILL = id(NS_CASE_B, "relation:wja-winter-hill");

// -- Graph --------------------------------------------------------------------
export const GRAPH_VERSION_B = id(NS_CASE_B, "graph:version-v1");

export const GN_B_CALLAHAN = id(NS_CASE_B, "graph:node:callahan");
export const GN_B_RICO = id(NS_CASE_B, "graph:node:rico");
export const GN_B_WJA = id(NS_CASE_B, "graph:node:wja");
export const GN_B_FBI = id(NS_CASE_B, "graph:node:fbi-boston");
export const GN_B_WHEELER = id(NS_CASE_B, "graph:node:wheeler");
export const GN_B_SHC = id(NS_CASE_B, "graph:node:southern-hills");
export const GN_B_HITMAN = id(NS_CASE_B, "graph:node:hitman");
export const GN_B_WINTER_HILL = id(NS_CASE_B, "graph:node:winter-hill");

export const GE_B_WJA_CALLAHAN = id(NS_CASE_B, "graph:edge:wja-callahan");
export const GE_B_WJA_RICO = id(NS_CASE_B, "graph:edge:wja-rico");
export const GE_B_WJA_WHEELER = id(NS_CASE_B, "graph:edge:wja-wheeler");
export const GE_B_WHEELER_SHC = id(NS_CASE_B, "graph:edge:wheeler-shc");
export const GE_B_HITMAN_WHEELER = id(NS_CASE_B, "graph:edge:hitman-wheeler");
export const GE_B_WJA_WINTER_HILL = id(NS_CASE_B, "graph:edge:wja-winter-hill");

// -- Gaps / Holes -------------------------------------------------------------
export const GAP_B1 = id(NS_CASE_B, "gap:responsible-party");
export const GAP_B2 = id(NS_CASE_B, "gap:schedule-knowledge");
export const GAP_B3 = id(NS_CASE_B, "gap:audit-records");
export const HOLE_B1 = id(NS_CASE_B, "hole:unknown-actor-schedule");
export const HOLE_B2 = id(NS_CASE_B, "hole:fbi-boston-isolated");
export const GAP_B5 = id(NS_CASE_B, "gap:security-shooter-connection");
export const HOLE_B4 = id(NS_CASE_B, "hole:security-shooter-connection");
export const GAP_B6 = id(NS_CASE_B, "gap:winter-hill-gunman-link");
export const HOLE_B5 = id(NS_CASE_B, "hole:winter-hill-gunman-link");
export const HOLE_B6 = id(NS_CASE_B, "hole:schedule-shooter-golf-schedule");
export const HOLE_B7 = id(NS_CASE_B, "hole:rico-hitman-link");

// -- Hypothesis ---------------------------------------------------------------
export const HYP_B1 = id(NS_CASE_B, "hypothesis:insider-schedule-knowledge");

// -- Leads --------------------------------------------------------------------
export const LEAD_B1 = id(NS_CASE_B, "lead:schedule-knowledge");
export const LEAD_B2 = id(NS_CASE_B, "lead:audit-records");

// -- Evidence Requests --------------------------------------------------------
export const EREQ_B1 = id(NS_CASE_B, "evidence-request:responsible-party");
export const EREQ_B2 = id(NS_CASE_B, "evidence-request:schedule-knowledge");
export const EREQ_B3 = id(NS_CASE_B, "evidence-request:audit-records");

// -- Review Tasks -------------------------------------------------------------
export const REVIEW_B1 = id(NS_CASE_B, "review-task:evidence-murder");
export const REVIEW_B2 = id(NS_CASE_B, "review-task:lead-schedule");

// -- Robustness ---------------------------------------------------------------
export const ROB_B1 = id(NS_CASE_B, "robustness:insider-schedule-knowledge");

// ── Real-Case ID Set ─────────────────────────────────────────────────────────

/** Canonical case ids accepted as demo-served in demo/auto mode. Composed here
 *  (from the case anchors) so config/factory can depend on a single set without
 *  pulling in the whole registry. */
export const REAL_CASE_IDS: readonly string[] = [CASE_A_ID, CASE_B_ID];

// ══════════════════════════════════════════════════════════════════════════════
//  FENCED — Breakthrough Phase 1 (NS_BREAKTHROUGH)
// ══════════════════════════════════════════════════════════════════════════════

export const ART_EXHIBIT_719 = id(NS_BREAKTHROUGH, "artifact:exhibit-719");
export const REC_MARTORANO = id(NS_BREAKTHROUGH, "record:martorano-hearsay-chain");
export const REC_RICO_NOTE = id(NS_BREAKTHROUGH, "record:rico-handwritten-note-s1");
export const ART_WJA_AUDIT = id(NS_BREAKTHROUGH, "artifact:wja-audit-records");
export const ART_TULSA_FILE = id(NS_BREAKTHROUGH, "artifact:tulsa-homicide-file");
export const ART_CONNOLLY_TRIAL = id(NS_BREAKTHROUGH, "artifact:connolly-trial-transcript");
export const REC_HALLORAN_DONAHUE = id(NS_BREAKTHROUGH, "record:halloran-donahue-1982");
export const REC_CALLAHAN_BODY = id(NS_BREAKTHROUGH, "record:callahan-body-miami-1982");
export const REC_CONNOLLY_2002 = id(NS_BREAKTHROUGH, "record:connolly-2002-trial");
export const REC_RICO_2003 = id(NS_BREAKTHROUGH, "record:rico-arrest-2003");
export const REC_CONNOLLY_2008 = id(NS_BREAKTHROUGH, "record:connolly-2008-miami");
export const REC_BULGER_2013 = id(NS_BREAKTHROUGH, "record:bulger-2013-conviction");

// ══════════════════════════════════════════════════════════════════════════════
//  FENCED — Counter-Evidence (NS_COUNTER)
// ══════════════════════════════════════════════════════════════════════════════

export const CNTR_C1 = id(NS_COUNTER, "counter:c1");
export const CNTR_C2 = id(NS_COUNTER, "counter:c2");
export const CNTR_C3 = id(NS_COUNTER, "counter:c3");
export const CNTR_C4 = id(NS_COUNTER, "counter:c4");

// ══════════════════════════════════════════════════════════════════════════════
//  PASS 2 — Phase 1 Intelligence (DERIVED, DERIVED_BY_DEMO_LOGIC)
//
//  Deterministic identities for the Phase-1 discovery chain (cross-case spark →
//  security-chief lead → hypothesis → graph hole → next-best-evidence →
//  prediction freeze). These records are DERIVED by the pure Phase-1 derivation
//  (phase1.ts) from the PASS 1 fixture data — none of them exist in the initial
//  crowd, and none reference fenced breakthrough material.
// ==============================================================================
// -- Analysis / signal anchors -------------------------------------------------
export const P1_ANALYSIS_A = id(NS_CASE_A, "phase1:analysis:ct-connecticut");
export const P1_ANALYSIS_B = id(NS_CASE_B, "phase1:analysis:tulsa-wheeler");

// -- Case B derived artifacts ---------------------------------------------------
export const LEAD_B3 = id(NS_CASE_B, "lead:phase1-security-chief");
export const HYP_B2 = id(NS_CASE_B, "hypothesis:phase1-security-pathway");
export const GAP_B4 = id(NS_CASE_B, "gap:phase1-security-pathway");
export const HOLE_B3 = id(NS_CASE_B, "hole:phase1-security-pathway");
export const EREQ_B4 = id(NS_CASE_B, "evidence-request:phase1-purchase-report");
export const FREEZE_B1 = id(NS_CASE_B, "prediction-freeze:phase1");

// -- Phase-1 event stream (Case A: 2, Case B: 9) -------------------------------
export const EVT_P1_A01 = id(NS_CASE_A, "phase1-event:analysis-started");
export const EVT_P1_A02 = id(NS_CASE_A, "phase1-event:signal-detected");

export const EVT_P1_B01 = id(NS_CASE_B, "phase1-event:analysis-started");
export const EVT_P1_B02 = id(NS_CASE_B, "phase1-event:signal-detected");
export const EVT_P1_B03 = id(NS_CASE_B, "phase1-event:lead-generated");
export const EVT_P1_B04 = id(NS_CASE_B, "phase1-event:hypothesis-created");
export const EVT_P1_B05 = id(NS_CASE_B, "phase1-event:evidence-for-attached");
export const EVT_P1_B06 = id(NS_CASE_B, "phase1-event:evidence-against-attached");
export const EVT_P1_B07 = id(NS_CASE_B, "phase1-event:graph-hole-detected");
export const EVT_P1_B08 = id(NS_CASE_B, "phase1-event:evidence-request-created");
export const EVT_P1_B09 = id(NS_CASE_B, "phase1-event:prediction-frozen");

// ══════════════════════════════════════════════════════════════════════════════
//  PASS 3 — Live Breakthrough Ingestion (DERIVED_ON_INGEST, deterministic)
//
//  Deterministic identities for the Exhibit-719 live ingestion. None of these
//  records exist in any initial fixture set: opening the NS_BREAKTHROUGH fence
//  surfaces the WORLD JAI ALAI PURCHASE REPORT (May 11, 1981) as evidence the
//  analyst SUMMITS, and the ingestion derives source → artifact → evidence →
//  observations → relation → graph edge → hypothesis refinement → gap/ER
//  reassessment. They only enter a workspace when the EREQ_B4 target class is
//  submitted against Case B.
// ==============================================================================
// -- Ingested source / evidence (fenced inputs, live under NS_BREAKTHROUGH) -----
export const SRC_EXHIBIT_719 = id(NS_BREAKTHROUGH, "source:exhibit-719-purchase-report");
export const EVID_EXHIBIT_719 = id(NS_BREAKTHROUGH, "evidence:exhibit-719-wja-purchase-report");

// -- Observations extracted at ingest (visible in the Case B workspace) --------
export const OBS_B7 = id(NS_CASE_B, "observation:exhibit-719-rico-security-role");
export const OBS_B8 = id(NS_CASE_B, "observation:exhibit-719-wja-hospitality-fbi");
export const OBS_B9 = id(NS_CASE_B, "observation:exhibit-719-record-scope");
export const OBS_B10 = id(NS_CASE_B, "observation:exhibit-719-rico-hitman-read");
export const OBS_B11 = id(NS_CASE_B, "observation:rico-coordination-callahan");
export const OBS_B12 = id(NS_CASE_B, "observation:rico-consulting-stipend");

// -- Relation / graph edge derived at ingest -----------------------------------
export const REL_B_WJA_FBI = id(NS_CASE_B, "relation:wja-fbi-boston");
export const GE_B_WJA_FBI = id(NS_CASE_B, "graph:edge:wja-fbi-boston");

// -- Case-A network reveal: bridge relations/edges derived at ingest -----------
// The ingested record materializes the Connecticut network on the Case B graph:
//   H. Paul Rico is the bridge → the hitman → Winter Hill Gang, and the CT
//   SOCTF / McGuigan nodes overlay onto the Tulsa graph via the shared FBI
//   Boston bridge. Only the Tulsa-side bridge edges live in the workspace state;
//   the CT-namespaced nodes/edges are catalog-only overlays (never Case-B rows).
export const REL_B_RICO_HITMAN = id(NS_CASE_B, "relation:rico-hitman-case-link");
export const REL_B_HITMAN_WINTER_HILL = id(NS_CASE_B, "relation:hitman-winter-hill-case-link");
export const GE_B_RICO_HITMAN = id(NS_CASE_B, "graph:edge:rico-hitman-case-link");
export const GE_B_HITMAN_WINTER_HILL = id(NS_CASE_B, "graph:edge:hitman-winter-hill-case-link");
export const GE_B_SOCTF_FBI = id(NS_CASE_B, "graph:edge:soctf-fbi-bridge");
export const GE_B_MCGUIGAN_SOCTF = id(NS_CASE_B, "graph:edge:mcguigan-soctf-bridge");

// -- Hypothesis refinement (child of HYP_B2, only appears post-ingest) ---------
export const HYP_B3 = id(NS_CASE_B, "hypothesis:phase1-security-pathway-refined");

// -- Breakthrough stream (10 actions, keyed by investigation) ------------------
export const EVT_BT_01 = id(NS_CASE_B, "breakthrough-event:evidence-ingested");
export const EVT_BT_02 = id(NS_CASE_B, "breakthrough-event:observation-extracted-rico");
export const EVT_BT_03 = id(NS_CASE_B, "breakthrough-event:observation-extracted-hospitality");
export const EVT_BT_04 = id(NS_CASE_B, "breakthrough-event:entity-resolved");
export const EVT_BT_05 = id(NS_CASE_B, "breakthrough-event:relation-created");
export const EVT_BT_06 = id(NS_CASE_B, "breakthrough-event:graph-edge-added");
export const EVT_BT_07 = id(NS_CASE_B, "breakthrough-event:graph-hole-resolved");
export const EVT_BT_08 = id(NS_CASE_B, "breakthrough-event:hypothesis-promoted");
export const EVT_BT_09 = id(NS_CASE_B, "breakthrough-event:gap-addressed");
export const EVT_BT_10 = id(NS_CASE_B, "breakthrough-event:freeze-compared");

export const EVT_BT_11 = id(NS_CASE_B, "breakthrough-event:ct-node-soctf-materialized");
export const EVT_BT_12 = id(NS_CASE_B, "breakthrough-event:ct-node-mcguigan-materialized");
export const EVT_BT_13 = id(NS_CASE_B, "breakthrough-event:ct-edge-soctf-fbi-bridge");
export const EVT_BT_14 = id(NS_CASE_B, "breakthrough-event:ct-edge-mcguigan-soctf");
export const EVT_BT_15 = id(NS_CASE_B, "breakthrough-event:bridge-rico-hitman");
export const EVT_BT_16 = id(NS_CASE_B, "breakthrough-event:bridge-hitman-winter-hill");

// ══════════════════════════════════════════════════════════════════════════════
//  PASS 4 — Phase 2 Motive / Causal-Hypothesis Investigation (DERIVED)
//
//  Deterministic identities for the Phase-2 causal-hypothesis chain (why was
//  Roger Wheeler killed?): three canonical competing hypotheses (H1/H2/H3,
//  §17 exact wording) plus the motive-discriminator lead / gap / graph hole /
//  evidence request and the pre-evidence comparison freeze. All records are
//  DERIVED by the pure Phase-2 derivation (phase2.ts) from the canonical Case B
//  observations — never from fenced S1 material. The S1 identities (source /
//  artifact / evidence / observations / graph delta) live under NS_BREAKTHROUGH
//  or as Case-B observation ids that appear ONLY in post-evidence projections
//  and the live ingestion — never in any initial fixture row.
// ==============================================================================
// -- Case B derived analytic anchors -------------------------------------------
export const LEAD_P2 = id(NS_CASE_B, "lead:phase2-motive-discriminator");
export const HYP_P2_H1 = id(NS_CASE_B, "hypothesis:phase2-h1-protect-operation");
export const HYP_P2_H2 = id(NS_CASE_B, "hypothesis:phase2-h2-regain-control");
export const HYP_P2_H3 = id(NS_CASE_B, "hypothesis:phase2-h3-personal");
export const HYP_P2_HL = id(NS_CASE_B, "hypothesis:phase2-hidden-link");
export const GAP_AG2 = id(NS_CASE_B, "gap:phase2-motive-discrimination");
export const HOLE_P2_MOTIVE = id(NS_CASE_B, "hole:phase2-motive");
export const EREQ_P2 = id(NS_CASE_B, "evidence-request:phase2-audit-records-motive");
export const FREEZE_P2 = id(NS_CASE_B, "prediction-freeze:phase2-pre-evidence");
export const LEDGER_P2 = id(NS_CASE_B, "reasoning-ledger:phase2");

// -- Phase-2 reasoning ledger entries -------------------------------------------
export const REASON_P2_01 = id(NS_CASE_B, "reasoning-ledger:phase2:entry:01-no-verdict-rule");
export const REASON_P2_02 = id(NS_CASE_B, "reasoning-ledger:phase2:entry:02-h1-fork");
export const REASON_P2_03 = id(NS_CASE_B, "reasoning-ledger:phase2:entry:03-h2-fork");
export const REASON_P2_04 = id(NS_CASE_B, "reasoning-ledger:phase2:entry:04-h3-collapse");
export const REASON_P2_05 = id(NS_CASE_B, "reasoning-ledger:phase2:entry:05-motive-hole");
export const REASON_P2_06 = id(NS_CASE_B, "reasoning-ledger:phase2:entry:06-evidence-request");
export const REASON_P2_07 = id(NS_CASE_B, "reasoning-ledger:phase2:entry:07-freeze");
export const REASON_P2_08 = id(NS_CASE_B, "reasoning-ledger:phase2:entry:08-s1-ingestion");
export const REASON_P2_09 = id(NS_CASE_B, "reasoning-ledger:phase2:entry:09-reassessment");
export const REASON_P2_10 = id(NS_CASE_B, "reasoning-ledger:phase2:entry:10-hearsay-limitation");
export const REASON_P2_11 = id(NS_CASE_B, "reasoning-ledger:phase2:entry:11-final-action");

// -- Phase-2 event stream: initial derivation ("phase2" named sequence) ---------
export const EVT_P2_01 = id(NS_CASE_B, "phase2-event:analysis-started");
export const EVT_P2_02 = id(NS_CASE_B, "phase2-event:hypotheses-proposed");
export const EVT_P2_03 = id(NS_CASE_B, "phase2-event:hypotheses-compared");
export const EVT_P2_04 = id(NS_CASE_B, "phase2-event:hypotheses-assessed");
export const EVT_P2_05 = id(NS_CASE_B, "phase2-event:comparison-rendered");
export const EVT_P2_06 = id(NS_CASE_B, "phase2-event:motive-hole-detected");
export const EVT_P2_07 = id(NS_CASE_B, "phase2-event:evidence-request-created");
export const EVT_P2_08 = id(NS_CASE_B, "phase2-event:freeze-compared");

// -- Phase-2 event stream: S1 live ingestion ("phase2-s1" named sequence) -------
export const EVT_P2S_01 = id(NS_CASE_B, "phase2-s1-event:evidence-ingested");
export const EVT_P2S_02 = id(NS_CASE_B, "phase2-s1-event:observation-extracted-a1");
export const EVT_P2S_03 = id(NS_CASE_B, "phase2-s1-event:observation-extracted-a2");
export const EVT_P2S_04 = id(NS_CASE_B, "phase2-s1-event:observation-extracted-a3");
export const EVT_P2S_05 = id(NS_CASE_B, "phase2-s1-event:relation-created");
export const EVT_P2S_06 = id(NS_CASE_B, "phase2-s1-event:graph-edge-added");
export const EVT_P2S_07 = id(NS_CASE_B, "phase2-s1-event:reassessment-run");
export const EVT_P2S_08 = id(NS_CASE_B, "phase2-s1-event:hypothesis-promoted");
export const EVT_P2S_09 = id(NS_CASE_B, "phase2-s1-event:gap-addressed");
export const EVT_P2S_10 = id(NS_CASE_B, "phase2-s1-event:ledger-appended");

// -- S1 second evidence (fenced inputs, LIVE under NS_BREAKTHROUGH) --------------
export const SRC_S1_AUDIT = id(NS_BREAKTHROUGH, "source:phase2-wja-audit-account");
export const ART_S1_AUDIT = id(NS_BREAKTHROUGH, "artifact:phase2-wja-audit-account");
export const EVID_S1_AUDIT = id(NS_BREAKTHROUGH, "evidence:phase2-wja-audit-account");

// -- Later-historical witness (the House-report testimony that surfaced LONG
//    after this analysis closed). The witness never met the security chief and
//    the chief died before he could be questioned, so the chain is single-source
//    and secondhand. Fenced: this id is released only by the phase-2
//    historical-validation overlay (buildPhase2HistoricalValidation), never by
//    an initial fixture set or a pre-validation surface. */
export const REC_P2_LATER_WITNESS = id(NS_BREAKTHROUGH, "record:phase2-later-witness-testimony");

// -- S1 observations (visible in Case B ONLY after the live ingestion) ----------
export const OBS_P2_A1 = id(NS_CASE_B, "observation:phase2-audit-narrative");
export const OBS_P2_A2 = id(NS_CASE_B, "observation:phase2-audit-timing");
export const OBS_P2_A3 = id(NS_CASE_B, "observation:phase2-audit-limitation");
// -- S1/CROSS-CASE connection evidence (visible ONLY once the graph edge solidifies)
export const OBS_P2_B1 = id(NS_CASE_B, "observation:phase2-connection-rico-hitman");

// -- Relation / graph delta derived at S1 ingest ---------------------------------
// The relation/edge follow the breakthrough convention (relation pair == edge
// pair). GE_B_AUDIT_WJA is the S1-derived CANDIDATE motive-context edge:
// company financial operation (WJA) → owner (WHEELER), unequal financial,
// PROPOSED (judge-acceptable only — never silently forced).
export const REL_B_AUDIT = id(NS_CASE_B, "relation:phase2-audit-wja-wheeler-financial");
export const GE_B_AUDIT_WJA = id(NS_CASE_B, "graph:edge:phase2-audit-wja-wheeler-financial");
