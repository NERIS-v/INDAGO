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

import {
  resolveDataModeForWorkspace,
  getDataModeConfig,
  getEffectiveEnv,
} from "./config";
import type {
  AppDataMode,
  DataModeConfig,
  WorkspaceIdentity,
  WorkspaceProviders,
  CaseProvider,
  EvidenceProvider,
  InvestigationProvider,
} from "./types";
import { createWorkspaceDemoProviders } from "./demo/providers";
import { createLiveWorkspaceProviders } from "./live/providers";
import { DemoCaseProvider, DemoEvidenceProvider, DemoInvestigationProvider } from "./demo/providers";
import { createDemoWorkspaceState } from "./demo/state";
import { LiveCaseProvider, LiveEvidenceProvider, LiveInvestigationProvider } from "./live/providers";

/**
 * Resolve the concrete app data mode for the given case.
 */
export function resolveAppDataMode(
  caseId: string,
  env: NodeJS.ProcessEnv = getEffectiveEnv(),
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
  env: NodeJS.ProcessEnv = getEffectiveEnv(),
): WorkspaceProviders {
  const config = getDataModeConfig(env);
  const mode = resolveDataModeForWorkspace(identity.caseId, env);

  if (mode === "demo") {
    return createWorkspaceDemoProviders(identity, config);
  }
  return createLiveWorkspaceProviders(identity, config);
}

// ============================================================================
// Case List (dashboard) providers
//
// The Case List is a top-level surface OUTSIDE any investigation workspace, so
// it cannot use the workspace bundle. It resolves data mode at the config level
// (not per-case): in development auto mode the demo case is made discoverable;
// production/live mode surfaces a typed unsupported/empty state.
// ============================================================================

export function resolveCaseListMode(
  env: NodeJS.ProcessEnv = getEffectiveEnv(),
): AppDataMode {
  const config = getDataModeConfig(env);
  if (config.mode === "demo") return "demo";
  if (config.mode === "live") return "live";
  // auto — dev surfaces the demo case so it is discoverable; prod is live.
  return config.isDevelopment && config.demoCaseId ? "demo" : "live";
}

export interface CaseListProviders {
  readonly mode: AppDataMode;
  readonly cases: CaseProvider;
}

export function createCaseListProviders(
  env: NodeJS.ProcessEnv = getEffectiveEnv(),
): CaseListProviders {
  const mode = resolveCaseListMode(env);
  const config = getDataModeConfig(env);
  if (mode === "demo") {
    const state = createDemoWorkspaceState("case-list");
    return { mode, cases: new DemoCaseProvider(state, config) };
  }
  return { mode, cases: new LiveCaseProvider() };
}

// ============================================================================
// New Investigation (evidence intake) providers
//
// The intake page lives OUTSIDE the workspace boundary (the investigation does
// not exist yet), so it builds a small provider set scoped to the entered case.
// Resolves data mode from the caseId (never a silent demo fallback).
// ============================================================================

export interface IntakeProviders {
  readonly mode: AppDataMode;
  readonly evidence: EvidenceProvider;
  readonly investigations: InvestigationProvider;
}

export function createIntakeProviders(
  caseId: string,
  env: NodeJS.ProcessEnv = getEffectiveEnv(),
): IntakeProviders {
  const mode = resolveDataModeForWorkspace(caseId, env);
  const config = getDataModeConfig(env);
  if (mode === "demo") {
    const state = createDemoWorkspaceState(`intake:${caseId}`);
    return {
      mode,
      evidence: new DemoEvidenceProvider(state, config),
      investigations: new DemoInvestigationProvider(state, config),
    };
  }
  return {
    mode,
    evidence: new LiveEvidenceProvider(),
    investigations: new LiveInvestigationProvider(caseId),
  };
}
