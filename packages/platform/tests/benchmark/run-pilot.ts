// ============================================================================
// INTERNAL PILOT EVALUATION  ·  PROTOTYPE BENCHMARK  ·  SYNTHETIC / DE-IDENTIFIED
// Pilot benchmark entrypoint.
//
//   full:   npx tsx tests/benchmark/run-pilot.ts
//   light:  $env:INDAGO_BENCH_LIGHT='1'; npx tsx tests/benchmark/run-pilot.ts
//   quiet:  $env:INDAGO_BENCH_QUIET='1'; npx tsx tests/benchmark/run-pilot.ts
//
// Runs the REAL deterministic engines over the seeded synthetic corpus for
// every (case-spec × condition), writes all artifacts to `<repo>/benchmark/`,
// and renders a sparse cinematic console record via terminal.ts. Deterministic:
// fixed nowIso, seeded RNG, no wall clock in scores (elapsed ms is diagnostic
// and excluded from hashes). The presentation layer reads real execution state —
// it never fabricates results and never hardcodes completion states.
// ============================================================================

import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { CASE_SPECS, CONDITIONS, generateCaseCorpus } from './corpus.js';
import { runHoleChain } from './holes.js';
import { computeCaseMetrics } from './metrics.js';
import { runPipeline } from './pipeline.js';
import { buildReport, writeBenchmarkArtifacts } from './report.js';
import { deriveEntityResolutionQueues, evaluateHoleRobustness } from './robustness.js';
import { envFlag, sha256Hex } from './util.js';
import {
  detectTerminalEnv,
  packageLine,
  parkPanel,
  renderArtifacts,
  renderConditionTraces,
  renderCoverage,
  renderEpilogue,
  renderHeader,
  renderResults,
  renderStageLedger,
  showPanelFrame,
  type HoleTrace,
  type StageRow,
} from './terminal.js';

const DEFAULT_NOW = '2026-01-01T00:00:00.000Z';

function seedFor(caseKey: string): number {
  return (parseInt(sha256Hex([caseKey]).slice(0, 6), 16) % 90_000) + 1_000;
}

interface RunSig {
  readonly regionErrCount: number;
  readonly detectionZeroCount: number;
  readonly rejectedCount: number;
}

function runSignals(cases: readonly { chain: { entries: readonly { region: unknown; regionError: unknown; detection: { candidateCount: number } | null; qualifiedCandidateCount: number }[] } }[]): RunSig {
  let regionErrCount = 0;
  let detectionZeroCount = 0;
  let rejectedCount = 0;
  for (const c of cases) {
    for (const e of c.chain.entries) {
      if (e.regionError !== null) regionErrCount += 1;
      if (e.region !== null && (e.detection?.candidateCount ?? 0) === 0) detectionZeroCount += 1;
      const raw = e.detection?.candidateCount ?? 0;
      if (raw > 0 && e.qualifiedCandidateCount === 0) rejectedCount += 1;
    }
  }
  return { regionErrCount, detectionZeroCount, rejectedCount };
}

function stageLedger(sig: RunSig): readonly StageRow[] {
  const note = (n: number, m: string): string | undefined => (n > 0 ? `${n} ${m}` : undefined);
  return [
    { key: 'INGESTION', status: 'EXECUTED', note: 'normalization · extraction · mentions' },
    { key: 'MATERIALIZATION', status: 'EXECUTED', note: 'observations · mentions · blocks' },
    { key: 'ENTITY RESOLUTION', status: 'EXECUTED', note: 'comparison + resolution' },
    { key: 'RELATION RESOLUTION', status: 'EXECUTED', note: 'proposals ≥ threshold' },
    { key: 'GRAPH PROJECTION', status: 'EXECUTED', note: 'project + analytics' },
    {
      key: 'GRAPH-HOLE REGION',
      status: sig.regionErrCount > 0 ? 'WARNING' : 'EXECUTED',
      note: note(sig.regionErrCount, 'hole(s) without a built region'),
    },
    {
      key: 'DETECTION',
      status: sig.detectionZeroCount > 0 ? 'WARNING' : 'EXECUTED',
      note: note(sig.detectionZeroCount, 'region(s) with no candidate signal'),
    },
    {
      key: 'QUALIFICATION',
      status: sig.rejectedCount > 0 ? 'WARNING' : 'EXECUTED',
      note: note(sig.rejectedCount, 'candidate(s) rejected at gates'),
    },
    { key: 'GAP CLASSIFICATION', status: 'EXECUTED', note: 'PR14 · classifyGap' },
    { key: 'EXPLANATIONS', status: 'EXECUTED', note: 'PR15 · competing hypotheses' },
    { key: 'EVIDENCE REQUESTS', status: 'EXECUTED', note: 'PR17 · request generation' },
    { key: 'NEXT-BEST EVIDENCE', status: 'EXECUTED', note: 'PR18 · run selection' },
    { key: 'AI ANALYST (PR7)', status: 'NOT_RUN', note: 'built, unwired · test-only' },
    { key: 'AI VALIDATOR (PR8)', status: 'NOT_RUN' },
    { key: 'AI JUDGE (PR9)', status: 'NOT_RUN' },
    { key: 'SEMANTIC RETRIEVAL', status: 'NOT_RUN' },
    { key: 'ENTITY-SPLIT (PR16)', status: 'NOT_RUN', note: 'PR16→PR17 handoff omitted' },
    { key: 'REASSESSMENT', status: 'NOT_APPLICABLE', note: 'no field ingestion stream' },
    { key: 'TARGETED REBLOCKING', status: 'NOT_APPLICABLE' },
    { key: 'DOCUMENT EXTRACTION', status: 'FABRICATED', note: 'makeTxt synthetic records only' },
  ];
}

function coverageRows(): readonly StageRow[] {
  return [
    { key: 'deterministic core', status: 'EXECUTED', note: 'real @indago engines · fully wired in harness' },
    { key: 'ai analyst / validator / judge', status: 'NOT_RUN', note: 'implemented, unwired' },
    { key: 'semantic retrieval', status: 'NOT_RUN', note: 'implemented, unwired' },
    { key: 'entity-split (PR16)', status: 'NOT_RUN' },
    { key: 'reassessment', status: 'NOT_APPLICABLE' },
    { key: 'targeted reblocking', status: 'NOT_APPLICABLE' },
    { key: 'document extraction', status: 'FABRICATED', note: 'synthetic input only' },
  ];
}

async function main(): Promise<void> {
  const env = detectTerminalEnv();
  const nowIso = DEFAULT_NOW;
  const light = envFlag('INDAGO_BENCH_LIGHT', false);
  const specs = light ? CASE_SPECS.slice(5, 9) : CASE_SPECS;
  const conditions = [...CONDITIONS];
  const total = specs.length * conditions.length;

  renderHeader(env, {
    light,
    nowIso,
    totalPackages: total,
    conditions,
    seedPolicy: 'per-case deterministic \u00b7 sha256(caseKey)',
  });

  const started = Date.now();
  const cases: {
    corpus: ReturnType<typeof generateCaseCorpus>;
    run: Awaited<ReturnType<typeof runPipeline>>;
    chain: Awaited<ReturnType<typeof runHoleChain>>;
    robustness: ReturnType<typeof evaluateHoleRobustness>;
    metrics: ReturnType<typeof computeCaseMetrics>;
  }[] = [];
  const doneByCondition = new Map<string, number>();
  const faultsByCondition = new Map<string, number>();
  const tracesByCondition = new Map<string, HoleTrace[]>();

  let index = 0;
  for (const spec of specs) {
    for (const condition of conditions) {
      index += 1;
      const frame = (stage: string) => ({
        condition,
        done: doneByCondition.get(condition) ?? 0,
        total: specs.length,
        spec: spec.label,
        stage,
        faults: faultsByCondition.get(condition) ?? 0,
        msec: Date.now() - started,
      });

      showPanelFrame(env, frame('corpus \u00b7 seed + ground truth'));
      const corpus = generateCaseCorpus(spec, condition, seedFor(spec.label));

      showPanelFrame(env, frame('pipeline \u00b7 ingest + resolve + project'));
      const run = await runPipeline(corpus, { includeHeldOut: false, nowIso });
      const lastStage = run.timing.length > 0 ? run.timing[run.timing.length - 1]!.stage : 'run';
      showPanelFrame(env, frame(`pipeline \u00b7 ${lastStage}`));

      showPanelFrame(env, frame('hole chain \u00b7 PR1 \u2026 PR18'));
      const chain = await runHoleChain(corpus, run, { nowIso });

      const robustness = evaluateHoleRobustness(corpus, run, chain);
      const entityTruth = deriveEntityResolutionQueues(corpus, run);
      const metrics = computeCaseMetrics(corpus, run, chain, robustness, entityTruth);

      const traces = tracesByCondition.get(condition) ?? [];
      for (const v of robustness.verdicts) {
        const e = chain.entries.find((x) => x.holeId === v.holeId);
        traces.push({
          holeId: v.holeId,
          holeType: v.holeType,
          hit: v.lenientHit,
          firstHitRank: v.firstHitRank,
          seedObs: v.seedObservationCount,
          regionStatus: e?.region?.status ?? null,
          regionError: e?.regionError?.message ?? null,
          regionNodes: e?.region?.nodeCount ?? null,
          rawCandidates: e?.detection?.candidateCount ?? 0,
          detectionError: e?.detectionError?.message ?? null,
          qualified: e?.qualifiedCandidateCount ?? 0,
          qualificationError: e?.qualificationError?.message ?? null,
          reasons: [...new Set(e?.qualificationFailureReasons ?? [])],
        });
      }
      tracesByCondition.set(condition, traces);

      faultsByCondition.set(condition, (faultsByCondition.get(condition) ?? 0) + robustness.hardFailures.length);
      doneByCondition.set(condition, (doneByCondition.get(condition) ?? 0) + 1);
      cases.push({ corpus, run, chain, robustness, metrics });

      if (envFlag('INDAGO_BENCH_DIAG', false)) {
        for (const e of chain.entries) {
          const q = e.qualifiedCandidateCount ?? 0;
          const r = e.detection?.candidateCount ?? 0;
          if (r > 0 && q === 0) {
            process.stdout.write(
              `    [diag] ${e.holeId} ${e.holeType} raw=${r} qualified=0 reasons=${e.qualificationFailureReasons?.join(',') ?? 'n/a'}\n`,
            );
          }
        }
      }

      packageLine(
        env,
        frame('scored \u00b7 robustness + metrics'),
        `holes ${metrics.holes.holesDetected}/${metrics.holes.holesPlanted}` +
          ` \u00b7 err@3 ${metrics.holes.errAtK.toFixed(3)} \u00b7 robustness ${metrics.holes.robustness.toFixed(3)}`,
      );
    }
  }

  parkPanel();

  const report = buildReport({ nowIso, light, cases });
  const benchmarkDir = fileURLToPath(new URL('../../../../benchmark/', import.meta.url));
  await writeBenchmarkArtifacts(benchmarkDir, report);

  renderStageLedger(env, stageLedger(runSignals(cases)));

  for (const condition of conditions) {
    renderConditionTraces(env, condition, tracesByCondition.get(condition) ?? []);
  }

  const mean = (sel: (c: { entityPrecision: number; observationCoverage: number }) => number): number => {
    const vals = report.conditions.map(sel);
    return vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  renderResults(env, {
    conditions: report.conditions.map((c) => ({
      condition: c.condition,
      holesDetected: c.holesDetected,
      holesPlanted: c.totalHoles,
      strictHits: c.holesDetectedStrict,
      errAtK: c.errAtK,
    })),
    entityPrecisionMean: mean((c) => c.entityPrecision),
    observationCoverageMean: mean((c) => c.observationCoverage),
    hardFailuresTotal: report.conditions.reduce((a, c) => a + c.hardFailures, 0),
    packages: cases.length,
  });

  renderCoverage(env, coverageRows());

  renderArtifacts(env, [
    { name: 'index', path: path.join(benchmarkDir, 'README.md') },
    { name: 'metrics', path: path.join(benchmarkDir, 'summary.json') },
    { name: 'trace', path: path.join(benchmarkDir, 'holes.json') },
    { name: 'manifest', path: path.join(benchmarkDir, 'manifest.json') },
  ]);

  const elapsedMs = Date.now() - started;
  renderEpilogue(env, nowIso, cases.length, elapsedMs);
}

main().catch((err: unknown) => {
  process.stderr.write(`[pilot] fatal error: ${String(err)}\n`);
  process.exitCode = 1;
});