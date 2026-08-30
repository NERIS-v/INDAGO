import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "../db/prisma.js";
import { investigationQueue } from "../queue/orchestrator.js";
import { logAuditEvent } from "../audit/logger.js";
import { streamEventsHandler } from "../realtime/sse.js";
import { realtimeEvents } from "../realtime/sse.js";
import { observationStore } from "../persistence/observation-store.js";
import { caseStore } from "../persistence/case-store.js";
import { requireAuth, requireRole, requireCaseAccess, verifyCaseAccess } from "./auth.js";
import {
  EvidenceSubmissionRequestSchema,
  SourceCatalogSchema,
  CaseIdSchema,
} from "@indago/contracts";

export const apiRouter: Router = Router();

// Schema for the incoming webhook/API request
//
// caseId MUST be a canonical CaseIdSchema UUID. The canonical case identity
// is persisted once on InvestigationRun.caseId and flows verbatim through the
// queue into the worker. No random/fabricated caseId is ever generated.
const StartInvestigationSchema = z.object({
  caseId: CaseIdSchema,
  investigationId: z.string().uuid(),
});

// 1. Lock down the Realtime Stream
//
// The SSE stream is case-scoped exactly like the GET status endpoint:
//   authenticate → resolve investigation → canonical run.caseId →
//   verifyCaseAccess(user, run.caseId)
// The client NEVER supplies the case boundary; the persisted run row is the
// only source of truth. Unauthenticated, nonexistent, and cross-case
// investigations are rejected before the stream handler subscribes.
apiRouter.get(
  "/investigations/:investigationId/stream",
  requireAuth,
  async (req, res, next) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }

      const run = await db.investigationRun.findUnique({
        where: { investigationId },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }

      const caseId = run.caseId;
      if (!caseId) {
        return res.status(400).json({ error: "Investigation has no associated case" });
      }

      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      // Authorized: carry the canonical identity for the stream handler.
      res.locals.caseId = caseId;
      res.locals.runId = run.id;
      return next();
    } catch (error: unknown) {
      console.error("Failed to authorize realtime stream:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  streamEventsHandler
);

// 1a. List Cases (case catalogue / dashboard)
apiRouter.get(
  "/cases",
  requireAuth,
  async (req, res) => {
    try {
      let cases = await caseStore.listCases();
      // Production scope: the authenticated principal's allowedCases drive the
      // catalogue. (verifyCaseAccess short-circuits to true in development, so
      // the dev catalogue is intentionally un-scoped.)
      if (process.env.NODE_ENV === "production") {
        const allowed = new Set(req.user?.allowedCases ?? []);
        cases = cases.filter((c) => allowed.has(c.id));
      }
      return res.status(200).json({
        count: cases.length,
        cases,
      });
    } catch (error: unknown) {
      console.error("Failed to list cases:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1a/i. Delete Case (case catalogue). Hard-remove the boundary and every
// durable row scoped to it; refuses while an active investigation run exists
// (409) so the orchestrator never orphans in-flight work. Deleting unblocks the
// whole case — this is intended destructive tooling for INV/ADMIN roles only.
apiRouter.delete(
  "/cases/:caseId",
  requireAuth,
  requireRole(["INVESTIGATOR", "ADMIN"]),
  async (req, res) => {
    try {
      const caseId = String(req.params.caseId);
      if (!CaseIdSchema.safeParse(caseId).success) {
        return res.status(400).json({ error: "Invalid case ID" });
      }
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const result = await caseStore.deleteCase(caseId);
      if (result.outcome === "not_found") {
        return res.status(404).json({ error: "Case not found" });
      }
      if (result.outcome === "active_runs") {
        return res.status(409).json({
          error: "Case has active investigations; wait for them to finish",
        });
      }
      return res.status(200).json({ deleted: true, caseId });
    } catch (error: unknown) {
      console.error("Failed to delete case:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1b. Get Investigation Status
apiRouter.get(
  "/investigations/:investigationId",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      const caseId = String(req.query.caseId || "");

      if (!caseId) {
        return res.status(400).json({ error: "caseId query parameter is required" });
      }

      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });

      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }

      // 4b. Cross-check: the persisted run MUST belong to the requested case boundary.
      //     Catches any caseId fabrication / cross-case data leakage.
      if (run.caseId !== caseId) {
        return res.status(403).json({
          error: `Security Violation: Investigation ${investigationId} does not belong to case boundary ${caseId}`,
        });
      }

      return res.status(200).json({
        id: run.id,
        investigationId: run.investigationId,
        status: run.status,
        state: run.state,
        currentStage: run.currentStage,
        error: run.error,
        retryCount: run.retryCount,
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
      });
    } catch (error: unknown) {
      console.error("Failed to get investigation:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1c. List Observations (M-A06)
//
// Server-side caseId derivation (edit #5): the client NEVER supplies the case
// boundary. Auth → latest run → authoritative run.caseId → case-access check →
// scoped read. Returns full ObservationSchema records for the investigation.
apiRouter.get(
  "/investigations/:investigationId/observations",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }

      // The persisted run is the ONLY source of truth for the case boundary —
      // never trust a client-supplied caseId here.
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }

      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const observations = await observationStore.listObservations({
        investigationId,
        caseId,
      });

      return res.status(200).json({
        investigationId,
        caseId,
        count: observations.length,
        observations,
      });
    } catch (error: unknown) {
      console.error("Failed to list observations:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 1d. List Evidence (M-A06)
//
// Mirrors the observations seam: auth → latest run → authoritative run.caseId →
// case-access check → scoped read. Returns the documented EvidenceProjection
// shape — the platform persists a narrower Evidence row than the canonical
// EvidenceSchema and refuses to fabricate the missing fields.
apiRouter.get(
  "/investigations/:investigationId/evidence",
  requireAuth,
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);
      if (!z.string().uuid().safeParse(investigationId).success) {
        return res.status(400).json({ error: "Invalid investigation ID" });
      }

      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }

      const caseId = run.caseId;
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      const evidence = await observationStore.listEvidenceByInvestigation({
        investigationId,
        caseId,
      });

      return res.status(200).json({
        investigationId,
        caseId,
        count: evidence.length,
        evidence,
      });
    } catch (error: unknown) {
      console.error("Failed to list evidence:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 2. Lock down the Start Investigation Endpoint
apiRouter.post(
  "/investigations/start",
  requireAuth,
  requireRole(["INVESTIGATOR", "ADMIN"]),
  requireCaseAccess,
  async (req, res) => {
    try {
      const parsed = StartInvestigationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error });
      }

      const { caseId, investigationId } = parsed.data;

      const run = await db.investigationRun.create({
        data: {
          investigationId,
          caseId,
          status: "QUEUED",
          state: "CREATED",
          contextData: { caseId },
        }
      });

      // Case catalogue (P-09): the case boundary is provisioned the moment a
      // run is created (idempotent), so the dashboard never lags a newly seen
      // case. The authorized principal is persisted as the assignee.
      await caseStore.ensureCase(caseId, req.user!.id);

      await logAuditEvent({
        investigationId,
        action: "INVESTIGATION_OPENED",
        actor: req.user!.id,
        targetType: "INVESTIGATION_RUN",
        targetId: run.id,
        description: `Investigation run queued for case ${caseId}`
      });

      // Run-state jobs are ONLY enqueued when the legacy pipeline is enabled.
      // Otherwise the run waits in CREATED until evidence arrives and the
      // canonical @indago/ingestion path drives INGESTING → NORMALIZING.
      if (process.env.LEGACY_PIPELINE_ENABLED === "true") {
        await investigationQueue.add("investigation-pipeline", {
          runId: run.id
        });
      }

      return res.status(202).json({
        message: "Investigation queued successfully",
        runId: run.id
      });

    } catch (error: unknown) {
      console.error("Failed to start investigation:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 3. Evidence Submission Endpoint (I-PR2 boundary)
apiRouter.post(
  "/investigations/:investigationId/evidence",
  requireAuth,
  requireRole(["INVESTIGATOR", "ADMIN"]),
  async (req, res) => {
    try {
      const investigationId = String(req.params.investigationId);

      // 1. Resolve investigation from DB
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
      });
      if (!run) {
        return res.status(404).json({ error: "Investigation not found" });
      }

      // 2. Resolve caseId from canonical Prisma column
      const caseId = run.caseId;
      if (!caseId) {
        return res.status(400).json({ error: "Investigation has no associated case" });
      }

      // 3. Case boundary authorization
      if (!req.user || !verifyCaseAccess(req.user, caseId)) {
        return res.status(403).json({
          error: `Security Violation: Unauthorized access to case boundary ${caseId}`,
        });
      }

      // 4. Validate payload
      const parsed = EvidenceSubmissionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "VALIDATION_FAILED",
          details: parsed.error.flatten(),
        });
      }
      const submission = parsed.data;

      // 5. System-generated IDs for this submission batch
      const operationId = randomUUID();
      const correlationId = randomUUID();

      // 5b. M-A06: resolve the untrusted client catalog string against the
      // canonical SourceCatalog set (exact match wins, everything else falls
      // back to MANUAL — matching the evidence-submission contract doctrine).
      const parsedCatalog = SourceCatalogSchema.safeParse(submission.sourceCatalog);
      const resolvedSourceCatalog = parsedCatalog.success ? parsedCatalog.data : "MANUAL";

      // 6. Construct ArtifactReference + enqueue one job per file
      const jobIds: string[] = [];
      for (const file of submission.files) {
        const idempotencyKey = `evidence-${investigationId}-${file.fileKey}`;

        const artifactReference = {
          url: file.fileUrl,
          originalFilename: file.fileName,
          declaredMimeType: file.mimeType,
          declaredSizeBytes: file.fileSize,
          ...(file.sha256Hash !== undefined
            ? { declaredContentHash: file.sha256Hash }
            : {}),
          sourceType: "FILE_UPLOAD",
          idempotencyKey,
          providerMetadata: { fileKey: file.fileKey },
        };

        const job = await investigationQueue.add(
          "ingest-evidence",
          {
            investigationId,
            caseId,
            artifactReference,
            sourceName: submission.sourceName,
            sourceDescription: submission.sourceDescription,
            // Source catalog (M-A06): the client string is untrusted. A strict
            // SourceCatalogSchema match is used; anything else (or absent)
            // falls back to MANUAL. The verbatim declaration is preserved so
            // any fallback is auditable on the persisted Source row.
            sourceCatalog: resolvedSourceCatalog,
            declaredSourceCatalog: submission.sourceCatalog,
            evidenceType: submission.evidenceType,
            evidenceTitle: submission.evidenceTitle,
            evidenceDescription: submission.evidenceDescription,
            observedAt: submission.observedAt,
            operationId,
            correlationId,
            idempotencyKey,
          },
          { jobId: idempotencyKey },
        );

        jobIds.push(job.id!);
      }

      // 7. Audit — EVIDENCE_QUEUED: submission accepted and jobs enqueued
      await logAuditEvent({
        investigationId,
        action: "EVIDENCE_QUEUED",
        actor: req.user!.id,
        targetType: "EVIDENCE",
        targetId: investigationId,
        description: `Evidence queued: ${submission.evidenceTitle} (${submission.files.length} file(s), case: ${caseId})`,
      });

      // 8. Broadcast to SSE listeners
      realtimeEvents.emit("progress", {
        investigationId,
        type: "EVIDENCE_SUBMITTED",
        evidenceTitle: submission.evidenceTitle,
        fileCount: submission.files.length,
        operationId,
      });

      return res.status(202).json({
        message: "Evidence submission accepted",
        operationId,
        correlationId,
        jobsEnqueued: jobIds.length,
        fileCount: submission.files.length,
      });

    } catch (error: unknown) {
      console.error("Failed to submit evidence:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);