// ============================================================================
// PR-5 — Context Narrative (pure module)
//
// Verifies buildResolvedStats / buildResolvedNarrative over REAL demo-resolved
// detail bundles (grounded data) plus synthetic null-slice bundles (the
// unavailable-source contract). Covers every resolvable kind, determinism, and
// the "--" / "unavailable in this data mode" fallbacks.
// ============================================================================

import { describe, it, expect } from "vitest";
import { buildResolvedStats, buildResolvedNarrative } from "@/lib/context/context-narrative";
import { resolveContextDetails } from "@/lib/context/context-details";
import type { ResolvedContextDetails, EntityContextDetails } from "@/lib/context/context-details";
import type { Entity, Observation } from "@indago/contracts";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import type { DataModeConfig, WorkspaceIdentity } from "@/lib/providers/types";
import {
  CASE_ID,
  INVESTIGATION_ID,
  ENT_VICTOR,
  REL_1,
  EVID_ACCOUNT_1,
  OBS_1,
  LEAD_1,
  GAP_1,
  HYP_1,
} from "@/lib/providers/demo/demo-fixtures/lookup";

const fastEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  [DATA_MODE_ENV]: "demo",
  [DEMO_CASE_ID_ENV]: CASE_ID,
  [TIMING_SCALE_ENV]: "0.001",
};
const config: DataModeConfig = getDataModeConfig(fastEnv);

function providers() {
  return createWorkspaceDemoProviders(
    { workspaceId: `pr5-narrative:${INVESTIGATION_ID}`, caseId: CASE_ID, investigationId: INVESTIGATION_ID },
    config,
  );
}

async function resolve(kind: string, id: string): Promise<ResolvedContextDetails> {
  const res = await resolveContextDetails(providers(), { kind: kind as never, id, source: "external" });
  if (res.status !== "resolved") throw new Error(`expected resolved ${kind} ${id}, got ${res.status}`);
  return res;
}

describe("PR-5 — context narrative (grounded over demo providers)", () => {
  it("every resolvable kind yields a non-empty stat grid and narrative", async () => {
    const cases: [string, string][] = [
      ["entity", ENT_VICTOR],
      ["relation", REL_1],
      ["evidence", EVID_ACCOUNT_1],
      ["observation", OBS_1],
      ["lead", LEAD_1],
      ["hypothesis", HYP_1],
      ["gap", GAP_1],
      ["cross-case", "cobalt"],
    ];
    for (const [kind, id] of cases) {
      const details = await resolve(kind, id);
      const stats = buildResolvedStats(details);
      const clauses = buildResolvedNarrative(details);
      expect(stats.length, `${kind} stats`).toBeGreaterThanOrEqual(2);
      expect(clauses.length, `${kind} clauses`).toBeGreaterThanOrEqual(1);
      for (const stat of stats) {
        expect(stat.label.length).toBeGreaterThan(0);
        expect(stat.value.length).toBeGreaterThan(0);
      }
      expect(details.kind, `${kind} resolved kind`).toBe(kind);
    }
  });

  it("entity stats carry provider-owned counts (observations, hypotheses, gaps)", async () => {
    const details = (await resolve("entity", ENT_VICTOR)) as EntityContextDetails;
    const stats = buildResolvedStats(details);
    const byLabel = new Map(stats.map((s) => [s.label, s.value]));
    expect(details.observations).not.toBeNull();
    expect(details.hypotheses).not.toBeNull();
    expect(byLabel.get("Observations")).toBe(String(details.observations!.length));
    expect(byLabel.get("Hypotheses")).toBe(String(details.hypotheses!.length));
  });

  it("entity narrative is deterministic and mirrors real links", async () => {
    const details = (await resolve("entity", ENT_VICTOR)) as EntityContextDetails;
    const first = buildResolvedNarrative(details);
    const second = buildResolvedNarrative(details);
    expect(first).toEqual(second);
    expect(first.join(" ")).toMatch(/observations and \d+ relations trace this entity/);
    expect(first.join(" ")).toMatch(/Part of \d+ working hypotheses/);
  });

  it("hypothesis narrative reports confidence and a real robustness score (never invented)", async () => {
    const details = await resolve("hypothesis", HYP_1);
    const clauses = buildResolvedNarrative(details);
    expect(clauses[0]).toMatch(/ACTIVE hypothesis with 82% stated confidence/);
    if (details.kind === "hypothesis" && details.robustness) {
      const robustness = clauses.find((c) => c.startsWith("Robustness"));
      expect(robustness).toMatch(/perturbation stability, not a truth probability/);
    }
  });

  it("weak-relation detection threshold is a documented constant", async () => {
    const { WEAK_SUPPORT_THRESHOLD } = await import("@/components/graph/control-center/intelligence/intelligence-signals");
    expect(WEAK_SUPPORT_THRESHOLD).toBe(0.3);
  });
});

describe("PR-5 — context narrative (unavailable-source contract)", () => {
  it("a fully-null entity bundle renders all-dash stats and an unavailable clause", () => {
    const details: EntityContextDetails = {
      status: "resolved",
      kind: "entity",
      id: "e-null",
      entity: {} as Entity,
      observations: null,
      relations: null,
      evidence: null,
      hypotheses: null,
      openGaps: null,
      activeLeads: null,
      contradictions: null,
      foreignOverlays: null,
    };
    const stats = buildResolvedStats(details);
    expect(stats.every((s) => s.value === "--")).toBe(true);
    const clauses = buildResolvedNarrative(details);
    expect(clauses).toContain("Observation links are unavailable in this data mode.");
  });

  it("partial branches show live counts and omit the unavailable clause for absent branches", () => {
    const details: EntityContextDetails = {
      status: "resolved",
      kind: "entity",
      id: "e-partial",
      entity: {} as Entity,
      observations: [] as unknown as Observation[],
      relations: null,
      evidence: null,
      hypotheses: [],
      openGaps: null,
      activeLeads: null,
      contradictions: null,
      foreignOverlays: null,
    };
    const clauses = buildResolvedNarrative(details);
    expect(clauses[0]).toBe("0 observations and — relations trace this entity.");
    expect(clauses).toContain("Part of 0 working hypotheses.");
    expect(clauses).not.toContain("Observation links are unavailable in this data mode.");
  });

  it("a hypothesis with a robustness slice documents it explicitly as a stability score", async () => {
    const details = (await resolve("hypothesis", HYP_1)) as Extract<ResolvedContextDetails, { kind: "hypothesis" }>;
    if (details.robustness) {
      const clauses = buildResolvedNarrative(details);
      expect(clauses.some((c) => c.startsWith("Robustness") && c.includes("perturbation stability"))).toBe(true);
    } else {
      // Live-like: no robustness slice → the module simply never claims one.
      const clauses = buildResolvedNarrative(details);
      expect(clauses.some((c) => c.startsWith("Robustness"))).toBe(false);
    }
  });
});