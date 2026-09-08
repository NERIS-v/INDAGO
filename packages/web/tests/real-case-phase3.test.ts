// ============================================================================
// PASS 3 — Live Breakthrough / Evidence Ingestion test suite
//
// Proves the Exhibit-719 live ingestion is:
//   1. DERIVED_ON_INGEST   — nothing breakthrough-related exists in any initial
//                            fixture set; interrogating the RAW corpora and the
//                            pre-ingest workspace shows NO fenced material.
//   2. DEMO DIRECTIVE      — any Case B document upload fires the SAME
//                            breakthrough reveal (the analyst need not upload
//                            the exact Exhibit-719 ledger); a submission
//                            carrying the EREQ_P2 class routes instead to the
//                            Phase-2 second-evidence flow, and a non-Case-B
//                            workspace never fires it.
//   3. DETERMINISTIC       — identical runs, identical records, stable freezes.
//   4. IDEMPOTENT          — re-submitting never duplicates records.
//   5. HONEST              — provenance is mandatory everywhere, gap is
//                            PARTIALLY_ADDRESSED (not resolved), the refinement
//                            reuses the parent chain, and no guilt/conspiracy or
//                            later-validation hearsay ever enters derived JSON.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Evidence } from "@indago/contracts";
import {
  RAW_CASE_FIXTURES,
  REAL_CASE_PHASE1,
  REAL_CASE_BREAKTHROUGH,
  caseBEnriched,
  getRealCaseFixtureSet,
} from "@/lib/providers/real-case/index";
import {
  BREAKTHROUGH_CLASS,
  buildBreakthroughPackage,
  computePostFreezeFingerprintAfter,
  deriveBreakthroughSupport,
  matchesBreakthroughClass,
  runBreakthroughIngestion,
  applyBreakthroughRunToState,
} from "@/lib/providers/real-case/breakthrough";
import {
  CASE_B_ID,
  INVESTIGATION_B_ID,
  ENT_RICO,
  ENT_WJA,
  ENT_FBIBOSTON,
  EREQ_B4,
  EVID_EXHIBIT_719,
  EVT_BT_01,
  EVT_BT_02,
  EVT_BT_03,
  EVT_BT_04,
  EVT_BT_05,
  EVT_BT_06,
  EVT_BT_07,
  EVT_BT_08,
  EVT_BT_09,
  EVT_BT_10,
  EVT_BT_11,
  EVT_BT_12,
  EVT_BT_13,
  EVT_BT_14,
  EVT_BT_15,
  EVT_BT_16,
  GAP_B4,
  GE_B_WJA_FBI,
  GE_B_RICO_HITMAN,
  GE_B_HITMAN_WINTER_HILL,
  GE_B_SOCTF_FBI,
  GE_B_MCGUIGAN_SOCTF,
  GN_B_WJA,
  GN_B_FBI,
  GN_A_SOCTF,
  GN_A_MCGUIGAN,
  HOLE_B3,
  HYP_B2,
  HYP_B3,
  OBS_B7,
  OBS_B8,
  OBS_B9,
  REL_B_WJA_FBI,
  SRC_EXHIBIT_719,
} from "@/lib/providers/real-case/lookup";
import { DemoEvidenceProvider, hydrateDemoSessionBreakthroughs } from "@/lib/providers/demo/providers";
import { createDemoWorkspaceState } from "@/lib/providers/demo/state";
import { listDemoSessionBreakthrough, resetDemoSession } from "@/lib/providers/demo/session";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import { CASE_ID, INVESTIGATION_ID } from "@/lib/providers/demo/demo-fixtures/lookup";
import { demoFixtures } from "@/lib/providers/demo/demo-fixtures";
import { catalogKey } from "@/lib/providers/types";
import type { DataModeConfig, BreakthroughRunResult } from "@/lib/providers/types";
import type { UploadedFileReference } from "@indago/contracts";

const BREAKTHROUGH_SUPPORT = 0.76;

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
    "breakthrough:case-b",
    getRealCaseFixtureSet(CASE_B_ID),
  );
  return { state, evidence: new DemoEvidenceProvider(state, config) };
}

async function makeBreakthroughSubmission(evidence: DemoEvidenceProvider) {
  const refs = await evidence.prepareUpload(INVESTIGATION_B_ID, [
    new File([new Uint8Array(2048)], "wja-purchase-report-may-11-1981.pdf", {
      type: "application/pdf",
    }),
  ]);
  return evidence.submit(INVESTIGATION_B_ID, {
    sourceName: BREAKTHROUGH_CLASS,
    evidenceType: "RECORD",
    evidenceTitle: BREAKTHROUGH_CLASS,
    files: refs satisfies UploadedFileReference[],
  });
}

describe("PASS 3 — pre-ingest boundary (nothing breakthrough exists initially)", () => {
  it("raw PASS 1 corpora contain no fenced Exhibit-719 material", () => {
    const blob = jsonSnap([
      RAW_CASE_FIXTURES[CASE_B_ID]!,
      RAW_CASE_FIXTURES[CASE_B_ID]!.graphEdges,
    ]).toLowerCase();
    expect(blob).not.toContain("exhibit");
    expect(blob).not.toContain("purchase report");
    expect(blob).not.toContain("dowd");
    expect(blob).not.toContain("forrester");
    // PASS 1 Case B graph stays exactly 6 edges (homicide/organizational/security edges — no redundant leaves).
    expect(RAW_CASE_FIXTURES[CASE_B_ID]!.graphEdges).toHaveLength(6);
  });

  it("the enriched Case B workspace still starts with 9 Phase-1 events and no breakthrough records", () => {
    expect(caseBEnriched.events).toHaveLength(9);
    expect(caseBEnriched.evidence.every((e: Evidence) => e.id !== EVID_EXHIBIT_719)).toBe(true);
    expect(caseBEnriched.hypotheses.every((h) => h.id !== HYP_B3)).toBe(true);
    expect(caseBEnriched.relations.every((r) => r.id !== REL_B_WJA_FBI)).toBe(true);
    expect(caseBEnriched.gaps.find((g) => g.id === GAP_B4)?.status).toBe("IDENTIFIED");
    expect(caseBEnriched.evidenceRequests.find((er) => er.id === EREQ_B4)?.status).toBe("SUBMITTED");
    expect(caseBEnriched.graphEdges).toHaveLength(6);
  });

  it("exposes the breakthrough ONLY as on-demand choreography + overlay + projection (never records)", () => {
    expect(caseBEnriched.namedSequences?.upload).toHaveLength(16);
    expect(caseBEnriched.namedSequences?.breakthrough).toHaveLength(16);
    expect(caseBEnriched.graphRealtimeCatalog?.[catalogKey("GRAPH_EDGE_ADDED", GE_B_WJA_FBI)]?.kind).toBe("edge");
    expect(
      caseBEnriched.graphRealtimeCatalog?.[catalogKey("GRAPH_HOLE_RESOLVED", HOLE_B3)]?.kind,
    ).toBe("hole-resolve");
    expect(caseBEnriched.phase1?.postFreezeDelta?.evidenceIngestedIds).toEqual([EVID_EXHIBIT_719]);
    expect(caseBEnriched.phase1?.breakthroughRecord?.evidenceId).toBe(EVID_EXHIBIT_719);
    // Case-A network reveal: CT nodes + overlay/bridge edges ride the SAME catalog.
    expect(caseBEnriched.graphRealtimeCatalog?.[catalogKey("GRAPH_NODE_ADDED", GN_A_SOCTF)]?.kind).toBe("node");
    expect(caseBEnriched.graphRealtimeCatalog?.[catalogKey("GRAPH_NODE_ADDED", GN_A_MCGUIGAN)]?.kind).toBe("node");
    expect(caseBEnriched.graphRealtimeCatalog?.[catalogKey("GRAPH_EDGE_ADDED", GE_B_RICO_HITMAN)]?.kind).toBe("edge");
    expect(
      caseBEnriched.graphRealtimeCatalog?.[catalogKey("GRAPH_EDGE_ADDED", GE_B_HITMAN_WINTER_HILL)]?.kind,
    ).toBe("edge");
  });

  it("match gate honors the canonical EREQ_B4 class only (normalized)", () => {
    expect(matchesBreakthroughClass("World Jai Alai  Purchase   Report (May 11, 1981)", ["x.pdf"])).toBe(true);
    expect(matchesBreakthroughClass("wja-purchase-report-may-11-1981.pdf", [BREAKTHROUGH_CLASS])).toBe(true);
    expect(matchesBreakthroughClass("Ledger rows for shell", ["ledger.csv"])).toBe(false);
    expect(matchesBreakthroughClass("WORLD JAI ALAI", ["receipt.jpg"])).toBe(false);
  });
});

describe("PASS 3 — package supply chain (DERIVED, honest, deterministic)", () => {
  it("builds a verbatim supply chain with documented support", () => {
    const pkg = buildBreakthroughPackage();
    expect(pkg.support).toBe(BREAKTHROUGH_SUPPORT);
    expect(deriveBreakthroughSupport({})).toBe(BREAKTHROUGH_SUPPORT);
    expect(deriveBreakthroughSupport({ hospitalityStrength: 0 })).toBe(0.41);

    expect(pkg.evidence.id).toBe(EVID_EXHIBIT_719);
    expect(pkg.evidence.type).toBe("RECORD");
    expect(pkg.evidence.status).toBe("PROCESSED");
    expect(pkg.evidence.strength).toBe(0.7);
    expect(pkg.evidence.posture).toBe("T1_INVESTIGATIVE_LEAD");
    expect([...pkg.evidence.entityIds].sort()).toEqual([ENT_FBIBOSTON, ENT_RICO, ENT_WJA].sort());
    expect(pkg.evidence.provenance.sourceId).toBe(SRC_EXHIBIT_719);

    expect(pkg.observations.map((o) => o.id)).toEqual([OBS_B7, OBS_B8, OBS_B9]);
    expect(pkg.observations.every((o) => o.type === "FINANCIAL" && o.sourceId === SRC_EXHIBIT_719)).toBe(true);
    expect(pkg.observations.every((o) => o.provenance?.sourceId === SRC_EXHIBIT_719)).toBe(true);
    expect(
      pkg.observations.map((o) => o.candidateMentions.join("|")).sort(),
    ).toEqual(["", "", "FBI Special Agents|Dowd|Forrester"].sort());
  });

  it("derives the relation + graph edge (WJA → FBI Boston, financial)", () => {
    const pkg = buildBreakthroughPackage();
    expect(pkg.relation.id).toBe(REL_B_WJA_FBI);
    expect(pkg.relation.relationType).toBe("financial");
    expect(pkg.relation.support).toBe(BREAKTHROUGH_SUPPORT);
    expect([...pkg.relation.evidenceBasis].sort()).toEqual([OBS_B7, OBS_B8].sort());
    expect([...pkg.relation.contradictions!].sort()).toEqual([OBS_B9].sort());
    expect(pkg.relation.status).toBe("PROPOSED");

    expect(pkg.edge.id).toBe(GE_B_WJA_FBI);
    expect(pkg.edge.sourceNodeId).toBe(GN_B_WJA);
    expect(pkg.edge.targetNodeId).toBe(GN_B_FBI);
    expect(pkg.edge.relationType).toBe("financial");
    expect(pkg.edge.relationHypothesisId).toBe(REL_B_WJA_FBI);
    expect(pkg.edge.status).toBe("ACTIVE");
    expect(pkg.edge.observationCount).toBe(2);
    expect(pkg.edge.sourceCount).toBe(1);
  });

  it("derives the Case-A network reveal: CT overlay nodes + bridge edges (all PROPOSED)", () => {
    const pkg = buildBreakthroughPackage();
    const bridgeIds = pkg.run.patch.graphEdges.map((e) => e.id).sort();
    expect(bridgeIds).toEqual(
      [GE_B_WJA_FBI, GE_B_RICO_HITMAN, GE_B_HITMAN_WINTER_HILL].sort(),
    );
    const ricoHitman = pkg.run.patch.graphEdges.find((e) => e.id === GE_B_RICO_HITMAN)!;
    expect(ricoHitman.relationType).toBe("case-link");
    expect(ricoHitman.support).toBe(0.72);
    expect(ricoHitman.status).toBe("ACTIVE");
    expect(pkg.run.patch.graphEdges.find((e) => e.id === GE_B_HITMAN_WINTER_HILL)!.support).toBe(0.7);

    const revealRelations = pkg.run.patch.relations.filter((r) => r.id !== REL_B_WJA_FBI);
    expect(revealRelations.map((r) => r.status)).toEqual(["PROPOSED", "PROPOSED"]);
    expect(pkg.run.patch.relations.some((r) => r.relationType === "case-link")).toBe(true);

    // CT overlay edges ride the catalog ONLY (never Case B graph rows).
    expect(pkg.delta.graphEdgesAdded).toEqual([
      GE_B_WJA_FBI,
      GE_B_RICO_HITMAN,
      GE_B_HITMAN_WINTER_HILL,
    ]);
    expect(pkg.catalog[catalogKey("GRAPH_NODE_ADDED", GN_A_SOCTF)]?.kind).toBe("node");
    expect(pkg.catalog[catalogKey("GRAPH_NODE_ADDED", GN_A_MCGUIGAN)]?.kind).toBe("node");
    expect(pkg.catalog[catalogKey("GRAPH_EDGE_ADDED", GE_B_SOCTF_FBI)]?.kind).toBe("edge");
    expect(pkg.catalog[catalogKey("GRAPH_EDGE_ADDED", GE_B_MCGUIGAN_SOCTF)]?.kind).toBe("edge");
  });

  it("refines HYP_B2 into HYP_B3 with the parent chain (no hypothesis ids in derivedFrom)", () => {
    const pkg = buildBreakthroughPackage();
    const h = pkg.refinementHypothesis;
    expect(h.id).toBe(HYP_B3);
    expect(h.parentHypothesisId).toBe(HYP_B2);
    expect(h.status).toBe("SUPPORTED");
    expect(h.confidence).toBe(0.31);
    expect(h.supportingObservationIds).toContain(OBS_B7);
    expect(h.supportingObservationIds).toContain(OBS_B8);
    expect(h.contradictingObservationIds).toContain(OBS_B9);
    expect(h.supportingEvidenceIds).toContain(EVID_EXHIBIT_719);
    expect(h.relatedEntityIds).toContain(ENT_FBIBOSTON);
    expect(h.provenance.entries.length).toBe(2);
    const appended = h.provenance.entries.at(-1)!;
    expect([...(appended.derivedFrom ?? [])].sort()).toEqual([OBS_B7, OBS_B8, OBS_B9].sort());
    for (const entry of h.provenance.entries) {
      expect(entry.sourceId).toBeTruthy();
      for (const id of entry.derivedFrom ?? []) {
        expect(id).not.toBe(HYP_B2);
        expect(id).not.toBe(HYP_B3);
      }
    }
  });

  it("reassesses the gap to PARTIALLY_ADDRESSED and completes EREQ_B4", () => {
    const pkg = buildBreakthroughPackage();
    const gap = pkg.gapReassessment;
    expect(gap.id).toBe(GAP_B4);
    expect(gap.status).toBe("PARTIALLY_ADDRESSED");
    expect(gap.resolution).toContain("NOT resolved");
    expect(gap.resolution).toContain("financial edge");
    expect(gap.resolvedAt).toBeUndefined();

    const er = pkg.evidenceRequestCompletion;
    expect(er.id).toBe(EREQ_B4);
    expect(er.status).toBe("COMPLETED");
    expect(er.resultingEvidenceIds).toEqual([EVID_EXHIBIT_719]);
    expect(er.createdBy).toBe("analyst.phase1");
  });

it("compares the post-ingest fingerprint WITHOUT mutating the Phase-1 freeze", () => {
    const freeze = REAL_CASE_PHASE1.predictionFreeze!;
    const pkg = REAL_CASE_BREAKTHROUGH;
    expect(pkg.delta.freezeFingerprintBefore).toBe(freeze.fingerprint);
    expect(pkg.delta.freezeFingerprintAfter).toBe(
      computePostFreezeFingerprintAfter(freeze, [
        GE_B_WJA_FBI,
        GE_B_RICO_HITMAN,
        GE_B_HITMAN_WINTER_HILL,
      ]),
    );
    expect(pkg.delta.freezeFingerprintAfter).not.toBe(freeze.fingerprint);
    // The freeze snapshot itself is untouched (fingerprint + edge ids unchanged).
    expect(freeze.fingerprint).toBe(REAL_CASE_PHASE1.predictionFreeze!.fingerprint);
    expect(freeze.edgeIds).toHaveLength(6);
  });

  it("is deterministic across repeated builds", () => {
    const first = buildBreakthroughPackage();
    const second = buildBreakthroughPackage();
    expect(jsonSnap(first.run)).toBe(jsonSnap(second.run));
    expect(jsonSnap(buildBreakthroughPackage().delta)).toBe(jsonSnap(REAL_CASE_BREAKTHROUGH.delta));
  });

  it("emits exactly 16 breakthrough transport events (ingest + Case-A network reveal)", () => {
    const events = buildBreakthroughPackage().events;
    expect(events).toHaveLength(16);
    expect(events.map((e) => e.id)).toEqual([
      EVT_BT_01, EVT_BT_02, EVT_BT_03, EVT_BT_04, EVT_BT_05,
      EVT_BT_06, EVT_BT_07, EVT_BT_08, EVT_BT_09, EVT_BT_10,
      EVT_BT_11, EVT_BT_12, EVT_BT_13, EVT_BT_14, EVT_BT_15, EVT_BT_16,
    ]);
    expect(events.map((e) => e.action)).toEqual([
      "EVIDENCE_INGESTED",
      "OBSERVATION_EXTRACTED",
      "OBSERVATION_EXTRACTED",
      "ENTITY_HYPOTHESIS_RESOLVED",
      "RELATION_CREATED",
      "GRAPH_EDGE_ADDED",
      "GRAPH_HOLE_RESOLVED",
      "HYPOTHESIS_PROMOTED",
      "GAP_ADDRESSED",
      "FREEZE_COMPARED",
      "GRAPH_NODE_ADDED",
      "GRAPH_NODE_ADDED",
      "GRAPH_EDGE_ADDED",
      "GRAPH_EDGE_ADDED",
      "GRAPH_EDGE_ADDED",
      "GRAPH_EDGE_ADDED",
    ]);
    expect(events[5]?.targetType).toBe("GRAPH_EDGE");
    expect(events[6]?.targetType).toBe("GRAPH_HOLE");
    expect(events[10]?.targetType).toBe("GRAPH_NODE");
    expect(events[10]?.targetId).toBe(GN_A_SOCTF);
    expect(events[14]?.targetId).toBe(GE_B_RICO_HITMAN);
    expect(events[15]?.targetId).toBe(GE_B_HITMAN_WINTER_HILL);
  });
});

describe("PASS 3 — hypothesis refinement parent chain", () => {
  it("keeps the parent provenance and appends the Exhibit-719 entry", () => {
    const pkg = buildBreakthroughPackage();
    const chain = pkg.refinementHypothesis.provenance.entries;
    expect(chain[0]).toEqual({ ...REAL_CASE_PHASE1.hypothesis!.provenance.entries[0] });
    expect(chain[1].documentRef).toBe("Exhibit 719");
    expect(chain[1].extractor).toBe("intel.breakthrough.v1");
  });
});

describe("PASS 3 — live ingestion through DemoEvidenceProvider", () => {
  beforeEach(() => {
    resetDemoSession();
  });
  afterEach(() => {
    resetDemoSession();
  });

  it("ingests the class submission into the Case B workspace", async () => {
    const { state, evidence } = caseBWorkspace();
    const response = await makeBreakthroughSubmission(evidence);
    expect(response.fileCount).toBe(1);

    expect(state.evidenceById.get(EVID_EXHIBIT_719)?.id).toBe(EVID_EXHIBIT_719);
    expect(state.observationById.has(OBS_B7)).toBe(true);
    expect(state.observationById.has(OBS_B8)).toBe(true);
    expect(state.observationById.has(OBS_B9)).toBe(true);
    expect(state.relationById.has(REL_B_WJA_FBI)).toBe(true);
    expect(state.graphEdgeById.has(GE_B_WJA_FBI)).toBe(true);
    expect(state.graphEdgeById.has(GE_B_RICO_HITMAN)).toBe(true);
    expect(state.graphEdgeById.has(GE_B_HITMAN_WINTER_HILL)).toBe(true);
    expect(state.graphEdgeById.size).toBe(9);
    expect(state.hypothesisById.has(HYP_B3)).toBe(true);
    expect(state.gapById.get(GAP_B4)?.status).toBe("PARTIALLY_ADDRESSED");
    expect(state.evidenceRequestById.get(EREQ_B4)?.status).toBe("COMPLETED");
    expect(listDemoSessionBreakthrough(INVESTIGATION_B_ID)).toHaveLength(1);
  });

  it("lists the ingested breakthrough evidence exactly once via the evidence provider", async () => {
    const { evidence } = caseBWorkspace();
    await makeBreakthroughSubmission(evidence);
    const page = await evidence.listByInvestigation(INVESTIGATION_B_ID, { pageSize: 100 });
    const matches = page.items.filter((e: Evidence) => e.id === EVID_EXHIBIT_719);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.title).toBe(BREAKTHROUGH_CLASS);
  });

  it("hydrates the session-run into a FRESH provider bundle exactly once", async () => {
    const { evidence } = caseBWorkspace();
    await makeBreakthroughSubmission(evidence);
    expect(listDemoSessionBreakthrough(INVESTIGATION_B_ID)).toHaveLength(1);

    const fresh = caseBWorkspace();
    hydrateDemoSessionBreakthroughs(fresh.state);
    expect(fresh.state.evidenceById.has(EVID_EXHIBIT_719)).toBe(true);
    expect(fresh.state.hypothesisById.has(HYP_B3)).toBe(true);
    expect(fresh.state.gapById.get(GAP_B4)?.status).toBe("PARTIALLY_ADDRESSED");
    const page = await fresh.evidence.listByInvestigation(INVESTIGATION_B_ID, { pageSize: 100 });
    expect(page.items.filter((e: Evidence) => e.id === EVID_EXHIBIT_719)).toHaveLength(1);
  });

  it("is idempotent: re-submitting the class never duplicates breakthrough records", async () => {
    const { state, evidence } = caseBWorkspace();
    await makeBreakthroughSubmission(evidence);
    await makeBreakthroughSubmission(evidence);
    expect(state.evidenceById.size).toBe(caseBEnriched.evidence.length + 1);
    expect(state.evidenceById.get(EVID_EXHIBIT_719)).toBeTruthy();
    expect(state.graphEdgeById.size).toBe(9);
    const page = await evidence.listByInvestigation(INVESTIGATION_B_ID, { pageSize: 100 });
    expect(page.items.filter((e: Evidence) => e.id === EVID_EXHIBIT_719)).toHaveLength(1);
  });

  it("demo directive: ANY Case B document fires the SAME breakthrough reveal", async () => {
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
    expect(state.evidenceById.has(EVID_EXHIBIT_719)).toBe(true);
    expect(state.hypothesisById.has(HYP_B3)).toBe(true);
    expect(state.graphEdgeById.has(GE_B_WJA_FBI)).toBe(true);
    expect(state.graphEdgeById.has(GE_B_RICO_HITMAN)).toBe(true);
    expect(state.graphEdgeById.has(GE_B_HITMAN_WINTER_HILL)).toBe(true);
    expect(state.gapById.get(GAP_B4)?.status).toBe("PARTIALLY_ADDRESSED");
    expect(listDemoSessionBreakthrough(INVESTIGATION_B_ID)).toHaveLength(1);
  });

  it("a matching title in a NON-Case-B workspace cannot trigger the breakthrough", async () => {
    const state = createDemoWorkspaceState("breakthrough:ofs");
    const evidence = new DemoEvidenceProvider(state, config);
    const refs = await evidence.prepareUpload(INVESTIGATION_ID, [
      new File([new Uint8Array(256)], "report.pdf", { type: "application/pdf" }),
    ]);
    await evidence.submit(INVESTIGATION_ID, {
      sourceName: "Registry export",
      evidenceType: "RECORD",
      evidenceTitle: BREAKTHROUGH_CLASS,
      files: refs satisfies UploadedFileReference[],
    });
    expect(state.evidenceById.has(EVID_EXHIBIT_719)).toBe(false);
    expect(listDemoSessionBreakthrough(INVESTIGATION_ID)).toHaveLength(0);
    expect(demoFixtures.case.id).not.toBe(CASE_B_ID);
  });

  it("applyBreakthroughRunToState is idempotent on a fully-applied state", () => {
    const { state } = caseBWorkspace();
    const run: BreakthroughRunResult = REAL_CASE_BREAKTHROUGH.run;
    applyBreakthroughRunToState(state, run);
    applyBreakthroughRunToState(state, run);
    applyBreakthroughRunToState(state, run);
    expect(state.evidenceById.get(EVID_EXHIBIT_719)).toBeTruthy();
    expect(state.evidenceById.size).toBe(caseBEnriched.evidence.length + 1);
    expect(state.graphEdgeById.size).toBe(9);
    expect(state.gapById.get(GAP_B4)?.status).toBe("PARTIALLY_ADDRESSED");
  });
});

describe("PASS 3 — honesty & leak-token hygiene", () => {
  it("run JSON never asserts guilt, conviction, conspiracy, or later-validation hearsay", () => {
    const blob = jsonSnap(REAL_CASE_BREAKTHROUGH.run).toLowerCase();
    const forbidden = [
      "guilty",
      "convicted",
      "conviction",
      "conspiracy",
      "martorano",
      "bulger",
      "flemmi",
      "connolly",
      "halloran",
      "target sheet",
      "ledger",
    ];
    for (const token of forbidden) {
      expect(blob).not.toContain(token);
    }
  });

  it("the summary stays honest: partial progress, not resolution of the homicide", () => {
    const summary = REAL_CASE_BREAKTHROUGH.record.summary;
    expect(summary).toContain("partially addressing");
    expect(summary).toContain("does NOT establish who killed Roger Wheeler");
  });

  it("the RUNS apply to a workspace without corrupting the RAW corpora", () => {
    expect(jsonSnap(RAW_CASE_FIXTURES[CASE_B_ID]!.evidence)).not.toContain(EVID_EXHIBIT_719);
    const { state } = caseBWorkspace();
    const injected = createDemoWorkspaceState("breakthrough:raw-check", RAW_CASE_FIXTURES[CASE_B_ID]);
    runBreakthroughIngestion(injected);
    expect(injected.evidenceById.size).toBe(RAW_CASE_FIXTURES[CASE_B_ID]!.evidence.length + 1);
    expect(state.evidenceById.has(EVID_EXHIBIT_719)).toBe(false);
  });
});