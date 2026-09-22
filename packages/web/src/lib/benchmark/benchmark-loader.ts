// ============================================================================
// Benchmark web loader — reads the committed benchmark corpus artifacts.
//
// Server-side ONLY (fs access). Resolves a benchmark corpus, parses every
// artifact through the @indago/contracts zod schemas with passthrough so that
// honest NOT AVAILABLE render when a field truly is absent. This file NEVER
// invents a number: if summary/holes/manifest or per-case docs are missing or
// fail parsing, the views degrade to explicit NOT AVAILABLE / NOT RUN markers.
//
// Run resolution:
//   - A directory is a RUN DIRECTORY when it contains `manifest.json`.
//   - A directory is a RUNS ROOT when its children are run directories.
//   - `INDAGO_BENCHMARK_DIR`     → treats the path as one run directory.
//   - `INDAGO_BENCHMARK_RUNS_DIR`→ treats the path as a runs root.
//   - Default: repo `benchmark/` (a run directory) or `benchmark-runs/` (a
//     runs root) adjacent to the workspace.
//
// Integrity merge rule: a value the artifact actually DECLARES in its raw JSON
// always wins. Undeclared integrity fields fall back to the provenance
// annotation (benchmark-annotations.ts), whose audit source is cited in the
// UI. Unknown provenance is never presented as corrected: an undeclared run
// without an annotation defaults to PRE_ANALYSIS.
// ============================================================================
// NOTE: this module is server-only by construction — it imports node:fs, which
// Next.js refuses to bundle into client components anyway.

import { promises as fs } from "node:fs";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  BenchmarkHolesDocSchema,
  BenchmarkManifestDocSchema,
  BenchmarkPerCaseDocSchema,
  BenchmarkRunSummarySchema,
  BenchmarkRunViewSchema,
  BenchmarkSummaryDocSchema,
  type BenchmarkConditionAggregate,
  type BenchmarkPerCaseDoc,
  type BenchmarkRunMeta,
  type BenchmarkRunState,
  type BenchmarkRunSummary,
  type BenchmarkRunView,
} from "@indago/contracts";

import { findRunAnnotation } from "./benchmark-annotations";
import { CAPABILITY_COVERAGE, type CapabilityCoverageRow } from "./capability-coverage";
import { comparisonSurface, inferenceMode } from "./benchmark-domain";

const JSON_MISSING = Symbol("missing");

export interface BenchmarkSourceResolution {
  dir: string | null;
  error: string | null;
}

export interface RunDirectory {
  readonly dir: string;
  readonly runId: string;
}

export interface BenchmarkCatalogLoad {
  readonly resolution: BenchmarkSourceResolution;
  readonly runs: BenchmarkRunSummary[];
  /** The active/primary run (first discovered), null only when no corpus mounts. */
  readonly active: BenchmarkRunLoad | null;
}

export interface BenchmarkCounts {
  readonly cases: number;
  readonly plantedHoles: number;
  readonly conditionCount: number;
  readonly holesDetected: number;
}

export interface BenchmarkIntegrity {
  readonly groundTruthAccessed: boolean | null;
  readonly state: BenchmarkRunState | null;
  readonly inferenceMode: string;
  readonly corpus: string;
  readonly independentValidation: boolean | null;
  readonly productionValidation: boolean | null;
  readonly provenanceNote: string | null;
  readonly provenanceSource: string | null;
}

export interface BenchmarkRunLoad {
  readonly resolution: BenchmarkSourceResolution;
  readonly view: BenchmarkRunView;
  readonly capabilities: readonly CapabilityCoverageRow[];
  readonly integrity: BenchmarkIntegrity;
  readonly counts: BenchmarkCounts;
  readonly comparison: ReturnType<typeof comparisonSurface>;
  readonly availableRuns: BenchmarkRunSummary[];
  /** manifest.sources passthrough — corpus/pipeline/etc authorship file paths. */
  readonly sources: Readonly<Record<string, string>>;
  /** manifest artifact SHA-256 hashes (append-only corpus records). */
  readonly artifactHashes: Readonly<Record<string, string>>;
}

export type RawDocument =
  | { ok: true; content: string; contentType: string }
  | { ok: false; reason: "NO_CORPUS" | "NOT_FOUND" | "FORBIDDEN" };

// ─── Path resolution ─────────────────────────────────────────────────────────

function pathUp(p: string, levels: number): string {
  let out = p;
  for (let i = 0; i < levels; i += 1) out = path.dirname(out);
  return out;
}

export function runIdForDir(dir: string): string {
  const base = path.basename(dir);
  if (base.toLowerCase() === "benchmark") return "pilot";
  const id = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return id || "run";
}

export function discoverRuns(envDir?: string, envRunsDir?: string): { runs: RunDirectory[]; resolution: BenchmarkSourceResolution } {
  const roots: string[] = [];
  if (envDir) roots.push(envDir);
  if (envRunsDir) roots.push(envRunsDir);
  const cwd = process.cwd();
  for (let up = 0; up <= 4; up += 1) {
    const base = up === 0 ? cwd : pathUp(cwd, up);
    roots.push(path.join(base, "benchmark"), path.join(base, "benchmark-runs"));
  }

  const runs: RunDirectory[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    if (!existsSync(root)) continue;
    if (existsSync(path.join(root, "manifest.json"))) {
      const runId = runIdForDir(root);
      if (!seen.has(runId)) {
        seen.add(runId);
        runs.push({ dir: root, runId });
      }
      continue;
    }
    let subs: string[] = [];
    try {
      subs = readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      subs = [];
    }
    for (const sub of subs) {
      const dir = path.join(root, sub);
      if (!existsSync(path.join(dir, "manifest.json"))) continue;
      const runId = runIdForDir(dir);
      if (!seen.has(runId)) {
        seen.add(runId);
        runs.push({ dir, runId });
      }
    }
  }

  return {
    runs,
    resolution: {
      dir: runs[0]?.dir ?? roots.find((r) => existsSync(r)) ?? null,
      error: runs.length === 0 ? "NO_BENCHMARK_RUNS_RESOLVED" : null,
    },
  };
}

// ─── JSON parse helpers ──────────────────────────────────────────────────────

async function readJson(p: string): Promise<unknown> {
  const raw = await fs.readFile(p, "utf8").catch(() => null);
  if (raw === null) return JSON_MISSING;
  try {
    return JSON.parse(raw);
  } catch {
    return JSON_MISSING;
  }
}

function rawDeclared(raw: unknown, key: string): boolean {
  return typeof raw === "object" && raw !== null && key in (raw as Record<string, unknown>);
}

function parseVia<T>(schema: { parse: (v: unknown) => T }, raw: unknown, errorRef: { error: string | null }, source: string): T | null {
  if (raw === JSON_MISSING) return null;
  try {
    return schema.parse(raw);
  } catch (e) {
    errorRef.error = `${source} rejected by contract: ${(e as Error).message.split("\n")[0]}`;
    return null;
  }
}

// ─── Run annotation merge ────────────────────────────────────────────────────

export function annotateMeta(
  meta: Partial<BenchmarkRunMeta>,
  runId: string,
  dir: string,
  manifestRaw: unknown,
): BenchmarkRunMeta {
  const ann = findRunAnnotation(runId);
  const stateDeclared = rawDeclared(manifestRaw, "state");
  const groundTruthDeclared = rawDeclared(manifestRaw, "groundTruthAccessed");
  const gitShaDeclared = rawDeclared(manifestRaw, "gitSha");
  const corpusDeclared = rawDeclared(manifestRaw, "corpus");

  return {
    runId,
    generatedAt: meta.generatedAt || "",
    benchmarkVersion: meta.benchmarkVersion || "prototype-pilot",
    gitSha: gitShaDeclared ? meta.gitSha ?? null : ann?.gitSha ?? null,
    seed: meta.seed ?? null,
    corpus: corpusDeclared ? meta.corpus || "SYNTHETIC / DE-IDENTIFIED" : ann?.corpus ?? "SYNTHETIC / DE-IDENTIFIED",
    conditions: meta.conditions ?? ["CLEAN", "NOISY_MISSING", "ADVERSARIAL"],
    provider: meta.provider ?? "NON_PROD",
    model: meta.model ?? null,
    durationMs: meta.durationMs ?? null,
    groundTruthAccessed: groundTruthDeclared ? meta.groundTruthAccessed ?? false : ann?.groundTruthAccessed ?? false,
    state: stateDeclared ? (meta.state ?? "CORRECTED_OBSERVATION_ONLY") : (ann?.state ?? "PRE_ANALYSIS"),
    runPath: dir,
  };
}

export function perCaseKey(caseKey: string, condition: string): string {
  return `${caseKey}__${condition}`;
}

// ─── Run loader ──────────────────────────────────────────────────────────────

export async function loadBenchmarkRun(runIdOrDir: string | undefined): Promise<BenchmarkRunLoad | null> {
  const { runs, resolution } = discoverRuns(
    process.env.INDAGO_BENCHMARK_DIR,
    process.env.INDAGO_BENCHMARK_RUNS_DIR,
  );
  if (runIdOrDir) {
    const target = runs.find((r) => r.runId === runIdOrDir);
    if (target) return loadRunDir(target.dir, target.runId, runs, resolution);
    return null;
  }
  const first = runs[0];
  if (!first) return null;
  return loadRunDir(first.dir, first.runId, runs, resolution);
}

export async function loadBenchmarkCatalog(): Promise<BenchmarkCatalogLoad> {
  const { runs, resolution } = discoverRuns(
    process.env.INDAGO_BENCHMARK_DIR,
    process.env.INDAGO_BENCHMARK_RUNS_DIR,
  );

  const summaries: BenchmarkRunSummary[] = runs.map((r) => {
    const ann = findRunAnnotation(r.runId);
    return BenchmarkRunSummarySchema.parse({
      runId: r.runId,
      label: ann?.label ?? "",
      dir: r.dir,
      generatedAt: "",
      benchmarkVersion: ann ? "prototype-pilot" : "",
      state: ann?.state ?? null,
      groundTruthAccessed: ann?.groundTruthAccessed ?? null,
    });
  });

  if (runs.length === 0) {
    return { resolution, runs: summaries, active: null };
  }

  const first = runs[0];
  if (!first) return { resolution, runs: summaries, active: null };
  const active = await loadRunDir(first.dir, first.runId, runs, resolution);
  return { resolution, runs: summaries, active };
}

async function loadRunDir(
  dir: string,
  runId: string,
  runs: RunDirectory[],
  resolution: BenchmarkSourceResolution,
): Promise<BenchmarkRunLoad> {
  const errorRef: { error: string | null } = { error: resolution.error ?? null };

  const manifestRaw = await readJson(path.join(dir, "manifest.json"));
  const summaryRaw = await readJson(path.join(dir, "summary.json"));
  const holesRaw = await readJson(path.join(dir, "holes.json"));

  const manifest = parseVia(BenchmarkManifestDocSchema, manifestRaw, errorRef, "manifest.json");
  const summary = parseVia(BenchmarkSummaryDocSchema, summaryRaw, errorRef, "summary.json");
  const holes = parseVia(BenchmarkHolesDocSchema, holesRaw, errorRef, "holes.json");

  const meta = annotateMeta(
    {
      ...(manifest ?? {}),
      generatedAt: manifest?.generatedAt ?? summary?.nowIso ?? summary?.generatedAt ?? "",
    },
    runId,
    dir,
    manifestRaw,
  );

  // Per-case docs (<caseKey>.<CONDITION>.json).
  const perCase: Record<string, BenchmarkPerCaseDoc> = {};
  let perCaseCount = 0;
  const perCaseDir = path.join(dir, "per-case");
  try {
    const files = (await fs.readdir(perCaseDir)).filter((f) => f.endsWith(".json"));
    perCaseCount = files.length;
    for (const file of files) {
      const raw = await readJson(path.join(perCaseDir, file));
      const doc = parseVia(BenchmarkPerCaseDocSchema, raw, errorRef, `per-case/${file}`);
      if (doc && doc.caseKey && doc.condition) {
        perCase[perCaseKey(doc.caseKey, doc.condition)] = doc;
      }
    }
  } catch {
    perCaseCount = 0;
  }

  const conditions: BenchmarkConditionAggregate[] = summary?.conditions ?? [];
  const ann = findRunAnnotation(runId);
  const view: BenchmarkRunView = BenchmarkRunViewSchema.parse({
    runId,
    label: ann?.label ?? "",
    generatedAt: meta.generatedAt,
    benchmarkVersion: meta.benchmarkVersion,
    state: meta.state,
    groundTruthAccessed: meta.groundTruthAccessed,
    gitSha: meta.gitSha,
    seed: meta.seed,
    corpus: meta.corpus,
    provider: meta.provider,
    model: meta.model,
    durationMs: meta.durationMs,
    commentary: holes?.labels
      ? {
          label: holes.labels.banner || null,
          title: holes.labels.mode || null,
          subheading: holes.labels.corpus || null,
          disclaimer: holes.labels.disclaimer ?? null,
        }
      : undefined,
    conditions,
    holes: holes?.entries ?? [],
    verdicts: holes?.verdicts ?? [],
    perCase,
    missing: {
      manifest: manifest === null,
      summary: summary === null,
      holes: holes === null,
      perCase: perCaseCount === 0,
    },
  });

  const counts: BenchmarkCounts = {
    cases: conditions.reduce((n, c) => n + c.cases, 0),
    plantedHoles: conditions.reduce((n, c) => n + (c.totalHoles ?? 0), 0),
    conditionCount: conditions.length,
    holesDetected: conditions.reduce((n, c) => n + (c.holesDetected ?? 0), 0),
  };

  const integrity: BenchmarkIntegrity = {
    groundTruthAccessed: meta.groundTruthAccessed,
    state: meta.state,
    inferenceMode: inferenceMode(meta.state, meta.groundTruthAccessed),
    corpus: meta.corpus,
    independentValidation: ann?.independentValidation ?? null,
    productionValidation: ann?.productionValidation ?? null,
    provenanceNote: ann?.note ?? null,
    provenanceSource: ann?.source ?? null,
  };

  const availableRuns: BenchmarkRunSummary[] = runs
    .filter((r) => r.runId !== runId)
    .map((r) => {
      const sub = findRunAnnotation(r.runId);
      return BenchmarkRunSummarySchema.parse({
        runId: r.runId,
        label: sub?.label ?? "",
        dir: r.dir,
        generatedAt: "",
        benchmarkVersion: sub ? "prototype-pilot" : "",
        state: sub?.state ?? null,
        groundTruthAccessed: sub?.groundTruthAccessed ?? null,
      });
    });

  const src = manifest && typeof manifest === "object" && "sources" in manifest ? (manifest as { sources?: Record<string, string> }).sources : undefined;
  const hashesOf = (): Record<string, string> => {
    const out: Record<string, string> = {};
    if (manifest && typeof manifest === "object") {
      const m = manifest as Record<string, unknown>;
      const skip = new Set(["labels", "sources", "generatedAt", "light"]);
      for (const key of Object.keys(m)) {
        if (skip.has(key)) continue;
        if (typeof m[key] === "string" && /^[0-9a-f]{40,}$/.test(m[key] as string)) {
          out[key] = m[key] as string;
        }
      }
    }
    return out;
  };

  return {
    resolution: { dir, error: errorRef.error },
    view,
    capabilities: CAPABILITY_COVERAGE,
    integrity,
    counts,
    comparison: comparisonSurface(view),
    availableRuns,
    sources: src ?? {},
    artifactHashes: hashesOf(),
  };
}

// ─── Raw document access (reproducibility actions) ───────────────────────────

export interface BenchmarkDocumentMeta {
  readonly file: string;
  readonly contentType: string;
  readonly label: string;
}

const DOCUMENT_ALLOWLIST: readonly BenchmarkDocumentMeta[] = [
  { file: "manifest.json", contentType: "application/json", label: "manifest.json" },
  { file: "summary.json", contentType: "application/json", label: "summary.json" },
  { file: "holes.json", contentType: "application/json", label: "holes.json" },
  { file: "audit/deep-audit.md", contentType: "text/markdown", label: "deep-audit.md" },
  { file: "condition-summary.md", contentType: "text/markdown", label: "condition-summary.md" },
  { file: "viability.md", contentType: "text/markdown", label: "viability.md" },
  { file: "README.md", contentType: "text/markdown", label: "README.md" },
];

export function benchmarkDocumentAllowlist(): readonly BenchmarkDocumentMeta[] {
  return DOCUMENT_ALLOWLIST;
}

const PER_CASE_PREFIX = "per-case/";

export async function readBenchmarkDocument(runId: string, document: string): Promise<RawDocument> {
  const { runs } = discoverRuns(
    process.env.INDAGO_BENCHMARK_DIR,
    process.env.INDAGO_BENCHMARK_RUNS_DIR,
  );
  if (runs.length === 0) return { ok: false, reason: "NO_CORPUS" };
  const run = runs.find((r) => r.runId === runId);
  if (!run) return { ok: false, reason: "NOT_FOUND" };

  const clean = document.replace(/\\/g, "/");
  if (clean.startsWith(PER_CASE_PREFIX)) {
    const file = path.join(run.dir, clean);
    if (!path.isAbsolute(file) || path.dirname(file) !== path.join(run.dir, "per-case")) {
      return { ok: false, reason: "FORBIDDEN" };
    }
    const content = await fs.readFile(file, "utf8").catch(() => null);
    if (content === null) return { ok: false, reason: "NOT_FOUND" };
    return { ok: true, content, contentType: "application/json" };
  }
  const entry = DOCUMENT_ALLOWLIST.find((d) => d.file === clean || d.label === clean);
  if (!entry) return { ok: false, reason: "FORBIDDEN" };
  const content = await fs.readFile(path.join(run.dir, entry.file), "utf8").catch(() => null);
  if (content === null) return { ok: false, reason: "NOT_FOUND" };
  return { ok: true, content, contentType: entry.contentType };
}