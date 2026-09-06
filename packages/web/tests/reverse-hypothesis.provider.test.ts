// ============================================================================
// PR-9 — Reverse Hypothesis: provider seam (demo deterministic + live honest)
//
// Exercises the IntelligenceProvider surface end to end:
//   - demo.testHypothesis runs the deterministic model over the REAL Operation
//     Financial Shadow fixtures (scenarios A and B — locked counts),
//   - demo decision recording is session-scoped and never mutates evidence,
//   - live.testHypothesis / recordHypothesisDecision are typed-unsupported and
//     never fabricate results.
// ============================================================================

import { describe, it, expect } from "vitest";
import type { DataModeConfig, WorkspaceIdentity } from "@/lib/providers/types";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { createLiveWorkspaceProviders } from "@/lib/providers/live/providers";
import {
  CASE_ID,
  INVESTIGATION_ID,
  CONTRADICTION_1,
  OBS_1,
  OBS_2,
  OBS_3,
  OBS_4,
  OBS_8,
  OBS_9,
  ENT_BANK,
  ENT_SHELL_ONE,
  ENT_VICTOR,
} from "@/lib/providers/demo/demo-fixtures/lookup";

const fastEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  [DATA_MODE_ENV]: "demo",
  [DEMO_CASE_ID_ENV]: CASE_ID,
  [TIMING_SCALE_ENV]: "0.001",
};
const config: DataModeConfig = getDataModeConfig(fastEnv);

function identity(workspaceId = `pr9-provider:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

function demoBundle(workspaceId?: string) {
  return createWorkspaceDemoProviders(identity(workspaceId), config);
}

function liveBundle(workspaceId?: string) {
  return createLiveWorkspaceProviders(identity(workspaceId), config);
}

describe("demo intelligence.testHypothesis", () => {
  it("scenario A: SUPPORTED with 2/0/2 retrieval over the real fixtures", async () => {
    const bundle = demoBundle();
    const assessment = await bundle.intelligence.testHypothesis(INVESTIGATION_ID, {
      hypothesis:
        "Intermediary account 0093 received funds from Aldridge Holdings in February 2024.",
    });
    expect(assessment.status).toBe("SUPPORTED");
    expect(assessment.error).toBeUndefined();
    expect(assessment.interpretation.subject?.id).toBe(ENT_SHELL_ONE);
    expect(assessment.interpretation.object?.id).toBe(ENT_BANK);
    expect(assessment.retrieval).toEqual({
      pool: 4,
      supporting: 2,
      contradicting: 0,
      unresolved: 2,
    });
    const supportingIds = assessment.supporting.map((f) => f.observationId);
    const unresolvedIds = assessment.unresolved.map((f) => f.observationId);
    expect(new Set(supportingIds)).toEqual(new Set([OBS_2, OBS_3]));
    expect(new Set(unresolvedIds)).toEqual(new Set([OBS_1, OBS_4]));
    expect(assessment.contradicting).toEqual([]);
    expect(assessment.stages).toContain("READY");
  });

  it("scenario B: SUPPORTED_WITH_CONFLICT with 1/1/0 retrieval over the real fixtures", async () => {
    const bundle = demoBundle();
    const assessment = await bundle.intelligence.testHypothesis(INVESTIGATION_ID, {
      hypothesis:
        "Victor Aldridge shares a residential address with the nominee director of Aldridge Holdings.",
    });
    expect(assessment.status).toBe("SUPPORTED_WITH_CONFLICT");
    expect(assessment.interpretation.subject?.id).toBe(ENT_VICTOR);
    expect(assessment.interpretation.object?.id).toBe(ENT_SHELL_ONE);
    expect(assessment.retrieval).toEqual({
      pool: 2,
      supporting: 1,
      contradicting: 1,
      unresolved: 0,
    });
    expect(assessment.supporting.map((f) => f.observationId)).toEqual([OBS_8]);
    expect(assessment.contradicting.map((f) => f.observationId)).toEqual([OBS_9]);
    expect(assessment.contradicting[0]?.canonicalContradictionId).toBe(CONTRADICTION_1);
    expect(assessment.notices.join(" ")).not.toMatch(/absence of contradiction is not evidence of truth/i);
  });

  it("does not fabricate confidence, scores, or a truth verdict", async () => {
    const bundle = demoBundle();
    const assessment = await bundle.intelligence.testHypothesis(INVESTIGATION_ID, {
      hypothesis:
        "Intermediary account 0093 received funds from Aldridge Holdings in February 2024.",
    });
    expect(assessment).not.toHaveProperty("confidence");
    expect(assessment).not.toHaveProperty("verdict");
    expect(assessment.supporting[0]?.content).toContain("0093");
  });

  it("rejects a hypothesis it cannot structure with HYPOTHESIS_PARSE_ERROR", async () => {
    const bundle = demoBundle();
    const assessment = await bundle.intelligence.testHypothesis(INVESTIGATION_ID, {
      hypothesis: "draft observations undefined",
    });
    expect(assessment.status).toBeNull();
    expect(assessment.error).toBe("HYPOTHESIS_PARSE_ERROR");
    expect(assessment.notices.join(" ")).toMatch(/could not be structured/i);
  });

  it("rejects an unknown investigation", async () => {
    const bundle = demoBundle();
    const run = bundle.intelligence
      .testHypothesis("unknown-investigation", { hypothesis: "Something happened." })
      .catch((e: unknown) => e);
    const err = await run;
    expect(err).toBeInstanceOf(Error);
    expect((err as { code?: string }).code).toBe("NOT_FOUND");
  });
});

describe("demo intelligence decisions", () => {
  it("records a session decision trail and returns it in order", async () => {
    const bundle = demoBundle();
    const first = await bundle.intelligence.recordHypothesisDecision(INVESTIGATION_ID, {
      hypothesis: "Intermediary account 0093 received funds from Aldridge Holdings.",
      decision: "ACCEPT_AS_WORKING_HYPOTHESIS",
    });
    expect(first).toHaveLength(1);
    expect(first[0]?.decision).toBe("ACCEPT_AS_WORKING_HYPOTHESIS");

    const second = await bundle.intelligence.recordHypothesisDecision(INVESTIGATION_ID, {
      hypothesis: "Intermediary account 0093 received funds from Aldridge Holdings.",
      decision: "KEEP_UNRESOLVED",
    });
    expect(second).toHaveLength(2);
    expect(second.map((r) => r.decision)).toEqual([
      "ACCEPT_AS_WORKING_HYPOTHESIS",
      "KEEP_UNRESOLVED",
    ]);

    const trail = await bundle.intelligence.listHypothesisDecisions(INVESTIGATION_ID);
    expect(trail).toEqual(second);
    expect(trail[0]?.investigationId).toBe(INVESTIGATION_ID);
    expect(typeof trail[0]?.at).toBe("string");
  });

  it("keeps the decision trail scoped to one workspace bundle", async () => {
    const other = demoBundle("pr9-provider:other-workspace");
    const trail = await other.intelligence.listHypothesisDecisions(INVESTIGATION_ID);
    expect(trail).toEqual([]);
  });

  it("records decisions without mutating canonical evidence", async () => {
    const bundle = demoBundle();
    const before = (await bundle.evidence.listByInvestigation(INVESTIGATION_ID)).items.length;
    await bundle.intelligence.recordHypothesisDecision(INVESTIGATION_ID, {
      hypothesis: "Intermediary account 0093 received funds from Aldridge Holdings.",
      decision: "OPEN_EVIDENCE",
    });
    const after = (await bundle.evidence.listByInvestigation(INVESTIGATION_ID)).items.length;
    expect(after).toBe(before);
  });
});

describe("live intelligence seam", () => {
  it("tests hypotheses as typed-unsupported (never fabricated)", async () => {
    const bundle = liveBundle();
    const run = bundle.intelligence
      .testHypothesis(INVESTIGATION_ID, {
        hypothesis: "Victor Aldridge shares a residential address with a nominee.",
      })
      .catch((e: unknown) => e);
    const err = await run;
    expect(err).toBeInstanceOf(Error);
    expect((err as { code?: string }).code).toBe("UNSUPPORTED");
  });

  it("records decisions as typed-unsupported", async () => {
    const bundle = liveBundle();
    const run = bundle.intelligence
      .recordHypothesisDecision(INVESTIGATION_ID, {
        hypothesis: "Something happened.",
        decision: "KEEP_UNRESOLVED",
      })
      .catch((e: unknown) => e);
    const err = await run;
    expect(err).toBeInstanceOf(Error);
    expect((err as { code?: string }).code).toBe("UNSUPPORTED");
  });
});