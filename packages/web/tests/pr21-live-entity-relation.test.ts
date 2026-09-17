// ============================================================================
// PR-21 — LIVE entity + relation + entity-hypothesis integration reads and
// authority mutations against mocked platform routes.
//
// These tests exercise the real LiveEntityProvider / LiveRelationProvider
// classes (in bundle form via createLiveWorkspaceProviders) through
// lib/api/server.ts platformFetch — the same boundary production uses.
// globalThis.fetch is stubbed with the documented wire shapes and pins the
// honest projection behavior:
//   - entity list DTO → canonical Entity (investigationId backfill,
//     evidenceIds/roleHypothesisIds present-but-empty by documented platform
//     model absence, timestamps as ObservedTime exact);
//   - entity-hypotheses are ALREADY canonical at the boundary and pass through;
//   - entity accept maps the M-A09.5 materialization result;
//   - relation-hypothesis DTO → canonical RelationHypothesis (validityInterval
//     → temporalInterval, strength omitted as relationship-quality-not-structural);
//   - get() resolves direct hypothesis ids AND graph-edge canonical relation ids
//     through the canonical reverse-lookup;
//   - accept/reject/reverse POST then RE-READ so returned statuses always
//     reflect the durable platform state; illegal transitions surface the
//     platform's refusal (409);
//   - persisted values violating the canonical shape throw typed VALIDATION,
//     never silent normalization.
// ============================================================================

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createLiveWorkspaceProviders } from "@/lib/providers/live/providers";
import type { WorkspaceIdentity } from "@/lib/providers/types";

const BASE = "https://api.test";
const CASE_ID = "11111111-1111-4111-8111-111111111111";
const INVESTIGATION_ID = "22222222-2222-4222-8222-222222222222";
const SRC_1 = "99999999-9999-4999-8999-999999999991";
const OBS_1 = "99999999-9999-4999-8999-999999999992";
const OBS_2 = "99999999-9999-4999-8999-999999999993";
const ENTITY_1 = "55555555-5555-4555-8555-555555555551";
const ENTITY_2 = "66666666-6666-4666-8666-666666666661";
const RH_1 = "77777777-7777-4777-8777-777777777771";
const RH_2 = "77777777-7777-4777-8777-777777777772";
const CANONICAL_1 = "88888888-8888-4888-8888-888888888881";
const EH_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PAIR_1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EMC_1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EMC_2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function identity(): WorkspaceIdentity {
  return {
    workspaceId: `workspace:${INVESTIGATION_ID}`,
    caseId: CASE_ID,
    investigationId: INVESTIGATION_ID,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

type RouteResult = { status: number; body: unknown } | null;

function stubRoutes(
  handlers: Array<(url: URL, init?: RequestInit) => RouteResult>,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      for (const handler of handlers) {
        const result = handler(url, init);
        if (result) return jsonResponse(result.body, result.status);
      }
      return jsonResponse({ error: "not-mocked" }, 500);
    }),
  );
}

function on(method: string, path: string, respond: (url?: URL, init?: RequestInit) => RouteResult) {
  return (url: URL, init?: RequestInit): RouteResult => {
    const actualMethod = (init?.method ?? "GET").toUpperCase();
    if (actualMethod !== method || !url.pathname.startsWith(path)) return null;
    return respond(url, init);
  };
}

function entityDto(id: string, canonicalName: string): Record<string, unknown> {
  return {
    id,
    caseId: CASE_ID,
    investigationId: null,
    canonicalName,
    entityType: "ORGANIZATION",
    status: "ACTIVE",
    observationIds: [OBS_1],
    hypothesisIds: [],
    sourceIdentifiers: [{ sourceId: SRC_1, identifier: "reg-882" }],
    provenance: { sourceId: SRC_1, extractor: "ingest-v1" },
    metadata: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
  };
}

function entityHypothesisFixture(): Record<string, unknown> {
  return {
    id: EH_1,
    caseId: CASE_ID,
    investigationId: INVESTIGATION_ID,
    candidatePairId: PAIR_1,
    supportingCandidateIds: [EMC_1, EMC_2],
    comparisonStatus: "RESOLVED_MATCH",
    score: 0.86,
    scoreModelVersion: "ma09-v1",
    supportingObservationIds: [OBS_1],
    contradictingObservationIds: [],
    status: "PROPOSED",
    provenance: { sourceId: SRC_1, extractor: "er-ingest-v1" },
    createdAt: { value: "2026-08-01T00:00:00.000Z", precision: "exact" },
    updatedAt: { value: "2026-08-02T00:00:00.000Z", precision: "exact" },
  };
}

function relationDto(
  id: string,
  status: string,
  validity: unknown = {
    validFrom: { value: "2026-01-01T00:00:00.000Z", precision: "exact" },
    precision: "exact",
    semantics: "inferred",
  },
): Record<string, unknown> {
  return {
    id,
    caseId: CASE_ID,
    investigationId: null,
    sourceEntityId: ENTITY_1,
    targetEntityId: ENTITY_2,
    relationType: "financial",
    support: 0.78,
    evidenceBasis: [OBS_1],
    contradictions: [OBS_2],
    status,
    scoreModelVersion: "ma10-v1",
    evidenceCount: 2,
    evidenceStrength: 0.82,
    sourceCoverage: 1,
    temporalCoverage: 1,
    directed: true,
    provenance: { sourceId: SRC_1, extractor: "rel-ingest-v1" },
    metadata: null,
    validityInterval: validity,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
  };
}

function canonicalRelationDto(
  id: string,
  hypothesisId: string,
): Record<string, unknown> {
  return {
    id,
    caseId: CASE_ID,
    investigationId: null,
    sourceEntityId: ENTITY_1,
    targetEntityId: ENTITY_2,
    relationType: "financial",
    directed: true,
    support: 0.78,
    evidenceBasis: [OBS_1],
    contradictions: [],
    status: "ACTIVE",
    scoreModelVersion: "ma10-v1",
    evidenceCount: 1,
    provenance: { sourceId: SRC_1, extractor: "rel-authority-v1" },
    hypothesisId,
    validityInterval: null,
    temporalAssertions: [],
    createdAt: "2026-08-03T00:00:00.000Z",
    reversedAt: null,
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = BASE;
  process.env.AUTH_TOKEN = "test-token";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_API_URL;
  delete process.env.AUTH_TOKEN;
});

describe("PR-21 — LiveEntityProvider (M-A09 reads)", () => {
  it("lists canonical entities, projecting the honest wire differences", async () => {
    const dto = entityDto(ENTITY_1, "Alpha Corp");
    stubRoutes([
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/entities`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          entityCount: 1,
          mentionCount: 3,
          entities: [dto],
        },
      })),
    ]);

    const providers = createLiveWorkspaceProviders(identity(), { simulateLatency: false });
    const page = await providers.entities.listByInvestigation(INVESTIGATION_ID);

    expect(page.totalItems).toBe(1);
    const entity = page.items[0];
    expect(entity.id).toBe(ENTITY_1);
    // investigationId backfilled from the workspace identity (nullable on wire).
    expect(entity.investigationId).toBe(INVESTIGATION_ID);
    expect(entity.canonicalName).toBe("Alpha Corp");
    // Documented platform absence — schema-valid EMPTY equivalents, not fabricated.
    expect(entity.evidenceIds).toEqual([]);
    expect(entity.roleHypothesisIds).toEqual([]);
    expect(entity.observationIds).toEqual([OBS_1]);
    expect(entity.sourceIdentifiers).toEqual([
      { sourceId: SRC_1, identifier: "reg-882" },
    ]);
    expect(entity.createdAt).toEqual({
      value: "2026-08-01T00:00:00.000Z",
      precision: "exact",
    });
    expect(entity.updatedAt).toEqual({
      value: "2026-08-02T00:00:00.000Z",
      precision: "exact",
    });
    // The canonical Entity carries no provenance field — the durable row's
    // provenance is honestly dropped at this boundary.
    expect("provenance" in entity).toBe(false);
  });

  it("get() resolves an id against the case-scoped entity list and rejects absent ids with NOT_FOUND", async () => {
    stubRoutes([
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/entities`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          entityCount: 1,
          mentionCount: 3,
          entities: [entityDto(ENTITY_1, "Alpha Corp")],
        },
      })),
    ]);

    const providers = createLiveWorkspaceProviders(identity(), { simulateLatency: false });
    const entity = await providers.entities.get(ENTITY_1);
    expect(entity.id).toBe(ENTITY_1);

    await expect(providers.entities.get("99999999-9999-4999-8999-999999999999"))
      .rejects.toMatchObject({ code: "NOT_FOUND", category: "NOT_FOUND" });
  });

  it("listEntityHypotheses passes through the already-canonical M-A09 universe", async () => {
    const hypothesis = entityHypothesisFixture();
    stubRoutes([
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/entity-hypotheses`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          count: 1,
          hypotheses: [hypothesis],
        },
      })),
    ]);

    const providers = createLiveWorkspaceProviders(identity(), { simulateLatency: false });
    const page = await providers.entities.listEntityHypotheses!(INVESTIGATION_ID);
    expect(page.totalItems).toBe(1);
    expect(page.items[0].id).toBe(EH_1);
    expect(page.items[0].status).toBe("PROPOSED");
    expect(page.items[0].score).toBe(0.86);
  });

  it("acceptEntityHypothesis maps the M-A09.5 materialization result", async () => {
    stubRoutes([
      on(
        "POST",
        `/api/v1/investigations/${INVESTIGATION_ID}/entity-hypotheses/${EH_1}/accept`,
        () => ({
          status: 200,
          body: {
            entityId: ENTITY_1,
            hypothesisId: EH_1,
            status: "ACCEPTED",
            materialized: true,
            reusedExisting: false,
          },
        }),
      ),
    ]);

    const providers = createLiveWorkspaceProviders(identity(), { simulateLatency: false });
    const result = await providers.entities.acceptEntityHypothesis!(
      INVESTIGATION_ID,
      EH_1,
    );
    expect(result).toEqual({
      entityId: ENTITY_1,
      hypothesisId: EH_1,
      status: "ACCEPTED",
      materialized: true,
      reusedExisting: false,
    });
  });

  it("a persisted entity that violates the canonical shape throws typed VALIDATION", async () => {
    const bad = { ...entityDto(ENTITY_1, "Alpha Corp"), status: "BOGUS" };
    stubRoutes([
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/entities`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          entityCount: 1,
          mentionCount: 1,
          entities: [bad],
        },
      })),
    ]);

    const providers = createLiveWorkspaceProviders(identity(), { simulateLatency: false });
    await expect(providers.entities.listByInvestigation(INVESTIGATION_ID))
      .rejects.toMatchObject({ code: "VALIDATION", category: "VALIDATION" });
  });
});

describe("PR-21 — LiveRelationProvider (M-A10 reads + authority)", () => {
  it("lists relation hypotheses, projecting validityInterval → temporalInterval and omitting strength", async () => {
    const dto = relationDto(RH_1, "PROPOSED");
    stubRoutes([
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/relations`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          count: 1,
          relations: [dto],
        },
      })),
    ]);

    const providers = createLiveWorkspaceProviders(identity(), { simulateLatency: false });
    const page = await providers.relations.listByInvestigation(INVESTIGATION_ID);
    expect(page.totalItems).toBe(1);
    const relation = page.items[0];
    expect(relation.id).toBe(RH_1);
    expect(relation.sourceEntityId).toBe(ENTITY_1);
    expect(relation.targetEntityId).toBe(ENTITY_2);
    expect(relation.relationType).toBe("financial");
    expect(relation.status).toBe("PROPOSED");
    // validityInterval column → canonical temporalInterval.
    expect(relation.temporalInterval).toEqual({
      validFrom: { value: "2026-01-01T00:00:00.000Z", precision: "exact" },
      precision: "exact",
      semantics: "inferred",
    });
    // strength is structural (graph-theoretic), NOT the platform's
    // evidenceStrength (relationship quality) — it is honestly omitted.
    expect("strength" in relation).toBe(false);
    expect(relation.contradictions).toEqual([OBS_2]);
  });

  it("a relation with a null validityInterval projects an absent temporalInterval", async () => {
    const dto = relationDto(RH_1, "PROPOSED", null);
    stubRoutes([
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/relations`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          count: 1,
          relations: [dto],
        },
      })),
    ]);

    const providers = createLiveWorkspaceProviders(identity(), { simulateLatency: false });
    const page = await providers.relations.listByInvestigation(INVESTIGATION_ID);
    expect(page.items[0].temporalInterval).toBeUndefined();
  });

  it("get() resolves a direct hypothesis id and rejects an unknown id with NOT_FOUND", async () => {
    stubRoutes([
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/relations`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          count: 1,
          relations: [relationDto(RH_1, "PROPOSED")],
        },
      })),
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/canonical-relations`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          count: 0,
          relations: [],
        },
      })),
    ]);

    const providers = createLiveWorkspaceProviders(identity(), { simulateLatency: false });
    const relation = await providers.relations.get(RH_1);
    expect(relation.id).toBe(RH_1);

    await expect(providers.relations.get("99999999-9999-4999-8999-999999999999"))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("get() reverses graph-edge canonical relation ids through the canonical list", async () => {
    stubRoutes([
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/relations`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          count: 1,
          relations: [relationDto(RH_1, "ACCEPTED")],
        },
      })),
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/canonical-relations`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          count: 1,
          relations: [canonicalRelationDto(CANONICAL_1, RH_1)],
        },
      })),
    ]);

    const providers = createLiveWorkspaceProviders(identity(), { simulateLatency: false });
    const relation = await providers.relations.get(CANONICAL_1);
    expect(relation.id).toBe(RH_1);
    expect(relation.status).toBe("ACCEPTED");
  });

  it("accept POSTs then RE-READS so the returned hypothesis reflects the durable ACCEPTED state", async () => {
    const mutable = [relationDto(RH_1, "PROPOSED")];
    stubRoutes([
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/relations`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          count: mutable.length,
          relations: mutable,
        },
      })),
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/canonical-relations`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          count: 0,
          relations: [],
        },
      })),
      on(
        "POST",
        `/api/v1/investigations/${INVESTIGATION_ID}/relation-hypotheses/${RH_1}/accept`,
        () => {
          mutable[0] = { ...mutable[0], status: "ACCEPTED" };
          return {
            status: 200,
            body: {
              relationId: CANONICAL_1,
              hypothesisId: RH_1,
              status: "ACCEPTED",
              materialized: true,
              reusedExisting: false,
            },
          };
        },
      ),
    ]);

    const providers = createLiveWorkspaceProviders(identity(), { simulateLatency: false });
    const accepted = await providers.relations.accept(INVESTIGATION_ID, RH_1);
    expect(accepted.status).toBe("ACCEPTED");
  });

  it("reject POSTs, RE-READS and surfaces a platform refusal (409) verbatim", async () => {
    const mutable = [relationDto(RH_1, "PROPOSED")];
    stubRoutes([
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/relations`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          count: mutable.length,
          relations: mutable,
        },
      })),
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/canonical-relations`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          count: 0,
          relations: [],
        },
      })),
      on(
        "POST",
        `/api/v1/investigations/${INVESTIGATION_ID}/relation-hypotheses/${RH_2}/reject`,
        () => ({
          status: 409,
          body: { error: "Relation hypothesis cannot be rejected" },
        }),
      ),
    ]);

    const providers = createLiveWorkspaceProviders(identity(), { simulateLatency: false });
    await expect(providers.relations.reject(INVESTIGATION_ID, RH_2))
      .rejects.toMatchObject({ code: "CANCELLED", category: "CONFLICT" });
  });

  it("reverse POSTs and RE-READS so the returned hypothesis reflects the durable REVERSED state", async () => {
    const mutable = [relationDto(RH_1, "ACCEPTED")];
    const canonicalMutable = [canonicalRelationDto(CANONICAL_1, RH_1)];
    stubRoutes([
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/relations`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          count: mutable.length,
          relations: mutable,
        },
      })),
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/canonical-relations`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          count: canonicalMutable.length,
          relations: canonicalMutable,
        },
      })),
      on(
        "POST",
        `/api/v1/investigations/${INVESTIGATION_ID}/relation-hypotheses/${RH_1}/reverse`,
        () => {
          mutable[0] = { ...mutable[0], status: "REVERSED" };
          canonicalMutable.length = 0;
          return {
            status: 200,
            body: { status: "REVERSED", hypothesisId: RH_1 },
          };
        },
      ),
    ]);

    const providers = createLiveWorkspaceProviders(identity(), { simulateLatency: false });
    const reversed = await providers.relations.reverse(INVESTIGATION_ID, RH_1);
    expect(reversed.status).toBe("REVERSED");
  });

  it("listCanonical surfaces the materialized ACTIVE canonical relations", async () => {
    stubRoutes([
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/canonical-relations`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          count: 1,
          relations: [canonicalRelationDto(CANONICAL_1, RH_1)],
        },
      })),
    ]);

    const providers = createLiveWorkspaceProviders(identity(), { simulateLatency: false });
    const page = await providers.relations.listCanonical!(INVESTIGATION_ID);
    expect(page.totalItems).toBe(1);
    expect(page.items[0].id).toBe(CANONICAL_1);
    expect(page.items[0].status).toBe("ACTIVE");
    expect(page.items[0].hypothesisId).toBe(RH_1);
  });
});