import { describe, it, expect, vi, beforeEach } from "vitest";
import { escalateToHuman } from "../src/queue/recovery.js";
import { validateClaim, ClaimGroundingError } from "../src/security/grounding.js";
import { db } from "../src/db/prisma.js";
import { logAuditEvent } from "../src/audit/logger.js";
import { realtimeEvents } from "../src/realtime/sse.js";
import { randomUUID } from "node:crypto";

// ============================================================================
// Mocks
// ============================================================================
vi.mock("../src/db/prisma.js", () => ({
  db: {
    $transaction: vi.fn(async (callback) => callback(db)), 
    investigationRun: {
      update: vi.fn().mockResolvedValue({ id: "run_123", state: "ANALYZING" }),
    }
  }
}));

vi.mock("../src/audit/logger.js", () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock("../src/realtime/sse.js", () => ({
  realtimeEvents: {
    emit: vi.fn(),
  }
}));

// ============================================================================
// Phase 6B: Trust & Reliability Tests
// ============================================================================
describe("Phase 6B: Agent Reliability & Trust Constraints", () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Claim Grounding Validator", () => {
    it("should reject agent claims when referenced IDs are not in deterministic tool output", async () => {
      const toolResult = { data: [{ id: "valid_id_1" }] };
      const claim = {
        id: randomUUID(),
        claimText: "Suspect was verified by two sources.",
        referencedIds: ["valid_id_1", "hallucinated_id_999"]
      };

      await expect(validateClaim("case_123", claim, toolResult))
        .rejects
        .toThrowError(ClaimGroundingError);

      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CLAIM_REJECTED",
          description: expect.stringContaining("hallucinated_id_999")
        })
      );
    });

    it("should accept valid agent claims grounded in tool output", async () => {
      const toolResult = { data: [{ id: "valid_id_1" }, { id: "valid_id_2" }] };
      const claim = {
        id: randomUUID(),
        claimText: "Verified via two sources.",
        referencedIds: ["valid_id_1", "valid_id_2"]
      };

      const result = await validateClaim("case_123", claim, toolResult);
      expect(result).toBe(true);

      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "CLAIM_ACCEPTED" })
      );
    });
  });

  describe("Safe Human Escalation", () => {
    it("should escalate to human review and broadcast alert when recovery fails", async () => {
      await escalateToHuman("case_123", "run_123", "Continuous semantic failure");

      // 1. Verify State Machine is safely paused
      expect(db.investigationRun.update).toHaveBeenCalledWith({
        where: { id: "run_123" },
        data: expect.objectContaining({
          status: "PAUSED",
          currentStage: "HUMAN_ESCALATION",
          error: "Continuous semantic failure"
        })
      });

      // 2. Verify immutable audit trail record
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "HUMAN_ESCALATION_TRIGGERED",
          description: expect.stringContaining("Continuous semantic failure")
        })
      );

      // 3. Verify real-time UI alert
      expect(realtimeEvents.emit).toHaveBeenCalledWith(
        "progress",
        expect.objectContaining({
          type: "ALERT",
          message: expect.stringContaining("Human review required")
        })
      );
    });
  });
});