// ============================================================================
// PR6 ownership boundary — the deterministic PR4/PR5 stack is PERSISTENCE-FREE.
//
// PR6 is where GraphHole intelligence output becomes durable. The ownership
// decision is:
//
//     producer  = PR4 detection + PR5 qualification (PURE, in-process)
//     persistence owner = platform GraphHole stores (PR6)
//
// This test guards the boundary structurally: the PR4/PR5 stack must never
// import a persistence client, queue, ORM, storage module, or any file under
// the platform persistence boundary — so no PR4/PR5 function can create a
// "canonical persistence side effect" no matter how it is wired at runtime.
//
// It scans real source files (and package.json dependency declarations), not
// mocks — a forbidden import fails CI.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The PR4/PR5 deterministic stack that must stay persistence-free. */
const PURE_GRAPH_HOLE_PACKAGES = [
  'packages/intelligence/graph-hole-region',
  'packages/intelligence/graph-hole-detection',
  'packages/intelligence/graph-hole-qualification',
] as const;

/** Libraries that would break the persistence-free ownership boundary. */
const FORBIDDEN_DEPENDENCIES = [
  '@prisma/client',
  'prisma',
  'pg',
  'postgres',
  '@neondatabase',
  'better-sqlite3',
  'knex',
  'drizzle-orm',
  'redis',
  'ioredis',
  'bullmq',
  'janus',
] as const;

/** Specifier substrings that would reach into the platform persistence layer. */
const FORBIDDEN_PATH_MARKERS = ['src/persistence', 'src/db/prisma'];

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFiles(full)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

async function scanPackage(pkgDir: string): Promise<string[]> {
  const violations: string[] = [];
  const srcDir = join(pkgDir, 'src');
  for (const file of await listFiles(srcDir)) {
    if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
    const content = await readFile(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      // Import/require specifiers only (no comment-only false positives).
      const match = /(?:from\s+|import\s+|require\(|dynamicImport)\s*['"]([^'"]+)['"]/.exec(line);
      if (!match) return;
      const specifier = match[1]!;
      const forbiddenLib = FORBIDDEN_DEPENDENCIES.find((lib) => specifier === lib);
      const forbiddenPath = FORBIDDEN_PATH_MARKERS.find((marker) => specifier.includes(marker));
      if (forbiddenLib) {
        violations.push(`${relative(WORKSPACE_ROOT, file)}:${i + 1}: imports forbidden dependency '${forbiddenLib}'`);
      }
      if (forbiddenPath) {
        violations.push(`${relative(WORKSPACE_ROOT, file)}:${i + 1}: crosses persistence boundary via '${forbiddenPath}'`);
      }
    });
  }
  const pkgJson = join(pkgDir, 'package.json');
  const manifest = JSON.parse(await readFile(pkgJson, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  for (const section of ['dependencies', 'devDependencies'] as const) {
    for (const name of Object.keys(manifest[section] ?? {})) {
      if ((FORBIDDEN_DEPENDENCIES as readonly string[]).includes(name)) {
        violations.push(`${relative(WORKSPACE_ROOT, pkgJson)}: declares forbidden dependency '${name}' (${section})`);
      }
    }
  }
  return violations;
}

describe('PR6 ownership boundary — PR4/PR5 stack is persistence-free', () => {
  it.each(PURE_GRAPH_HOLE_PACKAGES.map((p) => [p] as const))(
    '%s never imports persistence/DB/queue infrastructure',
    async (pkg) => {
      const violations = await scanPackage(join(WORKSPACE_ROOT, pkg));
      expect(violations).toEqual([]);
    },
  );
});