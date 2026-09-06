import { describe, it, expect } from "vitest";
import {
  buildFlowModel,
  currencySymbol,
  formatFlowAmount,
  formatFlowAmountCompact,
  flowContextForEntity,
  flowContextForGap,
  flowContextForRelation,
  flowEntityFromContext,
  flowSegmentFromContext,
  FLOW_DOMAIN_LABELS,
} from "@/lib/network/flow/flow-model";
import type { FlowDomain, FlowSegment } from "@/lib/network/flow/flow-model";
import { operationFinancialShadowGraph } from "@/lib/providers/demo/demo-fixtures/graph";
import { operationFinancialShadowObservations } from "@/lib/providers/demo/demo-fixtures/observations";
import { operationFinancialShadowRelations } from "@/lib/providers/demo/demo-fixtures/relations";
import {
  ENT_VICTOR,
  ENT_MARIA,
  ENT_SHELL_ONE,
  ENT_SHELL_TWO,
  ENT_BANK,
  REL_2,
  REL_3,
  REL_4,
  REL_5,
  OBS_5,
} from "@/lib/providers/demo/demo-fixtures/lookup";
import { ObservationSchema, RelationHypothesisSchema } from "@indago/contracts";
import type { Observation, RelationHypothesis } from "@indago/contracts";
import { evt, obs } from "@/lib/providers/demo/demo-fixtures/times";
import { deterministicUuid } from "@/lib/providers/demo/submit";

const graphNodes = operationFinancialShadowGraph.nodes;
const observations = operationFinancialShadowObservations;
const relations = operationFinancialShadowRelations;

function epochMs(iso: string): number {
  return new Date(iso).getTime();
}

const fullWindow = null as [number, number] | null;

// ---------------------------------------------------------------------------
// Synthetic factories (deterministic, contract-valid)
// ---------------------------------------------------------------------------

function syntheticObservation(
  id: string,
  type: "FINANCIAL" | "COMMUNICATION",
  entityIds: string[],
  amount: number | null,
  currency: string | null,
  date: string,
  gap = false,
): Observation {
  const custom: Record<string, unknown> = {};
  if (amount !== null && currency !== null) {
    custom["flowAmount"] = amount;
    custom["flowCurrency"] = currency;
  }
  if (gap) custom["flowGap"] = "destination";
  const sourceId = deterministicUuid(`src:${id}`);
  return ObservationSchema.parse({
    id: deterministicUuid(`obs:${id}`),
    evidenceId: deterministicUuid(`evidence:${id}`),
    sourceId,
    type,
    content: `synthetic ${id}`,
    entityIds: entityIds.map((entityId) => deterministicUuid(`ent:${entityId}`)),
    candidateMentions: [],
    strength: 0.6,
    provenance: { sourceId, extractor: "test.v1" },
    observedAt: evt(date, "exact"),
    createdAt: obs("2024-06-02"),
    updatedAt: obs("2024-06-02"),
    metadata: { customFields: custom },
  });
}

function syntheticRelation(
  id: string,
  sourceEntityId: string,
  targetEntityId: string,
  relationType: RelationHypothesis["relationType"],
  evidenceBasis: string[],
  status: RelationHypothesis["status"],
  directed = true,
  contradictions?: string[],
): RelationHypothesis {
  return RelationHypothesisSchema.parse({
    id: deterministicUuid(`rel:${id}`),
    sourceEntityId: deterministicUuid(`ent:${sourceEntityId}`),
    targetEntityId: deterministicUuid(`ent:${targetEntityId}`),
    relationType,
    support: 0.6,
    evidenceBasis,
    ...(contradictions ? { contradictions } : {}),
    directed,
    status,
    provenance: { sourceId: deterministicUuid("src:test"), extractor: "test.v1" },
    createdAt: obs("2024-06-02"),
    updatedAt: obs("2024-06-02"),
  });
}

// ---------------------------------------------------------------------------
// Shared demo expectations
// ---------------------------------------------------------------------------

function demoWindowMeta(window: [number, number] | null) {
  return buildFlowModel({
    nodes: graphNodes,
    observations,
    relations,
    timeRange: window,
    selectedMode: null,
    roleFilter: "all",
    crossCaseEntityIds: new Set([ENT_VICTOR]),
  });
}

describe("flow-model — demo fixture: extraction and honesty", () => {
  it("exposes only FINANCIAL as an available mode (adaptive, no fabrication)", () => {
    const meta = demoWindowMeta(fullWindow);
    expect(meta.status).toBe("ready");
    expect(meta.availableModes).toEqual(["FINANCIAL"]);
    expect(meta.mode).toBe("FINANCIAL");
  });

  it("extracts the directed financial chain SHELL_ONE → BANK → SHELL_TWO", () => {
    const meta = demoWindowMeta(fullWindow);
    const ids = meta.segments.map((segment: FlowSegment) => segment.relationId);
    expect(ids).toContain(REL_3);
    expect(ids).toContain(REL_4);
    expect(ids).toContain(REL_5);
    const r3 = meta.segments.find((s) => s.relationId === REL_3)!;
    expect(r3.sourceEntityId).toBe(ENT_SHELL_ONE);
    expect(r3.targetEntityId).toBe(ENT_BANK);
    const r4 = meta.segments.find((s) => s.relationId === REL_4)!;
    expect(r4.sourceEntityId).toBe(ENT_BANK);
    expect(r4.targetEntityId).toBe(ENT_SHELL_TWO);
  });

  it("reads amounts per currency from evidence observations (never invented)", () => {
    const meta = demoWindowMeta(fullWindow);
    const r3 = meta.segments.find((s) => s.relationId === REL_3)!;
    expect(r3.hasAmount).toBe(true);
    expect(r3.amounts).toHaveLength(1);
    expect(r3.amounts[0]!.currency).toBe("INR");
    expect(r3.amounts[0]!.total).toBe(250000);
    const r4 = meta.segments.find((s) => s.relationId === REL_4)!;
    expect(r4.amounts[0]!.total).toBe(245000);
    // amountless evidence stays qualitative
    const r5 = meta.segments.find((s) => s.relationId === REL_5)!;
    expect(r5.hasAmount).toBe(false);
    expect(r5.amounts).toHaveLength(0);
  });

  it("merges observed amounts per currency only — no cross-currency sums", () => {
    const meta = demoWindowMeta(fullWindow);
    expect(meta.observedAmounts).toEqual([
      { currency: "INR", total: 495000, count: 2 },
    ]);
  });

  it("marks the OBS_5 unilateral outflow as a gap destination, not a segment", () => {
    const meta = demoWindowMeta(fullWindow);
    expect(meta.gaps).toHaveLength(1);
    const gap = meta.gaps[0]!;
    expect(gap.observationId).toBe(OBS_5);
    expect(gap.sourceEntityId).toBe(ENT_SHELL_TWO);
    expect(gap.amount!.total).toBe(180000);
    const gapSegments = meta.segments.filter((s) => s.id === gap.id);
    expect(gapSegments).toHaveLength(0);
  });

  it("roles: sources / intermediaries; the gap leaves an unofficial terminus", () => {
    const meta = demoWindowMeta(fullWindow);
    const byId = new Map(meta.entities.map((entity) => [entity.entityId, entity.role]));
    expect(byId.get(ENT_MARIA)).toBe("sources");
    expect(byId.get(ENT_SHELL_ONE)).toBe("sources");
    expect(byId.get(ENT_BANK)).toBe("intermediaries");
    expect(byId.get(ENT_SHELL_TWO)).toBe("intermediaries");
  });

  it("counts paths from sources through the chain (3 active paths)", () => {
    const meta = demoWindowMeta(fullWindow);
    expect(meta.pathCount).toBe(3);
  });

  it("reports cross-case flow entities as a count only", () => {
    const meta = demoWindowMeta(fullWindow);
    expect(meta.crossCaseCount).toBe(0);
    const withCrossCase = buildFlowModel({
      nodes: graphNodes,
      observations,
      relations,
      timeRange: fullWindow,
      selectedMode: null,
      roleFilter: "all",
      crossCaseEntityIds: new Set([ENT_VICTOR, ENT_BANK]),
    });
    expect(withCrossCase.crossCaseCount).toBe(1);
  });

  it("layers the layout deterministically and keeps coordinates bounded", () => {
    const a = demoWindowMeta(fullWindow);
    const b = demoWindowMeta(fullWindow);
    expect(JSON.stringify(a.layout)).toBe(JSON.stringify(b.layout));
    expect(a.layout!.edges.every((edge) => edge.d.length > 0)).toBe(true);
    for (const node of a.layout!.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("clamps edge widths into the bounded band", () => {
    const meta = demoWindowMeta(fullWindow);
    for (const edge of meta.layout!.edges) {
      expect(edge.width).toBeGreaterThanOrEqual(2);
      expect(edge.width).toBeLessThanOrEqual(16);
    }
  });

  it("assigns gap edges a dashed style and proposed segments a dashed hint", () => {
    const meta = demoWindowMeta(fullWindow);
    const gapEdge = meta.layout!.edges.find((edge) => edge.gapId !== null)!;
    expect(gapEdge.dashed).toBe(true);
    const r5Edge = meta.layout!.edges.find((edge) => edge.segmentId?.includes(REL_5));
    expect(r5Edge).toBeDefined();
    expect(r5Edge!.dashed).toBe(true);
  });
});

describe("flow-model — temporal scoping (shared workspace window)", () => {
  const feb2024: [number, number] = [
    epochMs("2024-02-01T00:00:00.000Z"),
    epochMs("2024-02-29T23:59:59.999Z"),
  ];

  it("keeps wire segments made in February and drops January/March", () => {
    const meta = demoWindowMeta(feb2024);
    const ids = meta.segments.map((s) => s.relationId);
    expect(ids).toContain(REL_3);
    expect(ids).toContain(REL_4);
    expect(ids).toContain(REL_5);
    expect(ids).not.toContain(REL_2);
    expect(meta.gaps).toHaveLength(0);
    expect(meta.status).toBe("ready");
    expect(meta.pathCount).toBe(2);
  });

  it("reports NO FLOW IN SELECTED WINDOW when the mode holds no in-window data", () => {
    const may2024: [number, number] = [
      epochMs("2024-05-01T00:00:00.000Z"),
      epochMs("2024-05-31T23:59:59.999Z"),
    ];
    const meta = demoWindowMeta(may2024);
    expect(meta.status).toBe("no-flow-in-window");
    expect(meta.emptyMessage).toBe("No flow in selected window");
    expect(meta.layout).toBeNull();
    expect(meta.availableModes).toEqual(["FINANCIAL"]);
  });
});

describe("flow-model — honesty with missing data", () => {
  it("reports NO FLOW DATA for a case with no flow-forming relations", () => {
    const meta = buildFlowModel({
      nodes: graphNodes,
      observations,
      relations: [],
      timeRange: fullWindow,
      selectedMode: null,
      roleFilter: "all",
      crossCaseEntityIds: new Set(),
    });
    expect(meta.status).toBe("no-flow-data");
    expect(meta.emptyMessage).toBe("No flow data");
    expect(meta.availableModes).toEqual([]);
    expect(meta.layout).toBeNull();
  });

  it("never treats REJECTED/REVERSED hypotheses as active flow", () => {
    const o = syntheticObservation("obs-rejected", "FINANCIAL", [ENT_BANK], null, null, "2024-02-05");
    const relations: RelationHypothesis[] = [
      syntheticRelation("rel-rejected", "e-source", "e-target", "financial", [o.id], "REJECTED"),
      syntheticRelation("rel-reversed", "e-source", "e-target", "financial", [o.id], "REVERSED"),
    ];
    const meta = buildFlowModel({
      nodes: graphNodes,
      observations: [o],
      relations,
      timeRange: fullWindow,
      selectedMode: null,
      roleFilter: "all",
      crossCaseEntityIds: new Set(),
    });
    expect(meta.status).toBe("no-flow-data");
  });

  it("ignores non-directed relations for directed flow", () => {
    const o = syntheticObservation("obs-undirected", "FINANCIAL", [ENT_BANK], 100, "INR", "2024-02-05");
    const relation = syntheticRelation(
      "rel-undirected",
      "e-a",
      "e-b",
      "financial",
      [o.id],
      "ACCEPTED",
      false,
    );
    const meta = buildFlowModel({
      nodes: graphNodes,
      observations: [o],
      relations: [relation],
      timeRange: fullWindow,
      selectedMode: null,
      roleFilter: "all",
      crossCaseEntityIds: new Set(),
    });
    expect(meta.status).toBe("no-flow-data");
  });
});

describe("flow-model — mixed currencies are never summed", () => {
  it("keeps per-currency amounts and flags mixedCurrencies", () => {
    const oInr = syntheticObservation("obs-inr", "FINANCIAL", ["e-source", "e-target"], 100, "INR", "2024-02-05");
    const oUsd = syntheticObservation("obs-usd", "FINANCIAL", ["e-source", "e-target"], 50, "USD", "2024-02-05");
    const rel = syntheticRelation("rel-mixed", "e-source", "e-target", "financial", [oInr.id, oUsd.id], "ACCEPTED");
    const meta = buildFlowModel({
      nodes: graphNodes,
      observations: [oInr, oUsd],
      relations: [rel],
      timeRange: fullWindow,
      selectedMode: null,
      roleFilter: "all",
      crossCaseEntityIds: new Set(),
    });
    expect(meta.status).toBe("ready");
    const segment = meta.segments[0]!;
    expect(segment.mixedCurrencies).toBe(true);
    expect(segment.amounts).toHaveLength(2);
    expect(segment.amounts[0]!.currency).toBe("INR");
    expect(segment.amounts[1]!.currency).toBe("USD");
    expect(meta.observedAmounts).toHaveLength(2);
    // the two currencies are SEPARATELY reported, never combined
    expect(meta.observedAmounts.some((a) => a.currency === "INR" && a.total === 100)).toBe(true);
    expect(meta.observedAmounts.some((a) => a.currency === "USD" && a.total === 50)).toBe(true);
    expect(meta.observedAmounts.every((a) => a.total !== 150)).toBe(true);
  });
});

describe("flow-model — adaptive mode selection", () => {
  it("defaults to FINANCIAL when financial and other modes coexist", () => {
    const commObs = syntheticObservation("obs-comm", "COMMUNICATION", ["all-a", "all-b"], null, null, "2024-02-05");
    const finObs = syntheticObservation("obs-fin", "FINANCIAL", ["all-a", "all-b"], 100, "INR", "2024-02-05");
    const relations: RelationHypothesis[] = [
      syntheticRelation("rel-comm", "all-a", "all-b", "communication", [commObs.id], "ACCEPTED"),
      syntheticRelation("rel-fin", "all-a", "all-b", "financial", [finObs.id], "ACCEPTED"),
    ];
    const meta = buildFlowModel({
      nodes: graphNodes,
      observations: [commObs, finObs],
      relations,
      timeRange: fullWindow,
      selectedMode: null,
      roleFilter: "all",
      crossCaseEntityIds: new Set(),
    });
    expect(meta.availableModes).toContain("FINANCIAL");
    expect(meta.availableModes).toContain("COMMUNICATION");
    expect(meta.mode).toBe("FINANCIAL");
    const manual = buildFlowModel({
      nodes: graphNodes,
      observations: [commObs, finObs],
      relations,
      timeRange: fullWindow,
      selectedMode: "COMMUNICATION",
      roleFilter: "all",
      crossCaseEntityIds: new Set(),
    });
    expect(manual.mode).toBe("COMMUNICATION");
  });
});

describe("flow-model — role filters", () => {
  it("keeps only segments touching the requested role", () => {
    const meta = buildFlowModel({
      nodes: graphNodes,
      observations,
      relations,
      timeRange: fullWindow,
      selectedMode: null,
      roleFilter: "sources",
      crossCaseEntityIds: new Set(),
    });
    expect(meta.status).toBe("ready");
    expect(meta.segments.length).toBeGreaterThan(0);
    expect(
      meta.segments.every(
        (s) =>
          meta.entities.some((e) => e.entityId === s.sourceEntityId && e.role === "sources") ||
          meta.entities.some((e) => e.entityId === s.targetEntityId && e.role === "sources"),
      ),
    ).toBe(true);
  });
});

describe("flow-model — role filter with empty role set is honest", () => {
  it("destinations filter shows only the gap terminus (no fabricated targets)", () => {
    // OBS_5 has no target entity, so when no segments land on a destination the
    // only host of a "destination" is the gap — the filter must stay honest.
    const meta = buildFlowModel({
      nodes: graphNodes,
      observations,
      relations,
      timeRange: fullWindow,
      selectedMode: null,
      roleFilter: "destinations",
      crossCaseEntityIds: new Set(),
    });
    expect(meta.status).toBe("ready");
    const gapTermini = meta.layout!.nodes.filter((node) => node.kind === "gap");
    expect(gapTermini.length).toBeGreaterThan(0);
    // Entities classified as pure destinations don't exist in this network,
    // so no real entity row presents itself as an endpoint.
    expect(meta.entities.every((e) => e.role !== "destinations")).toBe(true);
  });
});

describe("flow-model — context bridge", () => {
  it("maps segment → relation context, entity → entity context, gap → observation context", () => {
    const meta = demoWindowMeta(fullWindow);
    const segment = meta.segments.find((s) => s.relationId === REL_3)!;
    const relContext = flowContextForRelation(segment.relationId);
    expect(relContext).toEqual({ kind: "relation", id: REL_3, source: "flow" });
    expect(flowSegmentFromContext(meta.segments, relContext)?.relationId).toBe(REL_3);

    const entityContext = flowContextForEntity(ENT_BANK);
    expect(entityContext).toEqual({ kind: "entity", id: ENT_BANK, source: "flow" });
    expect(flowEntityFromContext(meta.entities, entityContext)?.entityId).toBe(ENT_BANK);

    const gap = meta.gaps[0]!;
    const gapContext = flowContextForGap(gap);
    expect(gapContext).toEqual({ kind: "observation", id: OBS_5, source: "flow" });
    // observation selections are NOT segments/entities by design
    expect(flowSegmentFromContext(meta.segments, gapContext)).toBeNull();
  });
});

describe("flow-model — display helpers", () => {
  it("formats amounts readably and deterministically", () => {
    expect(currencySymbol("INR")).toBe("₹");
    expect(formatFlowAmount(495000, "INR")).toBe("₹495,000");
    expect(formatFlowAmountCompact(250000, "INR")).toBe("₹250K");
    expect(formatFlowAmountCompact(1_400_000, "INR")).toBe("₹1.4M");
  });

  it("uses the domain labels in the ready summary", () => {
    const meta = demoWindowMeta(fullWindow);
    expect(meta.summary).toContain(FLOW_DOMAIN_LABELS[meta.mode as FlowDomain]);
  });
});