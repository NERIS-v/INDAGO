import { db } from "../db/prisma.js";
import { logAuditEvent } from "../audit/logger.js";
import { ClaimGroundingSchema, type ClaimGrounding } from "@indago/contracts";

export async function validateAgentClaim(
  runId: string, 
  investigationId: string, 
  claimRaw: unknown
): Promise<{ isValid: boolean; reason?: string }> {
  
  // 1. Validate the structure against Domain Contracts
  const parsed = ClaimGroundingSchema.safeParse(claimRaw);
  if (!parsed.success) {
    return { isValid: false, reason: "Claim payload failed contract schema validation." };
  }
  
  const claim: ClaimGrounding = parsed.data;

  // 2. Fetch authorized context
  
  const toolResults = await db.toolExecution.findMany({
    where: { runId, status: "COMPLETED" }
  });

  const authorizedIds = new Set<string>();
  for (const tr of toolResults) {
    const outputString = JSON.stringify(tr.output);
    // Extract all UUIDs from the tool output string
    const uuids = outputString.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig) || [];
    uuids.forEach(id => authorizedIds.add(id));
  }

  // 3. The Grounding Check
  const citedIds = [
    ...claim.supportingObservationIds,
    ...claim.supportingEvidenceIds
  ];

  for (const citedId of citedIds) {
    if (!authorizedIds.has(citedId)) {
      await logAuditEvent({
        investigationId,
        action: "SYSTEM_ACTION" as any,
        actor: "CLAIM_VALIDATOR",
        targetType: "CLAIM",
        targetId: claim.id,
        description: `REJECTED: Agent hallucinated or cited unauthorized ID: ${citedId}`
      });
      
      // REJECT UNSUPPORTED AGENT CLAIMS
      return { 
        isValid: false, 
        reason: `Claim references unverified ID: ${citedId}. You must use a tool to fetch this data first.` 
      };
    }
  }

  await logAuditEvent({
    investigationId,
    action: "SYSTEM_ACTION" as any,
    actor: "CLAIM_VALIDATOR",
    targetType: "CLAIM",
    targetId: claim.id,
    description: `Claim grounded successfully.`
  });

  return { isValid: true };
}