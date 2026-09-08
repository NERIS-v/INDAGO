// ============================================================================
// PASS 4 — Phase 2 Motive / Causal-Hypothesis Investigation test suite
//
// Proves the Phase-2 motive investigation ("why was Roger Wheeler killed?") is:
//   1. DERIVED        — H1/H2/H3 are computed from the CANONICAL Case B
//                       observations (never from fenced S1 material), the pre-
//                       evidence comparison ties H1≈H2 on the shared narrative,
//                       and the freeze/ledger are deterministic.
//   2. GATED          — the S1 second evidence fires ONLY on a Case B submission
//                       carrying the EREQ_P2 target class (WJA AUDIT / FINANCIAL
//                       DOCUMENT (HOUSE REPORT III.B.5)); generic or non-Case-B
//                       submissions never fire it.
//   3. DETERMINISTIC  — identical runs produce identical records and a stable
//                       post-freeze fingerprint (rankingChanged H1 promoted).
//   4. IDEMPOTENT     — re-submitting the class does not duplicate records.
//   5. HONEST         — the physical audit document is BLOCKED (the ingested
//                       fallback is a House-report public account), the relation
//                       stays PROPOSED (machine scores never auto-accept), no
//                       proof/guilt language appears, and the later-historical
//                       hearsay is rendered LATER_HISTORICAL_KNOWLEDGE only.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Evidence } from "@indago/contracts";
import {
  RAW_CASE_FIXTURES,
  caseBEnriched,
  getRealCaseFixtureSet,
} from "@/lib/providers/real-case/index";
import {
  PHASE2_SECOND_EVIDENCE_CLASS,
  PHASE2_SCORE_WEIGHTS,
  PHASE2_SUPPORT_WEIGHTS,
  buildPhase2Frames,
  computeMotiveScores,
  derivePhase2,
  derivePhase2Support,
  buildPhase2S1Package,
  matchesPhase2Class,
  applyPhase2RunToState,
  runPhase2S1Ingestion,
  buildPhase2HistoricalValidation,
} from "@/lib/providers/real-case/phase2";
import {
  CASE_B_ID,
  INVESTIGATION_B_ID,
  ENT_WHEELER,
  ENT_WJA,
  EREQ_P2,
  EVID_S1_AUDIT,
  EVT_P2_01,
  EVT_P2_08,
  EVT_P2S_01,
  EVT_P2S_10,
  GAP_AG2,
  GE_B_AUDIT_WJA,
  GN_B_WJA,
  GN_B_WHEELER,
  HOLE_P2_MOTIVE,
  HYP_P2_H1,
  HYP_P2_H2,
  HYP_P2_H3,
  LEAD_P2,
  LEDGER_P2,
  OBS_B4,
  OBS_P2_A1,
  OBS_P2_A2,
  OBS_P2_A3,
  REASON_P2_01,
  REASON_P2_11,
  REL_B_AUDIT,
  SRC_S1_AUDIT,
} from "@/lib/providers/real-case/lookup";
import { DemoEvidenceProvider, hydrateDemoSessionPhase2 } from "@/lib/providers/demo/providers";
import { createDemoWorkspaceState } from "@/lib/providers/demo/state";
import { listDemoSessionPhase2, resetDemoSession } from "@/lib/providers/demo/session";
import {
  getDataModeConfig,
  TIMING_SCALE_ENV,
  DATA_MODE_ENV,
  DEMO_CASE_ID_ENV,
} from "@/lib/providers/config";
import { CASE_ID, INVESTIGATION_ID } from "@/lib/providers/demo/demo-fixtures/lookup";
import { demoFixtures } from "@/lib/providers/demo/demo-fixtures";
import { catalogKey } from "@/lib/providers/types";
import type { Phase2RunResult } from "@/lib/providers/types";
import type { UploadedFileReference } from "@indago/contracts";

const H1_POST_SCORE = 0.68;
const H2_POST_SCORE = 0.32;
const H3_POST_SCORE = 0;
const PRE_TIED_SCORE = 0.32;

const fastEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  [DATA_MODE_ENV]: "demo",
  [DEMO_CASE_ID_ENV]: CASE_ID,
  [TIMING_SCALE_ENV]: "0.001",
};
const config: DataModeConfig = getDataModeConfig(fastEnv);

function jsonSnap(value: unknown): string {
  return JSON.stringify(value);
}

function caseBWorkspace() {
  const state = createDemoWorkspaceState(
    "phase2:case-b",
    getRealCaseFixtureSet(CASE_B_ID),
  );
  return { state, evidence: new DemoEvidenceProvider(state, config) };
}

async function makePhase2Submission(evidence: DemoEvidenceProvider) {
  const refs = await evidence.prepareUpload(INVESTIGATION_B_ID, [
    new File([new Uint8Array(2048)], "wja-audit-house-report-iii-b5.txt", {
      type: "text/plain",
    }),
  ]);
  return evidence.submit(INVESTIGATION_B_ID, {
    sourceName: PHASE2_SECOND_EVIDENCE_CLASS,
    evidenceType: "RECORD",
    evidenceTitle: PHASE2_SECOND_EVIDENCE_CLASS,
    files: refs satisfies UploadedFileReference[],
  });
}

beforeEach(() => resetDemoSession());
afterEach(() => resetDemoSession());

describe("PASS 4 — pre-ingest boundary (no S1 material exists initially)", () => {
  it("raw PASS 1 Case B contains no fenced Phase-2 second-evidence (S1) records", () => {
    const raw = RAW_CASE_FIXTURES[CASE_B_ID]!;
    const blob = jsonSnap([raw, raw.graphEdges]).toLowerCase();
    // The PASS-1 corpus legitimately discusses the audit as a fact (a pre-
    // existing gap/lead); what must NOT exist is the S1 second-evidence layer:
    // the sealed-audit source/evidence/ids and the "SECOND EVIDENCE" class.
    expect(blob).not.toContain("source:phase2-wja-audit-account");
    expect(blob).not.toContain("evidence:phase2-wja-audit-account");
    expect(blob).not.toContain("observation:phase2-audit");
    expect(blob).not.toContain("second evidence");
    expect(blob).not.toContain("report:phase2-later-witness");
    expect(raw.evidence.every((e: Evidence) => e.id !== EVID_S1_AUDIT)).toBe(true);
    expect(raw.observations.every((o) => o.evidenceId !== EVID_S1_AUDIT)).toBe(true);
    expect(raw.relations.every((r) => r.id !== REL_B_AUDIT)).toBe(true);
  });

  it("the enriched Case B workspace still has 9 Phase-1 events and 6 graph edges", () => {
    expect(caseBEnriched.events).toHaveLength(9);
    expect(caseBEnriched.graphEdges).toHaveLength(6);
    // S1 material (evidence / observations / relation / edge) never enters the
    // pre-ingest envelope.
    expect(caseBEnriched.evidence.every((e: Evidence) => e.id !== EVID_S1_AUDIT)).toBe(true);
    expect(caseBEnriched.observations.every((o: Evidence) => o.evidenceId !== EVID_S1_AUDIT)).toBe(true);
    expect(caseBEnriched.relations.every((r) => r.id !== REL_B_AUDIT)).toBe(true);
    expect(caseBEnriched.graphEdges.every((e) => e.id !== GE_B_AUDIT_WJA)).toBe(true);
    // The pre-evidence H1/H2/H3 ARE present — they are DERIVED from the PASS-1
    // observations (never from S1 material).
    expect(caseBEnriched.hypotheses.some((h) => h.id === HYP_P2_H1)).toBe(true);
  });

  it("exposes the Phase-2 S1 ONLY as choreography + projection (never records)", () => {
    expect(caseBEnriched.namedSequences?.phase2).toHaveLength(8);
    expect(caseBEnriched.namedSequences?.["phase2-s1"]).toHaveLength(10);
    expect(caseBEnriched.phase2?.assessmentFreeze?.id).toBeTruthy();
    expect(caseBEnriched.phase2?.evidenceDelta?.evidenceIngestedIds).toEqual([EVID_S1_AUDIT]);
    expect(caseBEnriched.phase2?.historicalValidation?.classification).toBe(
      "LATER_HISTORICAL_KNOWLEDGE",
    );
  });
});

describe("PASS 4 — pre-evidence derivation (H1/H2/H3 compare honestly)", () => {
  const d = derivePhase2();

  it("proposes the three canonical hypotheses with doc §17 exact wording", () => {
    expect(d.hypotheses.map((h) => h.id)).toEqual([HYP_P2_H1, HYP_P2_H2, HYP_P2_H3]);
    const h1 = d.hypotheses.find((h) => h.id === HYP_P2_H1)!;
    expect(h1.statement).toContain("protect the company's financial operation");
    const h2 = d.hypotheses.find((h) => h.id === HYP_P2_H2)!;
    expect(h2.statement).toContain("restored / preserved");
    const h3 = d.hypotheses.find((h) => h.id === HYP_P2_H3)!;
    expect(h3.confidence).toBe(0.3);
    expect(h3.supportingObservationIds).toEqual([]);
  });

  it("pre-evidence comparison ties H1 ≈ H2 on the shared narrative; H3 weakest", () => {
    const { rows, pool } = computeMotiveScores(
      buildPhase2Frames(),
      caseBEnriched.observations,
      "PRE_EVIDENCE",
    );
    const h1 = rows.find((r) => r.key === "H1")!;
    const h2 = rows.find((r) => r.key === "H2")!;
    const h3 = rows.find((r) => r.key === "H3")!;
    expect(h1.score).toBe(PRE_TIED_SCORE);
    expect(h2.score).toBe(PRE_TIED_SCORE);
    expect(h3.score).toBe(H3_POST_SCORE);
    expect(h1.supportingObservationIds).toEqual([OBS_B4]);
    expect(h2.supportingObservationIds).toEqual([OBS_B4]);
    expect(pool).toContain(OBS_B4);
    expect(pool).not.toContain(OBS_P2_A1);
  });

  it("derives the lead, gap, hole, and evidence request for the motive discriminator", () => {
    expect(d.lead.id).toBe(LEAD_P2);
    expect(d.gap.id).toBe(GAP_AG2);
    expect(d.gap.status).toBe("IDENTIFIED");
    expect(d.hole.type).toBe("MISSING_EDGE");
    expect(d.hole.nodeIds).toEqual([GN_B_WJA, GN_B_WHEELER]);
    expect(d.evidenceRequest.id).toBe(EREQ_P2);
    expect(d.evidenceRequest.description).toContain(PHASE2_SECOND_EVIDENCE_CLASS);
    expect(d.evidenceRequest.status).toBe("SUBMITTED");
  });

  it("runs an 8-event phase2 stream", () => {
    expect(d.events).toHaveLength(8);
    expect(d.events[0]?.id).toBe(EVT_P2_01);
    expect(d.events[7]?.id).toBe(EVT_P2_08);
  });

  it("freezes a pre-evidence comparison deterministically", () => {
    expect(d.freeze.id).toBeTruthy();
    expect(d.freeze.stage).toBe("PHASE_2_PRE_EVIDENCE_FREEZE");
    expect(d.freeze.rows.length).toBe(3);
    expect(d.freeze.fingerprint).toMatch(/^[0-9a-f]{32}$/);
    expect(d.freeze.caveat).toContain("None of them has won yet");
  });

  it("records a reasoning ledger with the no-proof rule first", () => {
    expect(d.ledger.id).toBe(LEDGER_P2);
    expect(d.ledger.entries.length).toBe(7);
    expect(d.ledger.entries.map((e) => e.id)).toEqual([
      REASON_P2_01,
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
    ]);
    expect(d.ledger.entries[0]?.action).toBe("RECORD_REASONING");
    expect(d.ledger.entries[0]?.detail).toContain("never PROVEN");
    expect(d.ledger.entries.every((e) => e.investigationId === INVESTIGATION_B_ID)).toBe(true);
  });
});

describe("PASS 4 — S1 package supply chain (DERIVED, honest, deterministic)", () => {
  it("builds a verbatim supply chain with documented support", () => {
    const pkg = buildPhase2S1Package(derivePhase2());
    expect(pkg.source.id).toBe(SRC_S1_AUDIT);
    expect(pkg.source.status).toBe("ACTIVE");
    expect(pkg.artifact.evidenceId).toBe(EVID_S1_AUDIT);
    expect(pkg.evidence.id).toBe(EVID_S1_AUDIT);
    expect(pkg.evidence.type).toBe("RECORD");
    expect(pkg.evidence.status).toBe("PROCESSED");
    expect(pkg.evidence.posture).toBe("T1_INVESTIGATIVE_LEAD");
    expect([...pkg.evidence.entityIds].sort()).toEqual([ENT_WHEELER, ENT_WJA].sort());
    expect(pkg.evidence.observationIds).toEqual([OBS_P2_A1, OBS_P2_A2, OBS_P2_A3]);
    expect(pkg.evidence.hypothesisIds).toEqual([HYP_P2_H1, HYP_P2_H2, HYP_P2_H3]);
  });

  it("the document is honestly BLOCKED — the fallback is a report-text account", () => {
    const pkg = buildPhase2S1Package(derivePhase2());
    expect(pkg.record.physicalDocStatus).toBe("BLOCKED");
    expect(pkg.record.fallback).toBe("REPORT_TEXT_ACCOUNT");
    expect(pkg.evidence.description).toContain("BLOCKED");
    expect(pkg.source.description).toContain("BLOCKED");
    // The fallback account explicitly disclaims naming a perpetrator — it never
    // asserts who killed Roger Wheeler.
    expect(pkg.evidence.description).toContain("does not name who killed");
  });

  it("the relation stays PROPOSED (a machine score never auto-accepts)", () => {
    const pkg = buildPhase2S1Package(derivePhase2());
    expect(pkg.relation.id).toBe(REL_B_AUDIT);
    expect(pkg.relation.status).toBe("PROPOSED");
    expect(pkg.relation.relationType).toBe("financial");
    expect(pkg.relation.sourceEntityId).toBe(ENT_WJA);
    expect(pkg.relation.targetEntityId).toBe(ENT_WHEELER);
    expect(pkg.relation.support).toBe(derivePhase2Support({}));
    expect(derivePhase2Support({})).toBe(0.76);
    expect(derivePhase2Support({ auditStrength: 0 })).toBe(0.41);
  });

  it("the graph edge materializes the PROPOSED relation as an ACTIVE edge", () => {
    const pkg = buildPhase2S1Package(derivePhase2());
    expect(pkg.edge.id).toBe(GE_B_AUDIT_WJA);
    expect(pkg.edge.status).toBe("ACTIVE");
    expect(pkg.edge.relationHypothesisId).toBe(REL_B_AUDIT);
    expect(pkg.edge.sourceNodeId).toBe(GN_B_WJA);
    expect(pkg.edge.targetNodeId).toBe(GN_B_WHEELER);
    expect(pkg.run.patch.graphNodes).toEqual([]);
    expect(pkg.run.patch.graphEdges.map((e) => e.id)).toEqual([GE_B_AUDIT_WJA]);
  });

  it("post-ingestion re-scoring promotes H1 and records a ranking change", () => {
    const pkg = buildPhase2S1Package(derivePhase2());
    const delta = pkg.delta;
    const after = delta.after;
    const h1 = after.rows.find((r) => r.key === "H1")!;
    const h2 = after.rows.find((r) => r.key === "H2")!;
    const h3 = after.rows.find((r) => r.key === "H3")!;
    expect(h1.score).toBe(H1_POST_SCORE);
    expect(h1.exclusiveObservationIds).toEqual(expect.arrayContaining([OBS_P2_A1, OBS_P2_A2, OBS_P2_A3]));
    expect(h1.exclusiveObservationIds).toHaveLength(3);
    expect(h1.canonicalStatus).toBe("SUPPORTED");
    expect(h2.score).toBe(H2_POST_SCORE);
    expect(h2.canonicalStatus).toBe("ACTIVE");
    expect(h3.score).toBe(H3_POST_SCORE);
    expect(delta.rankingChanged).toBe(true);
    expect(delta.hypothesisPromotedIds).toEqual([HYP_P2_H1]);
    expect(delta.before.fingerprint).not.toBe(delta.after.fingerprint);
  });

  it("gap/ER transition honestly and the hole is PARTIALLY_RESOLVED (not resolved)", () => {
    const pkg = buildPhase2S1Package(derivePhase2());
    expect(pkg.gapReassessment.id).toBe(GAP_AG2);
    expect(pkg.gapReassessment.status).toBe("PARTIALLY_ADDRESSED");
    expect(pkg.gapReassessment.resolution).toContain("NOT resolved");
    expect(pkg.evidenceRequestCompletion.id).toBe(EREQ_P2);
    expect(pkg.evidenceRequestCompletion.status).toBe("COMPLETED");
    expect(pkg.delta.holeStatusChanges).toEqual([
      { graphHoleId: HOLE_P2_MOTIVE, status: "PARTIALLY_RESOLVED", derivedFromEvidenceIds: [EVID_S1_AUDIT] },
    ]);
    expect(pkg.delta.gapStatusChanges).toEqual([
      { gapId: GAP_AG2, from: "IDENTIFIED", to: "PARTIALLY_ADDRESSED" },
    ]);
  });

  it("runs a 10-event phase2-s1 stream and a graph overlay catalog", () => {
    const pkg = buildPhase2S1Package(derivePhase2());
    expect(pkg.events).toHaveLength(10);
    expect(pkg.events[0]?.id).toBe(EVT_P2S_01);
    expect(pkg.events[9]?.id).toBe(EVT_P2S_10);
    expect(pkg.catalog[catalogKey("RELATION_CREATED", REL_B_AUDIT)]?.kind).toBe("edge");
    expect(pkg.catalog[catalogKey("GRAPH_EDGE_ADDED", GE_B_AUDIT_WJA)]?.kind).toBe("edge");
  });

  it("appends ledger entries 8-11 with an OPEN_NEW_LEAD final action", () => {
    const pkg = buildPhase2S1Package(derivePhase2());
    expect(pkg.ledgerEntries.map((e) => e.id)).toEqual([
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
    ]);
    expect(pkg.ledgerEntries[3]?.action).toBe("OPEN_NEW_LEAD");
    expect(pkg.ledgerEntries[0]?.kind).toBe("INGESTION");
    expect(pkg.ledgerEntries[2]?.kind).toBe("LIMITATION");
    expect(pkg.ledgerEntries[2]?.detail).toContain("secondhand attribution");
  });
});

describe("PASS 4 — match gate honors the EREQ_P2 target class only (normalized)", () => {
  it("accepts the canonical class in title or file name (case/whitespace tolerant)", () => {
    expect(matchesPhase2Class("WJA AUDIT / FINANCIAL DOCUMENT (HOUSE REPORT III.B.5)", ["x.pdf"])).toBe(true);
    expect(matchesPhase2Class("wja-audit-house-report-iii-b5.pdf", [PHASE2_SECOND_EVIDENCE_CLASS])).toBe(true);
  });

  it("rejects titles/files that do not carry the full class", () => {
    expect(matchesPhase2Class("Ledger rows for shell", ["ledger.csv"])).toBe(false);
    expect(matchesPhase2Class("WJA AUDIT", ["wja-audit.pdf"])).toBe(false);
    expect(matchesPhase2Class("House Report", ["house-report.pdf"])).toBe(false);
  });
});

describe("PASS 4 — live S1 ingestion through DemoEvidenceProvider", () => {
  it("a matching submission fires the ingestion and completes EREQ_P2", async () => {
    const { state, evidence } = caseBWorkspace();
    await makePhase2Submission(evidence);
    expect(state.evidenceById.has(EVID_S1_AUDIT)).toBe(true);
    expect(state.observationById.has(OBS_P2_A1)).toBe(true);
    expect(state.hypothesisById.get(HYP_P2_H1)?.status).toBe("SUPPORTED");
    expect(state.gapById.get(GAP_AG2)?.status).toBe("PARTIALLY_ADDRESSED");
    expect(state.evidenceRequestById.get(EREQ_P2)?.status).toBe("COMPLETED");
    expect(state.graphEdgeById.has(GE_B_AUDIT_WJA)).toBe(true);
    expect(listDemoSessionPhase2(INVESTIGATION_B_ID)).toHaveLength(1);
  });

  it("lists the ingested S1 evidence exactly once via the evidence provider", async () => {
    const { evidence } = caseBWorkspace();
    await makePhase2Submission(evidence);
    const page = await evidence.listByInvestigation(INVESTIGATION_B_ID, { pageSize: 100 });
    const matches = page.items.filter((e: Evidence) => e.id === EVID_S1_AUDIT);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.title).toBe(PHASE2_SECOND_EVIDENCE_CLASS);
  });

  it("hydrates the session-run into a FRESH provider bundle exactly once", async () => {
    const { evidence } = caseBWorkspace();
    await makePhase2Submission(evidence);
    expect(listDemoSessionPhase2(INVESTIGATION_B_ID)).toHaveLength(1);

    const fresh = caseBWorkspace();
    hydrateDemoSessionPhase2(fresh.state);
    expect(fresh.state.evidenceById.has(EVID_S1_AUDIT)).toBe(true);
    expect(fresh.state.hypothesisById.get(HYP_P2_H1)?.status).toBe("SUPPORTED");
    const page = await fresh.evidence.listByInvestigation(INVESTIGATION_B_ID, { pageSize: 100 });
    expect(page.items.filter((e: Evidence) => e.id === EVID_S1_AUDIT)).toHaveLength(1);
  });

  it("is idempotent: re-submitting the class never duplicates S1 records", async () => {
    const { state, evidence } = caseBWorkspace();
    await makePhase2Submission(evidence);
    await makePhase2Submission(evidence);
    expect(state.evidenceById.size).toBe(caseBEnriched.evidence.length + 1);
    expect(state.evidenceById.has(EVID_S1_AUDIT)).toBe(true);
    expect(state.observationById.has(OBS_P2_A1)).toBe(true);
    expect(state.graphEdgeById.has(GE_B_AUDIT_WJA)).toBe(true);
    expect(state.relationById.has(REL_B_AUDIT)).toBe(true);
    const page = await evidence.listByInvestigation(INVESTIGATION_B_ID, { pageSize: 100 });
    expect(page.items.filter((e: Evidence) => e.id === EVID_S1_AUDIT)).toHaveLength(1);
  });

  it("a generic (non-matching) submission NEVER fires the Phase-2 ingestion", async () => {
    const { state, evidence } = caseBWorkspace();
    const refs = await evidence.prepareUpload(INVESTIGATION_B_ID, [
      new File([new Uint8Array(256)], "ledger.csv", { type: "text/csv" }),
    ]);
    await evidence.submit(INVESTIGATION_B_ID, {
      sourceName: "Registry export",
      evidenceType: "FINANCIAL",
      evidenceTitle: "Ledger rows for shell",
      files: refs satisfies UploadedFileReference[],
    });
    expect(state.evidenceById.has(EVID_S1_AUDIT)).toBe(false);
    expect(state.gapById.get(GAP_AG2)?.status).toBe("IDENTIFIED");
    expect(listDemoSessionPhase2(INVESTIGATION_B_ID)).toHaveLength(0);
  });

  it("a matching title in a NON-Case-B workspace cannot trigger the ingestion", async () => {
    const state = createDemoWorkspaceState("phase2:ofs");
    const evidence = new DemoEvidenceProvider(state, config);
    const refs = await evidence.prepareUpload(INVESTIGATION_ID, [
      new File([new Uint8Array(256)], "report.txt", { type: "text/plain" }),
    ]);
    await evidence.submit(INVESTIGATION_ID, {
      sourceName: "Registry export",
      evidenceType: "RECORD",
      evidenceTitle: PHASE2_SECOND_EVIDENCE_CLASS,
      files: refs satisfies UploadedFileReference[],
    });
    expect(state.evidenceById.has(EVID_S1_AUDIT)).toBe(false);
    expect(listDemoSessionPhase2(INVESTIGATION_ID)).toHaveLength(0);
    expect(demoFixtures.case.id).not.toBe(CASE_B_ID);
  });
});

describe("PASS 4 — honesty gates (no proof; later hearsay stays an overlay only)", () => {
  it("derived JSON never records a guilt/proven verdict — it records the no-proof rule instead", () => {
    const s1 = buildPhase2S1Package(derivePhase2());
    const blob = jsonSnap([s1.record, s1.delta, s1.events]).toLowerCase();
    // The S1 record/delta/events never declare a guilty party or a proven motive.
    expect(blob).not.toContain("guilty of");
    expect(blob).not.toContain("motive is proved");
    expect(blob).not.toContain("confessed");
    expect(blob).not.toContain("was the killer");
    // The summary explicitly disclaims proof.
    expect(s1.record.summary).toContain("NOT proof of who killed Wheeler");
    // The pre-evidence ledger records the standing RULE OF EVIDENCE (never PROVEN).
    const ledger = derivePhase2().ledger;
    expect(ledger.entries[0]?.title).toBe("No proof language");
    expect(ledger.entries[0]?.detail).toContain("never PROVEN");
  });

  it("the later-historical validation overlay is LATER_HISTORICAL_KNOWLEDGE, never confirmed", () => {
    const v = buildPhase2HistoricalValidation();
    expect(v.classification).toBe("LATER_HISTORICAL_KNOWLEDGE");
    expect(v.verdict).toBe("PARTIALLY_CORROBORATED");
    expect(v.stance).toBe("SOURCE_CREDIBILITY");
    expect(v.mannerOfProof).toBe("UNRESOLVED");
    expect(v.nonMeeting).toContain("never met the security chief");
    expect(v.hearsayChain.length).toBe(2);
    expect(v.hearsayChain[1]?.note).toContain("died before he could be questioned");
    expect(v.derivedFrom).toHaveLength(2);
  });

  it("the phase2-s1 scope is leak-safe by construction (no later-witness names)", () => {
    const pkg = buildPhase2S1Package(derivePhase2());
    const o = buildPhase2HistoricalValidation();
    const s1Blob = jsonSnap([pkg.record, pkg.delta, pkg.events, o.derivedFrom]).toLowerCase();
    // The overlay's derivedFrom ids are OPAQUE ids — never human names or the
    // witness's account text.
    expect(s1Blob).not.toContain("witness");
    expect(s1Blob).not.toContain("sheet identifying");
    expect(pkg.record.summary).not.toContain("later");
  });

  it("PHASE2_SCORE_WEIGHTS and PHASE2_SUPPORT_WEIGHTS are documented constants", () => {
    expect(PHASE2_SCORE_WEIGHTS).toEqual({ strength: 0.6, exclusivity: 0.4, overlapPenalty: 0.1 });
    expect(PHASE2_SUPPORT_WEIGHTS).toEqual({ auditNarrative: 0.5, timingContext: 0.3, structuralFit: 0.2 });
  });
});