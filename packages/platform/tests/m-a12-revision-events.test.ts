import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  decodeChange,
  replayLifecycle,
  replayEntityLifecycle,
  selectEntitiesAtVersion,
  toGraphRevisionMetadata,
  normalizeBuiltGraph,
  GraphProjectionService,
  GraphRevisionCorruptError,
  GRAPH_CHANGE_ACCEPTED,
  GRAPH_CHANGE_REVERSED,
  GRAPH_CHANGE_AMENDED,
  GRAPH_CHANGE_ENTITY_CREATED,
  GRAPH_CHANGE_ENTITY_ARCHIVED,
  type GraphRevisionEvent,
} from "../src/relations/graph-version-service.js";

// ============================================================================
// M-A12 WSHARDEN — structured graph revision events + entity versioning
//
// PURE unit tests (no DB). Covers:
//   - toGraphRevisionMetadata ↔ decodeChange round-trip (item C)
//   - strict decode for entity events + amendment (missing id → corrupt)
//   - replayEntityLifecycle / selectEntitiesAtVersion (item B semantics)
//   - amendment-aware temporalRange as-of a version (item A under projection)
//
// Real-Postgres behavior (unique ACTIVE index, advisory-lock allocation,
// same-tx amendment) is covered by the gated integration suite.
// ============================================================================

const relationVersion = (n: number, change: string, relationId: string) => ({
  versionNumber: n,
  reason: `${change}:${relationId}`,
  metadata: { change, relationId },
});

const entityVersion = (n: number, change: string, entityId: string) => ({
  versionNumber: n,
  reason: `${change}:${entityId}`,
  metadata: { change, entityId },
});

describe("toGraphRevisionMetadata / decodeChange round-trip (item C)", () => {
  it("round-trips all five structured graph events through persisted metadata", () => {
    const events: GraphRevisionEvent[] = [
      { type: GRAPH_CHANGE_ACCEPTED, relationId: randomUUID() },
      { type: GRAPH_CHANGE_REVERSED, relationId: randomUUID() },
      { type: GRAPH_CHANGE_AMENDED, relationId: randomUUID() },
      { type: GRAPH_CHANGE_ENTITY_CREATED, entityId: randomUUID() },
      { type: GRAPH_CHANGE_ENTITY_ARCHIVED, entityId: randomUUID() },
    ];

    for (const event of events) {
      const row = {
        versionNumber: 7,
        reason: `${event.type}:${"relationId" in event ? event.relationId : event.entityId}`,
        metadata: toGraphRevisionMetadata(event),
      };
      const decoded = decodeChange(row);
      expect(decoded).not.toBeNull();
      expect(decoded!.event).toEqual(event);
    }
  });

  it("toGraphRevisionMetadata emits exactly the machine-readable identifier layout", () => {
    const relationId = randomUUID();
    const meta = toGraphRevisionMetadata({ type: GRAPH_CHANGE_ACCEPTED, relationId });
    expect(meta).toEqual({ change: GRAPH_CHANGE_ACCEPTED, relationId });
    expect("entityId" in meta).toBe(false);

    const entityMeta = toGraphRevisionMetadata({
      type: GRAPH_CHANGE_ENTITY_CREATED,
      entityId: randomUUID(),
    });
    expect(entityMeta).toMatchObject({ change: GRAPH_CHANGE_ENTITY_CREATED });
    expect("relationId" in entityMeta).toBe(false);
  });

  it("known structured entity change with a missing entityId → GraphRevisionCorruptError", () => {
    const corrupt = {
      versionNumber: 4,
      reason: null,
      metadata: { change: GRAPH_CHANGE_ENTITY_CREATED },
    };
    expect(() => decodeChange(corrupt)).toThrow(GraphRevisionCorruptError);
  });

  it("structured RELATION_AMENDED with an empty relationId → GraphRevisionCorruptError", () => {
    const corrupt = {
      versionNumber: 5,
      reason: null,
      metadata: { change: GRAPH_CHANGE_AMENDED, relationId: "" },
    };
    expect(() => decodeChange(corrupt)).toThrow(GraphRevisionCorruptError);
  });

  it("unknown structured change + unknown reason prefix remain silently skippable", () => {
    expect(
      decodeChange({
        versionNumber: 2,
        reason: null,
        metadata: { change: "UNRELATED_EVENT" },
      }),
    ).toBeNull();
    expect(
      decodeChange({ versionNumber: 3, reason: "UNKNOWN_CHANGE:xyz", metadata: {} }),
    ).toBeNull();
  });
});

describe("replayEntityLifecycle (item B — entity membership window)", () => {
  it("empty chain → empty lifecycle", () => {
    expect(replayEntityLifecycle([], 5).size).toBe(0);
  });

  it("entity created at v1 is present from v1 (not at v0) and stays present", () => {
    const e1 = randomUUID();
    const chain = [entityVersion(1, GRAPH_CHANGE_ENTITY_CREATED, e1)];
    const at0 = replayEntityLifecycle(chain, 0);
    const at1 = replayEntityLifecycle(chain, 1);
    expect(at0.has(e1)).toBe(false);
    expect(at1.get(e1)).toEqual({ createdAtVersion: 1, archivedAtVersion: null });
  });

  it("an entity archived at v2 closes its membership window at v2", () => {
    const e1 = randomUUID();
    const chain = [
      entityVersion(1, GRAPH_CHANGE_ENTITY_CREATED, e1),
      entityVersion(2, GRAPH_CHANGE_ENTITY_ARCHIVED, e1),
    ];
    const at1 = replayEntityLifecycle(chain, 1);
    const at2 = replayEntityLifecycle(chain, 2);
    expect(at1.get(e1)).toEqual({ createdAtVersion: 1, archivedAtVersion: null });
    expect(at2.get(e1)).toEqual({ createdAtVersion: 1, archivedAtVersion: 2 });
  });

  it("a later ENTITY_CREATED re-opens a closed window (re-materialization legal)", () => {
    const e1 = randomUUID();
    const chain = [
      entityVersion(1, GRAPH_CHANGE_ENTITY_CREATED, e1),
      entityVersion(2, GRAPH_CHANGE_ENTITY_ARCHIVED, e1),
      entityVersion(4, GRAPH_CHANGE_ENTITY_CREATED, e1),
    ];
    const state = replayEntityLifecycle(chain, 4);
    expect(state.get(e1)).toEqual({ createdAtVersion: 4, archivedAtVersion: null });
  });

  it("relation revisions do not disturb entity lifecycle (independent dimensions)", () => {
    const e1 = randomUUID();
    const r1 = randomUUID();
    const chain = [
      entityVersion(1, GRAPH_CHANGE_ENTITY_CREATED, e1),
      relationVersion(2, GRAPH_CHANGE_ACCEPTED, r1),
    ];
    const state = replayEntityLifecycle(chain, 2);
    expect(state.get(e1)).toEqual({ createdAtVersion: 1, archivedAtVersion: null });
    expect(replayLifecycle(chain, 2).get(r1)).toEqual({
      accepted: true,
      reversedAtVersion: null,
    });
  });
});

describe("selectEntitiesAtVersion (item B — graph membership filter)", () => {
  const entities = [
    { id: "e1", entityType: "PERSON", canonicalName: "Alice" },
    { id: "e2", entityType: "PERSON", canonicalName: "Bob" },
    { id: "e3", entityType: "PERSON", canonicalName: "Carol" },
  ];

  it("empty lifecycle → legacy fallback returns the full universe", () => {
    expect(selectEntitiesAtVersion(entities, new Map(), 5)).toEqual(entities);
  });

  it("entities created after the target version are not present", () => {
    const lifecycle = new Map([
      ["e1", { createdAtVersion: 1, archivedAtVersion: null }],
      ["e2", { createdAtVersion: 3, archivedAtVersion: null }],
    ]);
    const at2 = selectEntitiesAtVersion(entities, lifecycle, 2);
    expect(at2.map((e) => e.id)).toEqual(["e1"]);
  });

  it("entities archived at/before the target version are not present", () => {
    const lifecycle = new Map([
      ["e1", { createdAtVersion: 1, archivedAtVersion: null }],
      ["e2", { createdAtVersion: 1, archivedAtVersion: 2 }],
      ["e3", { createdAtVersion: 1, archivedAtVersion: 3 }],
    ]);
    // At version 2: e2 archived at 2 → gone; e3 archived later → still present.
    expect(selectEntitiesAtVersion(entities, lifecycle, 2).map((e) => e.id)).toEqual(["e1", "e3"]);
    // At version 3: e3 archived at 3 → gone.
    expect(selectEntitiesAtVersion(entities, lifecycle, 3).map((e) => e.id)).toEqual(["e1"]);
  });

  it("an entity with no lifecycle entry in a versioned chain is treated as NOT present (fail-closed)", () => {
    const lifecycle = new Map([
      ["e1", { createdAtVersion: 1, archivedAtVersion: null }],
      ["e2", { createdAtVersion: 1, archivedAtVersion: null }],
    ]);
    // 'e3' has no lifecycle entry but sits in the authoritative universe.
    const selected = selectEntitiesAtVersion(entities, lifecycle, 1);
    expect(selected.map((e) => e.id)).toEqual(["e1", "e2"]);
  });
});

// ---------------------------------------------------------------------------
// Projection-level: amendment-aware temporalRange + entity membership (mock stores)
// ---------------------------------------------------------------------------
describe("GraphProjectionService — amendments + entity versioning", () => {
  const caseId = "test-case-amend";
  const investigationId = "inv-amend";

  const e1 = "00000000-0000-4000-8000-000000000011";
  const e2 = "00000000-0000-4000-8000-000000000012";
  const r1 = "10100000-0000-4000-8000-000000000011";

  const JAN10 = {
    validFrom: { value: "2026-01-10T12:00:00.000Z", precision: "exact" as const },
    precision: "exact" as const,
    semantics: "observed" as const,
  };
  const FEB20 = {
    validFrom: { value: "2026-01-10T12:00:00.000Z", precision: "exact" as const },
    validTo: { value: "2026-02-20T18:00:00.000Z", precision: "exact" as const },
    precision: "exact" as const,
    semantics: "inferred" as const,
  };

  function mockVersion(n: number, reason: string) {
    const change = reason.split(":")[0]!;
    const value = reason.split(":")[1] ?? "";
    return {
      id: randomUUID(),
      caseId,
      investigationId,
      versionNumber: n,
      status: "DRAFT",
      parentGraphVersionId: null,
      projectionStatus: "PENDING" as const,
      nodeCount: 0,
      edgeCount: 0,
      checkpointId: null,
      reason,
      metadata:
        change === GRAPH_CHANGE_ENTITY_CREATED || change === GRAPH_CHANGE_ENTITY_ARCHIVED
          ? { change, entityId: value }
          : { change, relationId: value },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  function buildMockStores(
    versionChain: ReturnType<typeof mockVersion>[],
    opts: { temporalAssertions?: unknown[]; entities?: unknown[] } = {},
  ) {
    const mockGraphVersions = {
      findByVersionNumber: vi.fn(async (_c: string, vn: number) =>
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

    const entities = opts.entities ?? [
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
        validityInterval: FEB20,
        hypothesisId: null,
        relationKey: "key",
        temporalAssertions: opts.temporalAssertions ?? [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const mockEntities = {
      listByCase: vi.fn(async () => entities),
    };
    const mockRelations = {
      listByCase: vi.fn(async () => relations),
      listActiveByCase: vi.fn(async () => relations),
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

  it("amendment does not leak into the past: version 1 carries the ORIGINAL interval", async () => {
    const chain = [
      mockVersion(1, `RELATION_ACCEPTED:${r1}`),
      mockVersion(2, `RELATION_AMENDED:${r1}`),
    ];
    const stores = buildMockStores(chain, {
      temporalAssertions: [
        {
          id: `assertion:${r1}:1`,
          relationId: r1,
          kind: "ORIGINAL",
          validityInterval: JAN10,
          revisionAtVersionNumber: 1,
        },
        {
          id: `assertion:${r1}:2`,
          relationId: r1,
          kind: "AMENDMENT",
          validityInterval: FEB20,
          supersedesAssertionId: `assertion:${r1}:1`,
          revisionAtVersionNumber: 2,
        },
      ],
    });
    const svc = new GraphProjectionService(stores);

    // As-of version 1 only the ORIGINAL assertion is known → the edge carries
    // JAN10 (the correction has NOT happened yet at version 1).
    const atV1 = await svc.projectGraphVersion(caseId, { versionNumber: 1 });
    const snap1 = normalizeBuiltGraph(atV1.graph, caseId);
    expect(snap1.edges[0].temporalRange).toEqual(JAN10);

    // As-of version 2 the amendment is known → the edge carries FEB20.
    const atV2 = await svc.projectGraphVersion(caseId, { versionNumber: 2 });
    const snap2 = normalizeBuiltGraph(atV2.graph, caseId);
    expect(snap2.edges[0].temporalRange).toEqual(FEB20);
  });

  it("a relation with no assertions falls back to its persisted validityInterval", async () => {
    const chain = [mockVersion(1, `RELATION_ACCEPTED:${r1}`)];
    const stores = buildMockStores(chain, { temporalAssertions: [] });
    const svc = new GraphProjectionService(stores);

    const built = await svc.projectGraphVersion(caseId, { versionNumber: 1 });
    const snap = normalizeBuiltGraph(built.graph, caseId);
    expect(snap.edges[0].temporalRange).toEqual(FEB20);
  });

  it("entity versioning filters the node universe at a historical version", async () => {
    const chain = [
      mockVersion(1, `ENTITY_CREATED:${e1}`),
      mockVersion(2, `ENTITY_CREATED:${e2}`),
      mockVersion(3, `RELATION_ACCEPTED:${r1}`),
    ];
    const stores = buildMockStores(chain);
    const svc = new GraphProjectionService(stores);

    // At version 1 only e1 exists → single node, no edges (r1 not yet accepted).
    const atV1 = await svc.projectGraphVersion(caseId, { versionNumber: 1 });
    const snap1 = normalizeBuiltGraph(atV1.graph, caseId);
    expect(snap1.nodes.map((n) => n.id)).toEqual([e1]);
    expect(snap1.edges).toHaveLength(0);

    // At version 3 both entities exist and the relation is accepted.
    const atV3 = await svc.projectGraphVersion(caseId, { versionNumber: 3 });
    const snap3 = normalizeBuiltGraph(atV3.graph, caseId);
    expect(snap3.nodes.map((n) => n.id).sort()).toEqual([e1, e2].sort());
    expect(snap3.edges).toHaveLength(1);
  });

  it("an archived entity disappears from the node universe at that version", async () => {
    const chain = [
      mockVersion(1, `ENTITY_CREATED:${e1}`),
      mockVersion(2, `ENTITY_CREATED:${e2}`),
      mockVersion(3, `ENTITY_ARCHIVED:${e2}`),
    ];
    const stores = buildMockStores(chain);
    const svc = new GraphProjectionService(stores);

    const atV3 = await svc.projectGraphVersion(caseId, { versionNumber: 3 });
    const snap = normalizeBuiltGraph(atV3.graph, caseId);
    expect(snap.nodes.map((n) => n.id)).toEqual([e1]);
  });
});