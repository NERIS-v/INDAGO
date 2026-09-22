// ============================================================================
// INTERNAL PILOT EVALUATION  ·  PROTOTYPE BENCHMARK  ·  SYNTHETIC / DE-IDENTIFIED
// Pilot benchmark entrypoint.
//
//   full:   npx tsx tests/benchmark/run-pilot.ts
//   light:  $env:INDAGO_BENCH_LIGHT='1'; npx tsx tests/benchmark/run-pilot.ts
//
// Runs the REAL deterministic engines over the seeded synthetic corpus for
// every (case-spec × condition), writes all artifacts to `<repo>/benchmark/`,
// and prints a console obituary. Deterministic: fixed nowIso, seeded RNG,
// no wall clock in scores (elapsed ms is diagnostic and excluded from hashes).
// ============================================================================

import { fileURLToPath } from 'node:url';

import { CASE_SPECS, CONDITIONS, generateCaseCorpus } from './corpus.js';
import { runHoleChain } from './holes.js';
import { NOTICE_LABELS } from './labels.js';
import { computeCaseMetrics } from './metrics.js';
import { runPipeline } from './pipeline.js';
import { buildReport, writeBenchmarkArtifacts } from './report.js';
import { deriveEntityResolutionQueues, evaluateHoleRobustness } from './robustness.js';
import { envFlag, sha256Hex } from './util.js';

const DEFAULT_NOW = '2026-01-01T00:00:00.000Z';

function seedFor(caseKey: string): number {
  return (parseInt(sha256Hex([caseKey]).slice(0, 6), 16) % 90_000) + 1_000;
}

async function main(): Promise<void> {
  const nowIso = DEFAULT_NOW;
  const light = envFlag('INDAGO_BENCH_LIGHT', false);
  const specs = light ? CASE_SPECS.slice(5, 9) : CASE_SPECS;
  const conditions = [...CONDITIONS];
  const total = specs.length * conditions.length;

  console.log(NOTICE_LABELS.banner);
  console.log(`scope: ${total} package(s) (${light ? 'LIGHT subset' : 'full'}), nowIso fixed at ${nowIso}`);
  console.log('');

  const started = Date.now();
  const cases = [];
  let index = 0;
  for (const spec of specs) {
    for (const condition of conditions) {
      index += 1;
      const seed = seedFor(spec.label);
      const corpus = generateCaseCorpus(spec, condition, seed);
      const run = await runPipeline(corpus, { includeHeldOut: false, nowIso });
      const chain = await runHoleChain(corpus, run, { nowIso });
      const robustness = evaluateHoleRobustness(corpus, run, chain);
      const entityTruth = deriveEntityResolutionQueues(corpus, run);
      const metrics = computeCaseMetrics(corpus, run, chain, robustness, entityTruth);
      cases.push({ corpus, run, chain, robustness, metrics });
      if (envFlag('INDAGO_BENCH_DIAG', false)) {
        for (const e of chain.entries) {
          const q = e.qualifiedCandidateCount ?? 0;
          const r = e.detection?.candidateCount ?? 0;
          if (r > 0 && q === 0) {
            console.log(
              `    [diag] ${e.holeId} ${e.holeType} raw=${r} qualified=0 reasons=${e.qualificationFailureReasons?.join(',') ?? 'n/a'}`,
            );
          }
        }
      }
      console.log(`[pilot ${index}/${total}] ${spec.label} ${condition} — holes ${metrics.holes.holesDetected}/${metrics.holes.holesPlanted}` +
        ` err@3 ${metrics.holes.errAtK.toFixed(3)} robustness ${metrics.holes.robustness.toFixed(3)}`);
      if (envFlag('INDAGO_BENCH_DIAG', false)) {
        for (const entry of chain.entries) {
          const rejected = entry.rejectedCandidateCount ?? 0;
          const raw = entry.detection?.candidateCount ?? 0;
          if (raw > 0 && rejected > 0) {
            console.log(
              `      [diag] ${entry.holeId} ${entry.holeType} raw=${raw} rejected=${rejected}` +
                ` reasons=[${[...(entry.qualificationFailureReasons ?? [])].join(',')}]`,
            );
          }
        }
      }
    }
  }

  const report = buildReport({ nowIso, light, cases });
  const benchmarkDir = fileURLToPath(new URL('../../../../benchmark/', import.meta.url));
  await writeBenchmarkArtifacts(benchmarkDir, report);

  const elapsedMs = Date.now() - started;
  console.log('');
  console.log(`${NOTICE_LABELS.banner} — artifacts written to ${benchmarkDir}`);
  console.log(`completed ${cases.length} packages in ${elapsedMs} ms (diagnostic; excluded from content hashes)`);
  for (const c of report.conditions) {
    console.log(
      `${c.condition.padEnd(14)} hit ${c.holesDetected}/${c.totalHoles}  strict ${c.holesDetectedStrict}` +
        `  err@3 ${c.errAtK.toFixed(3)}  robustness ${c.robustness.toFixed(3)}` +
        `  entRecall@1 ${c.surfaceRecallAt1.toFixed(3)}  relRecall ${c.relationRecall.toFixed(3)}`,
    );
  }
}

main().catch((err: unknown) => {
  console.error('[pilot] fatal error:', err);
  process.exitCode = 1;
});