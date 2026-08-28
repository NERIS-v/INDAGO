// ============================================================================
// F-PR2 Demo Providers
//
// Canonical-shaped, deterministic implementations backed by the per-workspace
// in-memory store. They simulate latency (scaled by DEMO_TIMING_SCALE), respect
// AbortSignal, and surface failures as ProviderError. They are constructed by
// the factory per workspace and are deliberately NOT imported by UI components.
// ============================================================================

import type {
  InvestigationProvider,
  EvidenceProvider,
  ObservationProvider,
  EntityProvider,
  GraphProvider,
  TimelineProvider,
  LeadProvider,
  GapProvider,
  ReviewProvider,
  RobustnessProvider,
  CrossCaseProvider,
  DataModeConfig,
  ProviderQuery,
  Paginated,
  WorkspaceProviders,
  WorkspaceIdentity,
} from "../types";
import { ProviderError } from "../types";
import { createDemoWorkspaceState } from "./state";
import type { DemoWorkspaceState } from "./state";
import { createDemoRealtimeProvider } from "./realtime";
import { baseLatency, heavyLatency, deterministicSleep } from "./latency";
import { demoFixtures } from "./demo-fixtures";

function paginate<T>(
  items: T[],
  query: ProviderQuery | undefined,
): Paginated<T> {
  const page = query?.page ?? 1;
  const pageSize = query?.pageSize ?? 20;
  const start = (page - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    items: slice,
    page,
    pageSize,
    totalItems: items.length,
    hasMore: start + pageSize < items.length,
  };
}

function resolveSignal(query?: ProviderQuery): AbortSignal | undefined {
  return query?.signal;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw ProviderError.cancelled();
}

export class DemoInvestigationProvider implements InvestigationProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async get(id: string): Promise<import("@indago/contracts").Investigation> {
    await deterministicSleep(baseLatency(this.config));
    if (id !== this.state.investigation.id) throw ProviderError.notFound();
    return this.state.investigation;
  }

  async listByCase(
    caseId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").Investigation>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    if (caseId !== this.state.case.id) return { items: [], page: 1, pageSize: 20, totalItems: 0, hasMore: false };
    return paginate([this.state.investigation], query);
  }
}

export class DemoEvidenceProvider implements EvidenceProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async listByInvestigation(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").Evidence>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    if (investigationId !== this.state.investigation.id) {
      throw ProviderError.notFound("Investigation not found.");
    }
    return paginate([...this.state.evidenceById.values()], query);
  }

  async get(id: string): Promise<import("@indago/contracts").Evidence> {
    await deterministicSleep(baseLatency(this.config));
    const it = this.state.evidenceById.get(id);
    if (!it) throw ProviderError.notFound();
    return it;
  }
}

export class DemoObservationProvider implements ObservationProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async listByInvestigation(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").Observation>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    if (investigationId !== this.state.investigation.id) {
      throw ProviderError.notFound("Investigation not found.");
    }
    return paginate([...this.state.observationById.values()], query);
  }

  async listByEntity(
    entityId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").Observation>> {
    await deterministicSleep(baseLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    const entity = this.state.entityById.get(entityId);
    if (!entity) throw ProviderError.notFound();
    const all = [...this.state.observationById.values()];
    return paginate(
      all.filter((o) => o.entityIds.includes(entityId)),
      query,
    );
  }
}

export class DemoEntityProvider implements EntityProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async listByInvestigation(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").Entity>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    if (investigationId !== this.state.investigation.id) {
      throw ProviderError.notFound("Investigation not found.");
    }
    return paginate([...this.state.entityById.values()], query);
  }

  async get(id: string): Promise<import("@indago/contracts").Entity> {
    await deterministicSleep(baseLatency(this.config));
    const it = this.state.entityById.get(id);
    if (!it) throw ProviderError.notFound();
    return it;
  }
}

export class DemoGraphProvider implements GraphProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async getVersion(investigationId: string): Promise<import("@indago/contracts").GraphVersion> {
    await deterministicSleep(baseLatency(this.config));
    if (investigationId !== this.state.investigation.id) {
      throw ProviderError.notFound("Investigation not found.");
    }
    return demoFixtures.graphVersion;
  }

  async getNodes(
    _investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").GraphNode>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    return paginate([...this.state.graphNodeById.values()], query);
  }

  async getEdges(
    _investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").GraphEdge>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    return paginate([...this.state.graphEdgeById.values()], query);
  }

  async getGraphHoles(
    investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").GraphHole>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    if (investigationId !== this.state.investigation.id) {
      throw ProviderError.notFound("Investigation not found.");
    }
    return paginate([], query);
  }
}

export class DemoTimelineProvider implements TimelineProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async getTimeline(
    investigationId: string,
  ): Promise<import("../types").InvestigationTimeline> {
    await deterministicSleep(baseLatency(this.config));
    if (investigationId !== this.state.investigation.id) {
      throw ProviderError.notFound("Investigation not found.");
    }
    return this.state.timeline;
  }
}

export class DemoLeadProvider implements LeadProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async listByInvestigation(
    _investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").Lead>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    return paginate([...this.state.leadById.values()], query);
  }

  async get(id: string): Promise<import("@indago/contracts").Lead> {
    await deterministicSleep(baseLatency(this.config));
    const it = this.state.leadById.get(id);
    if (!it) throw ProviderError.notFound();
    return it;
  }
}

export class DemoGapProvider implements GapProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async listByInvestigation(
    _investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").InvestigativeGap>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    return paginate([...this.state.gapById.values()], query);
  }

  async get(id: string): Promise<import("@indago/contracts").InvestigativeGap> {
    await deterministicSleep(baseLatency(this.config));
    const it = this.state.gapById.get(id);
    if (!it) throw ProviderError.notFound();
    return it;
  }

  async evidenceRequests(
    _investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").EvidenceRequest>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    return paginate([...this.state.evidenceRequestById.values()], query);
  }
}

export class DemoReviewProvider implements ReviewProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async listTasks(
    _investigationId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").ReviewTask>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    return paginate([...this.state.reviewTaskById.values()], query);
  }
}

export class DemoRobustnessProvider implements RobustnessProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async getResult(
    investigationId: string,
    hypothesisId: string,
  ): Promise<import("@indago/contracts").RobustnessResult> {
    await deterministicSleep(heavyLatency(this.config));
    if (investigationId !== this.state.investigation.id) {
      throw ProviderError.notFound("Investigation not found.");
    }
    return demoFixtures.robustness.hypothesisId === hypothesisId
      ? demoFixtures.robustness
      : demoFixtures.robustness;
  }
}

export class DemoCrossCaseProvider implements CrossCaseProvider {
  constructor(
    private readonly state: DemoWorkspaceState,
    private readonly config: DataModeConfig,
  ) {}

  async listMatches(
    caseId: string,
    query?: ProviderQuery,
  ): Promise<Paginated<import("@indago/contracts").CrossCaseMatch>> {
    await deterministicSleep(heavyLatency(this.config), resolveSignal(query));
    throwIfAborted(resolveSignal(query));
    if (caseId !== this.state.case.id) return { items: [], page: 1, pageSize: 20, totalItems: 0, hasMore: false };
    return paginate(demoFixtures.crossCase, query);
  }
}

/**
 * Build the full per-workspace demo provider bundle.
 * Creates its own in-memory state and realtime provider, so each bundle is
 * isolated (never a global singleton). Validates fixtures at construction.
 *
 * The identity is explicit: identity.workspaceId keys this bundle's state,
 * identity.caseId / identity.investigationId are surfaced on the bundle (and
 * for the deterministic case equal the fixture CASE_ID / INVESTIGATION_ID).
 */
export function createWorkspaceDemoProviders(
  identity: WorkspaceIdentity,
  config: DataModeConfig,
): WorkspaceProviders {
  const state = createDemoWorkspaceState(identity.workspaceId);
  const realtime = createDemoRealtimeProvider(state, config);
  const investigations = new DemoInvestigationProvider(state, config);
  const evidence = new DemoEvidenceProvider(state, config);
  const observations = new DemoObservationProvider(state, config);
  const entities = new DemoEntityProvider(state, config);
  const graph = new DemoGraphProvider(state, config);
  const timeline = new DemoTimelineProvider(state, config);
  const leads = new DemoLeadProvider(state, config);
  const gaps = new DemoGapProvider(state, config);
  const review = new DemoReviewProvider(state, config);
  const robustness = new DemoRobustnessProvider(state, config);
  const crossCase = new DemoCrossCaseProvider(state, config);

  return {
    workspaceId: identity.workspaceId,
    caseId: identity.caseId,
    investigationId: identity.investigationId,
    mode: "demo",
    investigations,
    evidence,
    observations,
    entities,
    graph,
    timeline,
    leads,
    gaps,
    review,
    robustness,
    crossCase,
    realtime,
  };
}
