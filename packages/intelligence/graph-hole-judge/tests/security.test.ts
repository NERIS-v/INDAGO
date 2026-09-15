// ============================================================================
// Graph-Hole Judge — security tests (Phase 5A-PR9, task §14)
//
// Grep the feature source for forbidden leakage per the authority boundary:
//   - no provider identifiers / API keys inside the feature (runtime-owned)
//   - no AI runtime construction, provider factories, or generation bypass
//   - no Prisma / SQL / direct fetch / HTTP / fs / shell / process.env
//   - no persistence / evidence creation / graph mutation / retrieval surface
//   - no tool-call mechanism / autonomous loops
// These are exclusively test-time static grep checks (no runtime overhead);
// they mirror PR7/PR8 security tests.
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = resolve(fileURLToPath(new URL('../src', import.meta.url)));

function readAllSource(): string {
  let content = '';
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts'))
        content += readFileSync(full, 'utf-8') + '\n';
    }
  }
  walk(srcDir);
  return content;
}

describe('graph-hole judge security', () => {
  const src = readAllSource();

  it('contains no provider identifiers or secret-key leakage', () => {
    expect(src).not.toMatch(/Gemini/i);
    expect(src).not.toMatch(/\bOLLAMA\b/);
    expect(src).not.toMatch(/GEMINI_API_KEY|API_KEY|apiKey|secret|Authorization/i);
  });

  it('does not construct or bypass the AI runtime (no createAiRuntime, createLLMProvider, provider factories)', () => {
    expect(src).not.toMatch(/createAiRuntime|createLLMProvider|GeminiProvider|OllamaGenerationProvider|\bfetch\s*\(/u);
  });

  it('has no persistence / SQL / Prisma / graph-mutation surface', () => {
    expect(src).not.toMatch(/\bprisma\b/i);
    expect(src).not.toMatch(/\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b\s+FROM/i);
    expect(src).not.toMatch(/\b(?:create|update|delete|save|persist|write)GraphHole\b/i);
    expect(src).not.toMatch(/\b(?:create|update|delete|save)Observation\b/i);
    expect(src).not.toMatch(/\b(?:create|update|delete|save)Edge\b|\b(?:create|update|delete|save)Node\b/i);
  });

  it('does not import, implement, or call graph-traversal / retrieval / evidence-acquisition APIs', () => {
    // The feature must have NO execution surface for these capabilities. The
    // system prompt may mention the words as prohibitions, so the greps target
    // real identifiers / call sites, not prose.
    expect(src).not.toMatch(/\b(?:traverseGraph|retrieveEvidence|findEvidence|bfs|dfs|shortestPath)\s*\(/u);
    expect(src).not.toMatch(/\bnextBestEvidence\b|\bEvidenceRequest\b/u);
    expect(src).not.toMatch(/\b(?:build|create|execute|plan|reward)EvidenceRequest\b/u);
    expect(src).not.toMatch(/\btool[ _]call\b|\bfunction[ _]call\b|\bcallTool\b|\bexecuteTool\b|\bregisterTool\b|\binvokeTool\b/u);
  });

  it('contains no autonomous-loop / clock / environment escape hatches', () => {
    expect(src).not.toMatch(/\bwhile\s*\(true\)|\bsetInterval\b|\brequestAnimationFrame\b/u);
    expect(src).not.toMatch(/process\.env|\bimport\s*\(/u);
  });
});