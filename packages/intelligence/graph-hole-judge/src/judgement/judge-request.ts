// ============================================================================
// Graph-Hole Judge LLM Request (Phase 5A-PR9)
//
// Constructs the LLMRequest that flows through generateStructured(). The
// system prompt is the static epistemic contract (judge-prompt.ts). The user
// message is a DETERMINISTIC, canonical serialization of a bounded payload:
// the qualified candidate, the PR7 analysis V1, the PR8 validation verdict,
// and the bounded context summary. Nothing outside this payload reaches the
// model (closed world — no graph traversal, no retrieval, no tool calls).
//
// The payload is serialized with canonicalStringify (from @indago/graph-hole-
// analysis) so identical inputs always produce a byte-identical user message
// (determinism for auditing and replay).
//
// No provider-specific formatting. provider/model are runtime-resolved;
// the feature only supplies the version-carrying prompt + feature version
// fields on the LLMRequest (promptVersion, schemaVersion, policyVersion).
// ============================================================================

import type { LLMMessage, LLMRequest } from '@indago/ai-agent-runtime';
import { canonicalStringify } from '@indago/graph-hole-analysis';

import type { GraphHoleJudgeInput } from '../contracts/judge-input.js';
import {
  GRAPH_HOLE_JUDGE_POLICY_VERSION,
  GRAPH_HOLE_JUDGE_PROMPT_VERSION,
  GRAPH_HOLE_JUDGE_SCHEMA_VERSION,
} from '../contracts/judge-policy.js';
import { GRAPH_HOLE_JUDGE_SYSTEM_PROMPT } from '../prompts/judge-prompt.js';

/**
 * Build the deterministic user-message payload for the judge. The payload is a
 * closed world: it contains ONLY the candidate + analysis + validation +
 * context summary for the (single) candidate being judged. The judge never
 * references anything it was not supplied.
 */
export function buildJudgePayload(input: GraphHoleJudgeInput): string {
  const { candidate, analysis, validation, contextSummary } = input;
  return canonicalStringify({
    judgedContextSha256: analysis.contextSha256,
    candidate: {
      candidateId: candidate.rawCandidate.candidateId,
      caseId: candidate.rawCandidate.caseId,
      graphVersionId: candidate.rawCandidate.graphVersionId,
      regionId: candidate.rawCandidate.regionId,
      detectorType: candidate.rawCandidate.detectorType,
      expectedRelationshipType: candidate.rawCandidate.expectedRelationshipType,
      nodeIds: [...candidate.rawCandidate.nodeIds],
      observedEdgeIds: [...candidate.rawCandidate.observedEdgeIds],
      structuralBasis: candidate.rawCandidate.structuralBasis,
      structuralScore: candidate.structuralScore,
      evidenceSupportScore: candidate.evidenceSupportScore,
      expectedInformationValue: candidate.expectedInformationValue,
      significance: candidate.significance,
      independentSupportUnitIds: [...candidate.independentSupportUnitIds],
      regionStatus: candidate.regionStatus,
    },
    analysis: {
      analysisPolicyVersion: analysis.analysisPolicyVersion,
      schemaVersion: analysis.schemaVersion,
      ...analysis.analysis,
    },
    validation: {
      valid: validation.valid,
      findings: validation.findings.map((finding) => ({
        code: finding.code,
        severity: finding.severity,
        path: finding.path,
        referenceId: finding.referenceId ?? null,
        message: finding.message,
      })),
    },
    contextSummary,
  });
}

/** Construct the judge LLMRequest: static system prompt + canonical payload. */
export function buildJudgeRequest(payload: string): LLMRequest {
  const messages: LLMMessage[] = [
    { role: 'system', content: GRAPH_HOLE_JUDGE_SYSTEM_PROMPT },
    { role: 'user', content: payload },
  ];
  return {
    messages,
    promptVersion: GRAPH_HOLE_JUDGE_PROMPT_VERSION,
    schemaVersion: GRAPH_HOLE_JUDGE_SCHEMA_VERSION,
    policyVersion: GRAPH_HOLE_JUDGE_POLICY_VERSION,
  };
}