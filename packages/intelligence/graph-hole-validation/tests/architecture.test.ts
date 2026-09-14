// ============================================================================
// Graph-Hole Validation — architecture tests (Phase 5A-PR8)
//
// Verifies the validator-layer architectural invariants: deterministic pure
// functions, no console output, no direct HTTP calls, no network/database,
// no mutation of inputs, and a minimal public API.
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { VALIDATION_FINDING_CODE } from '../src/index.js';

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

describe('Graph-Hole Validation architecture', () => {
  const src = readAllSource();

  it('contains no console.log/console.error calls', () => {
    expect(src).not.toMatch(/console\.(log|error|warn|debug)\s*\(/);
  });

  it('contains no direct HTTP fetch or dynamic import', () => {
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/\bimport\s*\(/);
  });

  it('contains no JSON.parse (pure structural validation only)', () => {
    expect(src).not.toMatch(/\bJSON\.parse\s*\(/);
  });

  it('contains no Date.now, Math.random, or clock/entropy sources', () => {
    expect(src).not.toMatch(/\bDate\.now\s*\(/);
    expect(src).not.toMatch(/\bMath\.random\s*\(/);
    expect(src).not.toMatch(/\bperformance\.now\s*\(/);
  });

  it('contains no mutation of inputs (no assignment to result/analysis fields)', () => {
    expect(src).not.toMatch(/\.candidateId\s*=/);
    expect(src).not.toMatch(/\.analysis\s*=/);
  });

  it('is a pure validator with no persistence surface', () => {
    expect(src).not.toMatch(/\bprisma\b/i);
    // SQL/DML mutation mechanisms only; `createHash.update(...)` is intentionally excluded.
    expect(src).not.toMatch(/\binsert\s+into\b/i);
    expect(src).not.toMatch(/\bupdate\s+[a-z0-9_.]+`?[\s\S]*?\bset\b/i);
    expect(src).not.toMatch(/\bdelete\s+from\b/i);
    expect(src).not.toMatch(/\bsave\b|\bpersist\b/i);
  });

  it('exposes a minimal public API surface from index.ts', async () => {
    const api = await import('../src/index.js');
    const keys = Object.keys(api).sort();
    expect(keys).toContain('validateGraphHoleAnalysis');
    expect(keys).toContain('VALIDATION_FINDING_CODE');
    // No schema/runtime leakage.
    expect(keys).not.toContain('createAiRuntime');
    expect(keys).not.toContain('analyzeGraphHole');
  });

  it('publishes the frozen finding code map', () => {
    expect(Object.values(VALIDATION_FINDING_CODE).length).toBe(11);
  });

  it('contains no stated network, provider, or model identifiers', () => {
    // The validator must never reference a runtime/provider to stay pure.
    expect(src).not.toMatch(/ollama/i);
    expect(src).not.toMatch(/gemini/i);
    expect(src).not.toMatch(/\bopenai\b/i);
  });
});