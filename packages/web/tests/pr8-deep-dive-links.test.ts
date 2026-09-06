// ============================================================================
// PR-8 — Deep-dive bridges: pure link composition (deep-dive-links.ts)
//
// Every deep link is a REAL href into the workspace surfaces built through the
// central URL helpers (investigationUrl + the network/entity query params), so
// ?caseId= is always preserved and no dead/placeholder route is produced.
// Availability is driven by the RESOLVED CONTEXT DATA (aggregated provider
// slices), never by fabrication — a null slice reports available:false with an
// honest note.
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  relationDeepDiveLinks,
  entityDeepDiveLinks,
  type DeepDiveSource,
} from "@/lib/context/deep-dive-links";
import type { RelationContextDetails, EntityContextDetails } from "@/lib/context/context-details";
import type { RelationHypothesis } from "@indago/contracts";
import { CASE_ID, INVESTIGATION_ID, ENT_VICTOR } from "@/lib/providers/demo/demo-fixtures/lookup";

const source: DeepDiveSource = { investigationId: INVESTIGATION_ID, caseId: CASE_ID };

function relation(details: Partial<RelationContextDetails> = {}): RelationContextDetails {
  return {
    kind: "relation",
    id: "b1e0c9a6-0000-4000-8000-000000000055",
    relation: {
      id: "b1e0c9a6-0000-4000-8000-000000000055",
      sourceEntityId: ENT_VICTOR,
      targetEntityId: "b1e0c9a6-0000-4000-8000-000000000043",
      relationType: "FINANCIAL",
      status: "PROPOSED",
      support: 0.7,
      updatedAt: { value: "2026-01-01T00:00:00.000Z", precision: "exact" },
    } as RelationHypothesis,
    sourceName: "Victor Aldridge",
    targetName: "Meridian Holdings",
    linkedObservations: [],
    linkedHypotheses: [],
    ...details,
  };
}

function entity(details: Partial<EntityContextDetails> = {}): EntityContextDetails {
  return {
    kind: "entity",
    id: ENT_VICTOR,
    entity: {} as any,
    observations: [],
    relations: [],
    evidence: [],
    hypotheses: [],
    openGaps: [],
    activeLeads: [],
    contradictions: [],
    foreignOverlays: [],
    ...details,
  };
}

describe("PR-8 — relation deep-dive links", () => {
  it("every link is REAL: absolute workspace href, ?caseId= preserved, no dead routes", () => {
    const links = relationDeepDiveLinks(source, relation());
    const ids = links.map((l) => l.id);
    expect(ids).toContain("network");
    expect(ids).toContain("observations");
    expect(ids).toContain("evidence");
    expect(ids).toContain("hypotheses");
    expect(ids).toContain("leads");
    expect(ids).toContain("gaps");
    expect(ids).toContain("timeline");
    expect(ids).toContain("review");
    expect(ids).toContain("robustness");
    expect(ids).toContain("ledger");
    expect(ids).toContain("cross-case");

    for (const link of links) {
      expect(link.href).toMatch(new RegExp(`^/investigations/${INVESTIGATION_ID}`));
      expect(link.href).toContain(`caseId=${CASE_ID}`);
      expect(link.href).not.toContain("#");
      expect(link.href.trim().length).toBeGreaterThan(0);
    }
  });

  it("the network bridge focus-params the relation's source entity", () => {
    const network = relationDeepDiveLinks(source, relation()).find((l) => l.id === "network")!;
    expect(network.available).toBe(true);
    expect(network.href).toContain("focus=");
    expect(network.href).toContain(encodeURIComponent(ENT_VICTOR));
  });

  it("the observations bridge entity-params the source entity", () => {
    const obs = relationDeepDiveLinks(source, relation()).find((l) => l.id === "observations")!;
    expect(obs.href).toContain("entity=");
    expect(obs.href).toContain("/observations");
  });

  it("a null slice reports an honest unavailable bridge, never a dead anchor", () => {
    const links = relationDeepDiveLinks(
      source,
      relation({ linkedObservations: null, linkedHypotheses: null }),
    );
    const obs = links.find((l) => l.id === "observations")!;
    const hyp = links.find((l) => l.id === "hypotheses")!;
    expect(obs.available).toBe(false);
    expect(obs.note).toContain("Observations are not exposed");
    expect(obs.available).toBe(false);
    // still a resolvable href (the surface exists), but the DATA gate is honest
    expect(obs.href).toContain("caseId=");
    expect(hyp.available).toBe(false);
    expect(hyp.note).toContain("Hypotheses are not exposed");
  });

  it("page-level bridges are always valid destinations", () => {
    const links = relationDeepDiveLinks(source, relation({ linkedObservations: null }));
    for (const id of ["network", "evidence", "leads", "gaps", "timeline", "review", "robustness", "ledger", "cross-case"]) {
      const link = links.find((l) => l.id === id)!;
      expect(link.available).toBe(true);
    }
  });
});

describe("PR-8 — entity deep-dive links", () => {
  it("every link is REAL with ?caseId= preserved and no dead routes", () => {
    const links = entityDeepDiveLinks(source, entity());
    expect(links).toHaveLength(11);
    for (const link of links) {
      expect(link.href).toMatch(new RegExp(`^/investigations/${INVESTIGATION_ID}`));
      expect(link.href).toContain(`caseId=${CASE_ID}`);
      expect(link.href).not.toContain("#");
    }
    const network = links.find((l) => l.id === "network")!;
    expect(network.href).toContain(`focus=${encodeURIComponent(ENT_VICTOR)}`);
  });

  it("null slices gate their bridges individually with honest notes", () => {
    const links = entityDeepDiveLinks(
      source,
      entity({ observations: null, foreignOverlays: null }),
    );
    expect(links.find((l) => l.id === "observations")!.available).toBe(false);
    expect(links.find((l) => l.id === "observations")!.note).toContain("not exposed");
    expect(links.find((l) => l.id === "cross-case")!.available).toBe(false);
    expect(links.find((l) => l.id === "cross-case")!.note).toContain("not exposed");
    expect(links.find((l) => l.id === "leads")!.available).toBe(true);
    expect(links.find((l) => l.id === "gaps")!.available).toBe(true);
    expect(links.find((l) => l.id === "timeline")!.available).toBe(true);
  });

  it("labels/hints are stable and non-empty", () => {
    for (const link of entityDeepDiveLinks(source, entity())) {
      expect(link.label.trim().length).toBeGreaterThan(0);
      expect(link.hint.trim().length).toBeGreaterThan(0);
    }
  });
});