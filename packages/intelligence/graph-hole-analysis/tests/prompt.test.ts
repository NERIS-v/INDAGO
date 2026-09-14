// ============================================================================
// Graph-Hole Analysis — prompt and grounding tests (Phase 5A-PR7)
//
// Verifies that the system prompt encodes the frozen epistemic rules and
// that the request messages are correctly assembled.
// ============================================================================

import { describe, expect, it } from 'vitest';

import {
  GRAPH_HOLE_ANALYSIS_POLICY_VERSION,
  GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION,
  GRAPH_HOLE_ANALYSIS_PROMPT_VERSION,
} from '../src/index.js';
import { GRAPH_HOLE_ANALYSIS_SYSTEM_PROMPT } from '../src/prompts/system-prompt.js';
import { buildAnalysisRequest } from '../src/analyst/request.js';

const EXAMPLE_SERIALIZED = '{"candidate":"test-payload"}';

describe('Graph-Hole Analysis prompt and grounding', () => {
  it('embeds all frozen version labels in the system prompt', () => {
    expect(GRAPH_HOLE_ANALYSIS_SYSTEM_PROMPT).toContain(
      `Analysis policy version: ${GRAPH_HOLE_ANALYSIS_POLICY_VERSION}`,
    );
    expect(GRAPH_HOLE_ANALYSIS_SYSTEM_PROMPT).toContain(
      `Schema version: ${GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION}`,
    );
    expect(GRAPH_HOLE_ANALYSIS_SYSTEM_PROMPT).toContain(
      `Prompt version: ${GRAPH_HOLE_ANALYSIS_PROMPT_VERSION}`,
    );
  });

  it('forbids criminality, guilt, intent, and concealment assertions (§8/§9)', () => {
    const p = GRAPH_HOLE_ANALYSIS_SYSTEM_PROMPT;
    expect(p).toContain('NEVER assert criminality, guilt, intent, concealment, conspiracy');
    expect(p).toMatch(/absence of evidence is evidence of concealment/u);
    expect(p).toContain('You are NOT a judge, lead generator, canonical-mutation system, or autonomous agent');
  });

  it('enumerates the exact allowed evidence classifications', () => {
    const p = GRAPH_HOLE_ANALYSIS_SYSTEM_PROMPT;
    expect(p).toContain('OBSERVED FACT');
    expect(p).toContain('HYPOTHESIS');
    expect(p).toContain('CONTRADICTION');
    expect(p).toContain('STRUCTURAL SIGNAL');
    expect(p).toContain('INFERENCE');
    expect(p).toContain('Evidence classifications (one of exactly five)');
  });

  it('prohibits outside knowledge as evidence and forbids id fabrication', () => {
    const p = GRAPH_HOLE_ANALYSIS_SYSTEM_PROMPT;
    expect(p).toContain('NEVER use outside knowledge as evidence');
    expect(p).toContain('NEVER fabricate entity IDs, observation IDs, source IDs');
    expect(p).toContain('Never fabricate timestamps, date ranges, or temporal claims');
  });

  it('builds the analyst request with system + user messages in the correct order', () => {
    const req = buildAnalysisRequest(EXAMPLE_SERIALIZED);
    expect(req.messages).toEqual([
      { role: 'system', content: GRAPH_HOLE_ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: EXAMPLE_SERIALIZED },
    ]);
    expect(req.promptVersion).toBe(GRAPH_HOLE_ANALYSIS_PROMPT_VERSION);
    expect(req.schemaVersion).toBe(GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION);
    expect(req.policyVersion).toBe(GRAPH_HOLE_ANALYSIS_POLICY_VERSION);
  });

  it('requires the serialized context to be the exact user message (grounding check)', () => {
    const payload = '{"candidate":"specific-analysis-payload","observations":[]}';
    const req = buildAnalysisRequest(payload);
    expect(req.messages[1].content).toBe(payload);
  });
});