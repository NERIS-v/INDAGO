import { logAuditEvent } from "../audit/logger.js";
import type { ToolResult } from "@indago/contracts";

export interface AgentClaim {
  id: string;
  claimText: string;
  referencedIds: string[];
}

export class ClaimGroundingError extends Error {
  constructor(message: string, public ungroundedIds: string[]) {
    super(message);
    this.name = "ClaimGroundingError";
  }
}

/**
 * Validates that an agent's claim is strictly grounded in the deterministic tool output.
 * Rejects if the agent references an ID that the tool didn't return.
 */
export async function validateClaim(
  investigationId: string,
  claim: AgentClaim,
  toolResult: ToolResult
): Promise<boolean> {
  const validOutputIds = new Set<string>();
  
  if (Array.isArray(toolResult.data)) {
    toolResult.data.forEach((item: any) => {
      if (item?.id) validOutputIds.add(item.id);
    });
  }

  const ungroundedIds = claim.referencedIds.filter(id => !validOutputIds.has(id));

  if (ungroundedIds.length > 0) {
    await logAuditEvent({
      investigationId,
      action: "CLAIM_REJECTED" as any, 
      actor: "CLAIM_GROUNDER",
      targetType: "AGENT_CLAIM",
      targetId: claim.id,
      description: `Agent hallucinated or misreferenced IDs: ${ungroundedIds.join(", ")}`
    });

    throw new ClaimGroundingError(
      "Agent claim rejected. Referenced IDs not found in tool output.", 
      ungroundedIds
    );
  }

  await logAuditEvent({
    investigationId,
    action: "CLAIM_ACCEPTED" as any,
    actor: "CLAIM_GROUNDER",
    targetType: "AGENT_CLAIM",
    targetId: claim.id,
    description: "Agent claim grounded successfully against deterministic tool output"
  });

  return true;
}