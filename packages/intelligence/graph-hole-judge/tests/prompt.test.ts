// ============================================================================
// Graph-Hole Judge — prompt contract tests (Phase 5A-PR9, task §3/§4)
//
// Pins the static judge system prompt against the frozen epistemic rules:
//   - closed world (only supplied evidence; no inventing, no graph traversal,
//     no retrieval, no tool calls)
//   - PR8 cannot be overridden; any supplied ERROR → NON_ACCEPTING
//   - no criminality / guilt / intent / concealment / conspiracy claims
//   - contradictions treated explicitly; retained WARNINGs are weighed, not
//     silently dropped
//   - closed verdict enum (ACCEPT/NON_ACCEPTING), no numeric aggregate, no
//     threshold the model must derive, no free-form "decision" string
//   - frozen version labels embedded
// ============================================================================

import { describe, expect, it } from 'vitest';

import {
  GRAPH_HOLE_JUDGE_POLICY_VERSION,
  GRAPH_HOLE_JUDGE_PROMPT_VERSION,
  GRAPH_HOLE_JUDGE_SCHEMA_VERSION,
} from '../src/index.js';
import { GRAPH_HOLE_JUDGE_SYSTEM_PROMPT } from '../src/prompts/judge-prompt.js';
import { buildJudgeRequest } from '../src/judgement/judge-request.js';

describe('graph-hole judge prompt', () => {
  it('embeds the frozen version labels', () => {
    const p = GRAPH_HOLE_JUDGE_SYSTEM_PROMPT;
    expect(p).toContain(`Judge policy version: ${GRAPH_HOLE_JUDGE_POLICY_VERSION}`);
    expect(p).toContain(`Schema version: ${GRAPH_HOLE_JUDGE_SCHEMA_VERSION}`);
    expect(p).toContain(`Prompt version: ${GRAPH_HOLE_JUDGE_PROMPT_VERSION}`);
  });

  it('states the closed-world rule: only the supplied payload is evidence', () => {
    const p = GRAPH_HOLE_JUDGE_SYSTEM_PROMPT;
    expect(p).toContain('Reason ONLY over the evidence supplied in the user message below');
    expect(p).toContain('NEVER retrieve, search, traverse, or otherwise reach beyond the supplied');
    expect(p).toContain('NEVER use outside knowledge as evidence');
    expect(p).toContain('NEVER invent observation ids, hypothesis ids, node ids, edge ids, sources');
  });

  it('forbids criminality, guilt, intent, concealment, and conspiracy assertions', () => {
    const p = GRAPH_HOLE_JUDGE_SYSTEM_PROMPT;
    expect(p).toContain(
      'You MUST NOT assert criminality, guilt, intent, concealment, conspiracy',
    );
    expect(p).toMatch(/absence of evidence is evidence of concealment/u);
  });

  it('never overrides a PR8 ERROR: any ERR → NON_ACCEPTING', () => {
    const p = GRAPH_HOLE_JUDGE_SYSTEM_PROMPT;
    expect(p).toContain('A PR8 ERROR can never be overridden by this judgement');
    expect(p).toContain('your verdict MUST be NON_ACCEPTING');
  });

  it('treats contradictions explicitly and weighs warnings instead of hiding them', () => {
    const p = GRAPH_HOLE_JUDGE_SYSTEM_PROMPT;
    expect(p).toContain('Treat supplied contradictions explicitly');
    expect(p).toContain('CONTRADICTION_IGNORED');
    expect(p).toContain('never dropped or hidden');
  });

  it('keeps verdict discipline: closed enum, no threshold, no free-form decision', () => {
    const p = GRAPH_HOLE_JUDGE_SYSTEM_PROMPT;
    expect(p).toContain('verdict is a closed enum: ACCEPT or NON_ACCEPTING');
    expect(p).toContain('no numeric aggregation, and no threshold you compute');
    expect(p).toContain('Scores are NOT probabilities and there is NO weighted aggregate');
    expect(p).toContain('Do NOT output any field not present in GraphHoleJudgeV1');
  });

  it('bounds the dimension vocabulary to the six frozen dimensions', () => {
    const p = GRAPH_HOLE_JUDGE_SYSTEM_PROMPT;
    for (const dim of [
      'EVIDENCE_GROUNDING',
      'REASONING_COHERENCE',
      'EPISTEMIC_DISCIPLINE',
      'UNCERTAINTY_CALIBRATION',
      'GAP_ASSESSMENT_QUALITY',
      'ALTERNATIVE_COVERAGE',
    ]) {
      expect(p).toContain(dim);
    }
  });

  it('buildJudgeRequest assembles system + user messages in the correct order with frozen versions', () => {
    const payload = '{"judgedContextSha256":"abc","candidate":{},"analysis":{},"validation":{},"contextSummary":{}}';
    const req = buildJudgeRequest(payload);
    expect(req.messages).toEqual([
      { role: 'system', content: GRAPH_HOLE_JUDGE_SYSTEM_PROMPT },
      { role: 'user', content: payload },
    ]);
    expect(req.promptVersion).toBe(GRAPH_HOLE_JUDGE_PROMPT_VERSION);
    expect(req.schemaVersion).toBe(GRAPH_HOLE_JUDGE_SCHEMA_VERSION);
    expect(req.policyVersion).toBe(GRAPH_HOLE_JUDGE_POLICY_VERSION);
  });
});