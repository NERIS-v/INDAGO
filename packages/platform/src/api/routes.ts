import { Router } from "express";
import { z } from "zod";
import { db } from "../db/prisma.js";
import { investigationQueue } from "../queue/orchestrator.js";
import { logAuditEvent } from "../audit/logger.js";
import { streamEventsHandler } from "../realtime/sse.js";
import { requireAuth, requireRole, requireCaseAccess } from "./auth.js";

export const apiRouter: Router = Router();

// Schema for the incoming webhook/API request
const StartInvestigationSchema = z.object({
  caseId: z.string(),
  investigationId: z.string().uuid(),
});

// 1. Lock down the Realtime Stream
apiRouter.get(
  "/investigations/:investigationId/stream", 
  requireAuth, 
  streamEventsHandler
);

// 2. Lock down the Start Investigation Endpoint
apiRouter.post(
  "/investigations/start", 
  requireAuth,                            // Must be logged in
  requireRole(["INVESTIGATOR", "ADMIN"]), // Must have correct role
  requireCaseAccess,                      // Must have clearance for this specific caseId
  async (req, res) => {
    try {
      // 1. Strict input validation
      const parsed = StartInvestigationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error });
      }

      const { caseId, investigationId } = parsed.data;

      // 2. Create the Investigation Run state in the database
      const run = await db.investigationRun.create({
        data: {
          investigationId,
          caseId,
          status: "QUEUED",
          state: "CREATED",
          contextData: { caseId }, // Store case scope in context
        }
      });

      // 3. Log the action to the tamper-evident audit trail
      await logAuditEvent({
        investigationId,
        action: "INVESTIGATION_OPENED" as any, // Cast to contracts AuditAction
        actor: req.user!.id, //logs the actual user ID instead of "API_SYSTEM"
        targetType: "INVESTIGATION_RUN",
        targetId: run.id,
        description: `Investigation run queued for case ${caseId}`
      });

      // 4. Push to BullMQ (Producer)
      await investigationQueue.add("investigation-pipeline", {
        runId: run.id
      });

      return res.status(202).json({ 
        message: "Investigation queued successfully", 
        runId: run.id 
      });

    } catch (error: any) {
      console.error("Failed to start investigation:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);