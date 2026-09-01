import { describe, it, expect } from "vitest";
import { createWorkspaceDemoProviders } from "@/lib/providers/demo/providers";
import { createLiveWorkspaceProviders } from "@/lib/providers/live/providers";
import { ProviderError } from "@/lib/providers/types";
import { demoFixtures } from "@/lib/providers/demo/demo-fixtures";
import { demoDiscoveryCandidates } from "@/lib/providers/demo/demo-fixtures/discovery";
import {
  operationFinancialShadowContradictions,
  contradictionsForObservation,
} from "@/lib/providers/demo/demo-fixtures/contradictions";
import { ENTITY_LINK_BY_CANDIDATE } from "@/lib/providers/demo/demo-fixtures/entity-resolution";
import {
  CASE_ID,
  INVESTIGATION_ID,
  OBS_8,
  OBS_9,
  EMC_NOMINEE,
  EMC_VICTOR_RESIDENCE,
  PAIR_RES_1,
  HYP_RES_1,
  CONTRADICTION_1,
  ENT_VICTOR,
  ENT_SHELL_ONE,
  GE_5,
} from "@/lib/providers/demo/demo-fixtures/lookup";
import type { WorkspaceIdentity } from "@/lib/providers/types";

function identity(): WorkspaceIdentity {
  return {
    workspaceId: `workspace:${INVESTIGATION_ID}`,
    caseId: CASE_ID,
    investigationId: INVESTIGATION_ID,
  };
}

const config = { simulateLatency: false };

describe("F-PR4 fixture coherence", () => {
  it("the contradiction pairs OBS_8 (shared-address line) against OBS_9 (CC-882 cross-check)", () => {
    expect(CONTRADICTION_1).toBeDefined();
    const c = operationFinancialShadowContradictions.find(
      (x) => x.id === CONTRADICTION_1,
    );
    expect(c).toBeDefined();
    expect(c?.contradictionType).toBe("DIRECT_REFUTATION");
    expect(c?.strength).toBeGreaterThan(0.5);
    expect(c?.leftObservationId).toBe(OBS_8);
    expect(c?.rightObservationId).toBe(OBS_9);
    expect(c?.evidenceIds).toHaveLength(2);
  });

  it("contradictionsForObservation returns the pair for either side", () => {
    const byLeft = contradictionsForObservation(OBS_8);
    const byRight = contradictionsForObservation(OBS_9);
    expect(byLeft.some((c) => c.id === CONTRADICTION_1)).toBe(true);
    expect(byRight.some((c) => c.id === CONTRADICTION_1)).toBe(true);
  });

  it("OBS_9 is a canonical observation grounded in EVID_REGISTRY_2/SRC_REGISTRY", () => {
    const obs = demoFixtures.observations.find((o) => o.id === OBS_9);
    expect(obs).toBeDefined();
    expect(obs?.type).toBe("RELATIONAL");
    expect(obs?.entityIds).toContain(ENT_VICTOR);
    expect(obs?.candidateMentions).toContain("V. Aldridge");
    expect(obs?.candidateMentions).toContain("8 Rue des Capucines");
    expect(obs?.evidenceId).toBe("b1e0c9a6-0000-4000-8000-000000000029");
  });

  it("ENTITY_LINK_BY_CANDIDATE: only the right/linked side resolves; nominee stays unlinked", () => {
    expect(ENTITY_LINK_BY_CANDIDATE[EMC_VICTOR_RESIDENCE]).toBe(ENT_VICTOR);
    expect(ENTITY_LINK_BY_CANDIDATE[EMC_NOMINEE]).toBeUndefined();
  });

  it("the ER score is a ranking signal — the hypothesis starts UNRESOLVED despite score 0.51", () => {
    const hypothesis = demoFixtures.entityHypotheses.find(
      (h) => h.id === HYP_RES_1,
    );
    expect(hypothesis).toBeDefined();
    expect(hypothesis?.status).toBe("UNRESOLVED");
    expect(hypothesis?.comparisonStatus).toBe("COMPARED_AND_UNRESOLVED");
    expect(hypothesis?.score).toBeGreaterThan(0.5);
  });

  it("the resolution comparison evidence includes a genuine ADDRESS DIFFERENT with grounded contradiction", () => {
    const resolution = demoFixtures.resolutions.find(
      (r) => r.candidatePairId === PAIR_RES_1,
    );
    expect(resolution).toBeDefined();
    const address = resolution?.comparisonEvidence.find(
      (e) => e.feature === "ADDRESS",
    );
    expect(address?.relation).toBe("DIFFERENT");
    const uuid = resolution?.comparisonEvidence.find(
      (e) => e.feature === "UUID",
    );
    expect(uuid?.relation).toBe("BOTH_ABSENT");
    expect(resolution?.supportingObservationIds).toContain(OBS_8);
    expect(resolution?.contradictingObservationIds).toContain(OBS_9);
  });
});

describe("F-PR4 Discovery Mode determinism", () => {
  it("ranks the top-3 by degree then structuralImportance (labels are graph display names)", () => {
    expect(demoDiscoveryCandidates.map((c) => c.label)).toEqual([
      "Intermediary Account 0093",
      "Victor Aldridge",
      "Aldridge Holdings S.A.",
    ]);
    const [first, second, third] = demoDiscoveryCandidates;
    // BANK is the central wiring point, the rest tie on degree and sort by
    // structuralImportance — never by support score.
    expect(first.degree).toBeGreaterThan(second.degree);
    expect(second.degree).toBeGreaterThanOrEqual(third.degree);
  });

  it("flags SHELL_ONE as incident to a contradicted link, VICTOR as a bridge node", () => {
    const shellOne = demoDiscoveryCandidates.find(
      (c) => c.entityId === ENT_SHELL_ONE,
    );
    expect(shellOne?.contradictedEdgeIds).toContain(GE_5);
    expect(
      shellOne?.reasons.some((r) => r.includes("CONTRADICTED")),
    ).toBe(true);

    const victor = demoDiscoveryCandidates.find(
      (c) => c.entityId === ENT_VICTOR,
    );
    expect(victor?.bridgeNote).not.toBeNull();
    expect(victor?.reasons.some((r) => r.startsWith("Bridge:"))).toBe(true);
  });

  it("reasons are factual, derived from canonical graph data (never relevance)", () => {
    for (const c of demoDiscoveryCandidates) {
      expect(c.reasons.length).toBeGreaterThan(0);
      for (const r of c.reasons) {
        expect(r.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("F-PR4 demo ER lifecycle", () => {
  it("lists one unresolved candidate through the workspace bundle", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    const page = await providers.intelligence.listCandidates(
      INVESTIGATION_ID,
      { pageSize: 20 },
    );
    expect(page.items.length).toBeGreaterThan(0);
    const view = page.items.find((v) => v.resolutionId === HYP_RES_1);
    expect(view).toBeDefined();
    expect(view?.hypothesis.status).toBe("UNRESOLVED");
    expect(view?.left).toBeDefined();
    expect(view?.right).toBeDefined();
    expect(view?.leftEntity).toBeNull();
    expect(view?.rightEntity?.id).toBe(ENT_VICTOR);
  });

  it("listContradictions returns the grounded contradiction through the bundle", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    const page = await providers.intelligence.listContradictions(
      INVESTIGATION_ID,
      { pageSize: 20 },
    );
    expect(page.items.map((c) => c.id)).toContain(CONTRADICTION_1);
  });

  it("accept records a decision and never merges canonical data", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    const view = await providers.intelligence.accept(
      INVESTIGATION_ID,
      HYP_RES_1,
    );
    expect(view.hypothesis.status).toBe("ACCEPTED");
    expect(view.hypothesis.comparisonStatus).toBe("RESOLVED_MATCH");
    // The candidate's absence of a linked canonical entity is preserved — the
    // decision itself does not fabricate a merge.
    const fresh = await providers.intelligence.getCandidate(
      INVESTIGATION_ID,
      HYP_RES_1,
    );
    expect(fresh.leftEntity).toBeNull();
  });

  it("reverse restores the hypothesis to a reversible, history-keeping state", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    await providers.intelligence.accept(INVESTIGATION_ID, HYP_RES_1);
    const reversed = await providers.intelligence.reverse(
      INVESTIGATION_ID,
      HYP_RES_1,
    );
    expect(reversed.hypothesis.status).toBe("REVERSED");
    expect(reversed.hypothesis.comparisonStatus).toBe("COMPARED_AND_UNRESOLVED");
    // The hypothesis is still listed — reversal never deletes it.
    const page = await providers.intelligence.listCandidates(
      INVESTIGATION_ID,
      { pageSize: 20 },
    );
    expect(page.items.some((v) => v.resolutionId === HYP_RES_1)).toBe(true);
    expect(page.items.find((v) => v.resolutionId === HYP_RES_1)?.hypothesis.status).toBe(
      "REVERSED",
    );
  });

  it("reverse throws for a never-resolved hypothesis", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    await expect(
      providers.intelligence.reverse(INVESTIGATION_ID, HYP_RES_1),
    ).rejects.toThrow(ProviderError);
  });

  it("keepUnresolved records the deliberate decision and stays COMPARED_AND_UNRESOLVED", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    const kept = await providers.intelligence.keepUnresolved(
      INVESTIGATION_ID,
      HYP_RES_1,
    );
    expect(kept.hypothesis.status).toBe("UNRESOLVED");
    expect(kept.hypothesis.comparisonStatus).toBe("COMPARED_AND_UNRESOLVED");
  });

  it("wrong investigation id rejects all ER/contradiction/listDiscovery calls", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    await expect(
      providers.intelligence.getCandidate("missing-inv", HYP_RES_1),
    ).rejects.toThrow(ProviderError);
    await expect(
      providers.intelligence.listContradictions("missing-inv"),
    ).rejects.toThrow(ProviderError);
    await expect(
      providers.intelligence.listDiscovery("missing-inv"),
    ).rejects.toThrow(ProviderError);
  });
});

describe("F-PR4 relation + discovery providers", () => {
  it("DemoRelationProvider lists relation hypotheses for the investigation", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    const page = await providers.relations.listByInvestigation(
      INVESTIGATION_ID,
      { pageSize: 100 },
    );
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items[0].relationType).toBeTruthy();
  });

  it("DemoRelationProvider rejects the wrong investigation", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    await expect(
      providers.relations.listByInvestigation("missing-inv"),
    ).rejects.toThrow(ProviderError);
  });

  it("getSource and getArtifact resolve through the intelligence provider", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    const source = await providers.intelligence.getSource(
      demoFixtures.sources[0].id,
    );
    expect(source.id).toBe(demoFixtures.sources[0].id);
  });

  it("listDiscovery is deterministic and structural (repeats produce identical order)", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    const a = await providers.intelligence.listDiscovery(INVESTIGATION_ID, {
      pageSize: 20,
    });
    const b = await providers.intelligence.listDiscovery(INVESTIGATION_ID, {
      pageSize: 20,
    });
    expect(a.items.map((c) => c.id)).toEqual(b.items.map((c) => c.id));
    expect(a.items.map((c) => c.id)).toEqual(
      demoDiscoveryCandidates.map((c) => c.id),
    );
  });
});

describe("F-PR4 catalog boundary", () => {
  it("demo graph provider owns the demo overlay catalog", async () => {
    const providers = createWorkspaceDemoProviders(identity(), config);
    const catalog = await providers.graph.getOverlayCatalog();
    expect(catalog).toBeDefined();
    expect(Object.keys(catalog).length).toBeGreaterThan(0);
  });

  it("live graph provider resolves an empty overlay catalog (no demo leak)", async () => {
    const providers = createLiveWorkspaceProviders(identity(), config);
    const catalog = await providers.graph.getOverlayCatalog();
    expect(catalog).toEqual({});
  });
});

describe("F-PR4 live stubs", () => {
  const providers = createLiveWorkspaceProviders(identity(), {
    simulateLatency: false,
  });

  it("relations/listByInvestigation and get are UNSUPPORTED", async () => {
    await expect(
      providers.relations.listByInvestigation(INVESTIGATION_ID),
    ).rejects.toMatchObject({ code: "UNSUPPORTED" });
    await expect(providers.relations.get("any-id")).rejects.toMatchObject({
      code: "UNSUPPORTED",
    });
  });

  it("intelligence methods are UNSUPPORTED with an explicit message", async () => {
    await expect(
      providers.intelligence.listContradictions(INVESTIGATION_ID),
    ).rejects.toMatchObject({ code: "UNSUPPORTED" });
    await expect(
      providers.intelligence.listCandidates(INVESTIGATION_ID),
    ).rejects.toMatchObject({ code: "UNSUPPORTED" });
    await expect(
      providers.intelligence.accept(INVESTIGATION_ID, HYP_RES_1),
    ).rejects.toMatchObject({ code: "UNSUPPORTED" });
    await expect(
      providers.intelligence.listDiscovery(INVESTIGATION_ID) as Promise<unknown>,
    ).rejects.toMatchObject({ code: "UNSUPPORTED" });
  });
});