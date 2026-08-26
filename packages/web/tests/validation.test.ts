import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  InvestigationStatusResponseSchema,
  StartInvestigationResponseSchema,
  HealthResponseSchema,
  ApiErrorResponseSchema,
  SseAuditEventSchema,
} from "@/lib/contracts/validation";
import type { InvestigationStatusResponse } from "@/lib/api/types";

describe("API Response Validation", () => {
  describe("InvestigationStatusResponseSchema", () => {
    const validResponse: InvestigationStatusResponse = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      investigationId: "550e8400-e29b-41d4-a716-446655440001",
      status: "QUEUED",
      state: "CREATED",
      currentStage: undefined,
      error: undefined,
      retryCount: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    it("should accept valid response", () => {
      const result = InvestigationStatusResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it("should reject invalid state", () => {
      const invalid = { ...validResponse, state: "INVALID_STATE" };
      const result = InvestigationStatusResponseSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("should reject invalid status", () => {
      const invalid = { ...validResponse, status: "INVALID_STATUS" };
      const result = InvestigationStatusResponseSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("should reject missing required fields", () => {
      const invalid = { id: "550e8400-e29b-41d4-a716-446655440000" };
      const result = InvestigationStatusResponseSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("StartInvestigationResponseSchema", () => {
    it("should accept valid response", () => {
      const response = {
        message: "Investigation queued successfully",
        runId: "550e8400-e29b-41d4-a716-446655440000",
      };
      const result = StartInvestigationResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it("should reject missing runId", () => {
      const response = { message: "ok" };
      const result = StartInvestigationResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });

  describe("HealthResponseSchema", () => {
    it("should accept valid health response", () => {
      const response = { status: "healthy", service: "indago-platform" };
      const result = HealthResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe("ApiErrorResponseSchema", () => {
    it("should accept error with message", () => {
      const response = { error: "Something went wrong" };
      const result = ApiErrorResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it("should accept error with details", () => {
      const response = {
        error: "Validation failed",
        details: { field: "caseId" },
      };
      const result = ApiErrorResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe("SseAuditEventSchema", () => {
    it("should accept valid audit event", () => {
      const event = {
        investigationId: "550e8400-e29b-41d4-a716-446655440000",
        action: "EVIDENCE_UPLOADED",
        actor: "API_SYSTEM",
        targetType: "FILE",
        targetId: "file-key-123",
        description: "Uploaded case file: audit.csv",
        timestamp: "2026-01-01T00:00:00.000Z",
      };
      const result = SseAuditEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it("should accept minimal event (only investigationId)", () => {
      const event = {
        investigationId: "550e8400-e29b-41d4-a716-446655440000",
      };
      const result = SseAuditEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });
  });
});
