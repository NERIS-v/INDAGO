import { describe, it, expect, afterEach } from "vitest";
import {
  resolveDataModeForWorkspace,
  DEMO_CASE_ID_ENV,
  DATA_MODE_ENV,
} from "@/lib/providers/config";
import { createWorkspaceProviders } from "@/lib/providers/factory";
import { CASE_ID, INVESTIGATION_ID } from "@/lib/providers/demo/demo-fixtures/lookup";
import type { WorkspaceIdentity } from "@/lib/providers/types";

const env = (overrides: Record<string, string | undefined> = {}) => ({
  NODE_ENV: "test",
  ...overrides,
});

afterEach(() => {
  process.env.NODE_ENV = "test";
});

describe("F-PR2 identity model", () => {
  it("caseId and investigationId are distinct for the demo fixtures", () => {
    expect(CASE_ID).not.toBe(INVESTIGATION_ID);
  });

  it("DataMode is resolved from caseId, not investigationId or workspaceId", () => {
    process.env.NODE_ENV = "development";
    const matching = env({
      [DATA_MODE_ENV]: "auto",
      [DEMO_CASE_ID_ENV]: CASE_ID,
    });

    // caseId (the demo case) => demo
    expect(resolveDataModeForWorkspace(CASE_ID, matching)).toBe("demo");

    // investigationId / a distinct workspace id must NOT resolve to demo
    expect(resolveDataModeForWorkspace(INVESTIGATION_ID, matching)).toBe("live");
    expect(resolveDataModeForWorkspace(`workspace:${INVESTIGATION_ID}`, matching)).toBe("live");
  });

  it("explicit demo mode requires the caseId to match DEMO_CASE_ID", () => {
    const matching = env({
      [DATA_MODE_ENV]: "demo",
      [DEMO_CASE_ID_ENV]: CASE_ID,
    });

    expect(resolveDataModeForWorkspace(CASE_ID, matching)).toBe("demo");
    // Passing the investigationId where a caseId is required must throw.
    expect(() =>
      resolveDataModeForWorkspace(INVESTIGATION_ID, matching),
    ).toThrow();
  });

  it("the factory exposes distinct identities on the demo bundle", () => {
    const identity: WorkspaceIdentity = {
      workspaceId: `workspace:${INVESTIGATION_ID}`,
      caseId: CASE_ID,
      investigationId: INVESTIGATION_ID,
    };
    // Send the demo case through the factory in demo mode.
    process.env.NODE_ENV = "development";
    const providers = createWorkspaceProviders(identity, {
      [DATA_MODE_ENV]: "demo",
      [DEMO_CASE_ID_ENV]: CASE_ID,
      NODE_ENV: "development",
    });

    expect(providers.mode).toBe("demo");
    expect(providers.workspaceId).toBe(`workspace:${INVESTIGATION_ID}`);
    expect(providers.caseId).toBe(CASE_ID);
    expect(providers.investigationId).toBe(INVESTIGATION_ID);
    expect(providers.caseId).not.toBe(providers.investigationId);
    expect(providers.workspaceId).not.toBe(providers.caseId);
    expect(providers.workspaceId).not.toBe(providers.investigationId);
  });

  it("investigation provider and realtime receive the investigation id, not workspaceId", async () => {
    const identity: WorkspaceIdentity = {
      workspaceId: `workspace:${INVESTIGATION_ID}`,
      caseId: CASE_ID,
      investigationId: INVESTIGATION_ID,
    };
    const providers = createWorkspaceProviders(identity, {
      [DATA_MODE_ENV]: "demo",
      [DEMO_CASE_ID_ENV]: CASE_ID,
      NODE_ENV: "development",
    });

    // Pulling by the investigation id succeeds (demo state is keyed by it).
    const investigation = await providers.investigations.get(INVESTIGATION_ID);
    expect(investigation.id).toBe(INVESTIGATION_ID);
    expect(investigation.caseId).toBe(CASE_ID);

    // Investigation-scoped catalog reads require the investigation id.
    const evidence = await providers.evidence.listByInvestigation(INVESTIGATION_ID);
    expect(evidence.items.length).toBeGreaterThan(0);

    // Realtime connect uses the investigation id (provider accepts it).
    providers.realtime.connect(INVESTIGATION_ID);
    expect(providers.realtime.getStatus()).toBe("connecting");

    // Passing a workspace key as if it were an investigation id must fail
    // loudly for the investigation resource (no silent workspace substitution).
    await expect(
      providers.investigations.get(identity.workspaceId),
    ).rejects.toThrow();
  });
});
