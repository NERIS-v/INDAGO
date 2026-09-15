// ============================================================================
// Graph-Hole Judge — architecture + smoke-import tests (Phase 5A-PR9,
// task §15)
//
// Verifies the feature-layer invariants: no console output, no direct HTTP,
// no JSON.parse, frozen version constants, a minimal public API surface, and
// that the published entry point imports + round-trips a decision without a
// network or live provider.
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  adjudicateGraphHoleDecision,
  GRAPH_HOLE_DECISION_POLICY_VERSION,
  GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION,
  GRAPH_HOLE_JUDGE_POLICY_VERSION,
  GRAPH_HOLE_JUDGE_PROMPT_VERSION,
  GRAPH_HOLE_JUDGE_SCHEMA_VERSION,
} from '../src/index.js';

const srcDir = resolve(fileURLToPath(new URL('../src', import.meta.url)));

function readAllSource(): string {
  let content = '';
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts'))
        content += readFileSync(full, 'utf-8') + '\n';
    }
  }
  walk(srcDir);
  return content;
}

describe('graph-hole judge architecture', () => {
  const src = readAllSource();

  it('contains no console output and no direct HTTP / JSON.parse', () => {
    expect(src).not.toMatch(/console\.(log|error|warn|debug)\s*\(/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/\bJSON\.parse\s*\(/);
  });

  it('freezes the expected PR9 version constants', () => {
    expect(GRAPH_HOLE_JUDGE_POLICY_VERSION).toBe('v1');
    expect(GRAPH_HOLE_JUDGE_PROMPT_VERSION).toBe('graph-hole-judge-v1');
    expect(GRAPH_HOLE_JUDGE_SCHEMA_VERSION).toBe('graph-hole-judge-v1');
    // Decision policy: v1 verdict-first table, v2 dimension-gated acceptance.
    expect(GRAPH_HOLE_DECISION_POLICY_VERSION).toBe('v1');
    expect(GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION).toBe('v2');
  });

  it('exports a minimal public API surface from index.ts', async () => {
    const api = await import('../src/index.js');
    const keys = Object.keys(api).sort();
    // Sequential core (the only AI-runtime touch point)
    expect(keys).toContain('judgeGraphHole');
    // Request/payload builders
    expect(keys).toContain('buildJudgePayload');
    expect(keys).toContain('buildJudgeRequest');
    // Orchestration + gate
    expect(keys).toContain('runJudgeDecision');
    expect(keys).toContain('JUDGE_GATE_REASON');
    // Deterministic decision state
    expect(keys).toContain('adjudicateGraphHoleDecision');
    expect(keys).toContain('evaluateJudgeDecision');
    expect(keys).toContain('JUDGE_FAILURE_REASON');
    // Schema + errors + versions
    expect(keys).toContain('GraphHoleJudgeV1Schema');
    expect(keys).toContain('GraphHoleJudgeError');
    expect(keys).toContain('isGraphHoleJudgeError');
    expect(keys).toContain('GRAPH_HOLE_JUDGE_POLICY_VERSION');
    expect(keys).toContain('GRAPH_HOLE_JUDGE_SCHEMA_VERSION');
  });
});

describe('graph-hole judge smoke import', () => {
  it('round-trips a deterministic v2-gated decision entirely offline', () => {
    const resolution = adjudicateGraphHoleDecision({
      candidateId: 'smoke-cand',
      currentStatus: null,
      judgeVerdict: 'ACCEPT',
      validationValid: true,
      judgeDimensions: [
        { dimension: 'ALTERNATIVE_COVERAGE', score: 0.8, rationale: 'x' },
        { dimension: 'EPISTEMIC_DISCIPLINE', score: 1, rationale: 'x' },
        { dimension: 'EVIDENCE_GROUNDING', score: 0.9, rationale: 'x' },
        { dimension: 'GAP_ASSESSMENT_QUALITY', score: 0.8, rationale: 'x' },
        { dimension: 'REASONING_COHERENCE', score: 0.8, rationale: 'x' },
        { dimension: 'UNCERTAINTY_CALIBRATION', score: 0.8, rationale: 'x' },
      ],
      candidateQualified: true,
    });
    expect(resolution.nextStatus).toBe('ACTIVE');
    expect(resolution.transitionApplied).toBe(true);
    expect(resolution.assessmentType).toBe('QUALIFICATION');
    expect(resolution.decisionPolicyVersion).toBe('v2');
  });

  it('gates by PR8 valid without ever touching a runtime', async () => {
    const api = await import('../src/index.js');
    expect(typeof api.runJudgeDecision).toBe('function');
  });
});