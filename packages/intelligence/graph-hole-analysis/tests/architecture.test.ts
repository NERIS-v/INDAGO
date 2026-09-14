// ============================================================================
// Graph-Hole Analysis — architecture tests (Phase 5A-PR7)
//
// Verifies the feature-layer architectural invariants: no console output,
// no direct HTTP calls, frozen version constants, and a minimal public API.
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  GRAPH_HOLE_ANALYSIS_POLICY_VERSION,
  GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION,
  GRAPH_HOLE_ANALYSIS_PROMPT_VERSION,
  DEFAULT_GRAPH_HOLE_ANALYSIS_BOUNDS,
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

describe('Graph-Hole Analysis architecture', () => {
  const src = readAllSource();

  it('contains no console.log/console.error calls', () => {
    expect(src).not.toMatch(/console\.(log|error|warn|debug)\s*\(/);
  });

  it('contains no direct HTTP fetch or dynamic import', () => {
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/\bimport\s*\(/);
  });

  it('contains no JSON.parse (deserialization is owned by the runtime, not the feature)', () => {
    expect(src).not.toMatch(/\bJSON\.parse\s*\(/);
  });

  it('freezes the expected version constants and default bounds', () => {
    expect(GRAPH_HOLE_ANALYSIS_POLICY_VERSION).toBe('v1');
    expect(GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION).toBe('graph-hole-analysis-v1');
    expect(GRAPH_HOLE_ANALYSIS_PROMPT_VERSION).toBe('graph-hole-analysis-v1');
    expect(DEFAULT_GRAPH_HOLE_ANALYSIS_BOUNDS).toEqual({
      maxObservations: 100,
      maxHypotheses: 50,
      maxNodes: 100,
      maxEdges: 250,
      maxSerializedContextChars: 100_000,
    });
  });

  it('exports a minimal public API surface from index.ts', async () => {
    const api = await import('../src/index.js');
    const keys = Object.keys(api).sort();
    // Functions
    expect(keys).toContain('buildGraphHoleAnalysisContext');
    expect(keys).toContain('analyzeGraphHole');
    // Error helpers
    expect(keys).toContain('GraphHoleAnalysisError');
    expect(keys).toContain('isGraphHoleAnalysisError');
    // Schemas (for downstream consumers)
    expect(keys).toContain('GraphHoleAnalysisV1Schema');
    expect(keys).toContain('GraphHoleAnalysisSchemaStampSchema');
    // Version constants
    expect(keys).toContain('GRAPH_HOLE_ANALYSIS_POLICY_VERSION');
    expect(keys).toContain('GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION');
    expect(keys).toContain('GRAPH_HOLE_ANALYSIS_PROMPT_VERSION');
    expect(keys).toContain('DEFAULT_GRAPH_HOLE_ANALYSIS_BOUNDS');
  });
});