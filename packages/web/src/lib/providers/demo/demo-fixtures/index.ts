// ============================================================================
// F-PR2 Demo Fixture Assembly
//
// Composes every canonical fixture for "Operation Financial Shadow" into a
// single immutable set, plus a validation function the test suite uses to
// prove every fixture passes its canonical Zod schema.
// ============================================================================

import type {
  Case,
  Investigation,
  Source,
  Evidence,
  Observation,
  Entity,
  RelationHypothesis,
  Hypothesis,
  Lead,
  InvestigativeGap,
  EvidenceRequest,
  ReviewTask,
  GraphVersion,
  GraphNode,
  GraphEdge,
  CrossCaseMatch,
  RobustnessResult,
  EntityMentionCandidate,
  CandidatePair,
  CandidateResolution,
  EntityHypothesis,
  Artifact,
} from "@indago/contracts";
import type { InvestigationTimeline } from "../../types";
import type { ObservationContradiction, DiscoveryCandidate } from "../../types";
import type { DemoStreamEvent } from "./events";
import { operationFinancialShadowCase } from "./case";
import { operationFinancialShadowInvestigation } from "./investigation";
import { operationFinancialShadowSources } from "./sources";
import { operationFinancialShadowArtifacts } from "./artifacts";
import { operationFinancialShadowEvidence } from "./evidence";
import { operationFinancialShadowObservations } from "./observations";
import { operationFinancialShadowEntities } from "./entities";
import { operationFinancialShadowRelations } from "./relations";
import { operationFinancialShadowHypotheses } from "./hypotheses";
import { operationFinancialShadowLeads } from "./leads";
import { operationFinancialShadowGaps } from "./gaps";
import { operationFinancialShadowEvidenceRequests } from "./evidence-requests";
import { operationFinancialShadowReviewTasks } from "./review-tasks";
import { operationFinancialShadowGraph } from "./graph";
import { operationFinancialShadowTimeline } from "./timeline";
import { operationFinancialShadowCrossCase } from "./cross-case";
import { operationFinancialShadowRobustness } from "./robustness";
import { operationFinancialShadowEvents } from "./events";
import {
  operationFinancialShadowCandidates,
  operationFinancialShadowCandidatePairs,
  operationFinancialShadowResolutions,
  operationFinancialShadowEntityHypotheses,
} from "./entity-resolution";
import { operationFinancialShadowContradictions } from "./contradictions";
import { demoDiscoveryCandidates } from "./discovery";

export interface DemoFixtureSet {
  case: Case;
  investigation: Investigation;
  sources: Source[];
  artifacts: Artifact[];
  evidence: Evidence[];
  observations: Observation[];
  entities: Entity[];
  relations: RelationHypothesis[];
  hypotheses: Hypothesis[];
  leads: Lead[];
  gaps: InvestigativeGap[];
  evidenceRequests: EvidenceRequest[];
  reviewTasks: ReviewTask[];
  graphVersion: GraphVersion;
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  timeline: InvestigationTimeline;
  crossCase: CrossCaseMatch[];
  robustness: RobustnessResult;
  events: DemoStreamEvent[];
  candidates: EntityMentionCandidate[];
  candidatePairs: CandidatePair[];
  resolutions: CandidateResolution[];
  entityHypotheses: EntityHypothesis[];
  contradictions: ObservationContradiction[];
  discoveryCandidates: DiscoveryCandidate[];
}

/** The single assembled demo dataset (immutable). */
export const demoFixtures: DemoFixtureSet = {
  case: operationFinancialShadowCase,
  investigation: operationFinancialShadowInvestigation,
  sources: operationFinancialShadowSources,
  artifacts: operationFinancialShadowArtifacts,
  evidence: operationFinancialShadowEvidence,
  observations: operationFinancialShadowObservations,
  entities: operationFinancialShadowEntities,
  relations: operationFinancialShadowRelations,
  hypotheses: operationFinancialShadowHypotheses,
  leads: operationFinancialShadowLeads,
  gaps: operationFinancialShadowGaps,
  evidenceRequests: operationFinancialShadowEvidenceRequests,
  reviewTasks: operationFinancialShadowReviewTasks,
  graphVersion: operationFinancialShadowGraph.version,
  graphNodes: operationFinancialShadowGraph.nodes,
  graphEdges: operationFinancialShadowGraph.edges,
  timeline: operationFinancialShadowTimeline,
  crossCase: operationFinancialShadowCrossCase,
  robustness: operationFinancialShadowRobustness,
  events: operationFinancialShadowEvents,
  candidates: operationFinancialShadowCandidates,
  candidatePairs: operationFinancialShadowCandidatePairs,
  resolutions: operationFinancialShadowResolutions,
  entityHypotheses: operationFinancialShadowEntityHypotheses,
  contradictions: operationFinancialShadowContradictions,
  discoveryCandidates: demoDiscoveryCandidates,
};
