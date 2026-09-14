// ============================================================================
// Graph-Hole Analysis — security tests (Phase 5A-PR7)
//
// Grep the feature source for forbidden leakage: provider identifiers
// outside the runtime boundary, canonical-mutation surface, hypothesis
// approve/reject, judge, tool calls, autonomous loops. These are
// exclusively test-time grep checks (no runtime overhead).
// ============================================================================

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = resolve(fileURLToPath(new URL('../src', import.meta.url)));

function readAllSource(): string {
  let content = '';
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts')) {
        content += readFileSync(full, 'utf-8') + '\n';
      }
    }
  }
  walk(srcDir);
  return content;
}

describe('Graph-Hole Analysis security', () => {
  const src = readAllSource();

  it('contains no Gemini/OLLAMA/GEMINI_API_KEY provider leakage', () => {
    expect(src).not.toMatch(/Gemini/i);
    expect(src).not.toMatch(/OLLAMA/);
    expect(src).not.toMatch(/GEMINI_API_KEY/);
  });

  it('contains no canonical-mutation or lead/hypothesis lifecycle API surface', () => {
    expect(src).not.toMatch(/\b(?:approve|reject)Hypothesis\b/i);
    expect(src).not.toMatch(/\b(?:approve|reject|close|escalate)Lead\b/i);
    expect(src).not.toMatch(/\bcreateLead\b|\bupdateLead\b|\bdeleteLead\b/i);
    expect(src).not.toMatch(/\b(?:create|update|delete|save)Observation\b/i);
  });

  it('contains no tool-call / function-call mechanism and no runtime/provider creation', () => {
    expect(src).not.toMatch(/\btool[ _]call\b/i);
    expect(src).not.toMatch(/\bfunction[ _]call\b/i);
    expect(src).not.toMatch(/callTool|executeTool|registerTool|invokeTool/u);
    expect(src).not.toMatch(/createAiRuntime|createLLMProvider/u);
    expect(src).not.toMatch(/setInterval|requestAnimationFrame/u);
  });
});