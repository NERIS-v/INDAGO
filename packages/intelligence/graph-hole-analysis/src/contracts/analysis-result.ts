// ============================================================================
// Graph-Hole Analysis Result (Phase 5A-PR7)
//
// The public analyst output: the strict GraphHoleAnalysisV1 plus grounding
// identity and safe execution metadata.
//
// Identity fields (candidateId, caseId, graphVersionId, regionId) are stamped
// by the FEATURE from the authoritative input — never echoed by the model — so
// an analysis record is always correctly tied to the hole it analyzed.
// Execution metadata mirrors the runtime's safe LLMExecutionMetadata; secrets
// never appear (provider, model, versions, latency, retry count, tokens).
// ============================================================================

import type {
  LLMExecutionMetadata,
  LLMFinishReason,
} from '@indago/ai-agent-runtime';

import type { GraphHoleAnalysisV1 } from './analysis-v1.js';
import type {
  GraphHoleAnalysisPolicyVersion,
  GraphHoleAnalysisSchemaVersion,
  GraphHoleAnalysisPromptVersion,
} from './analysis-policy.js';
import {
  GRAPH_HOLE_ANALYSIS_POLICY_VERSION,
  GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION,
  GRAPH_HOLE_ANALYSIS_PROMPT_VERSION,
} from './analysis-policy.js';

/** Safe execution/grounding metadata of one successful analysis. */
export interface GraphHoleAnalysisExecution {
  readonly requestId: string;
  readonly provider: string;
  readonly model: string;
  readonly modelVersion?: string;
  readonly runtimePolicyVersion: string;
  readonly promptVersion: GraphHoleAnalysisPromptVersion;
  readonly schemaVersion: GraphHoleAnalysisSchemaVersion;
  readonly policyVersion: GraphHoleAnalysisPolicyVersion;
  readonly latencyMs: number;
  readonly retryCount: number;
  readonly finishReason: LLMFinishReason;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

/** Full PR7 result — success is structurally distinct from any AI failure. */
export interface GraphHoleAnalysisResult {
  readonly analysis: GraphHoleAnalysisV1;
  readonly candidateId: string;
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly regionId: string;
  readonly analysisPolicyVersion: GraphHoleAnalysisPolicyVersion;
  readonly schemaVersion: GraphHoleAnalysisSchemaVersion;
  readonly contextSha256: string;
  readonly execution: GraphHoleAnalysisExecution;
}

/** Map the runtime's safe metadata into the feature execution envelope. */
export function toGraphHoleAnalysisExecution(
  metadata: LLMExecutionMetadata,
): GraphHoleAnalysisExecution {
  return {
    requestId: metadata.requestId,
    provider: metadata.provider,
    model: metadata.model,
    modelVersion: metadata.modelVersion,
    runtimePolicyVersion: metadata.runtimePolicyVersion,
    promptVersion: GRAPH_HOLE_ANALYSIS_PROMPT_VERSION,
    schemaVersion: GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION,
    policyVersion: GRAPH_HOLE_ANALYSIS_POLICY_VERSION,
    latencyMs: metadata.latencyMs,
    retryCount: metadata.retryCount,
    finishReason: metadata.finishReason,
    inputTokens: metadata.inputTokens,
    outputTokens: metadata.outputTokens,
    totalTokens: metadata.totalTokens,
  };
}