// ============================================================================
// Graph-Hole Validation — security tests (Phase 5A-PR8)
//
// Grep the validator source for forbidden leakage: runtime/provider surface,
// generative-AI creation, tool-call mechanisms, and secret access patterns.
// These are exclusively test-time grep checks (no runtime overhead).
// ============================================================================

import { expect, describe, it } from 'vitest';
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

describe('Graph-Hole Validation security', () => {
  const src = readAllSource();

  it('contains no Gemini/OLLAMA/GEMINI_API_KEY provider leakage', () => {
    expect(src).not.toMatch(/Gemini/i);
    expect(src).not.toMatch(/OLLAMA/);
    expect(src).not.toMatch(/GEMINI_API_KEY/);
  });

  it('contains no tool-call / function-call mechanism and no runtime/provider creation', () => {
    expect(src).not.toMatch(/\btool[ _]call\b/i);
    expect(src).not.toMatch(/\bfunction[ _]call\b/i);
    expect(src).not.toMatch(/callTool|executeTool|registerTool|invokeTool/u);
    expect(src).not.toMatch(/createAiRuntime|createLLMProvider/u);
  });

  it('contains no secrets, API keys, or provider base URLs', () => {
    expect(src).not.toMatch(/api[ _]?key/i);
    expect(src).not.toMatch(/generativelanguage|localhost:11434/i);
    expect(src).not.toMatch(/Authorization\s*:/i);
  });

  it('contains no environment variable access (pure validator, closed-world)', () => {
    expect(src).not.toMatch(/process\.env/);
  });

  it('contains no autonomous-loop/agent mechanics', () => {
    expect(src).not.toMatch(/\bsetInterval\b|\brequestAnimationFrame\b/i);
    expect(src).not.toMatch(/\bwhile\s*\(\s*true\s*\)/);
    expect(src).not.toMatch(/\bawait\b/); // validator must be fully synchronous
  });
});