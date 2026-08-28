import { createUploadthing, type FileRouter } from "uploadthing/express";
import type { Request } from "express";
import { resolveUploadAuth, verifyCaseAccess, type AuthenticatedUser } from "./auth.js";
import { logAuditEvent } from "../audit/logger.js";
import { db } from "../db/prisma.js";

const f = createUploadthing();

// ============================================================================
// UploadThing File Router
//
// UploadThing onUploadComplete is NOT a BullMQ producer. It:
//   1. Resolves the investigation + canonical case from DB
//   2. Verifies case boundary authorization ONLY when an authenticated
//      principal exists (browser uploads carry no principal by design —
//      they are authenticated by UploadThing's signed-upload handshake).
//   3. Records the upload to the audit ledger (awaited; failures propagate)
//      ONLY for an authenticated principal that passed verifyCaseAccess.
//
// ANONYMOUS UPLOADS ARE PROVIDER-UPLOAD STAGING (Prompt 4 decision): a file
// arriving at UploadThing's CDN is not yet evidence for any case and no
// principal has claimed case scope. Writing a case-scoped EVIDENCE_UPLOADED
// audit would record an evidence-lifecycle event that does not exist yet — so
// the callback records NOTHING for anonymous uploads. The authorized evidence
// submission (POST /api/v1/investigations/:id/evidence → BullMQ worker) is
// what creates the case-scoped audit trail (EVIDENCE_INGESTED etc.).
//
// Case authorization is ALWAYS enforced for every file at the evidence
// submission endpoint — the single queue producer. onUploadComplete never
// claims "case authorization verified" for anonymous uploads.
// ============================================================================

/**
 * Metadata handed to the completion callback. `uploader` is set ONLY when the
 * request presented a Bearer token that passed verifyToken(); anonymous
 * browser uploads have `uploader` undefined.
 */
export interface UploadCompleteMetadata {
  readonly investigationId: string;
  readonly uploader?: AuthenticatedUser | undefined;
}

export interface UploadedFileDescriptor {
  readonly key: string;
  readonly name: string;
}

/**
 * Completion policy for an accepted provider upload. Testable in isolation
 * (the SDK `onUploadComplete` wrapper only forwards here).
 *
 *   - Missing investigation / case   → throws (await propagates)
 *   - Authenticated principal        → verifyCaseAccess(principal, run.caseId);
 *                                      deny throws WITHOUT recording an audit
 *   - Anonymous upload               → PROVIDER-UPLOAD STAGING: accepted, but
 *                                      NO case-scoped audit is recorded — no
 *                                      principal asserted case scope and the
 *                                      file is not yet evidence. The authorized
 *                                      submission produces the audit trail.
 *   - Audit write                    → awaited; a failure propagates (never
 *                                      silently swallowed)
 */
export async function handleUploadComplete(
  metadata: UploadCompleteMetadata,
  file: UploadedFileDescriptor,
): Promise<void> {
  const { investigationId, uploader } = metadata;

  const run = await db.investigationRun.findUnique({
    where: { investigationId },
  });
  if (!run) throw new Error("Investigation not found");

  const caseId = run.caseId;
  if (!caseId) throw new Error("Investigation has no associated case");

  if (!uploader) {
    // Provider-upload staging: the file exists in UploadThing's CDN but has no
    // case-scoped authorization yet. Record NO audit here — a case-scoped
    // EVIDENCE_UPLOADED would assert an evidence-lifecycle event that only the
    // authorized evidence submission can create.
    return;
  }

  if (!verifyCaseAccess(uploader, caseId)) {
    throw new Error(
      `Unauthorized: uploader ${uploader.id} lacks access to case boundary ${caseId}`,
    );
  }

  await logAuditEvent({
    investigationId,
    action: "EVIDENCE_UPLOADED",
    actor: uploader.id,
    targetType: "FILE",
    targetId: file.key,
    description: `Upload accepted: ${file.name} (case: ${caseId}, verified for ${uploader.id})`,
  });
}

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

      // Auth model (Prompt 3 §8/§10):
      //  - Browser uploads carry no Bearer token (the browser never sees
      //    AUTH_TOKEN). They are authenticated by UploadThing's own signed
      //    upload handshake and allowed through with no principal. Case
      //    authorization for those files is enforced at the evidence-submission
      //    API boundary — the single BullMQ producer.
      //  - If a Bearer token IS presented, it must satisfy the same
      //    verifyToken() boundary as the REST API (defense in depth).
      const auth = resolveUploadAuth(req.headers);
      if (!auth.authorized) throw new Error(auth.reason);

      return { investigationId, uploader: auth.user ?? undefined };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      await handleUploadComplete(metadata, file);
    }),
};

export type OurFileRouter = typeof uploadRouter;