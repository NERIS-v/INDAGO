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
  GraphHole,
} from "@indago/contracts";
import type { InvestigationTimeline } from "../../types";
import type {
  ObservationContradiction,
  DiscoveryCandidate,
  ForeignCaseOverlay,
  GraphRealtimeCatalog,
  CrossCaseSignal,
  PredictionFreeze,
  Phase1PostFreezeDelta,
  BreakthroughRecord,
  Phase2AssessmentFreeze,
  MotiveHypothesisComparison,
  ReasoningLedger,
  Phase2EvidenceDelta,
  Phase2EvidenceReadout,
  Phase2HistoricalValidation,
} from "../../types";
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
import { operationFinancialShadowGraph, operationFinancialShadowVersions } from "./graph";
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

/** PASS 2 — Phase-1 intelligence envelope produced by the real-case derivation
 *  (real-case/phase1.ts). Attached purely as DATA to enriched real-case fixture
 *  sets; the OFS demo set leaves it unset. All scores are DERIVED_BY_DEMO_LOGIC. */
export interface RealCasePhase1 {
  readonly crossCaseSignal?: CrossCaseSignal;
  readonly predictionFreeze?: PredictionFreeze;
  readonly derivedLeadId?: string;
  readonly derivedHypothesisId?: string;
  readonly derivedGapId?: string;
  readonly derivedGraphHoleId?: string;
  readonly derivedEvidenceRequestId?: string;
  /** PASS 3 — deterministic post-freeze delta + breakthrough record carried by
   *  the ENRICHED Case-B envelope only (the Exhibit-719 fence is opened by the
   *  analyst's live submission, not by any initial fixture set). */
  readonly postFreezeDelta?: Phase1PostFreezeDelta;
  readonly breakthroughRecord?: BreakthroughRecord;
}

/** PASS 4 — Phase-2 motive-investigation envelope produced by the real-case
 *  derivation (real-case/phase2.ts). Attached purely as DATA to the enriched
 *  Case-B fixture set; the OFS demo set leaves it unset. All scores are
 *  DERIVED_BY_DEMO_LOGIC investigative-relevance estimates — never guilt or
 *  probability statements. S1 material (the sealed WJA audit / financial
 *  document and its observations) is NEVER carried here: it is produced only
 *  by the live second-evidence ingestion. */
export interface RealCasePhase2 {
  readonly investigationId: string;
  readonly caseId: string;
  readonly derivedLeadId?: string;
  readonly derivedHypothesisIds?: readonly string[];
  readonly derivedGapId?: string;
  readonly derivedGraphHoleId?: string;
  readonly derivedEvidenceRequestId?: string;
  readonly assessmentFreeze?: Phase2AssessmentFreeze;
  readonly comparison?: MotiveHypothesisComparison;
  readonly ledger?: ReasoningLedger;
  /** PASS 4 post-evidence delta (deterministic derived projection). */
  readonly evidenceDelta?: Phase2EvidenceDelta;
  /** PASS 4 later-historical validation overlay (class-5 knowledge; the fence
   *  releases these ids only here). */
  readonly historicalValidation?: Phase2HistoricalValidation;
  /** PASS 4 display-only FOR/AGAINST readout (demo §14) for the route surface. */
  readonly evidenceReadout?: Phase2EvidenceReadout;
  /** PASS 4 — the second-evidence (S1) observation RECORDS carried as a seam
   *  projection so the route surface renders resolvable content. Never spliced
   *  into the base envelope's record arrays. */
  readonly secondEvidence?: readonly Observation[];
  /** PASS 4 — the cross-case CONNECTION evidence (H. Paul Rico ↔ hitman /
   *  Boston-gang link revealed by the Case-A network operation). The route
   *  surface renders its observation in H1's supporting set ONLY when the
   *  workspace graph carries the SOLID (ACTIVE) edge between the two nodes —
   *  the "?" graph hole alone never unlocks it. Never spliced into the base
   *  envelope's record arrays. */
  readonly connectionEvidence?: {
    readonly observation: Observation;
    readonly sourceNodeId: string;
    readonly targetNodeId: string;
  };
}

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
  graphVersions: GraphVersion[];
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
  /** Real-case extensions (optional — the OFS demo set leaves these unset).
   *  The `Demo*Provider` classes read them from `state.fixtures` and fall back
   *  to their demo constants when absent. */
  graphHoles?: GraphHole[];
  setupEvents?: DemoStreamEvent[];
  namedSequences?: Record<string, DemoStreamEvent[]>;
  foreignCaseOverlays?: ForeignCaseOverlay[];
  foreignEntityDb?: Record<string, Entity>;
  entityLinkByCandidate?: Record<string, string>;
  graphRealtimeCatalog?: GraphRealtimeCatalog;
  /** PASS 2 — Phase-1 intelligence envelope (DERIVED_BY_DEMO_LOGIC), when the
   *  fixture set carries a derivation. */
  phase1?: RealCasePhase1;
  /** PASS 4 — Phase-2 motive-investigation envelope (DERIVED_BY_DEMO_LOGIC),
   *  when the fixture set carries a derivation. */
  phase2?: RealCasePhase2;
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
  graphVersions: operationFinancialShadowVersions,
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
