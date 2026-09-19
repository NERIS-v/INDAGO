import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  replayLifecycle,
  makeProjectionInput,
  normalizeBuiltGraph,
  GraphProjectionService,
  GraphRevisionCorruptError,
  GRAPH_CHANGE_ACCEPTED,
  GRAPH_CHANGE_REVERSED,
} from "../src/relations/graph-version-service.js";
import { buildGraph, type Graph } from "@indago/graphology-projection";
import { GRAPH_VERSION_LIFECYCLE_TRANSITIONS } from "../src/persistence/graph-version-store.js";

// ============================================================================
// M-A12-PR2 Graph projection — PURE unit tests (no DB).
//
// Tests the deterministic, DB-free core of historical/current projection:
//   - replayLifecycle (dimension A — revision-order selection from the
//     persisted GraphVersion chain)
//   - makeProjectionInput (authoritative state → normalized graph input,
//     temporalRange = persisted validityInterval, provenance preserved)
//   - normalizeBuiltGraph (order-independent deterministic comparison shape,
//     used by the deterministic-replay test)
//
// The service class itself needs injected stores (Postgres-backed), so its
// transactional/allocation behavior is covered by the gated integration suite
// (m-a12-pr2.integration.test.ts) — NOT mocked here.
// ============================================================================

const version = (n: number, change: string, relationId: string) => ({
  versionNumber: n,
  reason: `${change}:${relationId}`,
  metadata: { change, relationId },
});

describe("replayLifecycle (dimension A — revision-order selection)", () => {
  it("empty version list → empty lifecycle (no relations included)", () => {
    const state = replayLifecycle([], 5);
    expect(state.size).toBe(0);
  });

  it("reflects an accepted relation starting at its accept version", () => {
    const r1 = randomUUID();
    const state = replayLifecycle([version(1, GRAPH_CHANGE_ACCEPTED, r1)], 1);
    expect(state.get(r1)).toEqual({ accepted: true, reversedAtVersion: null });
  });

  it("a relation accepted at version 1 is NOT active at version 0", () => {
    const r1 = randomUUID();
    expect(replayLifecycle([version(1, GRAPH_CHANGE_ACCEPTED, r1)], 0).has(r1)).toBe(false);
  });

  it("a relation accepted at v1 and reversed at v2 stays accepted but reversed by v2", () => {
    const r1 = randomUUID();
    const chain = [
      version(1, GRAPH_CHANGE_ACCEPTED, r1),
      version(2, GRAPH_CHANGE_REVERSED, r1),
    ];
    const atV1 = replayLifecycle(chain, 1);
    const atV2 = replayLifecycle(chain, 2);
    expect(atV1.get(r1)).toEqual({ accepted: true, reversedAtVersion: null });
    expect(atV2.get(r1)).toEqual({ accepted: true, reversedAtVersion: 2 });
  });

  it("reaches only up to (and including) the target version, never beyond", () => {
    const r1 = randomUUID();
    const r2 = randomUUID();
    const chain = [
      version(1, GRAPH_CHANGE_ACCEPTED, r1),
      version(2, GRAPH_CHANGE_ACCEPTED, r2),
    ];
    const atV1 = replayLifecycle(chain, 1);
    expect(atV1.has(r1)).toBe(true);
    expect(atV1.has(r2)).toBe(false);
  });

  it("a reversal without a prior accept is recorded but the edge is never active", () => {
    const r1 = randomUUID();
    const state = replayLifecycle([version(1, GRAPH_CHANGE_REVERSED, r1)], 1);
    const s = state.get(r1);
    expect(s).toBeDefined();
    expect(s!.accepted).toBe(false);
    expect(s!.reversedAtVersion).toBe(1);
  });

  it("an accept after a reversal re-arms the relation as active", () => {
    const r1 = randomUUID();
    const chain = [
      version(1, GRAPH_CHANGE_REVERSED, r1),
      version(2, GRAPH_CHANGE_ACCEPTED, r1),
    ];
    const state = replayLifecycle(chain, 2);
    expect(state.get(r1)).toEqual({ accepted: true, reversedAtVersion: null });
  });

  it("ignores versions whose reason is not an accepted/reversed relation change", () => {
    const r1 = randomUUID();
    const chain = [
      version(1, GRAPH_CHANGE_ACCEPTED, r1),
      { versionNumber: 2, reason: "ENTITY_STATE_CHANGED:ent1", metadata: null },
    ];
    const state = replayLifecycle(chain, 2);
    expect(state.has(r1)).toBe(true);
    expect(state.size).toBe(1);
  });
});

describe("strict replay decoding (M-A12 WS-8)", () => {
  it("throws GraphRevisionCorruptError when a KNOWN graph change carries no relationId", () => {
    const corrupt = {
      versionNumber: 3,
      reason: "RELATION_ACCEPTED:",
      metadata: { change: "RELATION_ACCEPTED" },
    };
    expect(() => replayLifecycle([corrupt], 3)).toThrow(GraphRevisionCorruptError);
  });

  it("throws on a structured RELATION_REVERSED with an empty relationId", () => {
    const corrupt = {
      versionNumber: 2,
      reason: null,
      metadata: { change: GRAPH_CHANGE_REVERSED, relationId: "" },
    };
    expect(() => replayLifecycle([corrupt], 2)).toThrow(GraphRevisionCorruptError);
  });

  it("a corrupt middle version poisons the whole replay (never silently skipped)", () => {
    const r1 = randomUUID();
    const chain = [
      version(1, GRAPH_CHANGE_ACCEPTED, r1),
      { versionNumber: 2, reason: "RELATION_ACCEPTED:", metadata: {} },
    ];
    expect(() => replayLifecycle(chain, 2)).toThrow(GraphRevisionCorruptError);
  });

  it("still silently skips unknown/non-graph change types (replay contract preserved)", () => {
    const r1 = randomUUID();
    const chain = [
      version(1, GRAPH_CHANGE_ACCEPTED, r1),
      {
        versionNumber: 2,
        reason: "ENTITY_STATE_CHANGED:ent1",
        metadata: { change: "ENTITY_STATE_CHANGED", relationId: "ent1" },
      },
      { versionNumber: 3, reason: null, metadata: null },
    ];
    const state = replayLifecycle(chain, 3);
    expect(state.has(r1)).toBe(true);
    expect(state.size).toBe(1);
  });

  it("completely unknown reason prefixes are not fabrications and remain skippable", () => {
    const r1 = randomUUID();
    const chain = [
      version(1, GRAPH_CHANGE_ACCEPTED, r1),
      { versionNumber: 2, reason: "UNKNOWN_CHANGE:something", metadata: {} },
    ];
    expect(replayLifecycle(chain, 2).size).toBe(1);
  });
});

describe("GraphVersion lifecycle transition matrix (locked D4)", () => {
  it("permits exactly DRAFT→ACTIVE, ACTIVE→SUPERSEDED, SUPERSEDED→ARCHIVED", () => {
    const { DRAFT, ACTIVE, SUPERSEDED, ARCHIVED } = GRAPH_VERSION_LIFECYCLE_TRANSITIONS;
    expect(DRAFT).toEqual(["ACTIVE"]);
    expect(ACTIVE).toEqual(["SUPERSEDED"]);
    expect(SUPERSEDED).toEqual(["ARCHIVED"]);
    expect(ARCHIVED).toEqual([]);
  });

  it("forbids every non-locked transition (active not reversible, archived terminal)", () => {
    const { DRAFT, ACTIVE, SUPERSEDED, ARCHIVED } = GRAPH_VERSION_LIFECYCLE_TRANSITIONS;
    expect(DRAFT).not.toContain("SUPERSEDED");
    expect(DRAFT).not.toContain("ARCHIVED");
    expect(DRAFT).not.toContain("DRAFT");
    expect(ACTIVE).not.toContain("DRAFT");
    expect(ACTIVE).not.toContain("ACTIVE");
    expect(ACTIVE).not.toContain("ARCHIVED");
    expect(SUPERSEDED).not.toContain("SUPERSEDED");
    expect(SUPERSEDED).not.toContain("DRAFT");
    expect(ARCHIVED).not.toContain("ACTIVE");
    expect(ARCHIVED).not.toContain("SUPERSEDED");
  });
});

describe("makeProjectionInput (authoritative state → normalized input)", () => {
  it("maps persisted validityInterval to temporalRange (dimension B, verbatim)", () => {
    const r1 = randomUUID();
    const e1 = randomUUID();
    const e2 = randomUUID();
    const input = makeProjectionInput(
      "case-1",
      [
        { id: e1, entityType: "PERSON", canonicalName: "Alice" },
        { id: e2, entityType: "PERSON", canonicalName: "Bob" },
      ],
      [
        {
          id: r1,
          relationType: "communication",
          sourceEntityId: e1,
          targetEntityId: e2,
          directed: true,
          provenance: { sourceId: "src-1" },
          validityInterval: { value: "2026-08-01T10:00:00.000Z", precision: "exact" },
        },
      ],
    );
    expect(input.edges[0].temporalRange).toEqual({
      value: "2026-08-01T10:00:00.000Z",
      precision: "exact",
    });
    expect(input.edges[0].provenance).toEqual({ sourceId: "src-1" });
  });

  it("omits temporalRange when the authoritative relation has no validityInterval", () => {
    const e1 = randomUUID();
    const e2 = randomUUID();
    const input = makeProjectionInput(
      "case-1",
      [{ id: e1, entityType: "PERSON", canonicalName: "Alice" }],
      [
        {
          id: randomUUID(),
          relationType: "communication",
          sourceEntityId: e1,
          targetEntityId: e2,
          directed: false,
          provenance: {},
          validityInterval: null,
        },
      ],
    );
    expect("temporalRange" in input.edges[0]).toBe(false);
  });

  it("preserves node identity, type and canonical name", () => {
    const e1 = randomUUID();
    const input = makeProjectionInput(
      "case-1",
      [{ id: e1, entityType: "PERSON", canonicalName: "Alice" }],
      [],
    );
    expect(input.nodes[0]).toEqual({
      id: e1,
      entityType: "PERSON",
      canonicalName: "Alice",
    });
  });
});

// ============================================================================
// PR-31 FIX 6 — the runtime graph (GraphRuntime / loadCaseProjection / toGraphEdge)
// MUST carry the authoritative validityInterval as `temporalRange`, exactly like
// the versioned projection. PR-30 verdict was "PARTIALLY": temporal ranges
// reached the versioned projection but never the runtime analytics graph, so the
// temporal-burst detector (which reads edge attrs.temporalRange.validFrom) could
// never fire on the live graph. DB-free: injected stub stores only.
// ============================================================================
describe("PR-31 FIX 6 — runtime graph edges carry temporalRange", () => {
  const E1 = "00000000-0000-4000-8000-000000000001";
  const E2 = "00000000-0000-4000-8000-000000000002";
  const R1 = "10100000-0000-4000-8000-000000000001";
  const RANGE = { value: "2026-08-01T10:00:00.000Z", precision: "exact" as const };

  interface StubStores {
    entities?: unknown;
    relations?: unknown;
  }

  function relationRow(validityInterval: unknown): Record<string, unknown> {
    return {
      id: R1,
      caseId: "case-1",
      investigationId: null,
      relationType: "communication",
      sourceEntityId: E1,
      targetEntityId: E2,
      directed: true,
      support: 0.8,
      evidenceBasis: [],
      contradictions: [],
      status: "ACTIVE",
      scoreModelVersion: "v1",
      evidenceCount: 1,
      provenance: {},
      hypothesisId: "hyp-1",
      validityInterval,
      temporalAssertions: [],
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      reversedAt: null,
    };
  }

  function stores(validityInterval: unknown): StubStores {
    const entities = [
      { id: E1, entityType: "PERSON", canonicalName: "Alice" },
      { id: E2, entityType: "PERSON", canonicalName: "Bob" },
    ];
    if (validityInterval === "__NONE__") {
      return {
        entities: { listByCase: async () => entities },
        relations: { listActiveByCase: async () => [] },
      };
    }
    return {
      entities: { listByCase: async () => entities },
      relations: { listActiveByCase: async () => [relationRow(validityInterval)] },
    };
  }

  it("loadCaseProjection maps a persisted validityInterval to edge temporalRange", async () => {
    const { loadCaseProjection } = await import("../src/relations/graph-runtime.js");
    const projection = await loadCaseProjection(
      { investigationId: "inv-1", caseId: "case-1" },
      stores(RANGE) as never,
    );
    expect(projection.edges[0].temporalRange).toEqual(RANGE);
  });

  it("omits temporalRange when the authoritative relation has no validityInterval", async () => {
    const { loadCaseProjection } = await import("../src/relations/graph-runtime.js");
    const projection = await loadCaseProjection(
      { investigationId: "inv-1", caseId: "case-1" },
      stores(undefined) as never,
    );
    expect("temporalRange" in projection.edges[0]).toBe(false);
  });

  it("GraphRuntime.buildGraph edges carry temporalRange into the built graph attrs", async () => {
    const { GraphRuntime } = await import("../src/relations/graph-runtime.js");
    const runtime = new GraphRuntime(stores(RANGE) as never);
    const view = await runtime.graph({ investigationId: "inv-1", caseId: "case-1" });
    expect(view.edges[0].temporalRange).toEqual(RANGE);
  });
});

describe("normalizeBuiltGraph (order-independent deterministic snapshot)", () => {
  const E1 = "00000000-0000-4000-8000-000000000001";
  const E2 = "00000000-0000-4000-8000-000000000002";
  const E3 = "00000000-0000-4000-8000-000000000003";
  const R1 = "10100000-0000-4000-8000-000000000001";
  const R2 = "10100000-0000-4000-8000-000000000002";
  const RANGE = { value: "2026-08-01T10:00:00.000Z", precision: "exact" as const };

  function makeGraph(edgeOrder: "asc" | "desc"): Graph {
    const input = {
      caseId: "case-1",
      nodes: [
        { id: E3, entityType: "PERSON", canonicalName: "Carol" },
        { id: E1, entityType: "PERSON", canonicalName: "Alice" },
        { id: E2, entityType: "PERSON", canonicalName: "Bob" },
      ],
      edges:
        edgeOrder === "asc"
          ? [
              {
                id: R1,
                relationType: "communication",
                source: E1,
                target: E2,
                directed: true,
                provenance: { sourceId: "s1" },
                temporalRange: RANGE,
              },
              {
                id: R2,
                relationType: "co-location",
                source: E2,
                target: E3,
                directed: false,
                provenance: { sourceId: "s2" },
              },
            ]
          : [
              {
                id: R2,
                relationType: "co-location",
                source: E3,
                target: E2,
                directed: false,
                provenance: { sourceId: "s2" },
              },
              {
                id: R1,
                relationType: "communication",
                source: E1,
                target: E2,
                directed: true,
                provenance: { sourceId: "s1" },
                temporalRange: RANGE,
              },
            ],
    };
    return buildGraph(input).graph;
  }

  it("normalizes to identical snapshots regardless of input insertion order", () => {
    const g1 = makeGraph("asc");
    const g2 = makeGraph("desc");
    expect(normalizeBuiltGraph(g1, "case-1")).toEqual(normalizeBuiltGraph(g2, "case-1"));
  });

  it("keeps directed endpoints in direction order and sorts undirected endpoints", () => {
    const g = makeGraph("asc");
    const snap = normalizeBuiltGraph(g, "case-1");
    const directed = snap.edges.find((e) => e.directed);
    const undirected = snap.edges.find((e) => !e.directed);
    // Directed edge keeps source→target exactly as authoritative.
    expect(directed!.source).not.toBe(directed!.target);
    // Undirected endpoint pair is lexicalized (source <= target).
    expect(undirected!.source.localeCompare(undirected!.target) <= 0).toBe(true);
  });

  it("carries through temporalRange and relationType", () => {
    const g = makeGraph("asc");
    const snap = normalizeBuiltGraph(g, "case-1");
    expect(snap.edges[0].relationType).toBeTruthy();
    const withRange = snap.edges.find((e) => "temporalRange" in e && e.temporalRange);
    expect(withRange?.temporalRange).toEqual({
      value: "2026-08-01T10:00:00.000Z",
      precision: "exact",
    });
  });
});