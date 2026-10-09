import { describe, expect, it } from "vitest";
import { loadBenchmarkRun, loadBenchmarkCatalog } from "@/lib/benchmark/benchmark-loader";

describe("real repo benchmark artifacts (one-off smoke)", () => {
  it("loads the pilot run and surfaces the measured 6/8 clean recovery", async () => {
    const run = await loadBenchmarkRun("pilot");
    if (!run) throw new Error("pilot run not resolved");
    expect(run.view.runId).toBe("pilot");
    expect(run.integrity.state).toBe("PRE_ANALYSIS");
    expect(run.integrity.groundTruthAccessed).toBe(true);
    expect(run.view.gitSha).toBe("7b16c9eb1a774db41403a506ded87c4fa9c7c8b7");
    expect(run.counts.cases).toBe(45);
    expect(run.counts.plantedHoles).toBe(24);
    expect(run.counts.conditionCount).toBe(3);
    expect(run.counts.holesDetected).toBe(15);
    const clean = run.view.conditions.find((c) => c.condition === "CLEAN");
    expect(clean?.holesDetected).toBe(6);
    expect(clean?.totalHoles).toBe(8);
    expect(run.view.perCase["GAP-01__NOISY_MISSING"].holes.holesDetected).toBe(0);
    expect(run.view.holes.length).toBe(24);
    expect(run.view.verdicts.length).toBe(24);
    expect(run.sources.corpus).toContain("corpus.ts");
  });

  it("catalog resolves pilot and resolution errors are null", async () => {
    const cat = await loadBenchmarkCatalog();
    expect(cat.resolution.error).toBeNull();
    expect(cat.active?.view.runId).toBe("pilot");
    expect(cat.runs.map((r) => r.runId)).toContain("pilot");
  });
});