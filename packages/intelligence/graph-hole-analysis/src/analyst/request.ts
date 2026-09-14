// ============================================================================
// Graph-Hole Analysis LLM Request (Phase 5A-PR7)
//
// Constructs the LLMRequest that flows through generateStructured(). The
// system prompt is the static epistemic contract (system-prompt.ts). The user
// message is the serialized, bounded context package (single JSON object).
//
// No provider-specific formatting. No tool calls. No autonomous loops.
// The request shape is PR7A-compatible: provider/model are runtime-resolved;
// feature only supplies the version-carrying prompt + the feature's version
// fields on the LLMRequest (promptVersion, schemaVersion, policyVersion).
// ============================================================================

import type { LLMMessage, LLMRequest } from '@indago/ai-agent-runtime';

import { GRAPH_HOLE_ANALYSIS_PROMPT_VERSION } from '../contracts/analysis-policy.js';
import { GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION } from '../contracts/analysis-policy.js';
import { GRAPH_HOLE_ANALYSIS_POLICY_VERSION } from '../contracts/analysis-policy.js';
import { GRAPH_HOLE_ANALYSIS_SYSTEM_PROMPT } from '../prompts/system-prompt.js';

export function buildAnalysisRequest(
  serializedContext: string,
): LLMRequest {
  const messages: LLMMessage[] = [
    { role: 'system', content: GRAPH_HOLE_ANALYSIS_SYSTEM_PROMPT },
    { role: 'user', content: serializedContext },
  ];
  return {
    messages,
    promptVersion: GRAPH_HOLE_ANALYSIS_PROMPT_VERSION,
    schemaVersion: GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION,
    policyVersion: GRAPH_HOLE_ANALYSIS_POLICY_VERSION,
  };
}