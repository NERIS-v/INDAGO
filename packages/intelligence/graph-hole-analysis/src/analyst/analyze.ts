// ============================================================================
// Graph-Hole Analysis Core (Phase 5A-PR7)
//
// The analyst converts a deterministic context + an AI runtime into a
// GraphHoleAnalysisResult. It is a narrow function: one request, one
// generateStructured call, one stamped result. No retry, no fallback, no tool
// calls, no autonomous loops. If the runtime fails, the AiRuntimeError
// propagates directly — the caller receives the specific failure reason
// (UNSUPPORTED_CAPABILITY, RATE_LIMITED, REQUEST_TIMEOUT, etc.) and may
// decide how to handle it.
//
// Determinism:
//   - Identity fields (candidateId, caseId, graphVersionId, regionId) are
//     stamped by the FEATURE, never by the model.
//   - Execution metadata comes from the runtime (authoritative).
//   - contextSha256 is computed BEFORE the LLM call and passed through.
// ============================================================================

import type { AiRuntime } from '@indago/ai-agent-runtime';

import {
  GRAPH_HOLE_ANALYSIS_POLICY_VERSION,
  GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION,
} from '../contracts/analysis-policy.js';
import { GraphHoleAnalysisV1Schema } from '../contracts/analysis-v1.js';
import type { GraphHoleAnalysisResult } from '../contracts/analysis-result.js';
import { toGraphHoleAnalysisExecution } from '../contracts/analysis-result.js';
import type { GraphHoleAnalysisContext } from '../context/types.js';
import { buildAnalysisRequest } from './request.js';

export interface AnalyzeGraphHoleParams {
  /** Prebuilt bounded context (output of buildGraphHoleAnalysisContext). */
  context: GraphHoleAnalysisContext;
  /** The serialized, bounded context package (user message). */
  serializedContext: string;
  /** The context identity digest (computed before the LLM call). */
  contextSha256: string;
  /** Authoritative identity stamps from the caller's input. */
  candidateId: string;
  caseId: string;
  graphVersionId: string;
  regionId: string;
  /** The AI runtime to use for the generateStructured call. */
  runtime: AiRuntime;
}

/**
 * Run the GraphHole analyst: build the request, call generateStructured,
 * validate via Zod, stamp identity + execution metadata, return the result.
 * Runtime-provider errors propagate directly (no feature-level retry).
 */
export async function analyzeGraphHole(
  params: AnalyzeGraphHoleParams,
): Promise<GraphHoleAnalysisResult> {
  const {
    context: _context,
    serializedContext,
    contextSha256,
    candidateId,
    caseId,
    graphVersionId,
    regionId,
    runtime,
  } = params;

  const request = buildAnalysisRequest(serializedContext);
  const result = await runtime.generateStructured(request, GraphHoleAnalysisV1Schema);

  // Identity stamped by the FEATURE (never by the model).
  return {
    analysis: result.data,
    candidateId,
    caseId,
    graphVersionId,
    regionId,
    analysisPolicyVersion: GRAPH_HOLE_ANALYSIS_POLICY_VERSION,
    schemaVersion: GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION,
    contextSha256,
    execution: toGraphHoleAnalysisExecution(result.metadata),
  };
}