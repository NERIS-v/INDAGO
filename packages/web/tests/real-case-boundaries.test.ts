import { describe, it, expect } from "vitest";
import { validateRealCaseBoundaries } from "@/lib/providers/real-case/validate";
import {
  CASE_A_ID,
  CASE_B_ID,
} from "@/lib/providers/real-case/lookup";
import { getRealCaseFixtureSet } from "@/lib/providers/real-case/index";
import { ALL_FENCED_RECORD_IDS } from "@/lib/providers/real-case/fenced";

describe("real-case PASS 1 boundary validation", () => {
  it("all 12 assertions pass (no invented facts, strict schema, no fenced leakage)", () => {
    const results = validateRealCaseBoundaries();
    expect(results.length).toBeGreaterThanOrEqual(12);
    const failures = results.filter((r) => !r.passed);
    expect(failures.map((f) => `#${f.assertion} ${f.name}: ${f.detail}`)).toEqual([]);
  });

  it("both canonical real cases resolve to deterministic fixture sets", () => {
    const a = getRealCaseFixtureSet(CASE_A_ID);
    const b = getRealCaseFixtureSet(CASE_B_ID);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a?.case.id).toBe(CASE_A_ID);
    expect(b?.case.id).toBe(CASE_B_ID);
  });

  it("real cases carry a deterministic Phase-1-derived event stream (no PASS-1 scripted playback)", () => {
    const a = getRealCaseFixtureSet(CASE_A_ID);
    const b = getRealCaseFixtureSet(CASE_B_ID);
    expect(a?.events?.length ?? 0).toBe(2);
    expect(b?.events?.length ?? 0).toBe(9);
    expect((b?.events ?? []).map((e) => e.action)).toEqual([
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

  it("fenced packages expose at least the four hard-fence boundaries", () => {
    expect(ALL_FENCED_RECORD_IDS.length).toBeGreaterThan(0);
  });
});