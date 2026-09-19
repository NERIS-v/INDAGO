// ============================================================================
// PR-22 — Lead adapter (provenance + alternative explanations) and valid-at
// panel surface.
//
// The LeadDrawer consumes toLeadDrawerFields; this pins that the persisted
// provenance chain and rich alternative explanations (kind, plausibility,
// requiresAdditionalEvidence) are adapted for display — never fabricated, and
// honestly absent when the lead carries none.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { toLeadDrawerFields } from "@/lib/intel/lead-adapter";
import type { Lead } from "@indago/contracts";

const INVESTIGATION_ID = "b1e0c9a6-0000-4000-8000-000000000002";
const CASE_ID = "a1a0a0a0-0000-4000-8000-000000000001";
const LEAD_ID = "c1c0c0c0-0000-4000-8000-000000000003";

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: LEAD_ID,
    investigationId: INVESTIGATION_ID,
    caseId: CASE_ID,
    title: "Bridge between A and B",
    description: "Structural signal description.",
    status: "UNDER_REVIEW",
    priority: "HIGH",
    confidence: 0.72,
    posture: "CORROBORATED",
    relatedEntityIds: [],
    supportingObservationIds: ["obs-1"],
    contradictingObservationIds: [],
    relatedEvidenceIds: [],
    gapIds: [],
    sourceCandidateType: "BRIDGE",
    sourceCandidateKey: "bridge:a-b",
    sourceCandidateSnapshot: {},
    alternativeExplanations: [],
    provenance: {
      entries: [
        {
          sourceId: "src-1",
          artifactId: "art-1",
          documentRef: "doc-x",
          extractor: "v1",
          derivedFrom: ["obs-0"],
        },
      ],
      createdAt: { value: "2026-01-01T00:00:00.000Z", precision: "exact" },
    },
    createdAt: { value: "2026-01-01T00:00:00.000Z", precision: "exact" },
    updatedAt: { value: "2026-01-02T00:00:00.000Z", precision: "exact" },
    ...overrides,
  };
}

describe("PR-22 — toLeadDrawerFields provenance + alternatives", () => {
  it("adapts the persisted provenance chain for display", () => {
    const fields = toLeadDrawerFields(lead());
    expect(fields.provenance?.entries.length).toBe(1);
    expect(fields.provenance?.entries[0]?.sourceId).toBe("src-1");
    expect(fields.provenance?.entries[0]?.extractor).toBe("v1");
    expect(fields.provenance?.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("reports null provenance when none is carried (honest absence, never fabricated)", () => {
    const fields = toLeadDrawerFields(lead({ provenance: undefined as never }));
    expect(fields.provenance).toBeNull();
  });

  it("adapts rich alternative explanations (kind, plausibility, requiresAdditionalEvidence)", () => {
    const fields = toLeadDrawerFields(
      lead({
        alternativeExplanations: [
          {
            kind: "COMMON_INFRASTRUCTURE",
            statement: "Shared employer could explain the bridge.",
            plausibility: 0.4,
            wouldBeConsistentWithEntityIds: [],
            requiresAdditionalEvidence: ["payroll records"],
            relatedObservationIds: [],
          },
        ],
      }),
    );
    expect(fields.alternatives.length).toBe(1);
    expect(fields.alternatives[0]?.kind).toBe("COMMON_INFRASTRUCTURE");
    expect(fields.alternatives[0]?.statement).toContain("Shared employer");
    expect(fields.alternatives[0]?.plausibility).toBe(0.4);
    expect(fields.alternatives[0]?.requiresAdditionalEvidence).toEqual(["payroll records"]);
  });

  it("returns an empty alternatives list when none are recorded", () => {
    const fields = toLeadDrawerFields(lead({ alternativeExplanations: [] }));
    expect(fields.alternatives).toEqual([]);
  });

  it("keeps support/against counts verbatim for evidence FOR/AGAINST display", () => {
    const fields = toLeadDrawerFields(
      lead({
        supportingObservationIds: ["obs-1", "obs-2"],
        contradictingObservationIds: ["obs-3"],
      }),
    );
    expect(fields.supportCount).toBe(2);
    expect(fields.againstCount).toBe(1);
  });
});