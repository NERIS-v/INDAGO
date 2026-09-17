import { describe, it, expect } from "vitest";
import { buildEntityPulseOverview } from "@/lib/network/pulse/pulse-model";
import type { PulseMarker } from "@/lib/network/pulse/pulse-model";
import { buildFlowModel } from "@/lib/network/flow/flow-model";
import { operationFinancialShadowGraph } from "@/lib/providers/demo/demo-fixtures/graph";
import { operationFinancialShadowObservations } from "@/lib/providers/demo/demo-fixtures/observations";
import { operationFinancialShadowRelations } from "@/lib/providers/demo/demo-fixtures/relations";
import { DemoGraphProvider } from "@/lib/providers/demo/providers";
import { ENT_BANK, ENT_VICTOR } from "@/lib/providers/demo/demo-fixtures/lookup";
import { deterministicUuid } from "@/lib/providers/demo/submit";
import {
  TemporalBurstCandidateSchema,
  ConnectingPathCandidateSchema,
} from "@indago/contracts";
import type {
  ConnectingPathCandidateDTO,
  RelationHypothesis,
  TemporalBurstCandidateDTO,
} from "@indago/contracts";

const graphNodes = operationFinancialShadowGraph.nodes;
const observations = operationFinancialShadowObservations;
const relations = operationFinancialShadowRelations;
const fullWindow = null as [number, number] | null;

function burst(
  nodeId: string,
  burstScore: number,
  windowStart: string,
  windowEnd: string,
  eventCount: number,
): TemporalBurstCandidateDTO {
  return TemporalBurstCandidateSchema.parse({
    nodeId,
    windowStart,
    windowEnd,
    eventCount,
    baselineRate: 1,
    burstScore,
    edgeIds: [],
  });
}

function connectingPath(
  startNodeId: string,
  targetNodeId: string,
  via: string[],
): ConnectingPathCandidateDTO {
  return ConnectingPathCandidateSchema.parse({
    startNodeId,
    targetNodeId,
    nodes: via.map((nodeId) => ({
      nodeId,
      entityType: "PERSON",
      canonicalName: `canonical-${nodeId}`,
    })),
    steps: via.map((nodeId) => ({
      relationType: "financial",
      edgeId: deterministicUuid(`path-edge:${startNodeId}:${nodeId}`),
      nodeId,
      directed: true,
    })),
    hopCount: via.length,
  });
}

// ---------------------------------------------------------------------------
// Pulse live adapter — authoritative backend bursts → deterministic markers
// ---------------------------------------------------------------------------

describe("PR-23 pulse live adapter — backend temporal bursts", () => {
  function pulseMarkers(bursts?: readonly TemporalBurstCandidateDTO[]): PulseMarker[] {
    const overview = buildEntityPulseOverview({
      nodes: graphNodes,
      observations,
      timeRange: fullWindow,
      ...(bursts ? { bursts } : {}),
    });
    return overview.markers;
  }

  it("emits no temporal-burst markers when bursts are absent (demo path)", () => {
    const markers = pulseMarkers();
    expect(markers.some((m) => m.kind === "temporal-burst")).toBe(false);
  });

  it("treats an empty burst array (backend answered 'none') identically — still honest", () => {
    const markers = pulseMarkers([]);
    expect(markers.some((m) => m.kind === "temporal-burst")).toBe(false);
  });

  it("anchors live bursts to their canonical owning entity as structural markers", () => {
    const markers = pulseMarkers([
      burst(ENT_BANK, 3.4, "2024-02-10T00:00:00.000Z", "2024-02-11T00:00:00.000Z", 12),
    ]);
    const temporal = markers.filter((m) => m.kind === "temporal-burst");
    expect(temporal).toHaveLength(1);
    expect(temporal[0]!.entityId).toBe(ENT_BANK);
    expect(temporal[0]!.label).toContain("3.4");
    expect(temporal[0]!.detail).toContain("12 events clustered in 2024-02-10");
  });

  it("skips bursts whose node is not a canonical placed entity (no fabrication)", () => {
    const markers = pulseMarkers([
      burst(
        deterministicUuid("unknown:entity"),
        9.9,
        "2024-02-10T00:00:00.000Z",
        "2024-02-11T00:00:00.000Z",
        3,
      ),
    ]);
    expect(markers.some((m) => m.kind === "temporal-burst")).toBe(false);
  });

  it("orders burst markers deterministically by node then window", () => {
    const a = pulseMarkers([
      burst(ENT_BANK, 2.0, "2024-02-10T00:00:00.000Z", "2024-02-11T00:00:00.000Z", 6),
      burst(ENT_VICTOR, 2.0, "2024-02-10T00:00:00.000Z", "2024-02-11T00:00:00.000Z", 6),
    ]);
    const b = pulseMarkers([
      burst(ENT_VICTOR, 2.0, "2024-02-10T00:00:00.000Z", "2024-02-11T00:00:00.000Z", 6),
      burst(ENT_BANK, 2.0, "2024-02-10T00:00:00.000Z", "2024-02-11T00:00:00.000Z", 6),
    ]);
    const keyOf = (markers: PulseMarker[]) =>
      markers
        .filter((m) => m.kind === "temporal-burst")
        .map((m) => `${m.entityId}:${m.label}:${m.detail}`);
    expect(keyOf(a)).toEqual(keyOf(b));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// Flow live adapter — bounded connecting-path corroboration (narration only)
// ---------------------------------------------------------------------------

describe("PR-23 flow live adapter — backend connecting-path corroboration", () => {
  function flowMeta(options?: {
    relations?: readonly RelationHypothesis[];
    backendPaths?: readonly ConnectingPathCandidateDTO[] | null;
  }) {
    return buildFlowModel({
      nodes: graphNodes,
      observations,
      relations: options?.relations ?? relations,
      timeRange: fullWindow,
      selectedMode: null,
      roleFilter: "all",
      crossCaseEntityIds: new Set(),
      ...(options && "backendPaths" in options
        ? { backendPaths: options.backendPaths }
        : {}),
    });
  }

  it("reports backendPathCount null when no live path seam was queried (default)", () => {
    const meta = flowMeta();
    expect(meta.status).toBe("ready");
    expect(meta.backendPathCount).toBeNull();
    expect(meta.backendPathEntityIds).toEqual([]);
    expect(meta.summary).not.toContain("backend-confirmed");
  });

  it("counts an authoritative empty backend answer as zero paths (never as unavailable)", () => {
    const meta = flowMeta({ backendPaths: [] });
    expect(meta.backendPathCount).toBe(0);
    expect(meta.backendPathEntityIds).toEqual([]);
    expect(meta.summary).toContain("0 backend-confirmed paths");
  });

  it("reports backend-confirmed path count and distinct entity ids deterministically", () => {
    const paths = [
      connectingPath(ENT_BANK, ENT_VICTOR, [ENT_VICTOR]),
      connectingPath(ENT_VICTOR, ENT_BANK, [ENT_VICTOR]),
    ];
    const meta = flowMeta({ backendPaths: paths });
    expect(meta.backendPathCount).toBe(2);
    expect(meta.backendPathEntityIds).toEqual([ENT_BANK, ENT_VICTOR].sort());
    expect(meta.summary).toContain("2 backend-confirmed paths");
    expect(meta.summary).not.toContain("0 backend");
  });

  it("treats corroboration as pure narration — no edges or amounts are invented", () => {
    const meta = flowMeta({
      backendPaths: [
        connectingPath(ENT_BANK, ENT_VICTOR, [ENT_VICTOR]),
        connectingPath(ENT_VICTOR, ENT_BANK, [ENT_BANK]),
      ],
    });
    const plain = flowMeta();
    expect(meta.segmentCount).toBe(plain.segmentCount);
    expect(meta.entities).toEqual(plain.entities);
    expect(meta.observedAmounts).toEqual(plain.observedAmounts);
    expect(meta.summary).toContain("2 backend-confirmed paths");
  });

  it("keeps the early no-flow-data status with backendPathCount null", () => {
    const meta = flowMeta({ relations: [] });
    expect(meta.status).toBe("no-flow-data");
    expect(meta.backendPathCount).toBeNull();
    expect(meta.backendPathEntityIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Demo / live separation — the demo exposes no live graph seams, unchanged
// ---------------------------------------------------------------------------

describe("PR-23 demo/live separation — demo graph provider exposes no live seams", () => {
  const demoPrototype = DemoGraphProvider.prototype as unknown as Record<
    string,
    unknown
  >;

  it("exposes no connectingPaths / traverse / getTemporalBursts seams (demo is unchanged)", () => {
    expect(typeof demoPrototype.connectingPaths).toBe("undefined");
    expect(typeof demoPrototype.traverse).toBe("undefined");
    expect(typeof demoPrototype.getTemporalBursts).toBe("undefined");
    expect(typeof demoPrototype.getValidAt).toBe("undefined");
  });

  it("still implements the core graph list/version seams the five zones consume", () => {
    expect(typeof demoPrototype.getNodes).toBe("function");
    expect(typeof demoPrototype.getVersion).toBe("function");
    expect(typeof demoPrototype.listVersions).toBe("function");
  });
});