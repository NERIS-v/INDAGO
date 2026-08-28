// ============================================================================
// F-PR2 Data Mode Resolution
//
// Resolves the effective data mode for the frontend from environment config.
//
// Rules (from F-PR2 spec):
//  - "demo"  -> DemoProvider set (deterministic, canonical-validated fixtures)
//  - "live"  -> Live wrappers over the existing platform API (never a demo)
//  - "auto"  -> development ONLY: demo when NEXT_PUBLIC_DEMO_CASE_ID is set and
//               the target workspace matches it; otherwise live.
//               In production "auto" is treated as LIVE. There is NO silent
//               live -> mock fallback.
//
// Resolution result is a concrete AppDataMode ("demo" | "live") that the
// factory consumes.
// ============================================================================

import type { DataModeConfig, DataMode } from "./types";

export const DEMO_CASE_ID_ENV = "NEXT_PUBLIC_DEMO_CASE_ID";
export const DATA_MODE_ENV = "NEXT_PUBLIC_DATA_MODE";
export const TIMING_SCALE_ENV = "DEMO_TIMING_SCALE";

/**
 * Resolve the effective env to read NEXT_PUBLIC_ config from.
 *
 * Next/Turbopack statically inline NEXT_PUBLIC_* values ONLY for direct member
 * access (process.env.NEXT_PUBLIC_X). Accessing via a dynamic index
 * (env["NEXT_PUBLIC_X"]) is NOT inlined, so the client bundle would see
 * undefined. This helper reads them statically so the inlined literals reach
 * the client, and merges them back over process.env. An explicit `env`
 * argument (used by tests) is returned as-is.
 */
export function getEffectiveEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (env) return env;
  const staticPublic: Record<string, string | undefined> = {
    [DATA_MODE_ENV]: process.env.NEXT_PUBLIC_DATA_MODE,
    [DEMO_CASE_ID_ENV]: process.env.NEXT_PUBLIC_DEMO_CASE_ID,
  };
  return { ...process.env, ...staticPublic };
}

/** Safe enum parse; returns undefined for unknown/invalid values. */
export function parseDataMode(raw: string | undefined): DataMode | undefined {
  if (raw === "demo" || raw === "live" || raw === "auto") return raw;
  return undefined;
}

export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

/** Parse DEMO_TIMING_SCALE as a positive finite number; defaults to 1. */
export function parseTimingScale(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

/**
 * Resolve the effective mode for a given workspace (caseId).
 *
 * Throws if the environment is configured in a way that would allow a silent
 * live -> mock fallback (i.e. "auto" or "demo" in production with NO demo case
 * configured).
 */
export function resolveDataModeForWorkspace(
  caseId: string,
  env: NodeJS.ProcessEnv = getEffectiveEnv(),
): AppDataMode {
  const raw = parseDataMode(env[DATA_MODE_ENV]);
  const demoCaseId = env[DEMO_CASE_ID_ENV];
  const dev = isDevelopment();

  let mode: DataMode;
  if (raw === undefined) {
    // No explicit mode: local dev defaults to AUTO so the demo experience is
    // available out of the box; production must be explicit (defaults LIVE).
    mode = dev ? "auto" : "live";
  } else {
    mode = raw;
  }

  if (mode === "live") return "live";

  if (mode === "demo") {
    if (!demoCaseId) {
      throw new Error(
        `${DEMO_CASE_ID_ENV} must be set when ${DATA_MODE_ENV}=demo`,
      );
    }
    if (caseId !== demoCaseId) {
      throw new Error(
        `${DATA_MODE_ENV}=demo only permits the configured demo case (${DEMO_CASE_ID_ENV}=${demoCaseId}); requested case "${caseId}" cannot use the demo data mode. Configure ${DEMO_CASE_ID_ENV} to match or set ${DATA_MODE_ENV}=live.`,
      );
    }
    return "demo";
  }

  // mode === "auto"
  if (!dev) return "live";
  if (demoCaseId && caseId === demoCaseId) return "demo";
  return "live";
}

/** Prohibit "auto" or "demo" in production when no demo case is configured to
 *  prevent an accidental silent live->mock fallback. */
export function assertNoImplicitFallback(
  env: NodeJS.ProcessEnv = getEffectiveEnv(),
): void {
  const raw = parseDataMode(env[DATA_MODE_ENV]);
  const demoCaseId = env[DEMO_CASE_ID_ENV];
  if (!isDevelopment() && raw === "auto" && !demoCaseId) {
    throw new Error(
      `${DATA_MODE_ENV}=auto is not allowed in production without ${DEMO_CASE_ID_ENV}. Set ${DATA_MODE_ENV}=live or configure a demo case.`,
    );
  }
}

/**
 * Build the full DataModeConfig (used at workspace-shell build time and in tests).
 */
export function getDataModeConfig(
  env: NodeJS.ProcessEnv = getEffectiveEnv(),
): DataModeConfig {
  const dev = isDevelopment();
  const demoCaseId = env[DEMO_CASE_ID_ENV] ?? "";
  const raw = parseDataMode(env[DATA_MODE_ENV]);
  const mode: DataMode = raw ?? (dev ? "auto" : "live");

  return {
    mode,
    demoCaseId,
    demoTimingScale: parseTimingScale(env[TIMING_SCALE_ENV]),
    isDevelopment: dev,
  };
}

export type AppDataMode = "demo" | "live";
