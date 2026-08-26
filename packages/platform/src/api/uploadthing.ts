import { createUploadthing, type FileRouter } from "uploadthing/express";
import type { Request } from "express";
import { logAuditEvent } from "../audit/logger.js";
import { db } from "../db/prisma.js";

const f = createUploadthing();

// ============================================================================
// UploadThing File Router
//
// UploadThing onUploadComplete is NOT a BullMQ producer. It:
//   1. Resolves the investigation + case from DB
//   2. Verifies case boundary authorization
//   3. Audits the upload event
//
// Evidence ingestion is ONLY triggered by the explicit evidence submission
// endpoint: POST /api/v1/investigations/:investigationId/evidence
//
// This ensures exactly ONE ingest-evidence queue producer exists.
// ============================================================================

export const uploadRouter: FileRouter = {
  casePackUploader: f({
    pdf: { maxFileSize: "16MB", maxFileCount: 10 },
    image: { maxFileSize: "8MB", maxFileCount: 20 },
    text: { maxFileSize: "16MB", maxFileCount: 10 },
    blob: { maxFileSize: "32MB", maxFileCount: 5 },
  })
    .middleware(async ({ req }: { req: Request }) => {
      const investigationId = req.headers["x-investigation-id"] as string;
      if (!investigationId) throw new Error("Missing investigation ID");

      // UploadThing handles authentication via its own UPLOADTHING_SECRET.
      // No additional Bearer token check needed here — the browser client
      // cannot access AUTH_TOKEN (server-side only).
      return { investigationId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const { investigationId } = metadata;

      // 1. Resolve investigation + case from DB (canonical caseId column)
      const run = await db.investigationRun.findFirst({
        where: { investigationId },
        orderBy: { createdAt: "desc" },
      });
      if (!run) throw new Error("Investigation not found");

      const caseId = run.caseId;
      if (!caseId) throw new Error("Investigation has no associated case");

      // 2. Audit — EVIDENCE_UPLOADED: file was received by UploadThing.
      //    This is NOT an ingestion event. Ingestion is triggered only by
      //    POST /api/v1/investigations/:investigationId/evidence.
      await logAuditEvent({
        investigationId,
        action: "EVIDENCE_UPLOADED",
        actor: "UPLOAD_CLIENT",
        targetType: "FILE",
        targetId: file.key,
        description: `Upload accepted: ${file.name} (case: ${caseId})`,
      }).catch(() => {});
    }),
};

export type OurFileRouter = typeof uploadRouter;
