// ============================================================================
// Benchmark view — pure module + loader integration tests.
// The loader fixture is written to a temp dir and resolved via
// INDAGO_BENCHMARK_DIR so the tests never depend on the repo's committed
// artifacts (which are also covered implicitly by the running app).
// ============================================================================

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BenchmarkRunViewSchema } from "@indago/contracts";

import {
  comparisonSurface,
  conditionFocus,
  inferenceMode,
  metricBreakdown,
  primaryResult,
  statePresentation,
} from "@/lib/benchmark/benchmark-domain";
import { findRunAnnotation } from "@/lib/benchmark/benchmark-annotations";
import { CAPABILITY_COVERAGE } from "@/lib/benchmark/capability-coverage";
import { findHoleAnnotation } from "@/lib/benchmark/failure-mechanisms";
import { loadBenchmarkRun, loadBenchmarkCatalog, runIdForDir } from "@/lib/benchmark/benchmark-loader";

function makeView() {
  return BenchmarkRunViewSchema.parse({
    runId: "fixture",
    label: "Fixture Run",
    state: "PRE_ANALYSIS",
    groundTruthAccessed: true,
    conditions: [
      {
        condition: "CLEAN",
        cases: 15,
        totalHoles: 8,
        holesDetected: 3,
        holesDetectedStrict: 3,
        errAtK: 0.1667,
        candidatePrecision: 0.2,
        hardFailures: 0,
      },
      {
        condition: "NOISY_MISSING",
        cases: 15,
        totalHoles: 8,
        holesDetected: 2,
        errAtK: 0.1,
      },
      {
        condition: "ADVERSARIAL",
        cases: 15,
        totalHoles: 8,
        holesDetected: 1,
        errAtK: 0.05,
      },
    ],
    holes: [
      {
        caseKey: "GAP-01",
        condition: "NOISY_MISSING",
        holeId: "H-EDGE-1",
        holeType: "MISSING_EDGE",
        expectedType: "association",
        regionStatus: "FLOOR/LIMITED",
        rawCandidateCount: 1,
        qualifiedCount: 0,
        qualificationFailureReasons: ["LOW_STRUCTURAL_SCORE"],
      },
    ],
    verdicts: [
      {
        caseKey: "GAP-01",
        condition: "NOISY_MISSING",
        holeId: "H-EDGE-1",
        holeType: "MISSING_EDGE",
        lenientHit: false,
        strictHit: false,
      },
    ],
    perCase: {},
  });
}

describe("benchmark domain", () => {
  it("primaryResult derives the total from condition aggregates", () => {
    const view = makeView();
    const p = primaryResult(view);
    expect(p.totalRecovered).toBe("6");
    expect(p.totalPlanted).toBe("24");
    expect(p.conditions).toHaveLength(3);
    expect(p.conditions[0]).toMatchObject({ condition: "CLEAN", recovered: "3", planted: "8" });
  });

  it("metricBreakdown exposes recovery ratios with numerators", () => {
    const rows = metricBreakdown(makeView());
    const recovery = rows[0];
    expect(recovery.kind).toBe("ratio");
    expect(recovery.label).toContain("recovery");
    expect(recovery.clean.numerator).toBe(8);
    expect(recovery.clean.value).toBe(3);
  });

  it("statePresentation maps PRE_ANALYSIS to the PRE-AUDIT marker", () => {
    expect(statePresentation("PRE_ANALYSIS").marker).toBe("PRE-AUDIT RESULT");
    expect(statePresentation("PRE_ANALYSIS").isHistorical).toBe(true);
    expect(statePresentation("CORRECTED_OBSERVATION_ONLY").isHistorical).toBe(false);
  });

  it("inferenceMode distinguishes historical from observation-only", () => {
    expect(inferenceMode("PRE_ANALYSIS", true)).toContain("HISTORICAL");
    expect(inferenceMode("CORRECTED_OBSERVATION_ONLY", false)).toBe("OBSERVATION-ONLY");
    expect(inferenceMode("COUNTERFACTUAL", null)).toBe("COUNTERFACTUAL");
    expect(inferenceMode(null, true)).toContain("HISTORICAL");
  });

  it("comparisonSurface never fabricates arm values", () => {
    const { arms, rows } = comparisonSurface(makeView());
    expect(arms[0].state).toBe("EXECUTED");
    for (const arm of arms.slice(1)) expect(arm.state).toBe("NOT_RUN");
    for (const row of rows) {
      for (const v of row.arms.slice(1)) expect(v).toBeNull();
    }
    expect(rows[0].arms[0]).toBe(3);
  });

  it("conditionFocus exposes traces and pairs verdicts", () => {
    const focus = conditionFocus(makeView(), "NOISY_MISSING");
    expect(focus.traces).toHaveLength(1);
    expect(focus.traces[0].failureReasons).toContain("LOW_STRUCTURAL_SCORE");
    expect(focus.traces[0].verdict?.lenientHit).toBe(false);
  });
});

describe("benchmark registries", () => {
  it("decorates the pilot run with the audited provenance", () => {
    const ann = findRunAnnotation("pilot");
    expect(ann?.state).toBe("PRE_ANALYSIS");
    expect(ann?.groundTruthAccessed).toBe(true);
    expect(ann?.gitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(ann?.source).toContain("deep-audit.md");
  });

  it("capability coverage has unique ids and auditable sources", () => {
    const ids = CAPABILITY_COVERAGE.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of CAPABILITY_COVERAGE) {
      expect(row.source).toBeTruthy();
      expect(["Ingestion", "Core intelligence", "Graph & holes", "Language / AI", "Event-driven"]).toContain(row.group);
    }
  });

  it("matches the audit facts for the unwired LLM stack", () => {
    const semantic = CAPABILITY_COVERAGE.find((c) => c.id === "semantic-retrieval");
    expect(semantic?.implemented).toBe(true);
    expect(semantic?.productionWired).toBe(false);
    expect(semantic?.benchmarkExecuted).toBe("NOT_EXECUTED");
    const extraction = CAPABILITY_COVERAGE.find((c) => c.id === "extraction");
    expect(extraction?.benchmarkExecuted).toBe("FABRICATED_INPUT");
  });

  it("failure mechanisms annotate known holes and null unknown ones", () => {
    expect(findHoleAnnotation("GAP-01", "NOISY_MISSING")?.mechanism).toContain("LOW_STRUCTURAL_SCORE");
    expect(findHoleAnnotation("GAP-01", "CLEAN")?.mechanism).toContain("Qualified");
    expect(findHoleAnnotation("GAP-09", "CLEAN")).toBeNull();
  });
});

describe("benchmark loader", () => {
  let tmp: string;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "indago-bench-"));
    const runDir = path.join(tmp, "fixture-run");
    await fs.mkdir(path.join(runDir, "per-case"), { recursive: true });
    await fs.writeFile(
      path.join(runDir, "manifest.json"),
      JSON.stringify({
        labels: { banner: "INTERNAL PILOT EVALUATION", corpus: "SYNTHETIC / DE-IDENTIFIED CORPUS", mode: "PROTOTYPE BENCHMARK" },
        generatedAt: "2026-01-01T00:00:00.000Z",
        sources: { corpus: "packages/platform/tests/benchmark/corpus.ts" },
        summary: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      }),
    );
    await fs.writeFile(
      path.join(runDir, "summary.json"),
      JSON.stringify({
        nowIso: "2026-01-01T00:00:00.000Z",
        conditions: [
          { condition: "CLEAN", cases: 15, totalHoles: 8, holesDetected: 3, holesDetectedStrict: 3 },
        ],
      }),
    );
    await fs.writeFile(
      path.join(runDir, "holes.json"),
      JSON.stringify({
        labels: { banner: "INTERNAL PILOT EVALUATION" },
        entries: [
          {
            caseKey: "GAP-01",
            condition: "CLEAN",
            holeId: "H-EDGE-1",
            holeType: "MISSING_EDGE",
            rawCandidateCount: 1,
            qualifiedCount: 1,
          },
        ],
        verdicts: [{ caseKey: "GAP-01", condition: "CLEAN", holeId: "H-EDGE-1", holeType: "MISSING_EDGE", lenientHit: true, strictHit: true, firstHitRank: 1 }],
      }),
    );
    await fs.writeFile(
      path.join(runDir, "per-case", "GAP-01.CLEAN.json"),
      JSON.stringify({
        caseId: "c1",
        caseKey: "GAP-01",
        condition: "CLEAN",
        materialization: { recordsTotal: 10 },
        graph: { entities: 4, graphNodes: 4, graphEdges: 5 },
        holes: { holesPlanted: 1, holesDetected: 1 },
      }),
    );
    process.env.INDAGO_BENCHMARK_DIR = runDir;
    delete process.env.INDAGO_BENCHMARK_RUNS_DIR;
  });

  afterAll(async () => {
    delete process.env.INDAGO_BENCHMARK_DIR;
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("derives a stable runId from the directory name", () => {
    expect(runIdForDir("/x/benchmark")).toBe("pilot");
    expect(runIdForDir("/x/Benchmark")).toBe("pilot");
    expect(runIdForDir("/x/fixture-run")).toBe("fixture-run");
  });

  it("loads the fixture run and merges annotation-free defaults", async () => {
    const run = await loadBenchmarkRun("fixture-run");
    expect(run).not.toBeNull();
    expect(run?.view.runId).toBe("fixture-run");
    expect(run?.view.generatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(run?.counts.conditionCount).toBe(1);
    expect(run?.counts.cases).toBe(15);
    expect(run?.counts.plantedHoles).toBe(8);
    expect(run?.counts.holesDetected).toBe(3);
    expect(run?.view.perCase["GAP-01__CLEAN"].holes.holesDetected).toBe(1);
    expect(run?.view.verdicts[0].lenientHit).toBe(true);
    // Undeclared state must never default to a corrected result.
    expect(run?.integrity.state).toBe("PRE_ANALYSIS");
    expect(run?.sources["corpus"]).toContain("corpus.ts");
    expect(run?.artifactHashes["summary"]).toBe("abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789");
  });

  it("catalog resolves the active run and lists others", async () => {
    const cat = await loadBenchmarkCatalog();
    expect(cat.active).not.toBeNull();
    expect(cat.runs.some((r) => r.runId === "fixture-run")).toBe(true);
  });
});