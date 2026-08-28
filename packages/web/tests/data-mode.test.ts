import { describe, it, expect, afterEach } from "vitest";
import {
  resolveDataModeForWorkspace,
  DEMO_CASE_ID_ENV,
  DATA_MODE_ENV,
  TIMING_SCALE_ENV,
} from "@/lib/providers/config";

const CASE_A = "case-A";
const CASE_B = "case-B";

interface EnvLike {
  [key: string]: string | undefined;
  NODE_ENV?: string;
}

function env(overrides: EnvLike = {}): EnvLike {
  return { NODE_ENV: "test", ...overrides };
}

afterEach(() => {
  process.env.NODE_ENV = "test";
});

describe("resolveDataModeForWorkspace — demo-only invariant", () => {
  it("DATA_MODE=live always returns live, regardless of caseId", () => {
    expect(
      resolveDataModeForWorkspace(CASE_B, env({ [DATA_MODE_ENV]: "live" })),
    ).toBe("live");
    expect(
      resolveDataModeForWorkspace(CASE_A, env({ [DATA_MODE_ENV]: "live" })),
    ).toBe("live");
  });

  it("DATA_MODE=demo returns demo ONLY for the configured demo case", () => {
    const matching = env({
      [DATA_MODE_ENV]: "demo",
      [DEMO_CASE_ID_ENV]: CASE_A,
    });
    expect(resolveDataModeForWorkspace(CASE_A, matching)).toBe("demo");
  });

  it("DATA_MODE=demo with a NON-demo case throws (no silent fallback)", () => {
    const cfg = env({ [DATA_MODE_ENV]: "demo", [DEMO_CASE_ID_ENV]: CASE_A });
    expect(() => resolveDataModeForWorkspace(CASE_B, cfg)).toThrow(
      /only permits the configured demo case/,
    );
  });

  it("DATA_MODE=demo without DEMO_CASE_ID throws", () => {
    expect(() =>
      resolveDataModeForWorkspace(CASE_A, env({ [DATA_MODE_ENV]: "demo" })),
    ).toThrow(/must be set when/);
  });

  it("DATA_MODE=auto in DEVELOPMENT returns demo for the demo case and live otherwise", () => {
    process.env.NODE_ENV = "development";
    const cfg = env({ [DATA_MODE_ENV]: "auto", [DEMO_CASE_ID_ENV]: CASE_A });

    expect(resolveDataModeForWorkspace(CASE_A, cfg)).toBe("demo");
    expect(resolveDataModeForWorkspace(CASE_B, cfg)).toBe("live");
  });

  it("DATA_MODE=auto in PRODUCTION returns live even for the demo case", () => {
    process.env.NODE_ENV = "production";
    const cfg = env({ [DATA_MODE_ENV]: "auto", [DEMO_CASE_ID_ENV]: CASE_A });

    expect(resolveDataModeForWorkspace(CASE_A, cfg)).toBe("live");
    expect(resolveDataModeForWorkspace(CASE_B, cfg)).toBe("live");
  });

  it("defaults to auto in development (no DATA_MODE) and live in production", () => {
    process.env.NODE_ENV = "development";
    const cfgDev = env({ [DEMO_CASE_ID_ENV]: CASE_A });
    expect(resolveDataModeForWorkspace(CASE_A, cfgDev)).toBe("demo");
    expect(resolveDataModeForWorkspace(CASE_B, cfgDev)).toBe("live");

    process.env.NODE_ENV = "production";
    const cfgProd = env({ [DEMO_CASE_ID_ENV]: CASE_A });
    expect(resolveDataModeForWorkspace(CASE_A, cfgProd)).toBe("live");
    expect(resolveDataModeForWorkspace(CASE_B, cfgProd)).toBe("live");
  });

  it("never routes an arbitrary non-demo case to demo", () => {
    const mode = resolveDataModeForWorkspace(CASE_B, env({ [DATA_MODE_ENV]: "auto", [DEMO_CASE_ID_ENV]: CASE_A }));
    expect(mode).toBe("live");
  });

  it("rejects invalid DATA_MODE values by falling back to defaults (dev auto)", () => {
    process.env.NODE_ENV = "development";
    const cfg = env({ [DATA_MODE_ENV]: "banana", [DEMO_CASE_ID_ENV]: CASE_A });
    expect(resolveDataModeForWorkspace(CASE_A, cfg)).toBe("demo");
    expect(resolveDataModeForWorkspace(CASE_B, cfg)).toBe("live");
  });
});

describe("timing scale parse", () => {
  it("honors DEMO_TIMING_SCALE as a positive number and defaults to 1", async () => {
    // Import here to keep module boundaries clean in this describe block.
    const { parseTimingScale } = await import("@/lib/providers/config");
    expect(parseTimingScale(undefined)).toBe(1);
    expect(parseTimingScale("0.5")).toBe(0.5);
    expect(parseTimingScale("2")).toBe(2);
    expect(parseTimingScale("-3")).toBe(1);
    expect(parseTimingScale("nope")).toBe(1);
  });

  it("includes timing scale and demo case in the config object", async () => {
    const { getDataModeConfig } = await import("@/lib/providers/config");
    const cfg = getDataModeConfig(
      env({ [DATA_MODE_ENV]: "demo", [DEMO_CASE_ID_ENV]: CASE_A, [TIMING_SCALE_ENV]: "2" }),
    );
    expect(cfg.mode).toBe("demo");
    expect(cfg.demoCaseId).toBe(CASE_A);
    expect(cfg.demoTimingScale).toBe(2);
  });
});
