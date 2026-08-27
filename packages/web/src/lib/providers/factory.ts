// ============================================================================
// F-PR2 Provider Factory
//
// Creates ONE WorkspaceProviders bundle per workspace (case). This is the only
// place the concrete Demo/Live provider implementations are constructed and
// selected. UI components consume the bundle through the Workspace context and
// never branch on DataMode.
//
// There is deliberately NO global singleton: every workspace gets its own
// immutable provider bundle, so concurrent investigations never share mutable
// demo state.
// ============================================================================

import { resolveDataModeForWorkspace, getDataModeConfig } from "./config";
import type {
  AppDataMode,
  DataModeConfig,
  WorkspaceIdentity,
  WorkspaceProviders,
} from "./types";
import { createWorkspaceDemoProviders } from "./demo/providers";
import { createLiveWorkspaceProviders } from "./live/providers";

/**
 * Resolve the concrete app data mode for the given case.
 */
export function resolveAppDataMode(
  caseId: string,
  env: NodeJS.ProcessEnv = process.env,
): { mode: AppDataMode; config: DataModeConfig } {
  const config = getDataModeConfig(env);
  const mode = resolveDataModeForWorkspace(caseId, env);
  return { mode, config };
}

/**
 * Build the provider bundle for a single workspace. Pure: no module-level
 * caches, so multiple calls produce independent bundles.
 *
 * The identity is explicit and never overloaded:
 *  - identity.caseId          is fed to the DataMode resolver (demo-only rule).
 *  - identity.investigationId is the target of investigation-scoped calls.
 *  - identity.workspaceId     keys the provider bundle instance.
 */
export function createWorkspaceProviders(
  identity: WorkspaceIdentity,
  env: NodeJS.ProcessEnv = process.env,
): WorkspaceProviders {
  const config = getDataModeConfig(env);
  const mode = resolveDataModeForWorkspace(identity.caseId, env);

  if (mode === "demo") {
    return createWorkspaceDemoProviders(identity, config);
  }
  return createLiveWorkspaceProviders(identity, config);
}
