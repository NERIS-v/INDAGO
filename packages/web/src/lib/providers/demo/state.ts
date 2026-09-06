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
  Source,
  Artifact,
  RelationHypothesis,
  EntityMentionCandidate,
  CandidatePair,
  CandidateResolution,
  EntityHypothesis,
  Hypothesis,
} from "@indago/contracts";
import { demoFixtures } from "./demo-fixtures";
import type { InvestigationTimeline, ObservationContradiction } from "../types";
import type { HypothesisDecisionRecord } from "@/lib/intel/reverse-hypothesis/hypothesis-model";

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
  sourceById: Map<string, Source>;
  artifactById: Map<string, Artifact>;
  relationById: Map<string, RelationHypothesis>;
  hypothesisById: Map<string, Hypothesis>;
  timeline: InvestigationTimeline;
  contradictions: readonly ObservationContradiction[];
  /** ER store — mutable decision state. Fixture constants are never mutated;
   *  the store holds working copies for accept / keep-unresolved / reverse. */
  candidateById: Map<string, EntityMentionCandidate>;
  candidatePairById: Map<string, CandidatePair>;
  candidateResolutionById: Map<string, CandidateResolution>;
  entityHypothesisById: Map<string, EntityHypothesis>;
  /** Deliberate analyst decision audit for ER (local projection; a REVERSED
   *  hypothesis keeps its history — reversal never deletes). */
  erAuditById: Map<
    string,
    { action: "keep-unresolved" | "accept" | "reverse"; by: string; at: { value: string; precision: "exact" } }
  >;
  /** PR-8 relation-authority audit — local projection of the platform
   *  relation-hypothesis accept/reject/reverse routes. A REVERSED hypothesis
   *  keeps its history — reversal never deletes. */
  relationAuthorityAuditById: Map<
    string,
    {
      action: "accept" | "reject" | "reverse";
      reason?: string;
      by: string;
      at: { value: string; precision: "exact" };
    }
  >;
  /** F-PR9 Reverse Hypothesis — session decision trail per investigation
   *  (session/workspace-scoped; canonical evidence is never mutated). */
  reverseHypothesisDecisions: Map<string, HypothesisDecisionRecord[]>;
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
    sourceById: toMap(demoFixtures.sources),
    artifactById: toMap(demoFixtures.artifacts),
    relationById: toMap(demoFixtures.relations),
    hypothesisById: toMap(demoFixtures.hypotheses),
    timeline: demoFixtures.timeline,
    contradictions: demoFixtures.contradictions,
    candidateById: toMap(demoFixtures.candidates),
    candidatePairById: toMap(demoFixtures.candidatePairs),
    candidateResolutionById: new Map(
      demoFixtures.resolutions.map((r) => [r.candidatePairId, r]),
    ),
    entityHypothesisById: toMap(demoFixtures.entityHypotheses),
    erAuditById: new Map(),
    relationAuthorityAuditById: new Map(),
    reverseHypothesisDecisions: new Map(),
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
  state.sourceById = toMap(demoFixtures.sources);
  state.artifactById = toMap(demoFixtures.artifacts);
  state.relationById = toMap(demoFixtures.relations);
  state.hypothesisById = toMap(demoFixtures.hypotheses);
  state.timeline = demoFixtures.timeline;
  state.contradictions = demoFixtures.contradictions;
  state.candidateById = toMap(demoFixtures.candidates);
  state.candidatePairById = toMap(demoFixtures.candidatePairs);
  state.candidateResolutionById = new Map(
    demoFixtures.resolutions.map((r) => [r.candidatePairId, r]),
  );
  state.entityHypothesisById = toMap(demoFixtures.entityHypotheses);
  state.erAuditById = new Map();
  state.relationAuthorityAuditById = new Map();
  state.reverseHypothesisDecisions = new Map();
  state.eventLog = [];
}

/** Append an event to the workspace log (bounded to avoid unbounded growth). */
export function logDemoEvent(state: DemoWorkspaceState, event: unknown): void {
  state.eventLog = [event, ...state.eventLog].slice(0, 500);
}
