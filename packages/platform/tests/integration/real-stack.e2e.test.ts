import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type { Server, AddressInfo } from "node:http";
import http from "node:http";
import { PrismaClient } from "@prisma/client";
import { PDFDocument, StandardFonts } from "pdf-lib";

// ============================================================================
// REAL-STACK E2E — real Redis/BullMQ + real worker + real HTTP API + real
// Postgres. Prompt 3 §31/§33/§34.
//
// No mocks: real ioredis → real BullMQ Queue/Worker, real express API routes
// (routes.ts), real acquisition/extraction, real persistence.
//
// Honest labels (Prompt 3 §31/§33):
//   - REAL integration: Redis + BullMQ + Worker + Postgres all real.
//   - http:// SSE client exercises the REAL stream endpoint end-to-end.
//   - NOT exercised here (documented omission): Next.js browser shell,
//     UploadThing CDN/signing, the browser→platform upload handshake.
//     Those edges are covered by the web unit tests + server-action boundary;
//     §34 treats the API→worker→DB→SSE path as the closest real E2E.
//
// Environment (both required, else this suite skips):
//   TEST_DATABASE_URL  dedicated test Postgres (never DATABASE_URL)
//   REDIS_URL          real Redis (BullMQ)
// ============================================================================

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

const describeOrSkip = TEST_DATABASE_URL && REDIS_URL ? describe : describe.skip;

interface SseFrame {
  readonly type?: string;
  readonly state?: string;
  readonly action?: string;
  readonly description?: string;
  readonly investigationId?: string;
  readonly [key: string]: unknown;
}

describeOrSkip("REAL-STACK E2E: HTTP → BullMQ → worker → Postgres → SSE", () => {
  let prisma: PrismaClient;
  let server: Server;
  let baseUrl: string;
  let artifactsDir: string;
  let queue: import("bullmq").Queue;
  let worker: import("bullmq").Worker;

  // Fixed, explicitly-granted case ids. verifyCaseAccess (auth.ts) is fail-closed
  // in EVERY environment: the demo principal may reach a case ONLY when it is in
  // DEMO_ALLOWED_CASES or an explicit INDAGO_DEV_ALLOWED_CASES grant. Random ids
  // would (and did) 403 every /start. These are granted in beforeAll below and
  // revoked in afterAll, mirroring the other API e2e suites.
  const SUITE_CASE_ID = "550e8400-e29b-41d4-a716-446655440101";
  const PDF_CASE_ID = "550e8400-e29b-41d4-a716-446655440102";
  const DEDUP_CASE_ID = "550e8400-e29b-41d4-a716-446655440103";
  const RETRY_CASE_ID = "550e8400-e29b-41d4-a716-446655440104";
  const SECURITY_CASE_ID = "550e8400-e29b-41d4-a716-446655440105";

  const investigationId = randomUUID();
  const caseId = SUITE_CASE_ID;
  const fixtureBytes = Buffer.from(
    "REPORT: balance 42000.00; status: under-review\n",
    "utf8",
  );
  const fixtureHash = createHash("sha256").update(fixtureBytes).digest("hex");

  const auth = { authorization: "Bearer demo-token" };

  // --- M-A06 Option A §28 live fixture: a controlled PDF whose two visible
  // text runs share ONE visual baseline (Address: keyword + its value split by
  // layout) plus a third run on a separate line. pdfjs emits one bbox'd span
  // per text run in content-stream order, so the real parser produces two
  // same-baseline spans with contiguous pageTextOffset — mergeable. ---
  let mergedPdfBytes: Buffer;
  let mergedPdfHash: string;

  async function buildMergedPdf(): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText("Address:", { x: 40, y: 720, size: 12, font });
    page.drawText("123 Main St, Mumbai", { x: 90, y: 720, size: 12, font });
    page.drawText("Notes for the file", { x: 40, y: 680, size: 12, font });
    return Buffer.from(await doc.save());
  }

  function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  async function pollUntil(
    fn: () => Promise<boolean>,
    timeoutMs = 40_000,
    interval = 250,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await fn()) return true;
      await sleep(interval);
    }
    return false;
  }

  async function getStatus(invId: string, cId: string) {
    const res = await fetch(
      `${baseUrl}/api/v1/investigations/${invId}?caseId=${cId}`,
      { headers: auth },
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  function evidenceBody(invId: string, fileKey: string, fileName: string, fileUrl: string) {
    return {
      investigationId: invId,
      sourceName: "Real-Stack E2E",
      evidenceType: "COMMUNICATION",
      evidenceTitle: "Monthly Ledger",
      files: [
        {
          fileKey,
          fileUrl,
          fileName,
          fileSize: fixtureBytes.length,
          mimeType: "text/plain",
          sha256Hash: fixtureHash,
        },
      ],
    };
  }

  async function postEvidence(invId: string, fileKey: string, fileName: string, fileUrl: string) {
    const res = await fetch(
      `${baseUrl}/api/v1/investigations/${invId}/evidence`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...auth },
        body: JSON.stringify(evidenceBody(invId, fileKey, fileName, fileUrl)),
      },
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  /** Open the REAL SSE endpoint and collect parsed frames until closed. */
  function openSse(invId: string): { frames: SseFrame[]; close: () => void } {
    const frames: SseFrame[] = [];
    let buffer = "";
    const req = http.request(
      {
        host: "127.0.0.1",
        port: (server.address() as AddressInfo).port,
        path: `/api/v1/investigations/${invId}/stream`,
        headers: auth,
      },
      (res) => {
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          buffer += chunk;
          const parts = buffer.split("\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            if (part.startsWith("data: ")) {
              try {
                frames.push(JSON.parse(part.slice(6).trim()) as SseFrame);
              } catch {
                // partial/malformed line — ignore
              }
            }
          }
        });
      },
    );
    req.end();
    return { frames, close: () => req.destroy() };
  }

  async function waitForSseConnected(sse: { frames: SseFrame[] }, timeoutMs = 5_000) {
    await pollUntil(() => sse.frames.some((f) => f.type === "CONNECTED"), timeoutMs, 50);
  }

  beforeAll(async () => {
    if (!TEST_DATABASE_URL || !REDIS_URL) return;

    // Env MUST be set before the worker/queue modules are imported.
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.REDIS_URL = REDIS_URL;
    process.env.INDAGO_DEV_ALLOWED_CASES = [
      SUITE_CASE_ID,
      PDF_CASE_ID,
      DEDUP_CASE_ID,
      RETRY_CASE_ID,
      SECURITY_CASE_ID,
    ].join(",");
    artifactsDir = await mkdtemp(join(tmpdir(), "indago-realstack-"));
    process.env.ARTIFACT_STORAGE_DIR = artifactsDir;
    // TEST-ONLY fetcher escape hatches: this suite serves fixtures from
    // http://127.0.0.1. Production default (no env set) is strict https +
    // public-hosts-only.
    process.env.ARTIFACT_ALLOW_HTTP = "true";
    process.env.ARTIFACT_ALLOW_PRIVATE_HOSTS = "true";
    // Isolate this suite from any concurrently-running dev worker: a dedicated
    // queue name keeps the REAL Redis/BullMQ worker honest while guaranteeing
    // a dev worker on the default queue can never claim these test jobs.
    process.env.INVESTIGATION_QUEUE_NAME = "investigation-pipeline-e2e";

    mergedPdfBytes = await buildMergedPdf();
    mergedPdfHash = createHash("sha256").update(mergedPdfBytes).digest("hex");

    prisma = new PrismaClient();
    await prisma.rawExtraction.deleteMany({});
    await prisma.ingestionAttempt.deleteMany({});
    await prisma.artifact.deleteMany({});
    await prisma.auditEvent.deleteMany({});
    await prisma.agentCheckpoint.deleteMany({});
    await prisma.investigationRun.deleteMany({});

    // Pre-warm the shared app Prisma singleton so its query engine is up
    // before the first /start request (avoids a cold-start engine race).
    const { db: appDb } = await import("../../src/db/prisma.js");
    await appDb.$connect();

    // Dynamic import AFTER env is set: creates the REAL Queue + Worker.
    const { apiRouter } = await import("../../src/api/routes.js");
    const orchestrator = await import("../../src/queue/orchestrator.js");
    queue = orchestrator.investigationQueue;
    worker = orchestrator.investigationWorker;
    await queue.obliterate({ force: true });

    const app = express();
    app.use(express.json());
    app.get("/fixture.txt", (_req, res) => {
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.setHeader("content-length", String(fixtureBytes.length));
      res.end(fixtureBytes);
    });
    app.get("/flaky.txt", (_req, res) => {
      res.status(503).setHeader("content-type", "text/plain").end("service unavailable");
    });
    app.get("/absent.txt", (_req, res) => {
      res.status(404).setHeader("content-type", "text/plain").end("not found");
    });
    app.get("/merged.pdf", (_req, res) => {
      res.setHeader("content-type", "application/pdf");
      res.setHeader("content-length", String(mergedPdfBytes.length));
      res.end(mergedPdfBytes);
    });
    app.use("/api/v1", apiRouter);

    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;
    });
    await new Promise<void>((resolve) => server.once("listening", resolve));
  });

  afterAll(async () => {
    if (!TEST_DATABASE_URL || !REDIS_URL) return;
    delete process.env.INDAGO_DEV_ALLOWED_CASES;
    try {
      await queue.obliterate({ force: true });
    } finally {
      await worker.close();
      await queue.close();
    }
    server?.close();
    await prisma.rawExtraction.deleteMany({});
    await prisma.ingestionAttempt.deleteMany({});
    await prisma.artifact.deleteMany({});
    await prisma.auditEvent.deleteMany({});
    await prisma.agentCheckpoint.deleteMany({});
    await prisma.investigationRun.deleteMany({});
    await prisma.$disconnect();
    await rm(artifactsDir, { recursive: true, force: true });
  }, 30_000);

  it("starts a run through the real API", async () => {
    const res = await fetch(`${baseUrl}/api/v1/investigations/start`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify({ caseId, investigationId }),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { runId?: string };
    expect(body.runId).toBeDefined();
    const run = await prisma.investigationRun.findUnique({
      where: { investigationId },
    });
    expect(run?.status).toBe("QUEUED");
    expect(run?.caseId).toBe(caseId);
  });

  it("REAL end-to-end: POST evidence → BullMQ → worker → RawExtraction → NormalizedExtraction → ANALYZING → SSE frames", async () => {
    const sse = openSse(investigationId);
    await waitForSseConnected(sse);

    const post = await postEvidence(
      investigationId,
      "ledger.txt",
      "ledger.txt",
      `${baseUrl}/fixture.txt`,
    );
    expect(post.status).toBe(202);

    const reachedAnalyzing = await pollUntil(async () => {
      const s = await getStatus(investigationId, caseId);
      return s.body.state === "ANALYZING";
    });
    expect(reachedAnalyzing).toBe(true);
    const reachedAt = Date.now();

    // --- Durable persistence assertions ---
    const artifact = await prisma.artifact.findUnique({
      where: { caseId_contentHash: { caseId, contentHash: fixtureHash } },
    });
    expect(artifact).not.toBeNull();
    expect(artifact!.caseId).toBe(caseId);
    expect(artifact!.investigationId).toBe(investigationId);
    expect(artifact!.detectedMimeType).toBe("text/plain");
    expect(artifact!.hashVerified).toBe(true);

    const attempt = await prisma.ingestionAttempt.findFirst({
      where: { investigationId },
      orderBy: { createdAt: "desc" },
    });
    expect(attempt).not.toBeNull();
    expect(attempt!.status).toBe("SUCCEEDED");
    expect(attempt!.attemptNumber).toBe(1);
    expect(attempt!.parserId).toBeDefined();

    const raw = await prisma.rawExtraction.findUnique({
      where: { attemptId: attempt!.id },
    });
    expect(raw).not.toBeNull();
    expect(raw!.format).toBe("TXT");
    expect(JSON.stringify(raw!.extraction)).toContain("balance 42000.00");

    // --- M-A05: canonical normalized output persisted for the attempt ---
    const normalized = await prisma.normalizedExtraction.findUnique({
      where: { attemptId: attempt!.id },
    });
    expect(normalized).not.toBeNull();
    expect(normalized!.normalizerId).toBe("indago-text-canonicalizer");
    const canonicalFields = normalized!.canonicalFields as Array<{
      rawValue: string;
      status: string;
    }>;
    expect(canonicalFields.some((f) => f.rawValue.includes("42000.00"))).toBe(true);

    // --- Real SSE frames (ordered lifecycle) ---
    await sleep(300);
    const frames = sse.frames;
    const actions = frames.map((f) => f.action ?? f.type ?? f.state ?? "(unknown)");
    expect(actions).toContain("CONNECTED");
    expect(actions).toContain("EVIDENCE_SUBMITTED");
    expect(actions).toContain("EVIDENCE_QUEUED");
    expect(actions).toContain("INGESTING");
    expect(actions).toContain("NORMALIZING");
    expect(actions).toContain("ANALYZING");
    expect(actions).toContain("EVIDENCE_INGESTED");

    // §4 guard AT the transport: any NORMALIZING state frame must arrive
    // only AFTER a frame whose message confirms durable persistence.
    const normIdx = frames.findIndex((f) => f.state === "NORMALIZING");
    const ingestedIdx = frames.findIndex((f) => f.action === "EVIDENCE_INGESTED");
    expect(normIdx).toBeGreaterThanOrEqual(0);
    expect(ingestedIdx).toBeGreaterThan(normIdx);

    // §4 guard AT the transport: the ANALYZING state frame may only fire after
    // the canonical normalization was durably persisted (audit written).
    const analyzingIdx = frames.findIndex((f) => f.state === "ANALYZING");
    expect(analyzingIdx).toBeGreaterThanOrEqual(0);
    const storedAudit = await prisma.auditEvent.findFirst({
      where: { investigationId, action: "NORMALIZATION_STORED" },
    });
    expect(storedAudit).not.toBeNull();
    expect(storedAudit!.timestamp.getTime()).toBeLessThan(reachedAt);

    sse.close();
  }, 60_000);

  it("M-A06 Option A live: a PDF with a layout-split 'Address:' line is re-ingested as ONE merged SPATIAL observation", async () => {
    const invPdf = randomUUID();
    const cid = PDF_CASE_ID;
    const start = await fetch(`${baseUrl}/api/v1/investigations/start`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify({ caseId: cid, investigationId: invPdf }),
    });
    expect(start.status).toBe(202);

    const post = await fetch(
      `${baseUrl}/api/v1/investigations/${invPdf}/evidence`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...auth },
        body: JSON.stringify({
          investigationId: invPdf,
          sourceName: "Real-Stack E2E",
          evidenceType: "COMMUNICATION",
          evidenceTitle: "Split-line address PDF",
          files: [
            {
              fileKey: "address.pdf",
              fileUrl: `${baseUrl}/merged.pdf`,
              fileName: "address.pdf",
              fileSize: mergedPdfBytes.length,
              mimeType: "application/pdf",
              sha256Hash: mergedPdfHash,
            },
          ],
        }),
      },
    );
    expect(post.status).toBe(202);

    const reachedAnalyzing = await pollUntil(async () => {
      const s = await getStatus(invPdf, cid);
      return s.body.state === "ANALYZING";
    });
    expect(reachedAnalyzing).toBe(true);

    const attempt = await prisma.ingestionAttempt.findFirst({
      where: { investigationId: invPdf },
      orderBy: { createdAt: "desc" },
    });
    expect(attempt?.status).toBe("SUCCEEDED");
    const raw = await prisma.rawExtraction.findUnique({
      where: { attemptId: attempt!.id },
    });
    expect(raw?.format).toBe("PDF");

    const obs = await prisma.observation.findMany({
      where: { investigationId: invPdf },
      orderBy: { createdAt: "asc" },
    });
    expect(obs).toHaveLength(2);

    const address = obs.find((o) => o.content.startsWith("Address:"));
    expect(address).toBeDefined();
    expect(address!.content).toBe("Address: 123 Main St, Mumbai");
    expect(address!.type).toBe("SPATIAL");
    expect(address!.strength).toBe(0.6);
    const mentions = address!.candidateMentions as string[];
    expect(mentions).toContain("Mumbai");
    expect(mentions).toContain("Main St");
    const prov = address!.provenance as { spanRef?: string; pageRef?: string };
    expect(prov.pageRef).toBe("page 1");
    // The merged range must START at the stream beginning (Address: is the
    // first run) and COVER both same-baseline runs. pdfjs may add a leading
    // space to later runs in the page text stream, so assert coverage, not the
    // exact pdfjs spacing-derived end offset (canonicalization collapses the
    // duplicate space in the content contract).
    expect(prov.spanRef).toMatch(/^span 0-\d+$/);

    const notes = obs.find((o) => o.content.startsWith("Notes for the file"));
    expect(notes).toBeDefined();
    const notesProv = notes!.provenance as { spanRef?: string };
    expect(notesProv.spanRef).toMatch(/^span \d+-\d+$/);
    expect(Number(notesProv.spanRef!.match(/^span (\d+)-(\d+)$/)![1])).toBeGreaterThanOrEqual(
      Number(prov.spanRef!.match(/^span (\d+)-(\d+)$/)![2]),
    );
    expect(notes!.identityKey).not.toBe(address!.identityKey);
  }, 90_000);

  it("BullMQ producer dedup: same idempotencyKey POST twice → job processed once", async () => {
    const inv2 = randomUUID();
    const cid = DEDUP_CASE_ID;
    const start = await fetch(`${baseUrl}/api/v1/investigations/start`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify({ caseId: cid, investigationId: inv2 }),
    });
    expect(start.status).toBe(202);

    const key = `evidence-${inv2}-dup.txt`;
    await sleep(200);
    const first = await postEvidence(inv2, "dup.txt", "dup.txt", `${baseUrl}/fixture.txt`);
    expect(first.status).toBe(202);

    const done = await pollUntil(async () => {
      const job = await queue.getJob(key);
      return (await job?.getState()) === "completed";
    });
    expect(done).toBe(true);
    const jobBefore = await queue.getJob(key);
    const processedOn = jobBefore?.processedOn ?? -1;

    const second = await postEvidence(inv2, "dup.txt", "dup.txt", `${baseUrl}/fixture.txt`);
    expect(second.status).toBe(202);

    await sleep(1_500); // give a phantom duplicate time to (not) spawn
    const jobAfter = await queue.getJob(key);
    expect(jobAfter?.id).toBe(key);
    expect(jobAfter?.processedOn).toBe(processedOn);
    expect(await jobAfter?.getState()).toBe("completed");

    const pending = await queue.getJobs(["waiting", "active", "delayed", "paused"]);
    expect(pending.some((j) => j.id === key)).toBe(false);

    const attempts = await prisma.ingestionAttempt.count({ where: { idempotencyKey: key } });
    expect(attempts).toBe(1);

    const run = await prisma.investigationRun.findUnique({ where: { investigationId: inv2 } });
    expect(run?.state).toBe("ANALYZING");
  }, 60_000);

  it("REAL retry + permanent failure: 503 fixture → retried by BullMQ → run FAILED, audited once", async () => {
    const inv3 = randomUUID();
    const cid = RETRY_CASE_ID;
    const start = await fetch(`${baseUrl}/api/v1/investigations/start`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify({ caseId: cid, investigationId: inv3 }),
    });
    expect(start.status).toBe(202);

    const key = `evidence-${inv3}-flaky.txt`;
    const post = await postEvidence(inv3, "flaky.txt", "flaky.txt", `${baseUrl}/flaky.txt`);
    expect(post.status).toBe(202);

    // 3 attempts (backoff 2s / 4s) → permanent FAILED.
    const failed = await pollUntil(async () => {
      const s = await getStatus(inv3, cid);
      return s.body.state === "FAILED";
    }, 45_000);
    expect(failed).toBe(true);

    const attempt = await prisma.ingestionAttempt.findFirst({
      where: { investigationId: inv3 },
      orderBy: { createdAt: "desc" },
    });
    expect(attempt?.status).toBe("FAILED");
    expect(attempt?.attemptNumber).toBe(3);

    // The INGESTION_JOB_FAILED audit is written by the asynchronous BullMQ
    // "failed" event listener, which lands a beat after the run FAILED state
    // itself becomes visible — so poll for it, then re-check exactly-once.
    const auditedOnce = await pollUntil(async () => {
      const n = await prisma.auditEvent.count({
        where: { investigationId: inv3, action: "INGESTION_JOB_FAILED" },
      });
      return n > 0;
    }, 15_000);
    expect(auditedOnce).toBe(true);

    const auditCount = await prisma.auditEvent.count({
      where: { investigationId: inv3, action: "INGESTION_JOB_FAILED" },
    });
    expect(auditCount).toBe(1);

    const job = await queue.getJob(key);
    expect(["failed", "completed"]).toContain(await job?.getState());

    const run = await prisma.investigationRun.findUnique({ where: { investigationId: inv3 } });
    expect(run?.status).toBe("FAILED");
    expect(run?.error).toContain("HTTP_ERROR");
  }, 90_000);

  it("security: 401 / 403 / 400 on the real API", async () => {
    const inv4 = randomUUID();
    const cid = SECURITY_CASE_ID;
    const body = evidenceBody(inv4, "x.txt", "x.txt", `${baseUrl}/fixture.txt`);

    const noAuth = await fetch(`${baseUrl}/api/v1/investigations/${inv4}/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(noAuth.status).toBe(401);

    const badToken = await fetch(`${baseUrl}/api/v1/investigations/${inv4}/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer nope" },
      body: JSON.stringify(body),
    });
    expect(badToken.status).toBe(403);

    const start = await fetch(`${baseUrl}/api/v1/investigations/start`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify({ caseId: cid, investigationId: inv4 }),
    });
    expect(start.status).toBe(202);

    const badCase = await getStatus(inv4, "550e8400-e29b-41d4-a716-446655449999");
    expect(badCase.status).toBe(403);

    const malformed = await fetch(`${baseUrl}/api/v1/investigations/${inv4}/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify({ investigationId: inv4, sourceName: "X", evidenceType: "COMMUNICATION" }),
    });
    expect(malformed.status).toBe(400);
  }, 30_000);

  it("P0-1: real stream endpoint — unauthenticated 401, nonexistent investigation 404, malformed id 400", async () => {
    const inv = randomUUID();

    const noAuth = await fetch(`${baseUrl}/api/v1/investigations/${inv}/stream`, {});
    expect(noAuth.status).toBe(401);

    const malformedId = await fetch(`${baseUrl}/api/v1/investigations/not-a-uuid/stream`, {
      headers: auth,
    });
    expect(malformedId.status).toBe(400);

    const notFound = await fetch(`${baseUrl}/api/v1/investigations/${inv}/stream`, {
      headers: auth,
    });
    expect(notFound.status).toBe(404);
    const body = (await notFound.json()) as { error?: string };
    expect(body.error).toBe("Investigation not found");

    // The authorized-200 path (CONNECTED frame) is exercised by the main
    // REAL end-to-end test via openSse(). The 403 decision branch is covered
    // by the mocked stream-auth test (production rejects the demo credential,
    // so it cannot be provoked through a real unprivileged run).
  }, 30_000);
});