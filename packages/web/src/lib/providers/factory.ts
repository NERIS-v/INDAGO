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
  ObservationContradiction,
  ProviderQuery,
  Paginated,
} from "./types";
import { ProviderError } from "./types";
import type {
  Investigation,
  Lead,
  InvestigativeGap,
  GraphNode,
  GraphEdge,
  Source,
  Evidence,
  Observation,
  Case,
} from "@indago/contracts";
import { createWorkspaceDemoProviders, hydrateDemoSessionBreakthroughs } from "./demo/providers";
import { createLiveWorkspaceProviders } from "./live/providers";
import { DemoEvidenceProvider, DemoInvestigationProvider } from "./demo/providers";
import { createDemoWorkspaceState, type DemoWorkspaceState } from "./demo/state";
import { LiveCaseProvider, LiveEvidenceProvider, LiveInvestigationProvider } from "./live/providers";
import { REAL_CASE_IDS, getRealCaseFixtureSet } from "./real-case/index";

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
    return createWorkspaceDemoProviders(
      identity,
      config,
      // Real cases inject their deterministic fixture set; the demo case uses
      // the default OFS fixtures.
      getRealCaseFixtureSet(identity.caseId),
    );
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
  const demo = createWorkspaceDemoProviders(
    identity,
    config,
    getRealCaseFixtureSet(identity.caseId),
  );
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
    // PASS 2 — OPTIONAL Phase-1 intelligence projections, forwarded from the
    // demo bundle only when the fixture set carries them (real cases). Live/OFS
    // workspaces leave them unset.
    crossCaseSignal: demo.crossCaseSignal,
    predictionFreeze: demo.predictionFreeze,
    // PASS 3 — OPTIONAL breakthrough projections, forwarded from the demo
    // bundle only when present (enriched Case B). Live/OFS leave them unset.
    postFreezeDelta: demo.postFreezeDelta,
    breakthroughRecord: demo.breakthroughRecord,
    // PASS 4 — OPTIONAL Phase-2 motive-investigation projections, forwarded
    // from the demo bundle only when present (enriched Case B). Live/OFS leave
    // them unset.
    phase2AssessmentFreeze: demo.phase2AssessmentFreeze,
    phase2EvidenceDelta: demo.phase2EvidenceDelta,
    phase2HistoricalValidation: demo.phase2HistoricalValidation,
    phase2Ledger: demo.phase2Ledger,
    phase2EvidenceReadout: demo.phase2EvidenceReadout,
    phase2SecondEvidence: demo.phase2SecondEvidence,
    phase2ConnectionEvidence: demo.phase2ConnectionEvidence,
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
  /** Genuine demo workspace state projected for the Case List (demo mode
   *  only). This is DATA, not a second provider interface: the dashboard reads
   *  immutable fixture projections to render real lead/gap/contradiction/
   *  graph/recency state. Absent in live mode — the dashboard never fabricates
   *  enrichments the platform cannot serve. */
  readonly enrichment?: DashboardEnrichment;
  /** Per-case real graph topology (graphNodes + graphEdges) keyed by case id.
   *  Genuine fixture projections so each case card's mini topology preview
   *  renders its own structure. Absent in live mode. */
  readonly topology?: Readonly<Record<string, { readonly nodes: readonly GraphNode[]; readonly edges: readonly GraphEdge[] }>>;
}

/**
 * Read-only dashboard projection of the demo workspace. Built in the factory
 * seam from the SAME canonical workspace state the case provider serves, so the
 * featured case, its leads, gaps, contradictions, graph topology, and recency
 * metadata are all genuine fixture data — never invented on the dashboard.
 */
export interface DashboardEnrichment {
  readonly investigationId: string;
  readonly investigation: Investigation;
  readonly leads: readonly Lead[];
  readonly gaps: readonly InvestigativeGap[];
  readonly contradictions: readonly ObservationContradiction[];
  readonly graphNodes: readonly GraphNode[];
  readonly graphEdges: readonly GraphEdge[];
  readonly sources: readonly Source[];
  readonly evidence: readonly Evidence[];
  readonly observations: readonly Observation[];
}

function toDashboardEnrichment(state: DemoWorkspaceState): DashboardEnrichment {
  return {
    investigationId: state.investigation.id,
    investigation: state.investigation,
    leads: Array.from(state.leadById.values()),
    gaps: Array.from(state.gapById.values()),
    contradictions: state.contradictions,
    graphNodes: Array.from(state.graphNodeById.values()),
    graphEdges: Array.from(state.graphEdgeById.values()),
    sources: Array.from(state.sourceById.values()),
    evidence: Array.from(state.evidenceById.values()),
    observations: Array.from(state.observationById.values()),
  };
}

export function createCaseListProviders(
  env: NodeJS.ProcessEnv = getEffectiveEnv(),
): CaseListProviders {
  const mode = resolveCaseListMode(env);
  if (mode === "demo") {
    // PASS 1 real-case dashboard: serve BOTH case boundaries as a 2-card grid
    // (no OFS). Each real case gets its own fixture-backed provider; the
    // enrichment projects the FIRST real case's workspace state so the
    // dashboard renders genuine lead/gap/graph state without inventing data.
    const realCaseIds = [...REAL_CASE_IDS];
    const firstCaseId = realCaseIds[0];
    const firstCase = firstCaseId ? getRealCaseFixtureSet(firstCaseId) : undefined;
    if (firstCase) {
      const state = createDemoWorkspaceState("case-list", firstCase);
      const topo: Record<string, { nodes: readonly GraphNode[]; edges: readonly GraphEdge[] }> = {};
      for (const id of realCaseIds) {
        const set = getRealCaseFixtureSet(id);
        if (set) topo[id] = { nodes: set.graphNodes, edges: set.graphEdges };
      }
      return {
        mode,
        cases: new CaseListCaseProvider(realCaseIds),
        enrichment: toDashboardEnrichment(state),
        topology: topo,
      };
    }
  }
  return { mode, cases: new LiveCaseProvider() };
}

/** Case provider that serves the full real-case catalogue (2 cases) for the
 *  Case List dashboard. Each case is read from its deterministic fixture set. */
class CaseListCaseProvider implements CaseProvider {
  constructor(private readonly caseIds: readonly string[]) {}

  async list(query?: ProviderQuery): Promise<Paginated<Case>> {
    const page = query?.page ?? 1;
    const pageSize = query?.pageSize ?? 20;
    const cases = this.caseIds
      .map((id) => getRealCaseFixtureSet(id)?.case)
      .filter((c): c is Case => Boolean(c));
    const start = (page - 1) * pageSize;
    const slice = cases.slice(start, start + pageSize);
    return {
      items: slice,
      page,
      pageSize,
      totalItems: cases.length,
      hasMore: start + pageSize < cases.length,
    };
  }

  async get(id: string): Promise<Case> {
    const c = getRealCaseFixtureSet(id)?.case;
    if (!c) throw ProviderError.notFound();
    return c;
  }

  async remove(): Promise<void> {
    // Real cases are immutable fixtures for PASS 1; removal is unsupported and
    // surfaced honestly (no fabrication of a replacement state).
    throw ProviderError.unsupported("Repository cases cannot be removed.");
  }
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
    const state = createDemoWorkspaceState(
      `intake:${caseId}`,
      getRealCaseFixtureSet(caseId),
    );
    hydrateDemoSessionBreakthroughs(state);
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
