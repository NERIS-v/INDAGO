import { describe, it, expect, afterEach } from "vitest";
import {
  createWorkspaceProviders,
  resolveAppDataMode,
} from "@/lib/providers/factory";
import {
  resolveDataModeForWorkspace,
  DEMO_CASE_ID_ENV,
  DATA_MODE_ENV,
} from "@/lib/providers/config";
import { ProviderError } from "@/lib/providers/types";
import { CASE_ID } from "@/lib/providers/demo/demo-fixtures/lookup";

const env = (overrides: Record<string, string | undefined> = {}) => ({
  NODE_ENV: "test",
  ...overrides,
});

afterEach(() => {
  process.env.NODE_ENV = "test";
});

describe("demo leakage audit", () => {
  it("the configured demo case is allowed demo mode", () => {
    expect(
      resolveDataModeForWorkspace(CASE_ID, env({ [DATA_MODE_ENV]: "demo", [DEMO_CASE_ID_ENV]: CASE_ID })),
    ).toBe("demo");
    expect(
      resolveDataModeForWorkspace(CASE_ID, env({ [DATA_MODE_ENV]: "auto", [DEMO_CASE_ID_ENV]: CASE_ID })),
    ).toBe("live"); // auto outside development
  });

  it("auto mode in dev returns live for any non-demo case", () => {
    process.env.NODE_ENV = "development";
    expect(
      resolveDataModeForWorkspace("other-case", env({ [DATA_MODE_ENV]: "auto", [DEMO_CASE_ID_ENV]: CASE_ID })),
    ).toBe("live");
  });

  it("explicit demo mode for a non-demo case throws (never silently routes to mock)", () => {
    expect(() =>
      resolveDataModeForWorkspace("other-case", env({ [DATA_MODE_ENV]: "demo", [DEMO_CASE_ID_ENV]: CASE_ID })),
    ).toThrow();
  });

  it("a forced live-provider failure on a non-demo case surfaces a real ProviderError, not demo data", async () => {
    const { mode } = resolveAppDataMode("other-case", env({ [DATA_MODE_ENV]: "live" }));
    expect(mode).toBe("live");

    const providers = createWorkspaceProviders(
      { workspaceId: "workspace:other", caseId: "other-case", investigationId: "inv-other" },
      env({ [DATA_MODE_ENV]: "live" }),
    );
    expect(providers.mode).toBe("live");

    // Live investigation domain is not exposed by the platform yet: the
    // provider must throw a typed UNSUPPORTED ProviderError — NOT return demo
    // fixtures.
    await expect(providers.investigations.get("inv-other")).rejects.toBeInstanceOf(ProviderError);
    await expect(providers.leads.listByInvestigation("inv-other")).rejects.toBeInstanceOf(ProviderError);
  });
});
