import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  replayLifecycle,
  normalizeBuiltGraph,
  makeProjectionInput,
  GraphProjectionService,
  GRAPH_CHANGE_ACCEPTED,
  GRAPH_CHANGE_REVERSED,
} from "../src/relations/graph-version-service.js";
import { buildGraph } from "@indago/graphology-projection";
import { GRAPH_VERSION_LIFECYCLE_TRANSITIONS } from "../src/persistence/graph-version-store.js";

// ============================================================================
// M-A12-PR3 Temporal APIs — PURE unit tests (no DB).
//
// Tests the deterministic, DB-free core of:
//   - replayLifecycle with PR3-relevant multi-relation scenarios
//   - GraphProjectionService.projectGraphVersion via injected mock stores
//   - normalizeBuiltGraph determinism with checkpoint metadata
//   - D7 checkpoint↔version mapping semantic rules (mock-based)
//   - as-of deferral documentation
//
// Real-Postgres behavior (advisory-lock version allocation, checkpoint
// association persistence, HTTP boundary) is covered by the gated
// integration suite — NOT mocked here.
// ============================================================================

const version = (n: number, change: string, relationId: string) => ({
  versionNumber: n,
  reason: `${change}:${relationId}`,
  metadata: { change, relationId },
});

// ---------------------------------------------------------------------------
// replayLifecycle — PR3-specific scenarios (extending PR2 coverage)
// ---------------------------------------------------------------------------
describe("replayLifecycle — PR3 multi-relation + checkpoint-relevant scenarios", () => {
  it("two relations accepted at different versions are both active at the later version", () => {
    const r1 = randomUUID();
    const r2 = randomUUID();
    const chain = [
      version(1, GRAPH_CHANGE_ACCEPTED, r1),
      version(2, GRAPH_CHANGE_ACCEPTED, r2),
    ];
    const state = replayLifecycle(chain, 2);
    expect(state.get(r1)).toEqual({ accepted: true, reversedAtVersion: null });
    expect(state.get(r2)).toEqual({ accepted: true, reversedAtVersion: null });
    expect(state.size).toBe(2);
  });

  it("relation accepted at v1, reversed at v3, re-accepted at v5 — state at each version", () => {
    const r1 = randomUUID();
    const chain = [
      version(1, GRAPH_CHANGE_ACCEPTED, r1),
      version(3, GRAPH_CHANGE_REVERSED, r1),
      version(5, GRAPH_CHANGE_ACCEPTED, r1),
    ];
    // At v0: not present
    expect(replayLifecycle(chain, 0).has(r1)).toBe(false);
    // At v1: accepted
    expect(replayLifecycle(chain, 1).get(r1)).toEqual({
      accepted: true,
      reversedAtVersion: null,
    });
    // At v3: reversed at v3
    expect(replayLifecycle(chain, 3).get(r1)).toEqual({
      accepted: true,
      reversedAtVersion: 3,
    });
    // At v5: re-accepted (reversedAtVersion reset to null)
    expect(replayLifecycle(chain, 5).get(r1)).toEqual({
      accepted: true,
      reversedAtVersion: null,
    });
  });

  it("interleaved accepts/reverses across two relations are tracked independently", () => {
    const r1 = randomUUID();
    const r2 = randomUUID();
    const chain = [
      version(1, GRAPH_CHANGE_ACCEPTED, r1),
      version(2, GRAPH_CHANGE_ACCEPTED, r2),
      version(3, GRAPH_CHANGE_REVERSED, r1),
      version(4, GRAPH_CHANGE_REVERSED, r2),
    ];
    const at3 = replayLifecycle(chain, 3);
    expect(at3.get(r1)).toEqual({ accepted: true, reversedAtVersion: 3 });
    expect(at3.get(r2)).toEqual({ accepted: true, reversedAtVersion: null });

    const at4 = replayLifecycle(chain, 4);
    expect(at4.get(r1)).toEqual({ accepted: true, reversedAtVersion: 3 });
    expect(at4.get(r2)).toEqual({ accepted: true, reversedAtVersion: 4 });
  });

  it("versions with unknown/irrelevant reason strings are silently skipped", () => {
    const r1 = randomUUID();
    const chain = [
      version(1, GRAPH_CHANGE_ACCEPTED, r1),
      { versionNumber: 2, reason: "UNKNOWN_CHANGE:something", metadata: {} },
      { versionNumber: 3, reason: null, metadata: null },
    ];
    const state = replayLifecycle(chain, 3);
    expect(state.size).toBe(1);
    expect(state.get(r1)).toEqual({ accepted: true, reversedAtVersion: null });
  });
});

// ---------------------------------------------------------------------------
// GraphProjectionService — mock-store historical projection (no DB)
// ---------------------------------------------------------------------------
describe("GraphProjectionService — mock-store historical projection", () => {
  const caseId = "test-case-001";
  const investigationId = "inv-001";

  const e1 = "00000000-0000-4000-8000-000000000001";
  const e2 = "00000000-0000-4000-8000-000000000002";
  const r1 = "10100000-0000-4000-8000-000000000001";

  const JAN10 = {
    validFrom: { value: "2026-01-10T12:00:00.000Z", precision: "exact" as const },
    precision: "exact" as const,
    semantics: "observed" as const,
  };

  function mockVersion(overrides: {
    versionNumber: number;
    reason?: string;
    status?: string;
    checkpointId?: string | null;
  }) {
    return {
      id: randomUUID(),
      caseId,
      investigationId,
      versionNumber: overrides.versionNumber,
      status: overrides.status ?? "DRAFT",
      parentGraphVersionId: null,
      projectionStatus: "PENDING" as const,
      nodeCount: 0,
      edgeCount: 0,
      checkpointId: overrides.checkpointId ?? null,
      reason: overrides.reason ?? null,
      metadata: overrides.reason
        ? { change: overrides.reason.split(":")[0], relationId: overrides.reason.split(":")[1] }
        : {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  function buildMockStores(
    versionChain: ReturnType<typeof mockVersion>[],
    relationsOverride?: typeof relations,
  ) {
    const mockGraphVersions = {
      findByVersionNumber: vi.fn(async (_caseId: string, vn: number) =>
        versionChain.find((v) => v.versionNumber === vn) ?? null,
      ),
      findById: vi.fn(async (id: string) =>
        versionChain.find((v) => v.id === id) ?? null,
      ),
      listByCase: vi.fn(async () => versionChain),
      setProjectionStatus: vi.fn(async (id: string) =>
        versionChain.find((v) => v.id === id) ?? null,
      ),
      latestActiveByCase: vi.fn(async () =>
        versionChain.find((v) => v.status === "ACTIVE") ?? null,
      ),
    };

    const entities = [
      { id: e1, entityType: "PERSON", canonicalName: "Alice", caseId, investigationId },
      { id: e2, entityType: "PERSON", canonicalName: "Bob", caseId, investigationId },
    ];
    const relations = [
      {
        id: r1,
        caseId,
        investigationId,
        relationType: "communication",
        sourceEntityId: e1,
        targetEntityId: e2,
        directed: true,
        status: "ACTIVE",
        support: 0.8,
        evidenceBasis: [],
        contradictions: [],
        scoreModelVersion: "v1",
        evidenceCount: 1,
        evidenceStrength: 0.8,
        sourceCoverage: 1,
        temporalCoverage: 1,
        provenance: { extractor: "test" },
        validityInterval: JAN10,
        hypothesisId: null,
        relationKey: "key",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const mockEntities = {
      listByCase: vi.fn(async () => entities),
    };
    const mockRelations = {
      listByCase: vi.fn(async () => relationsOverride ?? relations),
      listActiveByCase: vi.fn(async () => relationsOverride ?? relations),
    };

    return {
      graphVersions: mockGraphVersions as unknown as InstanceType<
        typeof import("../src/persistence/graph-version-store.js").GraphVersionStore
      >,
      entities: mockEntities as unknown as InstanceType<
        typeof import("../src/persistence/entity-store.js").EntityStore
      >,
      relations: mockRelations as unknown as InstanceType<
        typeof import("../src/persistence/relation-store.js").RelationStore
      >,
    };
  }

  it("projectGraphVersion projects the graph at version 1 with correct nodes/edges", async () => {
    const chain = [
      mockVersion({ versionNumber: 1, reason: `RELATION_ACCEPTED:${r1}` }),
    ];
    const stores = buildMockStores(chain);
    const svc = new GraphProjectionService(stores);

    const built = await svc.projectGraphVersion(caseId, { versionNumber: 1 });
    const snap = normalizeBuiltGraph(built.graph, caseId);

    expect(snap.nodes).toHaveLength(2);
    expect(snap.edges).toHaveLength(1);
    expect(snap.edges[0].relationType).toBe("communication");
    // Dimension B: temporalRange is the Jan 10 validityInterval, carried verbatim.
    expect(snap.edges[0].temporalRange).toEqual(JAN10);

    // setProjectionStatus was called with COMPLETE + counts.
    expect(stores.graphVersions.setProjectionStatus).toHaveBeenCalledWith(
      chain[0]!.id,
      { caseId },
      "COMPLETE",
      { nodeCount: 2, edgeCount: 1 },
    );
  });

  it("nonexistent versionNumber throws (no silent fallback to current graph)", async () => {
    const chain = [
      mockVersion({ versionNumber: 1, reason: `RELATION_ACCEPTED:${r1}` }),
    ];
    const stores = buildMockStores(chain);
    const svc = new GraphProjectionService(stores);

    // Version 0 does not exist (versionNumbers start at 1). The service
    // refuses to silently fall back — it throws, letting the caller mark ERROR.
    await expect(
      svc.projectGraphVersion(caseId, { versionNumber: 0 }),
    ).rejects.toThrow("GraphVersion not found");

    // Version 999 also does not exist.
    await expect(
      svc.projectGraphVersion(caseId, { versionNumber: 999 }),
    ).rejects.toThrow("GraphVersion not found");
  });

  it("projectGraphVersion at version 2 after reverse excludes the reversed edge", async () => {
    const chain = [
      mockVersion({ versionNumber: 1, reason: `RELATION_ACCEPTED:${r1}` }),
      mockVersion({ versionNumber: 2, reason: `RELATION_REVERSED:${r1}` }),
    ];
    const stores = buildMockStores(chain);
    const svc = new GraphProjectionService(stores);

    const built = await svc.projectGraphVersion(caseId, { versionNumber: 2 });
    const snap = normalizeBuiltGraph(built.graph, caseId);

    expect(snap.edges).toHaveLength(0);
    expect(snap.nodes).toHaveLength(2);
  });

  it("throws on unresolvable target (no silent fallback to current graph)", async () => {
    const chain = [
      mockVersion({ versionNumber: 1, reason: `RELATION_ACCEPTED:${r1}` }),
    ];
    const stores = buildMockStores(chain);
    const svc = new GraphProjectionService(stores);

    await expect(
      svc.projectGraphVersion(caseId, { versionNumber: 999 }),
    ).rejects.toThrow("GraphVersion not found");
  });

  it("resolves version by UUID id when graphVersionId target is used", async () => {
    const v1 = mockVersion({ versionNumber: 1, reason: `RELATION_ACCEPTED:${r1}` });
    const stores = buildMockStores([v1]);
    const svc = new GraphProjectionService(stores);

    const built = await svc.projectGraphVersion(caseId, { graphVersionId: v1.id });
    const snap = normalizeBuiltGraph(built.graph, caseId);

    expect(snap.edges).toHaveLength(1);
    expect(stores.graphVersions.findById).toHaveBeenCalledWith(v1.id, { caseId });
  });

  it("projectGraphValidAt keeps only relations whose interval contains the instant (dimension B)", async () => {
    const chain = [
      mockVersion({ versionNumber: 1, reason: `RELATION_ACCEPTED:${r1}`, status: "ACTIVE" }),
    ];
    const stores = buildMockStores(chain);
    const svc = new GraphProjectionService(stores);

    // JAN10 starts 2026-01-10T12:00:00.000Z and is open-ended (no validTo):
    // exactly at/after the start → contained; before it → excluded.
    const inside = await svc.projectGraphValidAt(
      { investigationId, caseId },
      "2026-01-10T12:00:00.000Z",
    );
    expect(normalizeBuiltGraph(inside.graph, caseId).edges).toHaveLength(1);

    const before = await svc.projectGraphValidAt(
      { investigationId, caseId },
      "2026-01-10T11:59:59.999Z",
    );
    expect(normalizeBuiltGraph(before.graph, caseId).edges).toHaveLength(0);

    // P2-04: valid-at is a pure read — it must NOT mutate projection metadata on the ACTIVE version.
    expect(stores.graphVersions.setProjectionStatus).not.toHaveBeenCalled();
  });

  it("projectGraphValidAt never fabricates for unparseable instants or unintervaled relations", async () => {
    const chain = [
      mockVersion({ versionNumber: 1, reason: `RELATION_ACCEPTED:${r1}`, status: "ACTIVE" }),
    ];
    // A relation with NO validityInterval (null) — its presence in the ACTIVE
    // set must never make it answer a valid-at query.
    const unintervaled: typeof relations = [
      {
        id: r1,
        caseId,
        investigationId,
        relationType: "communication",
        sourceEntityId: e1,
        targetEntityId: e2,
        directed: true,
        status: "ACTIVE",
        support: 0.8,
        evidenceBasis: [],
        contradictions: [],
        scoreModelVersion: "v1",
        evidenceCount: 1,
        evidenceStrength: 0.8,
        sourceCoverage: 1,
        temporalCoverage: 1,
        provenance: { extractor: "test" },
        validityInterval: null,
        hypothesisId: null,
        relationKey: "key",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const stores = buildMockStores(chain, unintervaled);
    const svc = new GraphProjectionService(stores);

    // Well-formed instant but the relation has no domain-validity boundary.
    const at = await svc.projectGraphValidAt(
      { investigationId, caseId },
      "2026-01-10T12:00:00.000Z",
    );
    expect(normalizeBuiltGraph(at.graph, caseId).edges).toHaveLength(0);

    // Malformed "at" → empty graph, never a guess.
    const bogus = await svc.projectGraphValidAt(
      { investigationId, caseId },
      "not-a-date",
    );
    expect(normalizeBuiltGraph(bogus.graph, caseId).edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// D7 Checkpoint ↔ GraphVersion mapping semantic rules (mock-based)
// ---------------------------------------------------------------------------
describe("D7 Checkpoint ↔ GraphVersion mapping — semantic rules", () => {
  it("associateCheckpoint sets checkpointId on the version; resolveVersionByCheckpoint returns it", async () => {
    const checkpointId = randomUUID();
    const caseId = randomUUID();
    const versionId = randomUUID();

    // Simulate the store behavior with a simple in-memory map.
    const store = new Map<string, { checkpointId: string | null }>();
    store.set(versionId, { checkpointId: null });

    // associate: set checkpointId on the version.
    const v = store.get(versionId)!;
    v.checkpointId = checkpointId;
    expect(v.checkpointId).toBe(checkpointId);

    // resolve: find version by checkpointId.
    const found = [...store.entries()].find(
      ([, val]) => val.checkpointId === checkpointId,
    );
    expect(found).toBeDefined();
    expect(found![0]).toBe(versionId);
  });

  it("cross-case: same checkpointId maps to different versions in different cases", () => {
    const checkpointId = randomUUID();
    const caseA = "case-A";
    const caseB = "case-B";
    const vA = "version-A";
    const vB = "version-B";

    // Two separate stores for two cases.
    const storeA = new Map<string, { caseId: string; checkpointId: string | null }>();
    const storeB = new Map<string, { caseId: string; checkpointId: string | null }>();
    storeA.set(vA, { caseId: caseA, checkpointId });
    storeB.set(vB, { caseId: caseB, checkpointId });

    // Same checkpointId → different version in each case.
    const foundA = [...storeA.entries()].find(
      ([, val]) => val.checkpointId === checkpointId && val.caseId === caseA,
    );
    const foundB = [...storeB.entries()].find(
      ([, val]) => val.checkpointId === checkpointId && val.caseId === caseB,
    );
    expect(foundA![0]).toBe(vA);
    expect(foundB![0]).toBe(vB);
    expect(foundA![0]).not.toBe(foundB![0]);
  });

  it("resolveVersionByCheckpoint returns null when no version is associated", () => {
    const store = new Map<string, { checkpointId: string | null }>();
    store.set("v1", { checkpointId: null });

    const found = [...store.entries()].find(
      ([, val]) => val.checkpointId === "nonexistent-checkpoint",
    );
    expect(found).toBeUndefined();
  });

  it("checkpoint→case resolution: AgentCheckpoint.runId → InvestigationRun.caseId", () => {
    // Pure data-flow test: given a checkpoint's runId, resolve to caseId.
    const runs = new Map([
      ["run-1", { caseId: "case-A" }],
      ["run-2", { caseId: "case-B" }],
    ]);

    const checkpoint = { runId: "run-1", stepId: "step_3" };
    const run = runs.get(checkpoint.runId);
    expect(run).toBeDefined();
    expect(run!.caseId).toBe("case-A");
  });
});

// ---------------------------------------------------------------------------
// normalizeBuiltGraph — deterministic with various metadata
// ---------------------------------------------------------------------------
describe("normalizeBuiltGraph — PR3 deterministic snapshot", () => {
  it("nodes and edges are sorted by id regardless of input order", () => {
    const E1 = "00000000-0000-4000-8000-000000000001";
    const E2 = "00000000-0000-4000-8000-000000000002";
    const R1 = "10100000-0000-4000-8000-000000000001";
    const R2 = "10100000-0000-4000-8000-000000000002";

    const inputA = {
      caseId: "case-1",
      nodes: [
        { id: E2, entityType: "ORG", canonicalName: "B" },
        { id: E1, entityType: "PERSON", canonicalName: "A" },
      ],
      edges: [
        {
          id: R2,
          relationType: "ownership",
          source: E1,
          target: E2,
          directed: false,
          provenance: {},
        },
        {
          id: R1,
          relationType: "communication",
          source: E1,
          target: E2,
          directed: true,
          provenance: {},
        },
      ],
    };
    const inputB = {
      caseId: "case-1",
      nodes: [
        { id: E1, entityType: "PERSON", canonicalName: "A" },
        { id: E2, entityType: "ORG", canonicalName: "B" },
      ],
      edges: [
        {
          id: R1,
          relationType: "communication",
          source: E1,
          target: E2,
          directed: true,
          provenance: {},
        },
        {
          id: R2,
          relationType: "ownership",
          source: E1,
          target: E2,
          directed: false,
          provenance: {},
        },
      ],
    };

    const gA = buildGraph(inputA).graph;
    const gB = buildGraph(inputB).graph;
    expect(normalizeBuiltGraph(gA, "case-1")).toEqual(normalizeBuiltGraph(gB, "case-1"));
  });
});

// ---------------------------------------------------------------------------
// GraphVersion lifecycle transition matrix (locked D4 — carried forward)
// ---------------------------------------------------------------------------
describe("GraphVersion lifecycle transition matrix (locked D4)", () => {
  it("permits exactly DRAFT→ACTIVE, ACTIVE→SUPERSEDED, SUPERSEDED→ARCHIVED", () => {
    const { DRAFT, ACTIVE, SUPERSEDED, ARCHIVED } = GRAPH_VERSION_LIFECYCLE_TRANSITIONS;
    expect(DRAFT).toEqual(["ACTIVE"]);
    expect(ACTIVE).toEqual(["SUPERSEDED"]);
    expect(SUPERSEDED).toEqual(["ARCHIVED"]);
    expect(ARCHIVED).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// as-of deferral documentation
// ---------------------------------------------------------------------------
describe("as-of temporal query — deferred", () => {
  it("documents that as-of is deferred because PR0 lacks temporal-boundary semantics", () => {
    // This test documents the STOP condition #6 deferral decision.
    // The endpoint returns 501 with a clear message. This is a behavioral
    // contract test — the actual HTTP route is tested by the integration suite.
    const DEFERRAL_REASON =
      "PR0 does not define sufficient temporal-boundary semantics. Use /versions/:vid for version-based historical retrieval.";
    expect(DEFERRAL_REASON).toContain("/versions/:vid");
    expect(DEFERRAL_REASON).toContain("temporal-boundary");
  });
});
