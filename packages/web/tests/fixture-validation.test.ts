import { describe, it, expect } from "vitest";
import { demoFixtures } from "@/lib/providers/demo/demo-fixtures";
import {
  validateDemoFixtures,
  assertDemoFixturesValid,
} from "@/lib/providers/demo/demo-fixtures/validate";
import { CASE_ID, INVESTIGATION_ID } from "@/lib/providers/demo/demo-fixtures/lookup";

describe("demo fixture canonical validation", () => {
  it("every canonical fixture parses against its Zod schema", () => {
    const report = validateDemoFixtures();
    expect(report.ok).toBe(true);
    if (!report.ok) {
      throw new Error(report.errors.join("\n"));
    }
    expect(report.errors).toEqual([]);
  });

  it("assertDemoFixturesValid does not throw for the valid dataset", () => {
    expect(() => assertDemoFixturesValid()).not.toThrow();
  });

  it("the assembled dataset is non-empty and internally coherent", () => {
    expect(demoFixtures.sources.length).toBeGreaterThan(0);
    expect(demoFixtures.evidence.length).toBeGreaterThan(0);
    expect(demoFixtures.observations.length).toBeGreaterThan(0);
    expect(demoFixtures.entities.length).toBeGreaterThan(0);
    expect(demoFixtures.leads.length).toBeGreaterThan(0);
    expect(demoFixtures.gaps.length).toBeGreaterThan(0);
    expect(demoFixtures.graphNodes.length).toBeGreaterThan(0);
    expect(demoFixtures.graphEdges.length).toBeGreaterThan(0);
    expect(demoFixtures.events.length).toBeGreaterThan(0);
  });

  it("cross-referenced ids resolve within the fixture set", () => {
    // Case + investigation use distinct, non-conflated identities.
    expect(CASE_ID).not.toBe(INVESTIGATION_ID);
    expect(demoFixtures.case.id).toBe(CASE_ID);
    expect(demoFixtures.investigation.id).toBe(INVESTIGATION_ID);
    expect(demoFixtures.investigation.caseId).toBe(CASE_ID);

    // Investigation-scoped catalog ids all belong to the same investigation.
    const evidenceIds = new Set(demoFixtures.evidence.map((e) => e.id));
    const entityIds = new Set(demoFixtures.entities.map((e) => e.id));
    const leadIds = new Set(demoFixtures.leads.map((l) => l.id));
    for (const id of demoFixtures.investigation.evidenceIds) {
      expect(evidenceIds.has(id)).toBe(true);
    }
    for (const id of demoFixtures.investigation.entityIds) {
      expect(entityIds.has(id)).toBe(true);
    }
    for (const id of demoFixtures.investigation.leadIds) {
      expect(leadIds.has(id)).toBe(true);
    }
  });
});
