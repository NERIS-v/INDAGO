// ============================================================================
// Graph-Hole Judge Result (Phase 5A-PR9)
//
// The public judge output: the strict GraphHoleJudgeV1 plus grounding identity
// and safe execution metadata (mirrors PR7 analysis-result.ts).
//
// Identity fields (candidateId, caseId, graphVersionId, regionId) are stamped
// by the FEATURE from the authoritative input — never echoed by the model —
// so a judge record is always correctly tied to the hole + analysis it judged.
//
// Authority discipline: the judge NEVER references an id it was not supplied;
// the judge result carries NO evidence references at all. `judgedContextSha256`
// is the PR7 analysis contextSha256 the judge was shown (already validated by
// PR8), enabling a downstream audit to verify the judge grounded on the exact
// same context the analyst saw.
// ============================================================================

import type {
  LLMExecutionMetadata,
  LLMFinishReason,
} from '@indago/ai-agent-runtime';

import type { GraphHoleJudgeV1 } from './judge-v1.js';
import type {
  GraphHoleJudgePolicyVersion,
  GraphHoleJudgePromptVersion,
  GraphHoleJudgeSchemaVersion,
} from './judge-policy.js';
import {
  GRAPH_HOLE_JUDGE_POLICY_VERSION,
  GRAPH_HOLE_JUDGE_PROMPT_VERSION,
  GRAPH_HOLE_JUDGE_SCHEMA_VERSION,
} from './judge-policy.js';

/** Safe execution/grounding metadata of one successful judge call. */
export interface GraphHoleJudgeExecution {
  readonly requestId: string;
  readonly provider: string;
  readonly model: string;
  readonly modelVersion?: string;
  readonly runtimePolicyVersion: string;
  readonly judgePromptVersion: GraphHoleJudgePromptVersion;
  readonly judgeSchemaVersion: GraphHoleJudgeSchemaVersion;
  readonly judgePolicyVersion: GraphHoleJudgePolicyVersion;
  readonly latencyMs: number;
  readonly retryCount: number;
  readonly finishReason: LLMFinishReason;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

/** Full PR9 result — success is structurally distinct from any AI failure. */
export interface GraphHoleJudgeResult {
  readonly judge: GraphHoleJudgeV1;
  readonly candidateId: string;
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly regionId: string;
  readonly judgePolicyVersion: GraphHoleJudgePolicyVersion;
  readonly judgeSchemaVersion: GraphHoleJudgeSchemaVersion;
  /** PR7 analysis contextSha256 the judge was shown (PR8-validated). */
  readonly judgedContextSha256: string;
  readonly execution: GraphHoleJudgeExecution;
}

/** Map the runtime's safe metadata into the feature execution envelope. */
export function toGraphHoleJudgeExecution(
  metadata: LLMExecutionMetadata,
): GraphHoleJudgeExecution {
  return {
    requestId: metadata.requestId,
    provider: metadata.provider,
    model: metadata.model,
    modelVersion: metadata.modelVersion,
    runtimePolicyVersion: metadata.runtimePolicyVersion,
    judgePromptVersion: GRAPH_HOLE_JUDGE_PROMPT_VERSION,
    judgeSchemaVersion: GRAPH_HOLE_JUDGE_SCHEMA_VERSION,
    judgePolicyVersion: GRAPH_HOLE_JUDGE_POLICY_VERSION,
    latencyMs: metadata.latencyMs,
    retryCount: metadata.retryCount,
    finishReason: metadata.finishReason,
    inputTokens: metadata.inputTokens,
    outputTokens: metadata.outputTokens,
    totalTokens: metadata.totalTokens,
  };
}