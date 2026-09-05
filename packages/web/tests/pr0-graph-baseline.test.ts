import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { getDataModeConfig, TIMING_SCALE_ENV, DATA_MODE_ENV, DEMO_CASE_ID_ENV } from "@/lib/providers/config";
import { operationFinancialShadowEvents } from "@/lib/providers/demo/demo-fixtures/events";
import { MOCK_FOREIGN_CASES, FOREIGN_ENTITIES_DB } from "@/lib/providers/demo/demo-fixtures/cross-case";
import { deterministicUuid } from "@/lib/providers/demo/submit";
import { triggerOrQueueUploadSequence } from "@/components/graph/graph-live";
import { catalogKey } from "@/lib/providers/types";
import type { DataModeConfig, WorkspaceIdentity, RealtimeProvider, ProviderEvent, GraphRealtimeCatalog } from "@/lib/providers/types";
import type { GraphNode, GraphEdge } from "@indago/contracts";
import {
  CASE_ID,
  INVESTIGATION_ID,
  GN_BANK,
  GN_VICTOR,
  GN_WITNESS,
  GE_1,
  GE_5,
  GE_6,
  CROSS_CASE_ID,
  CROSS_ENTITY_ID,
  ENT_VICTOR,
} from "@/lib/providers/demo/demo-fixtures/lookup";

const fastEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  [DATA_MODE_ENV]: "demo",
  [DEMO_CASE_ID_ENV]: CASE_ID,
  [TIMING_SCALE_ENV]: "0.001",
};
const config: DataModeConfig = getDataModeConfig(fastEnv);

function identity(workspaceId = `pr0:${INVESTIGATION_ID}`): WorkspaceIdentity {
  return { workspaceId, caseId: CASE_ID, investigationId: INVESTIGATION_ID };
}

function bundle(workspaceId?: string) {
  return createWorkspaceDemoProviders(identity(workspaceId), config);
}

/** Fetch every page of a provider list at pageSize 100. */
async function fetchAll<T>(
  fetchPage: (page: number, pageSize: number) => Promise<{ items: T[]; hasMore: boolean }>,
): Promise<T[]> {
  let page = 1;
  const out: T[] = [];
  for (let guard = 0; guard < 200; guard++) {
    const result = await fetchPage(page, 100);
    out.push(...result.items);
    if (!result.hasMore) break;
    page += 1;
  }
  return out;
}

/** Poll synchronously until the condition holds, bounded by a deadline. */
async function waitFor(cond: () => boolean, timeoutMs = 5000, intervalMs = 5): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

const realtimeHandles: RealtimeProvider[] = [];
function trackedRealtime(b: ReturnType<typeof bundle>): RealtimeProvider {
  realtimeHandles.push(b.realtime);
  return b.realtime;
}

const graphFiles = () =>
  fs
    .readdirSync("src/components/graph")
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

afterEach(() => {
  for (const r of realtimeHandles.splice(0)) r.disconnect();
});

describe("PR-0 §8.A initial demo graph — deterministic baseline topology", () => {
  it("version counts match the provider-served node/edge arrays", async () => {
    const providers = bundle();
    const version = await providers.graph.getVersion(INVESTIGATION_ID);
    expect(version.projectionStatus).toBe("COMPLETE");
    expect(version.status).toBe("ACTIVE");

    const nodes = await fetchAll<GraphNode>((p, n) => providers.graph.getNodes(INVESTIGATION_ID, { page: p, pageSize: n }));
    const edges = await fetchAll<GraphEdge>((p, n) => providers.graph.getEdges(INVESTIGATION_ID, { page: p, pageSize: n }));
    expect(version.nodeCount).toBe(nodes.length);
    expect(version.edgeCount).toBe(edges.length);
    expect(version.nodeCount).toBe(6);
    expect(version.edgeCount).toBe(6);
  });

  it("expected fixture topology appears (hub-and-spoke, bridge, contradicted, low-confidence)", async () => {
    const providers = bundle();
    const nodes = await fetchAll<GraphNode>((p, n) => providers.graph.getNodes(INVESTIGATION_ID, { page: p, pageSize: n }));
    const edges = await fetchAll<GraphEdge>((p, n) => providers.graph.getEdges(INVESTIGATION_ID, { page: p, pageSize: n }));

    const labels = new Set(nodes.map((n) => n.label));
    expect(labels).toContain("Victor Aldridge");
    expect(labels).toContain("Aldridge Holdings S.A.");
    expect(labels).toContain("Intermediary Account 0093");
    expect(labels).toContain("Northbridge Capital Ltd.");
    expect(labels).toContain("Maria Castellan");
    expect(labels).toContain("Unidentified Witness");

    // Intermediary Account 0093 is the hub.
    const hub = nodes.find((n) => n.id === GN_BANK);
    expect(hub?.structuralImportance).toBeGreaterThan(0.9);
    expect(
      edges.filter((e) => e.sourceNodeId === GN_BANK),
    ).toHaveLength(4);

    // GE_1 is the bridge to {VICTOR, WITNESS}, GE_6 the weak 0.2 link.
    const ge1 = edges.find((e) => e.id === GE_1);
    expect(ge1?.sourceNodeId).toBe(GN_BANK);
    expect(ge1?.targetNodeId).toBe(GN_VICTOR);
    const ge6 = edges.find((e) => e.id === GE_6);
    expect(ge6?.sourceNodeId).toBe(GN_VICTOR);
    expect(ge6?.targetNodeId).toBe(GN_WITNESS);
    expect(ge6?.support).toBeLessThan(0.3);

    // GE_5 retains the CONTRADICTED marker (counter-evidence flip).
    const ge5 = edges.find((e) => e.id === GE_5);
    expect(ge5?.status).toBe("CONTRADICTED");

    // Every base node is canonical (ENTITY/OBSERVATION with entityId).
    for (const n of nodes) {
      expect(n.entityId).toBeTruthy();
    }
  });

  it("is deterministic across repeated calls and across independent bundles", async () => {
    const a = bundle("pr0:det-a");
    const b = bundle("pr0:det-b");
    const nodesA = await fetchAll<GraphNode>((p, n) => a.graph.getNodes(INVESTIGATION_ID, { page: p, pageSize: n }));
    const nodesB = await fetchAll<GraphNode>((p, n) => b.graph.getNodes(INVESTIGATION_ID, { page: p, pageSize: n }));
    const nodesA2 = await fetchAll<GraphNode>((p, n) => a.graph.getNodes(INVESTIGATION_ID, { page: p, pageSize: n }));
    const id = (xs: GraphNode[]) => xs.map((x) => x.id);
    expect(id(nodesA)).toEqual(id(nodesA2));
    expect(id(nodesA)).toEqual(id(nodesB));
  });

  it("base graph serves no holes — holes are the overlay's job (realtime choreography)", async () => {
    const providers = bundle();
    const holes = await fetchAll((p, n) => providers.graph.getGraphHoles(INVESTIGATION_ID, { page: p, pageSize: n }));
    expect(holes).toHaveLength(0);
  });
});

describe("PR-0 §8.E evidence upload choreography — preserved deterministic sequence", () => {
  it("triggerOrQueueUploadSequence fires exactly the 4-stage demo sequence in order", async () => {
    const providers = bundle();
    const realtime = trackedRealtime(providers);
    const got: ProviderEvent[] = [];
    realtime.subscribe((e) => got.push(e));
    realtime.connect(INVESTIGATION_ID);

    await waitFor(() => got.length === operationFinancialShadowEvents.length);

    triggerOrQueueUploadSequence(realtime);
    await waitFor(() => got.length === operationFinancialShadowEvents.length + 4);

    const uploadEvents = got.slice(operationFinancialShadowEvents.length);
    expect(uploadEvents.map((e) => e.action)).toEqual([
      "ENTITY_CREATED",
      "GAP_IDENTIFIED",
      "EVIDENCE_REVIEWED",
      "ENTITY_CREATED",
    ]);
  });

  it("every choreography event resolves through the provider-owned overlay catalog", async () => {
    const providers = bundle();
    const catalog = await providers.graph.getOverlayCatalog();
    expect(Object.keys(catalog).length).toBeGreaterThan(0);

    const courierEntity = deterministicUuid("upload:entity:courier-firm");
    const simEntity = deterministicUuid("upload:entity:unregistered-sim");
    const gapId = deterministicUuid("upload:gap:courier-owner");

    const e1 = catalog[catalogKey("ENTITY_CREATED", courierEntity)];
    expect(e1?.kind).toBe("node");
    expect(e1?.node?.label).toBe("Meridian Transit Pvt Ltd");
    expect(e1?.extraEdges?.some((e) => e.sourceNodeId === GN_BANK)).toBe(true);

    const e2 = catalog[catalogKey("GAP_IDENTIFIED", gapId)];
    expect(e2?.kind).toBe("hole");
    expect(e2?.hole?.investigationGapId).toBe(gapId);

    const e3 = catalog[catalogKey("EVIDENCE_REVIEWED", gapId)];
    expect(e3?.kind).toBe("hole-resolve");
    expect(e3?.resolvesHoleId).toBe(gapId);
    // Resolution restores the ownership edge Victor -> Meridian.
    expect(e3?.edge?.sourceNodeId).toBe(GN_VICTOR);
    expect(e3?.edge?.relationType).toBe("ownership");

    const e4 = catalog[catalogKey("ENTITY_CREATED", simEntity)];
    expect(e4?.kind).toBe("node");
    expect(e4?.node?.label).toContain("Unregistered SIM");
  });

  it("a late subscriber receives full accumulated history (realtime memory bank)", async () => {
    const providers = bundle();
    const realtime = trackedRealtime(providers);
    const primary: ProviderEvent[] = [];
    realtime.subscribe((e) => primary.push(e));
    realtime.connect(INVESTIGATION_ID);

    await waitFor(() => primary.length === operationFinancialShadowEvents.length);
    triggerOrQueueUploadSequence(realtime);
    await waitFor(() => primary.length === operationFinancialShadowEvents.length + 4);

    // Simulate a tab that mounts AFTER the choreography finished.
    const late: ProviderEvent[] = [];
    realtime.subscribe((e) => late.push(e));
    expect(late.length).toBe(primary.length);
    expect(late.map((e) => e.id)).toEqual(primary.map((e) => e.id));
  });
});

describe("PR-0 §8.G cross-case boundary — fixture coherence through the provider", () => {
  it("cobalt + crimson islands carry isForeign flags and bridge telemetry", () => {
    for (const key of ["cobalt", "crimson"]) {
      const foreign = MOCK_FOREIGN_CASES[key];
      expect(foreign).toBeDefined();
      expect(foreign.nodes.length).toBeGreaterThan(0);
      expect(foreign.edges.length).toBeGreaterThan(0);
      expect(foreign.bridgeSupport).toBeGreaterThan(0);
      expect(foreign.bridgeSupport).toBeLessThanOrEqual(1);
      for (const node of foreign.nodes) {
        expect(node.isForeign).toBe(true);
      }
      for (const edge of foreign.edges) {
        expect(edge.isForeignEdge).toBe(true);
      }
    }
  });

  it("every foreign island node has a canonical Entity record in the foreign DB lookups", () => {
    for (const key of ["cobalt", "crimson"]) {
      for (const node of MOCK_FOREIGN_CASES[key].nodes) {
        const record = FOREIGN_ENTITIES_DB[node.id];
        expect(record).toBeDefined();
        expect(record.id).toBe(node.id);
        expect(record.canonicalName).toBeTruthy();
        expect(record.entityType).toBeTruthy();
      }
    }
  });

  it("the demo CrossCaseProvider serves the canonical cross-case match", async () => {
    const providers = bundle();
    const page = await providers.crossCase.listMatches(CASE_ID, { pageSize: 20 });
    expect(page.items.length).toBeGreaterThan(0);
    const match = page.items[0];
    expect(match.sourceCaseId).toBe(CASE_ID);
    expect(match.targetCaseId).toBe(CROSS_CASE_ID);
    expect(match.targetEntityId).toBe(CROSS_ENTITY_ID);
    expect(match.sourceEntityId).toBe(ENT_VICTOR);
    expect(match.matchScore).toBeGreaterThan(0.5);
  });
});

describe("PR-0 §8.C timeline boundary — deterministic temporal input", () => {
  it("DemoTimelineProvider returns a deterministic, time-sorted InvestigationTimeline", async () => {
    const providers = bundle();
    const timeline = await providers.timeline.getTimeline(INVESTIGATION_ID);
    const again = await providers.timeline.getTimeline(INVESTIGATION_ID);

    expect(timeline.bands.length).toBeGreaterThan(0);
    expect(timeline.items.length).toBeGreaterThan(0);
    expect(timeline.items.map((i) => i.id)).toEqual(again.items.map((i) => i.id));

    const bandIds = new Set(timeline.bands.map((b) => b.id));
    for (const item of timeline.items) {
      expect(bandIds.has(item.bandId)).toBe(true);
    }
    // PR-1 T4 normalized this contract: the provider now returns a single
    // global ascending sort (stable; unknown precision last). Band membership
    // is preserved, so the per-band ascending property still holds.
    for (const band of timeline.bands) {
      const bandItems = timeline.items.filter((i) => i.bandId === band.id);
      for (let i = 1; i < bandItems.length; i++) {
        const t0 = new Date(bandItems[i - 1].time).getTime();
        const t1 = new Date(bandItems[i].time).getTime();
        if (bandItems[i - 1].precision !== "unknown" && bandItems[i].precision !== "unknown") {
          expect(t1, `${band.id} items ascend in time`).toBeGreaterThanOrEqual(t0);
        }
      }
    }
  });
});

describe("PR-0 §17.6 demo-coupling guard — reusable graph UI stays provider-clean", () => {
  it("NO graph component imports demo fixtures (PR-1 T1/T2/T3 resolved graph-panel's deviation)", () => {
    const demoCoupling = graphFiles().filter((f) =>
      /providers\/demo|demo-\w*fixtures|demoFixtures/.test(fs.readFileSync(path.resolve("src/components/graph", f), "utf-8")),
    );
    expect(demoCoupling.sort()).toEqual([]);
  });

  it("the reusable graph engine layer remains free of provider/backend imports", () => {
    for (const f of ["graph-canvas.tsx", "use-graph-layout.ts", "graph-hole-burst-layer.tsx"]) {
      const content = fs.readFileSync(path.resolve("src/components/graph", f), "utf-8");
      expect(content, `${f} imports providers (live/demo/platform)`).not.toMatch(
        /providers\/|platform\/|@\/lib\/providers/,
      );
    }
  });

  it("the overlay mechanism consumes the provider catalog seam — not demo fixtures", () => {
    const content = fs.readFileSync(path.resolve("src/components/graph/graph-live.ts"), "utf-8");
    expect(content).not.toMatch(/demo|fixtures/);
  });
});