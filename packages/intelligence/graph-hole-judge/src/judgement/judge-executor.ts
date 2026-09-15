// ============================================================================
// Graph-Hole Judge Core (Phase 5A-PR9)
//
// The judge converts a closed-world GraphHoleJudgeInput + an AI runtime into a
// GraphHoleJudgeResult. It is a narrow function: one request, one
// generateStructured call, one stamped result. No retry, no fallback, no tool
// calls, no autonomous loops. If the runtime fails, the AiRuntimeError
// propagates directly — the caller receives the specific failure reason
// (UNSUPPORTED_CAPABILITY, RATE_LIMITED, REQUEST_TIMEOUT, STRUCTURED_OUTPUT_
// INVALID, ...) and the decision pipeline fails CLOSED (never an ACCEPT).
//
// Authority discipline (frozen contract): the judge only ever touches the ids
// it was supplied as input. candidateId / caseId / graphVersionId / regionId
// must agree across candidate, analysis, and context summary or the judge
// refuses to proceed (INPUT_AUTHORITY_MISMATCH). The candidate must already be
// QUALIFIED (hard-gate-passing) or the judge refuses (INPUT_UNQUALIFIED_
// CANDIDATE).
//
// Determinism:
//   - Identity fields + judgedContextSha256 are stamped by the FEATURE from
//     the authoritative analysis (never echoed by the model).
//   - Dimensions are sorted by dimension name (the schema requires it) so the
//     stamp is byte-stable regardless of model ordering.
//   - Execution metadata comes from the runtime (authoritative).
// ============================================================================

import type { AiRuntime } from '@indago/ai-agent-runtime';

import type { GraphHoleJudgeInput } from '../contracts/judge-input.js';
import {
  GRAPH_HOLE_JUDGE_POLICY_VERSION,
  GRAPH_HOLE_JUDGE_SCHEMA_VERSION,
} from '../contracts/judge-policy.js';
import { GraphHoleJudgeV1Schema } from '../contracts/judge-v1.js';
import type { GraphHoleJudgeV1 } from '../contracts/judge-v1.js';
import type { GraphHoleJudgeResult } from '../contracts/judge-result.js';
import { toGraphHoleJudgeExecution } from '../contracts/judge-result.js';
import { GraphHoleJudgeError } from '../errors/judge-error.js';
import { buildJudgePayload, buildJudgeRequest } from './judge-request.js';

export interface JudgeGraphHoleParams {
  /** The closed-world judge input (frozen contract, already PR8-validated). */
  readonly input: GraphHoleJudgeInput;
  /** The AI runtime to use for the single generateStructured call. */
  readonly runtime: AiRuntime;
}

/**
 * Enforce the authority boundary before the LLM call: every id in the judge
 * input must belong to the same (caseId, graphVersionId, regionId, candidateId)
 * and the candidate must be qualified. Refuses deterministically otherwise.
 */
export function enforceJudgeAuthority(input: GraphHoleJudgeInput): void {
  if (input.candidate.qualified !== true) {
    throw new GraphHoleJudgeError('INPUT_UNQUALIFIED_CANDIDATE');
  }

  const rc = input.candidate.rawCandidate;
  const analysis = input.analysis;
  const contextSummary = input.contextSummary;

  const mismatches: string[] = [];
  if (rc.candidateId !== analysis.candidateId) {
    mismatches.push(`candidateId (candidate=${rc.candidateId}, analysis=${analysis.candidateId})`);
  }
  if (rc.caseId !== analysis.caseId || rc.caseId !== contextSummary.caseId) {
    mismatches.push(
      `caseId (candidate=${rc.caseId}, analysis=${analysis.caseId}, context=${contextSummary.caseId})`,
    );
  }
  if (rc.graphVersionId !== analysis.graphVersionId ||
      rc.graphVersionId !== contextSummary.graphVersionId) {
    mismatches.push(
      `graphVersionId (candidate=${rc.graphVersionId}, analysis=${analysis.graphVersionId}, context=${contextSummary.graphVersionId})`,
    );
  }
  if (rc.regionId !== analysis.regionId || rc.regionId !== contextSummary.regionId) {
    mismatches.push(
      `regionId (candidate=${rc.regionId}, analysis=${analysis.regionId}, context=${contextSummary.regionId})`,
    );
  }

  if (mismatches.length > 0) {
    throw new GraphHoleJudgeError('INPUT_AUTHORITY_MISMATCH', mismatches.join('; '));
  }
}

/**
 * Sort dimensions by dimension name for a deterministic, byte-stable stamp.
 * Returns a NEW array — never mutates the runtime's parsed data.
 */
function sortDimensions(
  dimensions: GraphHoleJudgeV1['dimensions'],
): GraphHoleJudgeV1['dimensions'] {
  return [...dimensions].sort((a, b) => a.dimension.localeCompare(b.dimension));
}

/**
 * Run the GraphHole judge: build the request, call generateStructured exactly
 * once, stamp identity + execution metadata, and return the result.
 * Runtime-provider errors propagate directly (no feature-level retry);
 * the caller must treat any rejection as fail-closed.
 */
export async function judgeGraphHole(
  params: JudgeGraphHoleParams,
): Promise<GraphHoleJudgeResult> {
  const { input, runtime } = params;

  enforceJudgeAuthority(input);

  const payload = buildJudgePayload(input);
  const request = buildJudgeRequest(payload);
  const result = await runtime.generateStructured(request, GraphHoleJudgeV1Schema);

  // Identity stamped by the FEATURE (never by the model).
  return {
    judge: {
      ...result.data,
      dimensions: sortDimensions(result.data.dimensions),
    },
    candidateId: input.analysis.candidateId,
    caseId: input.analysis.caseId,
    graphVersionId: input.analysis.graphVersionId,
    regionId: input.analysis.regionId,
    judgePolicyVersion: GRAPH_HOLE_JUDGE_POLICY_VERSION,
    judgeSchemaVersion: GRAPH_HOLE_JUDGE_SCHEMA_VERSION,
    judgedContextSha256: input.analysis.contextSha256,
    execution: toGraphHoleJudgeExecution(result.metadata),
  };
}