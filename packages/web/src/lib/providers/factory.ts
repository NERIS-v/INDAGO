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
//
// Mode contract:
//  - config.mode "demo"  -> pure demo bundle (DEMO -> demo provider).
//  - config.mode "live"  -> pure live bundle (LIVE -> live provider; a capability
//    live cannot serve is typed "not-ready" and throws, never a demo fallback).
//  - config.mode "auto"  -> capability-level AUTO bundle (createAutoWorkspaceProviders):
//    each capability is served by the live implementation when one exists and by
//    the demo implementation when only a demo exists, all inside ONE bundle. This
//    is the F-PR5 corrective semantics: AUTO fallback is PER CAPABILITY, and a
//    capability that HAS a live implementation is never demo-served.
// ============================================================================

import {
  resolveDataModeForWorkspace,
  getDataModeConfig,
  getEffectiveEnv,
} from "./config";
import {
  createCapabilityStatusTable,
  resolveCapabilityStatus,
  type CapabilityKey,
} from "./capabilities";
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
  if (config.mode === "auto") {
    return createAutoWorkspaceProviders(identity, config);
  }
  return createLiveWorkspaceProviders(identity, config);
}

// ============================================================================
// AUTO (capability-level) bundle
//
// AUTO is resolved PER CAPABILITY, never globally: each capability slot picks
// the live implementation when CAPABILITY_AVAILABILITY says live exists, and the
// demo implementation when only demo exists (reusing the SAME providers the pure
// bundles construct — no second resolution system). Because every provider-backed
// capability in the matrix has at least one implementation, every slot resolves
// to live or demo.
//
// Runtime-failure rule: a slot served live is a REAL live provider. If its call
// fails it surfaces a typed ProviderError — there is no catch-and-fallback to the
// demo implementation, because the demo instance is never wired into that slot.
// ============================================================================

export function createAutoWorkspaceProviders(
  identity: WorkspaceIdentity,
  config: DataModeConfig,
): WorkspaceProviders {
  const demo = createWorkspaceDemoProviders(identity, config);
  const live = createLiveWorkspaceProviders(identity, config);
  const liveServes = (capability: CapabilityKey): boolean =>
    resolveCapabilityStatus(capability, config, "live") === "live";

  return {
    workspaceId: identity.workspaceId,
    caseId: identity.caseId,
    investigationId: identity.investigationId,
    mode: "live",
    capabilities: createCapabilityStatusTable(config, "live"),
    cases: liveServes("cases") ? live.cases : demo.cases,
    investigations: liveServes("investigation")
      ? live.investigations
      : demo.investigations,
    evidence: liveServes("evidence") ? live.evidence : demo.evidence,
    observations: liveServes("observations")
      ? live.observations
      : demo.observations,
    entities: liveServes("entities") ? live.entities : demo.entities,
    graph: liveServes("graph") ? live.graph : demo.graph,
    relations: liveServes("relations") ? live.relations : demo.relations,
    intelligence: liveServes("intelligence")
      ? live.intelligence
      : demo.intelligence,
    timeline: liveServes("timeline") ? live.timeline : demo.timeline,
    leads: liveServes("leads") ? live.leads : demo.leads,
    gaps: liveServes("gaps") ? live.gaps : demo.gaps,
    review: liveServes("review") ? live.review : demo.review,
    robustness: liveServes("robustness")
      ? live.robustness
      : demo.robustness,
    hypotheses: liveServes("hypotheses")
      ? live.hypotheses
      : demo.hypotheses,
    crossCase: liveServes("crossCase") ? live.crossCase : demo.crossCase,
    realtime: liveServes("realtime") ? live.realtime : demo.realtime,
  };
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
