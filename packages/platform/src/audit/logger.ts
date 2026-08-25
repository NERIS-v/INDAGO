import { db } from "../db/prisma.js";
import { createHash } from "node:crypto";
import type { AuditAction } from "@indago/contracts";

export async function logAuditEvent(params: {
  investigationId: string;
  action: AuditAction;
  actor: string;
  targetType: string;
  targetId: string;
  description: string;
}) {
  return await db.$transaction(async (tx) => {
    // 1. Fetch the tip of the hash chain
    const lastEvent = await tx.auditEvent.findFirst({
      orderBy: { timestamp: 'desc' }
    });

    const previousHash = lastEvent ? lastEvent.hash : "GENESIS";
    const timestamp = new Date();
    
    // 2. Compute cryptographically secure link
    const hashInput = `${previousHash}:${params.actor}:${params.action}:${params.targetId}:${timestamp.toISOString()}`;
    const hash = createHash("sha256").update(hashInput).digest("hex");

    // 3. Write immutable record
    return await tx.auditEvent.create({
      data: {
        investigationId: params.investigationId,
        action: params.action,
        actor: params.actor,
        targetType: params.targetType,
        targetId: params.targetId,
        description: params.description,
        timestamp,
        previousHash,
        hash
      }
    });
  });
}