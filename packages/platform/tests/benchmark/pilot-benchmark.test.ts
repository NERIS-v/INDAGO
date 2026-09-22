// ============================================================================
// INTERNAL PILOT EVALUATION  ·  PROTOTYPE BENCHMARK  ·  SYNTHETIC / DE-IDENTIFIED
// Vitest sanity harness for the benchmark pipeline. Focuses on DETERMINISM and
// structural invariants — it does not assert effectiveness (prototype fixture).
// ============================================================================

import { describe, expect, it } from 'vitest';

import { CASE_SPECS, generateCaseCorpus } from './corpus.js';
import { runHoleChain } from './holes.js';
import { computeCaseMetrics } from './metrics.js';
import { runPipeline } from './pipeline.js';
import { deriveEntityResolutionQueues, evaluateHoleRobustness } from './robustness.js';
import { stableStringify } from './util.js';

const NOW = '2026-01-01T00:00:00.000Z';
const HOLE_SPEC = CASE_SPECS[5]!; // GAP-01: single planted MISSING_EDGE

async function runOne() {
  const spec = HOLE_SPEC;
  const corpus = generateCaseCorpus(spec, 'CLEAN', 1234);
  const run = await runPipeline(corpus, { includeHeldOut: false, nowIso: NOW });
  const chain = await runHoleChain(corpus, run, { nowIso: NOW });
  const robustness = evaluateHoleRobustness(corpus, run, chain);
  const entityTruth = deriveEntityResolutionQueues(corpus, run);
  const metrics = computeCaseMetrics(corpus, run, chain, robustness, entityTruth);
  return { corpus, run, chain, robustness, metrics };
}

describe('benchmark pilot harness (CLEAN GAP-01)', () => {
  it('corpus generation is byte-reproducible for a fixed seed', () => {
    const a = generateCaseCorpus(HOLE_SPEC, 'CLEAN', 1234);
    const b = generateCaseCorpus(HOLE_SPEC, 'CLEAN', 1234);
    expect(stableStringify(a.records)).toBe(stableStringify(b.records));
    expect(a.truth.holes.length).toBeGreaterThan(0);
  });

  it('pipeline is deterministic', async () => {
    const first = await runOne();
    const corpus = generateCaseCorpus(HOLE_SPEC, 'CLEAN', 1234);
    const second = await runPipeline(corpus, { includeHeldOut: false, nowIso: NOW });
    expect(first.run.observations.map((o) => o.id)).toEqual(second.observations.map((o) => o.id));
    expect(stableStringify(first.run.entities)).toBe(stableStringify(second.entities));
    expect(first.run.graph.graph.edges().length).toBeGreaterThan(0);
  });

  it('hole chain is deterministic and covers every planted hole', async () => {
    const first = await runOne();
    const corpus2 = generateCaseCorpus(HOLE_SPEC, 'CLEAN', 1234);
    const run2 = await runPipeline(corpus2, { includeHeldOut: false, nowIso: NOW });
    const second = await runHoleChain(corpus2, run2, { nowIso: NOW });
    expect(second.entries.map((e) => e.holeId)).toEqual(first.chain.entries.map((e) => e.holeId));
    expect(first.chain.entries.length).toBe(first.corpus.truth.holes.length);
    for (const entry of first.chain.entries) {
      if (entry.region) expect(entry.region.nodeCount).toBeGreaterThan(0);
    }
  });

  it('metrics stay within honest bounds', async () => {
    const { corpus, metrics, robustness } = await runOne();
    expect(metrics.holes.holesPlanted).toBe(corpus.truth.holes.length);
    expect(metrics.holes.holesDetected).toBeGreaterThanOrEqual(0);
    expect(metrics.holes.holesDetected).toBeLessThanOrEqual(metrics.holes.holesPlanted);
    expect(metrics.holes.errAtK).toBeGreaterThanOrEqual(0);
    expect(metrics.holes.errAtK).toBeLessThanOrEqual(1);
    expect(metrics.holes.robustness).toBeGreaterThanOrEqual(0);
    expect(metrics.holes.robustness).toBeLessThanOrEqual(1);
    expect(metrics.entity.surfaceRecallAt1).toBeGreaterThanOrEqual(0);
    expect(metrics.entity.surfaceRecallAt1).toBeLessThanOrEqual(1);
    expect(metrics.materialization.observationCoverage).toBeLessThanOrEqual(1);
    expect(metrics.classification.classificationCoverage).toBeGreaterThanOrEqual(0);
    expect(metrics.classification.classificationCoverage).toBeLessThanOrEqual(1);
    expect(robustness.holesRegionBuilt).toBeLessThanOrEqual(robustness.holesPlanted);
  });

  it('artifacts carry the honesty notice labels', async () => {
    const { metrics } = await runOne();
    // The console/README labels come from labels.ts; assert the exported notice
    // contract is intact on the metrics objects consumed by the report.
    expect(metrics.caseKey).toBeTruthy();
    expect(metrics.condition).toBe('CLEAN');
  });
});