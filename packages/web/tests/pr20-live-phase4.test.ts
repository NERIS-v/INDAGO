// ============================================================================
// F-PR20 Phase 4 — LIVE provider integration (graph projection, leads, run
// control, review checkpoint) against mocked platform routes.
//
// These tests exercise the real LiveGraphProvider / LiveLeadProvider /
// LiveInvestigationProvider classes through lib/api/server.ts platformFetch —
// the same boundary production uses. globalThis.fetch is stubbed with a small
// URL router returning the documented wire shapes. They pin the honest
// projection behavior:
//   - graph: two-step latest-version resolution, PROJECTION-neutral defaults,
//     typed UNSUPPORTED when the platform has no recorded version;
//   - leads: DurableLead DTO → canonical Lead (investigationId backfill,
//     timestamps as ObservedTime exact, opaquely-stored blobs preserved);
//   - run control: pause requires a reason before any HTTP call, resume and
//     review resolution POST correctly, and getReviewCheckpoint is null
//     UNLESS the run is state REVIEW_REQUIRED.
// ============================================================================

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  LiveGraphProvider,
  LiveInvestigationProvider,
  LiveLeadProvider,
} from "@/lib/providers/live/providers";
import { ProviderError } from "@/lib/providers/types";

const BASE = "https://api.test";
const CASE_ID = "11111111-1111-4111-8111-111111111111";
const INVESTIGATION_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_1 = "33333333-3333-4333-8333-333333333333";
const VERSION_2 = "44444444-4444-4444-8444-444444444444";
const ENTITY_1 = "55555555-5555-4555-8555-555555555555";
const ENTITY_2 = "66666666-6666-4666-8666-666666666666";
const EDGE_1 = "77777777-7777-4777-8777-777777777777";
const RUN_ID = "88888888-8888-4888-8888-888888888888";

type Handler = (
  url: URL,
  init?: RequestInit,
) => { status: number; body: unknown };

function versionItem(id: string, versionNumber: number) {
  return {
    id,
    caseId: CASE_ID,
    versionNumber,
    status: "ACTIVE",
    projectionStatus: "COMPLETE",
    parentGraphVersionId: null,
    checkpointId: null,
    nodeCount: 2,
    edgeCount: 1,
    reason: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function stubRoutes(handlers: Array<(url: URL, init?: RequestInit) => { status: number; body: unknown } | null>) {
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

/** Handlers that match a path prefix regardless of query string. */
function on(method: string, path: string, respond: Handler): Handler {
  return (url, init) => {
    const actualMethod = (init?.method ?? "GET").toUpperCase();
    if (actualMethod !== method || !url.pathname.startsWith(path)) return null;
    return respond(url, init);
  };
}

function runSnapshot(state: string): {
  body: unknown;
  state: string;
} {
  return {
    body: {
      run: {
        id: RUN_ID,
        investigationId: INVESTIGATION_ID,
        caseId: CASE_ID,
        status: "ACTIVE",
        state,
        currentStage: "ANALYSIS",
      },
    },
    state,
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

// ---------------------------------------------------------------------------
// LiveGraphProvider — version resolution + projection neutrality
// ---------------------------------------------------------------------------

describe("LiveGraphProvider (Phase 4 graph projection)", () => {
  function versionsHandler(versions: ReturnType<typeof versionItem>[], total: number): Handler {
    return (url) => {
      const offset = Number(url.searchParams.get("offset") ?? 0);
      return {
        status: 200,
        body: {
          caseId: CASE_ID,
          total,
          offset,
          limit: 1,
          count: versions.length,
          versions,
        },
      };
    };
  }

  it("getVersion resolves the LATEST version via the deterministic offset page", async () => {
    const probe = vi.fn();
    const latest = vi.fn();
    stubRoutes([
      on("GET", `/api/v1/cases/${CASE_ID}/graph/versions`, (url) => {
        // First probe carries no offset → oldest slice; second page carries
        // offset = total-1 → the newest version.
        if (url.searchParams.get("offset") === null) {
          probe();
          return { status: 200, body: {
            caseId: CASE_ID, total: 2, offset: 0, limit: 1, count: 1,
            versions: [versionItem(VERSION_1, 1)],
          } };
        }
        latest();
        return { status: 200, body: {
          caseId: CASE_ID, total: 2, offset: 1, limit: 1, count: 1,
          versions: [versionItem(VERSION_2, 2)],
        } };
      }),
    ]);

    const provider = new LiveGraphProvider(CASE_ID);
    const version = await provider.getVersion(INVESTIGATION_ID);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(latest).toHaveBeenCalledTimes(1);
    expect(version.id).toBe(VERSION_2);
    expect(version.versionNumber).toBe(2);
    expect(version.investigationId).toBe(INVESTIGATION_ID);
    expect(version.status).toBe("ACTIVE");
    expect(version.projectionStatus).toBe("COMPLETE");
    expect(version.createdAt).toEqual({ value: "2026-08-01T00:00:00.000Z", precision: "exact" });
  });

  it("getNodes projects every node as an ENTITY node with neutral PROJECTION defaults", async () => {
    stubRoutes([
      on("GET", `/api/v1/cases/${CASE_ID}/graph/versions`, versionsHandler([versionItem(VERSION_2, 2)], 1)),
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/graph`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          nodeCount: 2,
          edgeCount: 1,
          graph: {
            nodes: [
              { id: ENTITY_1, canonicalName: "Acme Holdings", temporalRange: null },
              { id: ENTITY_2, canonicalName: "Northwind Traders", temporalRange: null },
            ],
            edges: [
              {
                id: EDGE_1,
                source: ENTITY_1,
                target: ENTITY_2,
                relationType: "ownership",
                directed: true,
                temporalRange: null,
              },
            ],
          },
        },
      })),
    ]);

    const provider = new LiveGraphProvider(CASE_ID);
    const { items } = await provider.getNodes(INVESTIGATION_ID);

    expect(items).toHaveLength(2);
    const node = items[0];
    expect(node.id).toBe(ENTITY_1);
    expect(node.entityId).toBe(ENTITY_1);
    expect(node.type).toBe("ENTITY");
    expect(node.label).toBe("Acme Holdings");
    expect(node.versionId).toBe(VERSION_2);
    // Neutral PROJECTION defaults — never read back as factual metadata.
    // ObservedTimeSchema only permits precision "exact", so the documented
    // determination sentinel carries the epoch value as its marker.
    expect(node.structuralImportance).toBe(0);
    expect(node.observationCount).toBe(0);
    expect(node.sourceCount).toBe(0);
    expect(node.createdAt.value).toBe("1970-01-01T00:00:00.000Z");
    expect(node.createdAt.precision).toBe("exact");
    expect(node.temporalRange).toBeUndefined();
  });

  it("getEdges maps relation fields truthfully and ACTIVE status + neutral support", async () => {
    stubRoutes([
      on("GET", `/api/v1/cases/${CASE_ID}/graph/versions`, versionsHandler([versionItem(VERSION_2, 2)], 1)),
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/graph`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          nodeCount: 2,
          edgeCount: 1,
          graph: {
            nodes: [
              { id: ENTITY_1, canonicalName: "Acme Holdings", temporalRange: null },
              { id: ENTITY_2, canonicalName: "Northwind Traders", temporalRange: null },
            ],
            edges: [
              {
                id: EDGE_1,
                source: ENTITY_1,
                target: ENTITY_2,
                relationType: "ownership",
                directed: true,
                temporalRange: null,
              },
            ],
          },
        },
      })),
    ]);

    const provider = new LiveGraphProvider(CASE_ID);
    const { items } = await provider.getEdges(INVESTIGATION_ID);

    expect(items).toHaveLength(1);
    const edge = items[0];
    expect(edge.id).toBe(EDGE_1);
    expect(edge.sourceNodeId).toBe(ENTITY_1);
    expect(edge.targetNodeId).toBe(ENTITY_2);
    expect(edge.relationType).toBe("ownership");
    expect(edge.directed).toBe(true);
    expect(edge.status).toBe("ACTIVE");
    expect(edge.versionId).toBe(VERSION_2);
    expect(edge.support).toBe(0);
    expect(edge.structuralImportance).toBe(0);
    expect(edge.createdAt.value).toBe("1970-01-01T00:00:00.000Z");
    expect(edge.createdAt.precision).toBe("exact");
  });

  it("throws typed UNSUPPORTED when the platform has no recorded graph version", async () => {
    stubRoutes([
      on("GET", `/api/v1/cases/${CASE_ID}/graph/versions`, () => ({
        status: 200,
        body: { caseId: CASE_ID, total: 0, offset: 0, limit: 1, count: 0, versions: [] },
      })),
    ]);

    const provider = new LiveGraphProvider(CASE_ID);
    await expect(provider.getNodes(INVESTIGATION_ID)).rejects.toMatchObject({
      code: "UNSUPPORTED",
    });
    await expect(provider.getNodes(INVESTIGATION_ID)).rejects.toBeInstanceOf(ProviderError);
  });
});

// ---------------------------------------------------------------------------
// LiveLeadProvider — DurableLead DTO projection
// ---------------------------------------------------------------------------

describe("LiveLeadProvider (Phase 4 leads)", () => {
  function leadDto(overrides: Record<string, unknown> = {}) {
    return {
      id: "99999999-9999-4999-8999-999999999999",
      caseId: CASE_ID,
      investigationId: INVESTIGATION_ID,
      title: "Wire transfer cluster to Acme",
      description: "Multiple transfers converging at the same beneficial owner.",
      status: "NEW",
      priority: "HIGH",
      confidence: 0.72,
      posture: "T1_INVESTIGATIVE_LEAD",
      relatedEntityIds: [ENTITY_1, ENTITY_2],
      supportingObservationIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      contradictingObservationIds: [],
      relatedEvidenceIds: [],
      gapIds: [],
      sourceCandidateType: "TEMPORAL_BURST",
      sourceCandidateKey: "burst#42",
      sourceCandidateSnapshot: { burst: 42 },
      alternativeExplanations: [],
      provenance: {
        entries: [
          {
            sourceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            artifactId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            extractor: "phase-4/graph-projection",
          },
        ],
        createdAt: { value: "2026-08-03T09:00:00.000Z", precision: "exact" },
      },
      assignedTo: null,
      createdAt: "2026-08-03T10:00:00.000Z",
      updatedAt: "2026-08-03T11:00:00.000Z",
      closedAt: null,
      ...overrides,
    };
  }

  it("projects the wire list into canonical Leads with investigationId backfill and exact timestamps", async () => {
    stubRoutes([
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/leads`, () => ({
        status: 200,
        body: {
          investigationId: INVESTIGATION_ID,
          caseId: CASE_ID,
          leadCount: 1,
          leads: [leadDto({ investigationId: null })],
        },
      })),
    ]);

    const provider = new LiveLeadProvider({ investigationId: INVESTIGATION_ID });
    const { items } = await provider.listByInvestigation(INVESTIGATION_ID);

    expect(items).toHaveLength(1);
    const lead = items[0];
    expect(lead.investigationId).toBe(INVESTIGATION_ID);
    expect(lead.caseId).toBe(CASE_ID);
    expect(lead.status).toBe("NEW");
    expect(lead.priority).toBe("HIGH");
    expect(lead.confidence).toBe(0.72);
    expect(lead.sourceCandidateType).toBe("TEMPORAL_BURST");
    expect(lead.sourceCandidateSnapshot).toEqual({ burst: 42 });
    expect(lead.createdAt).toEqual({ value: "2026-08-03T10:00:00.000Z", precision: "exact" });
    expect(lead.closedAt).toBeUndefined();
  });

  it("get() reconstructs the single-lead read from the detail envelope", async () => {
    stubRoutes([
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}/leads/lead-1`, () => ({
        status: 200,
        body: {
          lead: leadDto(),
          events: [],
          evidence: [
            {
              id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              leadId: "99999999-9999-4999-8999-999999999999",
              observationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              verdict: "FOR",
              rationale: null,
              addedBy: "system",
              createdAt: "2026-08-03T10:30:00.000Z",
            },
          ],
        },
      })),
    ]);

    const provider = new LiveLeadProvider({ investigationId: INVESTIGATION_ID });
    const lead = await provider.get("lead-1");

    expect(lead.id).toBe("99999999-9999-4999-8999-999999999999");
    expect(lead.title).toBe("Wire transfer cluster to Acme");
    expect(lead.relatedEntityIds).toEqual([ENTITY_1, ENTITY_2]);
  });

  it("generate() POSTs the generation route and returns the platform counts", async () => {
    const captured: RequestInit[] = [];
    stubRoutes([
      on("POST", `/api/v1/investigations/${INVESTIGATION_ID}/leads/generate`, (_url, init) => {
        captured.push(init ?? {});
        return {
          status: 200,
          body: {
            investigationId: INVESTIGATION_ID,
            caseId: CASE_ID,
            candidatesConsidered: 12,
            leadsCreated: 3,
            leadsAlreadyExisted: 1,
            skipped: 8,
            reviewTriggered: false,
          },
        };
      }),
    ]);

    const provider = new LiveLeadProvider({ investigationId: INVESTIGATION_ID });
    const result = await provider.generate(INVESTIGATION_ID);

    expect(captured[0].method).toBe("POST");
    expect(result.leadsCreated).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// LiveInvestigationProvider — run control + review checkpoint
// ---------------------------------------------------------------------------

describe("LiveInvestigationProvider (Phase 4 run control + review)", () => {
  let netCalls: string[] = [];

  beforeEach(() => {
    netCalls = [];
  });

  it("pause() rejects an empty reason BEFORE any HTTP call", async () => {
    stubRoutes([
      on("POST", `/api/v1/investigations/${INVESTIGATION_ID}/pause`, () => {
        netCalls.push("pause");
        return runSnapshot("PAUSED");
      }),
    ]);

    const provider = new LiveInvestigationProvider(CASE_ID);
    await expect(provider.pause(INVESTIGATION_ID)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(provider.pause(INVESTIGATION_ID, "   ")).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(netCalls).toHaveLength(0);
  });

  it("pause() with a reason POSTs and maps the run snapshot", async () => {
    const bodies: unknown[] = [];
    stubRoutes([
      on("POST", `/api/v1/investigations/${INVESTIGATION_ID}/pause`, (_url, init) => {
        bodies.push(init?.body);
        return runSnapshot("PAUSED");
      }),
    ]);

    const provider = new LiveInvestigationProvider(CASE_ID);
    const snapshot = await provider.pause(INVESTIGATION_ID, "Awaiting legal review");

    expect(bodies).toEqual([JSON.stringify({ reason: "Awaiting legal review" })]);
    expect(snapshot.runId).toBe(RUN_ID);
    expect(snapshot.state).toBe("PAUSED");
    expect(snapshot.investigationId).toBe(INVESTIGATION_ID);
  });

  it("resume() and resolveReview() POST to their routes", async () => {
    stubRoutes([
      on("POST", `/api/v1/investigations/${INVESTIGATION_ID}/resume`, () => runSnapshot("RUNNING")),
      on("POST", `/api/v1/investigations/${INVESTIGATION_ID}/review/resolve`, (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { outcome: string; notes?: string };
        expect(body).toEqual({ outcome: "APPROVED", notes: "All leads addressed" });
        return runSnapshot("COMPLETED");
      }),
    ]);

    const provider = new LiveInvestigationProvider(CASE_ID);
    const resumed = await provider.resume(INVESTIGATION_ID);
    expect(resumed.state).toBe("RUNNING");

    const resolved = await provider.resolveReview(
      INVESTIGATION_ID,
      "APPROVED",
      "All leads addressed",
    );
    expect(resolved.state).toBe("COMPLETED");
  });

  it("getReviewCheckpoint() is null unless the run is state REVIEW_REQUIRED", async () => {
    stubRoutes([
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}`, () => ({
        status: 200,
        body: {
          id: RUN_ID,
          investigationId: INVESTIGATION_ID,
          status: "ACTIVE",
          state: "RUNNING",
          currentStage: "ANALYSIS",
          retryCount: 0,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      })),
    ]);

    const provider = new LiveInvestigationProvider(CASE_ID);
    await expect(provider.getReviewCheckpoint(INVESTIGATION_ID)).resolves.toBeNull();
  });

  it("getReviewCheckpoint() returns a checkpoint when REVIEW_REQUIRED", async () => {
    stubRoutes([
      on("GET", `/api/v1/investigations/${INVESTIGATION_ID}`, () => ({
        status: 200,
        body: {
          id: RUN_ID,
          investigationId: INVESTIGATION_ID,
          status: "ACTIVE",
          state: "REVIEW_REQUIRED",
          currentStage: "REVIEW",
          retryCount: 0,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      })),
    ]);

    const provider = new LiveInvestigationProvider(CASE_ID);
    const checkpoint = await provider.getReviewCheckpoint(INVESTIGATION_ID);

    expect(checkpoint).not.toBeNull();
    expect(checkpoint?.runId).toBe(RUN_ID);
    expect(checkpoint?.state).toBe("REVIEW_REQUIRED");
    expect(checkpoint?.investigationId).toBe(INVESTIGATION_ID);
    expect(checkpoint?.caseId).toBe(CASE_ID);
  });
});