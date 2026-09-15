// ============================================================================
// PASS 2 — Phase-1 derivation test suite
//
// Proves the Phase-1 intelligence chain is DERIVED (not hardcoded) from the
// PASS 1 real-case datasets:
//   cross-case spark -> security-lead (Rico) -> hypothesis -> graph hole
//   -> evidence request (NBE class) -> prediction freeze.
// Negative gates prove the chain fires only when the structural signal is
// genuinely present (WJA-only shared set OR no shared org members => no spark).
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  RAW_CASE_FIXTURES,
  REAL_CASE_PHASE1,
  caseAEnriched,
  caseBEnriched,
  getRealCaseFixtureSet,
  REAL_CASE_GRAPH_HOLES,
} from "@/lib/providers/real-case/index";
import {
  deriveRealCasePhase1,
  computePredictionFreezeFingerprint,
} from "@/lib/providers/real-case/phase1";
import {
  CASE_A_ID,
  CASE_B_ID,
  ENT_RICO,
  ENT_CALLAHAN,
  ENT_WJA,
  ENT_FBIBOSTON,
  ENT_WHEELER,
  OBS_A1,
  OBS_A2,
  OBS_A3,
  OBS_A4,
  OBS_A5,
  OBS_A6,
  OBS_B4,
  OBS_B5,
  OBS_B6,
  LEAD_B3,
  HYP_B2,
  GAP_B4,
  HOLE_B3,
  EREQ_B4,
  FREEZE_B1,
  P1_ANALYSIS_A,
  INVESTIGATION_B_ID,
  GN_B_WJA,
  GN_B_WHEELER,
  GE_B_WJA_RICO,
} from "@/lib/providers/real-case/lookup";
import { createCaseListProviders } from "@/lib/providers/factory";
import { DATA_MODE_ENV } from "@/lib/providers/config";
import type { DemoFixtureSet } from "@/lib/providers/demo/demo-fixtures";

const CANDIDATE_COUNT = 4;

const caseAFixtureSet = RAW_CASE_FIXTURES[CASE_A_ID]!;
const caseBFixtureSet = RAW_CASE_FIXTURES[CASE_B_ID]!;

function jsonSnap(value: unknown): string {
  return JSON.stringify(value);
}

describe("PASS 2 Phase-1 derivation — positive chain", () => {
  it("fires the cross-case spark (>=2 shared WJA org members)", () => {
    expect(REAL_CASE_PHASE1.sparkFired).toBe(true);
    const orgMembers = REAL_CASE_PHASE1.sparkMembers.filter((id) => id !== ENT_WJA);
    expect(orgMembers.length).toBeGreaterThanOrEqual(2);
    expect(orgMembers).toEqual(expect.arrayContaining([ENT_CALLAHAN, ENT_RICO]));
  });

  it("ranks candidates with required typing (4 shared entities: Rico, Callahan, WJA, FBI)", () => {
    const candidates = REAL_CASE_PHASE1.candidates;
    expect(candidates.length).toBe(CANDIDATE_COUNT);
    candidates.forEach((c) => {
      expect(c.rank).toBeGreaterThan(0);
      expect(typeof c.score).toBe("number");
      expect(c.status === "SELECTED" || c.status === "REJECTED").toBe(true);
      expect(c.candidateId).toBeTruthy();
      expect(typeof c.label).toBe("string");
    });
  });

  it("selects H. Paul Rico (ENT_RICO) as the top-ranked candidate", () => {
    const top = REAL_CASE_PHASE1.candidates[0];
    expect(top.entityId).toBe(ENT_RICO);
    expect(top.status).toBe("SELECTED");
    expect(top.score).toBeGreaterThan(6);
    expect(top.score).toBeLessThan(7);
  });

  it("ranks Rico strictly above WJA, FBI, and Callahan", () => {
    const order = REAL_CASE_PHASE1.candidates.map((c) => c.entityId);
    expect(order.indexOf(ENT_RICO)).toBeLessThan(order.indexOf(ENT_WJA));
    expect(order.indexOf(ENT_RICO)).toBeLessThan(order.indexOf(ENT_FBIBOSTON));
    expect(order.indexOf(ENT_RICO)).toBeLessThan(order.indexOf(ENT_CALLAHAN));
  });

  it("labels and scores every candidate with DERIVED_BY_DEMO_LOGIC provenance", () => {
    const all = REAL_CASE_PHASE1.candidates;
    all.forEach((c) => {
      expect(c.scoreLabel).toBe("DERIVED_BY_DEMO_LOGIC");
    });
    if (REAL_CASE_PHASE1.predictionFreeze) {
      expect(REAL_CASE_PHASE1.predictionFreeze.scoreLabel).toBe("DERIVED_BY_DEMO_LOGIC");
    }
  });

  it("produces a verbatim stable hypothesis statement", () => {
    const hyp = REAL_CASE_PHASE1.hypothesis!;
    expect(hyp.id).toBe(HYP_B2);
    expect(hyp.statement).toBe(
      "The company's internal security function may have provided an information/operational pathway connecting the World Jai Alai network to the people surrounding the Wheeler homicide.",
    );
    expect(hyp.status).toBe("ACTIVE");
    expect(hyp.confidence).toBe(0.21);
  });

  it("attributes the exact supporting / contradicting observation sets", () => {
    const hyp = REAL_CASE_PHASE1.hypothesis!;
    expect([...hyp.supportingObservationIds].sort()).toEqual(
      [OBS_A4, OBS_A5, OBS_A6, OBS_B5].sort(),
    );
    expect(hyp.supportingObservationIds).not.toContain(OBS_B4);
    expect([...hyp.contradictingObservationIds].sort()).toEqual(
      [OBS_A1, OBS_A3].sort(),
    );
  });
});

describe("PASS 2 Phase-1 derivation — derived artifacts cross-reference", () => {
  it("links lead -> gap -> hole -> evidence request -> hypothesis", () => {
    const d = REAL_CASE_PHASE1;
    const lead = d.lead!;
    const gap = d.gap!;
    const hole = d.hole!;
    const er = d.evidenceRequest!;
    const hyp = d.hypothesis!;

    expect(lead.id).toBe(LEAD_B3);
    expect(lead.gapIds).toEqual([GAP_B4]);

    expect(gap.id).toBe(GAP_B4);
    expect(gap.evidenceRequestIds).toEqual([EREQ_B4]);
    expect(gap.relatedEntityIds).toEqual(
      expect.arrayContaining([ENT_CALLAHAN, ENT_RICO, ENT_WHEELER]),
    );

    expect(hole.investigationGapId).toBe(GAP_B4);
    expect(hole.nodeIds).toEqual([GN_B_WJA, GN_B_WHEELER]);

    expect(er.id).toBe(EREQ_B4);
    expect(er.gapId).toBe(GAP_B4);
    expect(er.hypothesisIds).toContain(HYP_B2);

    expect(hyp.id).toBe(HYP_B2);
  });

  it("models the hole as a graph hole, NOT a graph edge, with the expected missing 'case-link'", () => {
    const hole = REAL_CASE_PHASE1.hole!;
    expect(hole.type).toBe("MISSING_EDGE");
    expect(hole.expectedEdgeType).toBe("case-link");
    expect(hole.significance).toBe(0.75);
    expect(hole.suggestedEvidenceTypes).toEqual(
      expect.arrayContaining(["RECORD", "FINANCIAL"]),
    );
    expect(hole.id).toBe(HOLE_B3);
    expect(hole.caseId).toBe(CASE_B_ID);
    expect("sourceNodeId" in hole).toBe(false);
    expect("targetNodeId" in hole).toBe(false);
    expect(caseBFixtureSet.graphEdges).toHaveLength(6);
    expect(caseBEnriched.graphEdges).toHaveLength(6);
    expect(REAL_CASE_GRAPH_HOLES[CASE_B_ID].some((h) => h.investigationGapId === GAP_B4)).toBe(true);
  });

  it("names the NBE evidence class in the request without leaking the fenced artifact id", () => {
    const er = REAL_CASE_PHASE1.evidenceRequest!;
    expect(er.description).toContain("WORLD JAI ALAI PURCHASE REPORT (May 11, 1981)");
    expect(er.description).not.toContain("Exhibit");
    expect(er.evidenceType).toBe("RECORD");
    expect(er.status).toBe("SUBMITTED");
    expect(er.createdBy).toBe("analyst.phase1");
  });

  it("emits the deterministic event streams (Case A = 2, Case B = 9)", () => {
    expect(REAL_CASE_PHASE1.caseAEvents).toHaveLength(2);
    expect(REAL_CASE_PHASE1.caseBEvents).toHaveLength(9);
    expect(REAL_CASE_PHASE1.caseAEvents.map((e) => e.action)).toEqual([
      "CROSS_CASE_ANALYSIS_STARTED",
      "CROSS_CASE_SIGNAL_DETECTED",
    ]);
    expect(REAL_CASE_PHASE1.caseBEvents.map((e) => e.action)).toEqual([
      "CROSS_CASE_ANALYSIS_STARTED",
      "CROSS_CASE_SIGNAL_DETECTED",
      "LEAD_GENERATED",
      "HYPOTHESIS_CREATED",
      "EVIDENCE_FOR_ATTACHED",
      "EVIDENCE_AGAINST_ATTACHED",
      "GRAPH_HOLE_DETECTED",
      "EVIDENCE_REQUEST_CREATED",
      "PREDICTION_FROZEN",
    ]);
  });

  it("attaches the cross-case signal envelopes with the derived ids", () => {
    const sigA = REAL_CASE_PHASE1.phase1EnvelopeA.crossCaseSignal!;
    expect(sigA.analysisId).toBe(P1_ANALYSIS_A);
    expect(sigA.sourceCaseId).toBe(CASE_A_ID);
    expect(sigA.targetCaseId).toBe(CASE_B_ID);
    const envB = REAL_CASE_PHASE1.phase1EnvelopeB;
    expect(envB.crossCaseSignal?.sourceCaseId).toBe(CASE_B_ID);
    expect(envB.crossCaseSignal?.targetCaseId).toBe(CASE_A_ID);
    expect(envB.derivedLeadId).toBe(LEAD_B3);
    expect(envB.derivedHypothesisId).toBe(HYP_B2);
    expect(envB.derivedGapId).toBe(GAP_B4);
    expect(envB.derivedGraphHoleId).toBe(HOLE_B3);
    expect(envB.derivedEvidenceRequestId).toBe(EREQ_B4);
  });
});

describe("PASS 2 Phase-1 derivation — prediction freeze", () => {
  it("records the freeze snapshot with the security-chief ranked lead", () => {
    const freeze = REAL_CASE_PHASE1.predictionFreeze!;
    expect(freeze.id).toBe(FREEZE_B1);
    expect(freeze.investigationId).toBe(INVESTIGATION_B_ID);
    expect(freeze.caseId).toBe(CASE_B_ID);
    expect(freeze.frozenAt).toEqual({ value: "2024-07-01T18:00:00.000Z", precision: "exact" });
    expect(freeze.runId).toBe("phase1-2024-07-01");
    expect(freeze.stage).toBe("PHASE_1_PREDICTION_FREEZE");
    expect(freeze.hypothesisId).toBe(HYP_B2);
    expect(freeze.graphHoleId).toBe(HOLE_B3);
    expect(freeze.evidenceRequestId).toBe(EREQ_B4);

    expect(freeze.rankedLead.rank).toBe(1);
    expect(freeze.rankedLead.roleLabel).toBe("THE SECURITY CHIEF");
    expect(freeze.rankedLead.entityId).toBe(ENT_RICO);
    expect(freeze.rankedLead.leadId).toBe(LEAD_B3);

    expect(freeze.nodeIds).toHaveLength(caseBFixtureSet.graphNodes.length);
    expect(freeze.edgeIds).toHaveLength(6);
    expect(freeze.fingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it("records the full candidate ranking with SELECTED/REJECTED statuses", () => {
    const freeze = REAL_CASE_PHASE1.predictionFreeze!;
    expect(freeze.candidateRanking).toHaveLength(CANDIDATE_COUNT);
    expect(freeze.candidateRanking[0].entityId).toBe(ENT_RICO);
    expect(freeze.candidateRanking[0].status).toBe("SELECTED");
    expect(freeze.candidateRanking.slice(1).every((c) => c.status === "REJECTED")).toBe(true);
  });

  it("records the alternative hypotheses with their exact evidence bases", () => {
    const freeze = REAL_CASE_PHASE1.predictionFreeze!;
    expect(freeze.alternatives.map((a) => a.key)).toEqual(["H2", "H3", "H4"]);
    const h2 = freeze.alternatives.find((a) => a.key === "H2")!;
    const h3 = freeze.alternatives.find((a) => a.key === "H3")!;
    const h4 = freeze.alternatives.find((a) => a.key === "H4")!;
    expect([...h2.basisObservationIds].sort()).toEqual([OBS_A4, OBS_B5].sort());
    expect([...h3.basisObservationIds].sort()).toEqual([OBS_A2, OBS_A5, OBS_A6].sort());
    expect([...h4.basisObservationIds].sort()).toEqual([OBS_A1, OBS_A3, OBS_B6].sort());
  });
});

describe("PASS 2 Phase-1 derivation — determinism", () => {
  it("derives identical results on repeated runs over the same input", () => {
    const first = deriveRealCasePhase1(caseAFixtureSet, caseBFixtureSet);
    const second = deriveRealCasePhase1(caseAFixtureSet, caseBFixtureSet);
    expect(jsonSnap(first)).toBe(jsonSnap(second));
  });

  it("computes a stable fingerprint that changes when the snapshot changes", () => {
    const freeze = REAL_CASE_PHASE1.predictionFreeze!;
    const { fingerprint, ...snapshot } = freeze;
    expect(computePredictionFreezeFingerprint(snapshot)).toBe(fingerprint);
    expect(computePredictionFreezeFingerprint({ ...snapshot, runId: "phase1-2024-07-02" })).not.toBe(fingerprint);
  });
});

describe("PASS 2 Phase-1 derivation — leak-token hygiene", () => {
  it("never leaks fenced / later-validation narrative into derived JSON", () => {
    const blob = JSON.stringify({
      envelopeA: REAL_CASE_PHASE1.phase1EnvelopeA,
      envelopeB: REAL_CASE_PHASE1.phase1EnvelopeB,
      events: [...REAL_CASE_PHASE1.caseAEvents, ...REAL_CASE_PHASE1.caseBEvents],
    }).toLowerCase();
    const forbidden = [
      "martorano",
      "bulger",
      "flemmi",
      "connolly",
      "exhibit",
      "dowd",
      "forrester",
      "guilty",
      "convicted",
      "conviction",
      "conspiracy",
      "connected",
      "breakthrough",
    ];
    for (const token of forbidden) {
      expect(blob).not.toContain(token);
    }
  });
});

describe("PASS 2 Phase-1 derivation — negative gates", () => {
  it("downgrades to no chain when a shared WJA organizational member is removed", () => {
    const variant: DemoFixtureSet = {
      ...caseBFixtureSet,
      graphEdges: caseBFixtureSet.graphEdges.filter((e) => e.id !== GE_B_WJA_RICO),
    };
    const d = deriveRealCasePhase1(caseAFixtureSet, variant);
    expect(d.sparkFired).toBe(false);
    expect(d.sparkMembers).toEqual([ENT_CALLAHAN]);
    expect(d.hypothesis).toBeUndefined();
    expect(d.lead).toBeUndefined();
    expect(d.gap).toBeUndefined();
    expect(d.hole).toBeUndefined();
    expect(d.evidenceRequest).toBeUndefined();
    expect(d.predictionFreeze).toBeUndefined();
    expect(d.phase1EnvelopeA).toEqual({});
    expect(d.phase1EnvelopeB).toEqual({});
    expect(d.caseAEvents).toHaveLength(1);
    expect(d.caseBEvents).toHaveLength(1);
    expect(d.caseBEvents[0]?.action).toBe("CROSS_CASE_ANALYSIS_STARTED");
  });

  it("does not fire when the shared set is WJA-only (no org members shared)", () => {
    const variant: DemoFixtureSet = {
      ...caseBFixtureSet,
      entities: caseBFixtureSet.entities.filter((e) => e.id !== ENT_CALLAHAN && e.id !== ENT_RICO),
    };
    const d = deriveRealCasePhase1(caseAFixtureSet, variant);
    expect([...d.sharedEntityIds].sort()).toEqual([ENT_WJA, ENT_FBIBOSTON].sort());
    expect(d.sparkFired).toBe(false);
    expect(d.candidates[0]?.entityId).not.toBe(ENT_RICO);
    expect(d.hypothesis).toBeUndefined();
    expect(d.predictionFreeze).toBeUndefined();
    expect(d.caseBEvents).toHaveLength(1);
  });
});

describe("PASS 2 Phase-1 derivation — enriched fixtures and factory", () => {
  it("enriches the Case B fixture set with derived artifacts and events", () => {
    const setB = getRealCaseFixtureSet(CASE_B_ID)!;
    expect(setB.events).toHaveLength(9);
    expect(setB.leads.some((l) => l.id === LEAD_B3)).toBe(true);
    expect(setB.hypotheses.some((h) => h.id === HYP_B2)).toBe(true);
    expect(setB.gaps.some((g) => g.id === GAP_B4)).toBe(true);
    expect(setB.graphHoles?.some((h) => h.investigationGapId === GAP_B4)).toBe(true);
    expect(setB.phase1?.derivedLeadId).toBe(LEAD_B3);
    expect(setB.phase1?.derivedEvidenceRequestId).toBe(EREQ_B4);
    expect(caseAEnriched.events).toHaveLength(2);
  });

  it("serves the real-case 2-card catalogue with per-case topology in demo mode", async () => {
    const providers = createCaseListProviders({ [DATA_MODE_ENV]: "demo" } as NodeJS.ProcessEnv);
    expect(providers.mode).toBe("demo");
    expect(Object.keys(providers.topology ?? {})).toEqual(
      expect.arrayContaining([CASE_A_ID, CASE_B_ID]),
    );
    expect(providers.topology?.[CASE_B_ID]?.nodes.length).toBeGreaterThan(0);
    expect(providers.topology?.[CASE_B_ID]?.edges.length).toBe(6);
    const listed = await providers.cases.list({ page: 1, pageSize: 20 });
    expect(listed.totalItems).toBe(2);
  });
});