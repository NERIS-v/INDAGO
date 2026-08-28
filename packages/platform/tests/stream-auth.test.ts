import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Application } from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

// ============================================================================
// P0-1 REGRESSION: the SSE stream is case-scoped through the SAME boundary as
// the GET status endpoint. The persisted InvestigationRun row is the single
// source of truth for the case boundary — the client NEVER supplies it.
//
// This suite mounts the REAL routes.ts (real requireAuth + real access
// middleware ordering); only the DB + SSE handler are stubbed, and the
// authorization decision (verifyCaseAccess) is stubbed per-branch. The 403
// branch cannot be reached through a real integration run because the dev
// demo credential is rejected in production (P0-2) — it is proven here by
// injecting a denied decision into the real middleware chain.
// ============================================================================

const CASE_A = "550e8400-e29b-41d4-a716-446655440010";
const CASE_B = "550e8400-e29b-41d4-a716-446655440011";
const INV = "550e8400-e29b-41d4-a716-446655440000";

let capturedLocals: Record<string, unknown> | undefined;

vi.mock("../src/db/prisma.js", () => ({
  db: { investigationRun: { findUnique: vi.fn() } },
}));

vi.mock("../src/realtime/sse.js", () => ({
  streamEventsHandler: vi.fn((_req, res) => {
    capturedLocals = res.locals;
    res.status(200).json({ ok: true, stream: true });
  }),
  realtimeEvents: { emit: vi.fn() },
}));

vi.mock("../src/audit/logger.js", () => ({
  logAuditEvent: vi.fn().mockResolvedValue({ id: "audit-1" }),
}));

vi.mock("../src/queue/orchestrator.js", () => ({
  investigationQueue: { add: vi.fn() },
}));

// Real auth module EXCEPT the authorization decision is switchable per test:
// the 403 branch is proven by injecting a denied decision into the real
// requireAuth + middleware chain.
vi.mock("../src/api/auth.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/api/auth.js")>();
  return {
    ...actual,
    verifyCaseAccess: vi.fn().mockReturnValue(true),
  };
});

import * as auth from "../src/api/auth.js";
import { apiRouter } from "../src/api/routes.js";

const verifyCaseAccessMock = auth.verifyCaseAccess as unknown as ReturnType<typeof vi.fn>;

function makeApp(): Application {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", apiRouter);
  return app;
}

async function get(path: string, headers: Record<string, string> = {}) {
  const app = makeApp();
  const server = app.listen(0, "127.0.0.1") as Server;
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, body };
  } finally {
    server.close();
  }
}

const streamPath = `/api/v1/investigations/${INV}/stream`;

describe("P0-1: SSE stream authentication + case scope", () => {
  beforeEach(() => {
    capturedLocals = undefined;
    vi.clearAllMocks();
    verifyCaseAccessMock.mockReturnValue(true);
  });

  afterEach(() => {
    verifyCaseAccessMock.mockReset();
  });

  it("401 when no Bearer token is presented", async () => {
    const { status, body } = await get(streamPath);
    expect(status).toBe(401);
    expect(body.error).toMatch(/authorization header/i);
  });

  it("403 when the authenticated principal is denied for the run's case", async () => {
    const db = (await import("../src/db/prisma.js")).db as unknown as {
      investigationRun: { findUnique: ReturnType<typeof vi.fn> };
    };
    db.investigationRun.findUnique.mockResolvedValue({
      id: "run-1",
      investigationId: INV,
      caseId: CASE_A,
    });
    verifyCaseAccessMock.mockReturnValue(false);

    const { status, body } = await get(streamPath, { authorization: "Bearer demo-token" });
    expect(status).toBe(403);
    expect(body.error).toContain("Security Violation");
    expect(body.error).toContain(CASE_A);
  });

  it("400 for a malformed (non-UUID) investigationId", async () => {
    const { status, body } = await get("/api/v1/investigations/not-a-uuid/stream", {
      authorization: "Bearer demo-token",
    });
    expect(status).toBe(400);
    expect(body.error).toBe("Invalid investigation ID");
  });

  it("404 for a well-formed but nonexistent investigation", async () => {
    const db = (await import("../src/db/prisma.js")).db as unknown as {
      investigationRun: { findUnique: ReturnType<typeof vi.fn> };
    };
    db.investigationRun.findUnique.mockResolvedValue(null);

    const { status, body } = await get(streamPath, { authorization: "Bearer demo-token" });
    expect(status).toBe(404);
    expect(body.error).toBe("Investigation not found");
  });

  it("400 when the run has no canonical caseId", async () => {
    const db = (await import("../src/db/prisma.js")).db as unknown as {
      investigationRun: { findUnique: ReturnType<typeof vi.fn> };
    };
    db.investigationRun.findUnique.mockResolvedValue({
      id: "run-1",
      investigationId: INV,
      caseId: null,
    });

    const { status, body } = await get(streamPath, { authorization: "Bearer demo-token" });
    expect(status).toBe(400);
    expect(body.error).toBe("Investigation has no associated case");
  });

  it("200 and forwards the CANONICAL caseId (from DB, not the client) to the handler", async () => {
    const db = (await import("../src/db/prisma.js")).db as unknown as {
      investigationRun: { findUnique: ReturnType<typeof vi.fn> };
    };
    db.investigationRun.findUnique.mockResolvedValue({
      id: "run-1",
      investigationId: INV,
      caseId: CASE_B,
    });
    const receivedCaseIds: string[] = [];
    verifyCaseAccessMock.mockImplementation((_user, caseId) => {
      receivedCaseIds.push(caseId);
      return true;
    });

    const { status, body } = await get(streamPath, { authorization: "Bearer demo-token" });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    // The boundary resolved the case from the persisted run — never from req params/query.
    expect(receivedCaseIds).toEqual([CASE_B]);
    expect(capturedLocals).toEqual(
      expect.objectContaining({ caseId: CASE_B, runId: "run-1" }),
    );
  });
});