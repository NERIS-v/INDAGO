import { createUploadthing, type FileRouter } from "uploadthing/express";
import type { Request } from "express";
import { investigationQueue } from "../queue/orchestrator.js";
import { logAuditEvent } from "../audit/logger.js";

const f = createUploadthing();

export const uploadRouter: FileRouter = {
  // Accept standard case pack files: PDFs, Images, Text, and CSVs for CDRs/Financials
  casePackUploader: f({
    pdf: { maxFileSize: "16MB", maxFileCount: 10 },
    image: { maxFileSize: "8MB", maxFileCount: 20 },
    text: { maxFileSize: "16MB", maxFileCount: 10 },
    blob: { maxFileSize: "32MB", maxFileCount: 5 } // Used for CSVs
  })
    .middleware(async ({ req }: { req: Request }) => {
      // G-A12 Pre-requisite: Extract investigationId from headers
      const investigationId = req.headers["x-investigation-id"] as string;
      if (!investigationId) throw new Error("Missing investigation ID");
      
      return { investigationId, uploader: "API_SYSTEM" };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log(`Upload complete for investigation: ${metadata.investigationId}`);
      console.log(`File URL: ${file.url}`);

      // 1. Log the tamper-evident audit record
      await logAuditEvent({
        investigationId: metadata.investigationId,
        action: "EVIDENCE_UPLOADED" as any,
        actor: metadata.uploader,
        targetType: "FILE",
        targetId: file.key,
        description: `Uploaded case file: ${file.name}`
      });

      // 2. Queue the job for Ingestion Service
      await investigationQueue.add("ingest-evidence", {
        investigationId: metadata.investigationId,
        fileUrl: file.url,
        fileName: file.name,
        fileKey: file.key
      });
    }),
};

export type OurFileRouter = typeof uploadRouter;