import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { createLiveWorkspaceProviders } from "@/lib/providers/live/providers";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import { mapInvestigativeGapToGapMock } from "@/lib/intel/gap-adapter";
import { ProviderError } from "@/lib/providers/types";
import type { DataModeConfig, WorkspaceIdentity, RealtimeProvider } from "@/lib/providers/types";
import {
  WORKSPACE_NAV,
  workspaceSubroute,
  isNavEntryActive,
  isInvestigationWorkspacePathname,
} from "@/lib/workspace/nav";
import {
  CASE_ID,
  INVESTIGATION_ID,
  ENT_BANK,
  ENT_MARIA,
  ENT_VICTOR,
} from "@/lib/providers/demo/demo-fixtures/lookup";
import type { InvestigativeGap } from "@indago/contracts";

const fastEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  [DATA_MODE_ENV]: "demo",
  [DEMO_CASE_ID_ENV]: CASE_ID,
  [TIMING_SCALE_ENV]: "0.001",
};
const config: DataModeConfig = getDataModeConfig(fastEnv);

function identity(workspaceId = `pr1:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

function bundle(workspaceId?: string) {
  return createWorkspaceDemoProviders(identity(workspaceId), config);
}

const realtimeHandles: RealtimeProvider[] = [];
afterEach(() => {
  for (const r of realtimeHandles.splice(0)) r.disconnect();
});

describe("PR-1 T2 — cross-case boundary moves behind the provider seam", () => {
  it("listForeignOverlays serves the cobalt + crimson islands keyed by ref", async () => {
    const providers = bundle();
    const page = await providers.crossCase.listForeignOverlays(CASE_ID, { pageSize: 100 });
    const refs = page.items.map((o) => o.ref).sort();
    expect(refs).toEqual(["cobalt", "crimson"]);

    for (const overlay of page.items) {
      expect(overlay.caseId).toBeTruthy();
      expect(overlay.title.length).toBeGreaterThan(0);
      expect(overlay.bridgeSupport).toBeGreaterThan(0);
      expect(overlay.bridgeSupport).toBeLessThanOrEqual(1);
      expect(overlay.nodes.length).toBeGreaterThan(0);
      expect(overlay.edges.length).toBeGreaterThan(0);
      for (const node of overlay.nodes) {
        expect(node.isForeign).toBe(true);
        expect(node.label.length).toBeGreaterThan(0);
      }
      for (const edge of overlay.edges) {
        expect(edge.isForeignEdge).toBe(true);
      }
    }
  });

  it("foreign island nodes resolve through entities.get (no UI monkey-patch needed)", async () => {
    const providers = bundle();
    const page = await providers.crossCase.listForeignOverlays(CASE_ID, { pageSize: 100 });
    const firstNodeId = page.items[0].nodes[0].id;

    const entity = await providers.entities.get(firstNodeId);
    expect(entity.id).toBe(firstNodeId);
    expect(entity.canonicalName).toBeTruthy();
    expect(entity.observationIds).toBeInstanceOf(Array);
    expect(entity.evidenceIds).toBeInstanceOf(Array);
  });

  it("unknown entity ids still surface NOT_FOUND", async () => {
    const providers = bundle();
    await expect(providers.entities.get("no-such-entity")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("PR-1 T3 — investigative gaps flow through the provider + adapter", () => {
  it("gaps.listByInvestigation serves the canonical gaps (counterparties / signing authority / timing)", async () => {
    const providers = bundle();
    const page = await providers.gaps.listByInvestigation(INVESTIGATION_ID, { pageSize: 100 });
    expect(page.items.length).toBe(3);

    const titles = page.items.map((g) => g.title);
    expect(titles).toContain("Unknown counterparties on account 0093");
    expect(titles).toContain("Principal behind signing authority");
    expect(titles).toContain("Timing of laundering operations");
  });

  it("adapter maps canonical gaps into the GraphPanel display shape", () => {
    const gap: InvestigativeGap = {
      id: "gap-a",
      investigationId: INVESTIGATION_ID,
      caseId: CASE_ID,
      type: "UNRESOLVED_IDENTITY",
      title: "Principal behind signing authority",
      description: "Whether Maria exercises signing authority independently or under Victor's direction is unresolved.",
      status: "ACKNOWLEDGED",
      priority: "MEDIUM",
      impact: 0.58,
      expectedInformationValue: 0.5,
      relatedEntityIds: [ENT_MARIA, ENT_VICTOR],
      relatedHypothesisIds: [],
      evidenceRequestIds: [],
      createdAt: { value: "2024-06-09", precision: "exact" },
      updatedAt: { value: "2024-06-09", precision: "exact" },
    };

    const resolveLabel: Record<string, string> = {
      [ENT_MARIA]: "Maria Castellan",
      [ENT_VICTOR]: "Victor Aldridge",
    };

    const view = mapInvestigativeGapToGapMock(gap, (id) => resolveLabel[id]);
    expect(view.holeType).toBe("ISOLATED_NODE");
    expect(view.impact).toBe("MODERATE");
    expect(view.status).toBe("EVIDENCE_REQUESTED");
    expect(view.missingRelationship).toBe(gap.description);
    expect(view.affectedEntities).toEqual(["Maria Castellan", "Victor Aldridge"]);
  });

  it("adapter resolves entity labels to display names when a resolver is present", async () => {
    const providers = bundle();
    const page = await providers.gaps.listByInvestigation(INVESTIGATION_ID, { pageSize: 100 });
    const withLabels = page.items.map((g) => mapInvestigativeGapToGapMock(g, (id) => id === ENT_BANK ? "Intermediary Account 0093" : undefined));
    const counterpartyGap = withLabels.find((g) => g.id === page.items[0].id);
    expect(counterpartyGap?.affectedEntities).toContain("Intermediary Account 0093");
  });
});

describe("PR-1 T4 — timeline contract normalization (single global ascending sort)", () => {
  it("DemoTimelineProvider returns globally ascending items and deterministic membership", async () => {
    const providers = bundle();
    const timeline = await providers.timeline.getTimeline(INVESTIGATION_ID);
    const again = await providers.timeline.getTimeline(INVESTIGATION_ID);

    expect(timeline.items.map((i) => i.id)).toEqual(again.items.map((i) => i.id));

    let prev = Number.NEGATIVE_INFINITY;
    for (const item of timeline.items) {
      const t = new Date(item.time).getTime();
      expect(Number.isNaN(t)).toBe(false);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }

    const bandIds = new Set(timeline.bands.map((b) => b.id));
    for (const item of timeline.items) {
      expect(bandIds.has(item.bandId)).toBe(true);
    }
  });
});

describe("PR-1 — no silent live -> demo fallback (unsupported capabilities stay UNSUPPORTED)", () => {
  it("live crossCase.listForeignOverlays rejects with ProviderError UNSUPPORTED", async () => {
    const providers = createLiveWorkspaceProviders(identity("pr1:live"), config);
    await expect(providers.crossCase.listForeignOverlays(CASE_ID)).rejects.toMatchObject({
      code: "UNSUPPORTED",
    });
  });

  it("live gaps.listByInvestigation rejects with ProviderError UNSUPPORTED", async () => {
    const providers = createLiveWorkspaceProviders(identity("pr1:live"), config);
    await expect(providers.gaps.listByInvestigation(INVESTIGATION_ID)).rejects.toMatchObject({ code: "UNSUPPORTED" });
  });

  it("a ProviderError with code UNSUPPORTED is carried through without coercion", () => {
    const err = ProviderError.unsupported("This operation is not supported in the current data mode.");
    expect(err.code).toBe("UNSUPPORTED");
    expect(err.category).toBe("EXTERNAL_SERVICE");
    expect(err.retryable).toBe(false);
  });
});

describe("PR-1 — navigation module (shared WORKSPACE_NAV + route helpers)", () => {
  it("exposes every real workspace destination with no invented or removed routes", () => {
    expect(WORKSPACE_NAV.map((n) => n.label)).toEqual([
      "Dashboard",
      "Overview",
      "Network",
      "Evidence",
      "Observations",
      "Leads",
      "Gaps",
      "Hypothesis",
      "Cross-Case",
      "Ledger",
      "Robustness",
      "Review",
    ]);
  });

  it("New Investigation is NOT a primary dock destination", () => {
    expect(WORKSPACE_NAV.some((n) => n.href === "new" || n.href === "/investigations/new")).toBe(false);
  });

  it("workspaceSubroute resolves the active sub-route (Overview = empty)", () => {
    expect(workspaceSubroute(`/investigations/${INVESTIGATION_ID}`)).toBe("");
    expect(workspaceSubroute(`/investigations/${INVESTIGATION_ID}/graph`)).toBe("graph");
    expect(workspaceSubroute(`/investigations/${INVESTIGATION_ID}/hypothesis`)).toBe("hypothesis");
    expect(workspaceSubroute("/")).toBe("");
    expect(workspaceSubroute("/investigations/new")).toBe("");
  });

  it("isNavEntryActive marks Graph on the graph route and Hypothesis on the hypothesis route", () => {
    const graph = WORKSPACE_NAV.find((n) => n.href === "graph")!;
    const hypothesis = WORKSPACE_NAV.find((n) => n.href === "hypothesis")!;
    const dashboard = WORKSPACE_NAV.find((n) => n.href === "/dashboard")!;

    expect(isNavEntryActive(graph, `/investigations/${INVESTIGATION_ID}/graph`)).toBe(true);
    expect(isNavEntryActive(graph, `/investigations/${INVESTIGATION_ID}/hypothesis`)).toBe(false);
    expect(isNavEntryActive(hypothesis, `/investigations/${INVESTIGATION_ID}/hypothesis`)).toBe(true);
    expect(isNavEntryActive(hypothesis, `/investigations/${INVESTIGATION_ID}/graph`)).toBe(false);
    expect(isNavEntryActive(dashboard, "/dashboard")).toBe(true);
    expect(isNavEntryActive(dashboard, "/")).toBe(false);
    expect(isNavEntryActive(dashboard, `/investigations/${INVESTIGATION_ID}/graph`)).toBe(false);
  });

  it("isInvestigationWorkspacePathname distinguishes workspaces from app-level routes", () => {
    expect(isInvestigationWorkspacePathname(`/investigations/${INVESTIGATION_ID}/graph`)).toBe(true);
    expect(isInvestigationWorkspacePathname(`/investigations/${INVESTIGATION_ID}`)).toBe(true);
    expect(isInvestigationWorkspacePathname("/investigations/new")).toBe(false);
    expect(isInvestigationWorkspacePathname("/")).toBe(false);
  });
});

describe("PR-1 — source-level demo-coupling guards", () => {
  const readAll = (dir: string) =>
    fs
      .readdirSync(path.resolve("src", dir))
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

  it("components/graph never imports demo fixtures", () => {
    for (const f of readAll("components/graph")) {
      const content = fs.readFileSync(path.resolve("src/components/graph", f), "utf-8");
      expect(content, `${f} imports demo fixtures`).not.toMatch(/providers\/demo|demo-\w*fixtures/);
    }
  });

  it("components/layout (nav docks) never imports demo fixtures", () => {
    for (const f of readAll("components/layout")) {
      const content = fs.readFileSync(path.resolve("src/components/layout", f), "utf-8");
      expect(content, `${f} imports demo fixtures`).not.toMatch(/providers\/demo|demo-\w*fixtures/);
    }
  });

  it("the workspace shell and nav module stay provider-agnostic", () => {
    const shell = fs.readFileSync(path.resolve("src/lib/providers/workspace/shell.tsx"), "utf-8");
    expect(shell).not.toMatch(/@\/lib\/providers\/(demo|live)/);
    const nav = fs.readFileSync(path.resolve("src/lib/workspace/nav.ts"), "utf-8");
    expect(nav).not.toMatch(/@\/lib\/providers/);
  });

  it("New Investigation remains reachable through the Dashboard page", () => {
    const dashboard = fs.readFileSync(path.resolve("src/app/dashboard/page.tsx"), "utf-8");
    expect(dashboard).toMatch(/\/investigations\/new/);
    // The cinematic Home route owns "/" and must not recreate the dashboard there.
    const home = fs.readFileSync(path.resolve("src/app/page.tsx"), "utf-8");
    expect(home).not.toMatch(/\/investigations\/new/);
  });
});