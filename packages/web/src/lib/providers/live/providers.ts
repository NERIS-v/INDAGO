// ============================================================================
// F-PR2 Live Providers
//
// Wrappers over the EXISTING platform API (via platformFetch). These reuse the
// server-side auth boundary — no new tokens, no client-side credentials.
//
// Scope rule: we never silently fall back to demo, and we never invent
// frontend schema. Endpoints the platform does not yet expose throw
// ProviderError.unsupported() (documented as a dependency in the F-PR2 report)
// rather than fabricating data.
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
  RealtimeProvider,
  WorkspaceIdentity,
} from "../types";
import { ProviderError } from "../types";
import type { Investigation } from "@indago/contracts";
import { createLiveRealtimeProvider } from "./realtime";
import { providerUnsupported } from "./unsupported";

/**
 * Live implementation of InvestigationProvider.get() backed by the platform's
 * GET /investigations/:id. The platform response is a run-status shape, so it
 * is mapped into the canonical Investigation where the fields exist; missing
 * canonical fields are surfaced as a documented gap rather than fabricated.
 */
export class LiveInvestigationProvider implements InvestigationProvider {
  async get(_id: string): Promise<Investigation> {
    throw ProviderError.unsupported(
      "Live investigation domain endpoints are not yet exposed by the platform (documented dependency).",
    );
  }
  async listByCase(
    _caseId: string,
    _query?: ProviderQuery,
  ): Promise<Paginated<Investigation>> {
    throw providerUnsupported("investigation.listByCase");
  }
}

// ---------------------------------------------------------------------------
// Unsupported live providers (platform endpoints not yet exposed).
// Each method throws an explicit UNSUPPORTED ProviderError.
// ---------------------------------------------------------------------------

class UnsupportedEvidenceProvider implements EvidenceProvider {
  listByInvestigation(): Promise<Paginated<never>> {
    return providerUnsupported("evidence.listByInvestigation");
  }
  get(): Promise<never> {
    return providerUnsupported("evidence.get");
  }
}

class UnsupportedObservationProvider implements ObservationProvider {
  listByInvestigation(): Promise<Paginated<never>> {
    return providerUnsupported("observations.listByInvestigation");
  }
  listByEntity(): Promise<Paginated<never>> {
    return providerUnsupported("observations.listByEntity");
  }
}

class UnsupportedEntityProvider implements EntityProvider {
  listByInvestigation(): Promise<Paginated<never>> {
    return providerUnsupported("entities.listByInvestigation");
  }
  get(): Promise<never> {
    return providerUnsupported("entities.get");
  }
}

class UnsupportedGraphProvider implements GraphProvider {
  getVersion(): Promise<never> {
    return providerUnsupported("graph.getVersion");
  }
  getNodes(): Promise<Paginated<never>> {
    return providerUnsupported("graph.getNodes");
  }
  getEdges(): Promise<Paginated<never>> {
    return providerUnsupported("graph.getEdges");
  }
  getGraphHoles(): Promise<Paginated<never>> {
    return providerUnsupported("graph.getGraphHoles");
  }
}

class UnsupportedTimelineProvider implements TimelineProvider {
  getTimeline(): Promise<never> {
    return providerUnsupported("timeline.getTimeline");
  }
}

class UnsupportedLeadProvider implements LeadProvider {
  listByInvestigation(): Promise<Paginated<never>> {
    return providerUnsupported("leads.listByInvestigation");
  }
  get(): Promise<never> {
    return providerUnsupported("leads.get");
  }
}

class UnsupportedGapProvider implements GapProvider {
  listByInvestigation(): Promise<Paginated<never>> {
    return providerUnsupported("gaps.listByInvestigation");
  }
  get(): Promise<never> {
    return providerUnsupported("gaps.get");
  }
  evidenceRequests(): Promise<Paginated<never>> {
    return providerUnsupported("gaps.evidenceRequests");
  }
}

class UnsupportedReviewProvider implements ReviewProvider {
  listTasks(): Promise<Paginated<never>> {
    return providerUnsupported("review.listTasks");
  }
}

class UnsupportedRobustnessProvider implements RobustnessProvider {
  getResult(): Promise<never> {
    return providerUnsupported("robustness.getResult");
  }
}

class UnsupportedCrossCaseProvider implements CrossCaseProvider {
  listMatches(): Promise<Paginated<never>> {
    return providerUnsupported("crossCase.listMatches");
  }
}

/**
 * Build the full per-workspace LIVE provider bundle. No global singleton.
 * The explicit identity is surfaced on the bundle; investigation-scoped calls
 * receive the investigation id from the caller.
 */
export function createLiveWorkspaceProviders(
  identity: WorkspaceIdentity,
  _config: DataModeConfig,
): WorkspaceProviders {
  const realtime: RealtimeProvider = createLiveRealtimeProvider();
  return {
    workspaceId: identity.workspaceId,
    caseId: identity.caseId,
    investigationId: identity.investigationId,
    mode: "live",
    investigations: new LiveInvestigationProvider(),
    evidence: new UnsupportedEvidenceProvider(),
    observations: new UnsupportedObservationProvider(),
    entities: new UnsupportedEntityProvider(),
    graph: new UnsupportedGraphProvider(),
    timeline: new UnsupportedTimelineProvider(),
    leads: new UnsupportedLeadProvider(),
    gaps: new UnsupportedGapProvider(),
    review: new UnsupportedReviewProvider(),
    robustness: new UnsupportedRobustnessProvider(),
    crossCase: new UnsupportedCrossCaseProvider(),
    realtime,
  };
}
