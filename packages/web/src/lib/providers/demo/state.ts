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
import { demoFixtures, type DemoFixtureSet } from "./demo-fixtures";
import type { InvestigationTimeline, ObservationContradiction } from "../types";
import type { HypothesisDecisionRecord } from "@/lib/intel/reverse-hypothesis/hypothesis-model";

export interface DemoWorkspaceState {
  readonly workspaceId: string;
  /** The fixture set powering this workspace. Defaults to demoFixtures (OFS). */
  readonly fixtures: DemoFixtureSet;
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
export function createDemoWorkspaceState(
  workspaceId: string,
  fixtureSet: DemoFixtureSet = demoFixtures,
): DemoWorkspaceState {
  const s: DemoWorkspaceState = {
    workspaceId,
    fixtures: fixtureSet,
    case: fixtureSet.case,
    investigation: fixtureSet.investigation,
    evidenceById: toMap(fixtureSet.evidence),
    observationById: toMap(fixtureSet.observations),
    entityById: toMap(fixtureSet.entities),
    leadById: toMap(fixtureSet.leads),
    gapById: toMap(fixtureSet.gaps),
    evidenceRequestById: toMap(fixtureSet.evidenceRequests),
    reviewTaskById: toMap(fixtureSet.reviewTasks),
    graphNodeById: toMap(fixtureSet.graphNodes),
    graphEdgeById: toMap(fixtureSet.graphEdges),
    sourceById: toMap(fixtureSet.sources),
    artifactById: toMap(fixtureSet.artifacts),
    relationById: toMap(fixtureSet.relations),
    hypothesisById: toMap(fixtureSet.hypotheses),
    timeline: fixtureSet.timeline,
    contradictions: fixtureSet.contradictions,
    candidateById: toMap(fixtureSet.candidates),
    candidatePairById: toMap(fixtureSet.candidatePairs),
    candidateResolutionById: new Map(
      fixtureSet.resolutions.map((r) => [r.candidatePairId, r]),
    ),
    entityHypothesisById: toMap(fixtureSet.entityHypotheses),
    erAuditById: new Map(),
    relationAuthorityAuditById: new Map(),
    reverseHypothesisDecisions: new Map(),
    eventLog: [],
  };
  return s;
}

/** Immutable-reset the store back to the canonical fixture values. */
export function resetDemoWorkspaceState(state: DemoWorkspaceState): void {
  const f = state.fixtures;
  state.case = f.case;
  state.investigation = f.investigation;
  state.evidenceById = toMap(f.evidence);
  state.observationById = toMap(f.observations);
  state.entityById = toMap(f.entities);
  state.leadById = toMap(f.leads);
  state.gapById = toMap(f.gaps);
  state.evidenceRequestById = toMap(f.evidenceRequests);
  state.reviewTaskById = toMap(f.reviewTasks);
  state.graphNodeById = toMap(f.graphNodes);
  state.graphEdgeById = toMap(f.graphEdges);
  state.sourceById = toMap(f.sources);
  state.artifactById = toMap(f.artifacts);
  state.relationById = toMap(f.relations);
  state.hypothesisById = toMap(f.hypotheses);
  state.timeline = f.timeline;
  state.contradictions = f.contradictions;
  state.candidateById = toMap(f.candidates);
  state.candidatePairById = toMap(f.candidatePairs);
  state.candidateResolutionById = new Map(
    f.resolutions.map((r) => [r.candidatePairId, r]),
  );
  state.entityHypothesisById = toMap(f.entityHypotheses);
  state.erAuditById = new Map();
  state.relationAuthorityAuditById = new Map();
  state.reverseHypothesisDecisions = new Map();
  state.eventLog = [];
}

/** Append an event to the workspace log (bounded to avoid unbounded growth). */
export function logDemoEvent(state: DemoWorkspaceState, event: unknown): void {
  state.eventLog = [event, ...state.eventLog].slice(0, 500);
}
