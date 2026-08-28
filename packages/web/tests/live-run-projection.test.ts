import { describe, it, expect } from "vitest";
import { InvestigationSchema } from "@indago/contracts";
import {
  projectRunStatusToInvestigation,
  INVESTIGATION_STATUS_BY_RUN_STATUS,
} from "@/lib/providers/live/run-projection";
import type { InvestigationStatusResponse } from "@/lib/api/types";

const CASE_ID = "550e8400-e29b-41d4-a716-446655440010";
const INVESTIGATION_ID = "550e8400-e29b-41d4-a716-446655440020";

function makeRun(
  overrides: Partial<InvestigationStatusResponse> = {},
): InvestigationStatusResponse {
  return {
    id: "run-1",
    investigationId: INVESTIGATION_ID,
    status: "RUNNING",
    state: "INGESTING",
    currentStage: "extracting financial records",
    retryCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T12:30:00.000Z",
    ...overrides,
  };
}

describe("projectRunStatusToInvestigation", () => {
  it("maps endpoint-exposed fields verbatim (id, caseId, timestamps)", () => {
    const projected = projectRunStatusToInvestigation(
      { investigationId: INVESTIGATION_ID, caseId: CASE_ID },
      makeRun(),
    );
    expect(projected.id).toBe(INVESTIGATION_ID);
    expect(projected.caseId).toBe(CASE_ID);
    expect(projected.createdAt).toEqual({
      value: "2026-01-01T00:00:00.000Z",
      precision: "exact",
    });
    expect(projected.updatedAt).toEqual({
      value: "2026-01-02T12:30:00.000Z",
      precision: "exact",
    });
    expect(projected.description).toBe("extracting financial records");
  });

  it("falls back to the run error message for description when no stage exists", () => {
    const projected = projectRunStatusToInvestigation(
      { investigationId: INVESTIGATION_ID, caseId: CASE_ID },
      makeRun({ currentStage: undefined, error: "Ingestion failed: timeout" }),
    );
    expect(projected.description).toBe("Ingestion failed: timeout");
  });

  it("uses documented neutral PROJECTION defaults for unsourced canonical fields", () => {
    const projected = projectRunStatusToInvestigation(
      { investigationId: INVESTIGATION_ID, caseId: CASE_ID },
      makeRun(),
    );
    expect(projected.title).toBe(`Investigation ${INVESTIGATION_ID}`);
    expect(projected.priority).toBe("MEDIUM");
    expect(projected.owner).toBe("platform");
    expect(projected.entityIds).toEqual([]);
    expect(projected.evidenceIds).toEqual([]);
    expect(projected.hypothesisIds).toEqual([]);
    expect(projected.leadIds).toEqual([]);
    expect(projected.confidence).toBeUndefined();
    expect(projected.temporalScope).toBeUndefined();
  });

  it("maps run execution status to investigation lifecycle status per the documented table", () => {
    const cases: Array<[string, string]> = [
      ["QUEUED", "ACTIVE"],
      ["INITIALIZING", "ACTIVE"],
      ["RUNNING", "ACTIVE"],
      ["PAUSED", "PAUSED"],
      ["COMPLETED", "CLOSED"],
      ["FAILED", "PAUSED"],
      ["CANCELLED", "ARCHIVED"],
    ];
    for (const [runStatus, expected] of cases) {
      const projected = projectRunStatusToInvestigation(
        { investigationId: INVESTIGATION_ID, caseId: CASE_ID },
        makeRun({ status: runStatus }),
      );
      expect(projected.status).toBe(expected);
      expect(INVESTIGATION_STATUS_BY_RUN_STATUS[runStatus]).toBe(expected);
    }
  });

  it("defaults unknown future run statuses to ACTIVE (deterministic, forward-compatible)", () => {
    const projected = projectRunStatusToInvestigation(
      { investigationId: INVESTIGATION_ID, caseId: CASE_ID },
      makeRun({ status: "SOME_FUTURE_STATUS" }),
    );
    expect(projected.status).toBe("ACTIVE");
  });

  it("is deterministic: identical inputs produce identical output", () => {
    const ctx = { investigationId: INVESTIGATION_ID, caseId: CASE_ID };
    const run = makeRun();
    expect(projectRunStatusToInvestigation(ctx, run)).toEqual(
      projectRunStatusToInvestigation(ctx, run),
    );
  });

  it("returns a schema-valid canonical Investigation", () => {
    const projected = projectRunStatusToInvestigation(
      { investigationId: INVESTIGATION_ID, caseId: CASE_ID },
      makeRun(),
    );
    // Strict schema: parse would throw if any required canonical field is
    // missing or if an unexpected field was included.
    expect(() => InvestigationSchema.parse(projected)).not.toThrow();
  });

  it("throws rather than fabricating when the input is not a valid run status", () => {
    expect(() =>
      projectRunStatusToInvestigation(
        { investigationId: INVESTIGATION_ID, caseId: CASE_ID },
        makeRun({ investigationId: "" }),
      ),
    ).toThrow();
  });
});