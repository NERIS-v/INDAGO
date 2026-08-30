// ============================================================================
// F-PR2 Demo Per-Workspace State
//
// The demo simulation keeps an in-memory, PER-WORKSPACE mutable store (no
// IndexedDB, no global singleton). Each workspace gets its own store instance
// so concurrent investigations never share state. `reset()` restores the
// canonical fixtures exactly.
//
// The store holds the canonical fixture data plus derived indexes for O(1)
// lookups. Mutations are applied via functional updates (immutable replace)
// so consumers always read coherent snapshots.
// ============================================================================

import type {
  Case,
  Investigation,
  Evidence,
  Observation,
  Entity,
  Lead,
  InvestigativeGap,
  EvidenceRequest,
  ReviewTask,
  GraphNode,
  GraphEdge,
} from "@indago/contracts";
import { demoFixtures } from "./demo-fixtures";
import type { InvestigationTimeline } from "../types";

export interface DemoWorkspaceState {
  readonly workspaceId: string;
  /** Nullable so listCaseProviders can hard-delete its single demo case. */
  case: Case | null;
  investigation: Investigation;
  evidenceById: Map<string, Evidence>;
  observationById: Map<string, Observation>;
  entityById: Map<string, Entity>;
  leadById: Map<string, Lead>;
  gapById: Map<string, InvestigativeGap>;
  evidenceRequestById: Map<string, EvidenceRequest>;
  reviewTaskById: Map<string, ReviewTask>;
  graphNodeById: Map<string, GraphNode>;
  graphEdgeById: Map<string, GraphEdge>;
  timeline: InvestigationTimeline;
  /** Rolling log of emitted (normalized) realtime events. */
  eventLog: unknown[];
}

function toMap<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}

/** Create a fresh, canonical store instance for one workspace. */
export function createDemoWorkspaceState(workspaceId: string): DemoWorkspaceState {
  const s: DemoWorkspaceState = {
    workspaceId,
    case: demoFixtures.case,
    investigation: demoFixtures.investigation,
    evidenceById: toMap(demoFixtures.evidence),
    observationById: toMap(demoFixtures.observations),
    entityById: toMap(demoFixtures.entities),
    leadById: toMap(demoFixtures.leads),
    gapById: toMap(demoFixtures.gaps),
    evidenceRequestById: toMap(demoFixtures.evidenceRequests),
    reviewTaskById: toMap(demoFixtures.reviewTasks),
    graphNodeById: toMap(demoFixtures.graphNodes),
    graphEdgeById: toMap(demoFixtures.graphEdges),
    timeline: demoFixtures.timeline,
    eventLog: [],
  };
  return s;
}

/** Immutable-reset the store back to the canonical fixture values. */
export function resetDemoWorkspaceState(state: DemoWorkspaceState): void {
  state.case = demoFixtures.case;
  state.investigation = demoFixtures.investigation;
  state.evidenceById = toMap(demoFixtures.evidence);
  state.observationById = toMap(demoFixtures.observations);
  state.entityById = toMap(demoFixtures.entities);
  state.leadById = toMap(demoFixtures.leads);
  state.gapById = toMap(demoFixtures.gaps);
  state.evidenceRequestById = toMap(demoFixtures.evidenceRequests);
  state.reviewTaskById = toMap(demoFixtures.reviewTasks);
  state.graphNodeById = toMap(demoFixtures.graphNodes);
  state.graphEdgeById = toMap(demoFixtures.graphEdges);
  state.timeline = demoFixtures.timeline;
  state.eventLog = [];
}

/** Append an event to the workspace log (bounded to avoid unbounded growth). */
export function logDemoEvent(state: DemoWorkspaceState, event: unknown): void {
  state.eventLog = [event, ...state.eventLog].slice(0, 500);
}
