// ============================================================================
// Graph-Hole Judge Input (Phase 5A-PR9)
//
// The closed-world input to the GraphHole judge. The orchestrator assembles
// EXACTLY ONE candidate's already-produced artifacts and hands them to the
// judge. The judge NEVER reaches beyond this data: no database-wide retrieval,
// no semantic search, no graph traversal, no tool calls — the model reasons
// only over what is packaged here (plus the judge system prompt).
//
// Object shapes are the repository's authoritative types (never re-created):
//   - candidate: QualifiedGraphHoleCandidate (@indago/contracts, PR5 output)
//   - analysis:  GraphHoleAnalysisResult       (@indago/graph-hole-analysis, PR7 output)
//   - validation: ValidatedGraphHoleAnalysis   (@indago/graph-hole-validation, PR8 output)
//   - contextSummary: a bounded, auditable digest of what the analyst saw —
//     built from GraphHoleAnalysisContext (PR7), NOT a re-institution of the
//     full package.
//
// Authority invariant (mirrors PR7): candidateId / caseId / graphVersionId /
// regionId must agree across candidate, analysis, and contextSummary. The
// judge refuses to proceed on a mismatch.
// ============================================================================

import type { QualifiedGraphHoleCandidate } from '@indago/contracts';
import type { GraphHoleAnalysisResult } from '@indago/graph-hole-analysis';
import type { ValidatedGraphHoleAnalysis } from '@indago/graph-hole-validation';

/** Bounded digest of the PR7 analysis context the model was shown. */
export interface GraphHoleJudgeContextSummary {
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly regionId: string;
  /** Completeness flags of the supplied context (PR7 authority). */
  readonly completeness: GraphHoleAnalysisContextCompleteness;
  readonly observationCount: number;
  readonly hypothesisCount: number;
  readonly groupCount: number;
  readonly structuralSignalCount: number;
}

/** Standalone view of PR7 ContextCompleteness (no widened semantics). */
export interface GraphHoleAnalysisContextCompleteness {
  readonly semanticRetrievalTruncated: boolean;
  readonly regionLimited: boolean;
  readonly observationContextLimited: boolean;
  readonly hypothesisContextLimited: boolean;
  readonly hypothesisGroupingTruncated: boolean;
  readonly temporalContextLimited: boolean;
  readonly contextBudgetLimited: boolean;
}

/**
 * The authoritative, closed-world input to the GraphHole judge. All ids belong
 * to the same (caseId, graphVersionId, regionId, candidateId); agreement is
 * enforced by the judge (authority boundary).
 */
export interface GraphHoleJudgeInput {
  /** The already-qualified candidate (PR5 output, qualified === true). */
  readonly candidate: QualifiedGraphHoleCandidate;
  /** The PR7 analyst result (analysis + stamped identity + execution). */
  readonly analysis: GraphHoleAnalysisResult;
  /** The PR8 deterministic validation verdict over the analysis. */
  readonly validation: ValidatedGraphHoleAnalysis;
  /** Bounded digest of what the analyst saw (auditability, no re-context). */
  readonly contextSummary: GraphHoleJudgeContextSummary;
}