// ============================================================================
// INTERNAL PILOT EVALUATION  ·  PROTOTYPE BENCHMARK  ·  SYNTHETIC / DE-IDENTIFIED
// Report assembly: aggregates per-case metrics into condition summaries,
// renders the dashboard + 12-section viability assessment, and writes ALL
// benchmark artifacts under `<repo>/benchmark/` with a content-hash manifest.
//
// Everything here is pure JSON/markdown serialization of deterministic results.
// The dashboard is STATIC (every indicator is regenerated from the seeded
// corpus on every run — no wall clock, no randomness).
// ============================================================================

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import type { CaseCorpus } from './corpus.js';
import { NOTICE_LABELS } from './labels.js';
import type { HoleChainResult } from './holes.js';
import type { CaseMetrics } from './metrics.js';
import type { PipelineResult } from './pipeline.js';
import type { RobustnessResult } from './robustness.js';
import { sha256Hex } from './util.js';

const syntheticLabels: Readonly<Record<string, string>> = { ...NOTICE_LABELS };

function headerBlock(nowIso: string, light: boolean): string {
  return [
    `<!-- ${NOTICE_LABELS.banner} · ${NOTICE_LABELS.corpus} · ${NOTICE_LABELS.mode} -->`,
    `<!-- generated ${nowIso}; light-mode=${String(light)}; deterministic seeded corpus; not a production/field/independent claim -->`,
    '',
  ].join('\n');
}

export type EvaluationCondition = 'CLEAN' | 'NOISY_MISSING' | 'ADVERSARIAL';
export const CONDITIONS: readonly EvaluationCondition[] = ['CLEAN', 'NOISY_MISSING', 'ADVERSARIAL'];

export interface CaseRecord {
  readonly corpus: CaseCorpus;
  readonly run: PipelineResult;
  readonly chain: HoleChainResult;
  readonly robustness: RobustnessResult;
  readonly metrics: CaseMetrics;
}

export interface ConditionSummary {
  readonly condition: EvaluationCondition;
  readonly cases: number;
  readonly totalHoles: number;
  readonly holesDetected: number;
  readonly holesDetectedStrict: number;
  readonly hookHitRate: number;
  readonly strictHitRate: number;
  readonly robustness: number;
  readonly errAtK: number;
  readonly candidatePrecision: number;
  readonly fprProxy: number;
  readonly surfaceRecallAt1: number;
  readonly entityPrecision: number;
  readonly relationPrecision: number;
  readonly relationRecall: number;
  readonly observationCoverage: number;
  readonly classificationCoverage: number;
  readonly holesWithSignalAlignment: number;
  readonly hardFailures: number;
  readonly materializedEntities: number;
  readonly graphNodes: number;
  readonly graphEdges: number;
}

export interface ReportData {
  readonly nowIso: string;
  readonly light: boolean;
  readonly conditions: readonly ConditionSummary[];
  readonly perCase: readonly {
    readonly caseKey: string;
    readonly condition: EvaluationCondition;
    readonly metrics: CaseMetrics;
  }[];
  readonly allTypeDistribution: ReadonlyArray<{ type: string; count: number }>;
  readonly allStatusDistribution: ReadonlyArray<{ status: string; count: number }>;
  readonly allEvidenceTypes: ReadonlyArray<{ type: string; count: number }>;
  readonly allExplanationTypes: ReadonlyArray<{ type: string; count: number }>;
  readonly hardFailures: readonly { caseKey: string; condition: string; holeId: string; stage: string; message: string }[];
  readonly verdicts: readonly {
    readonly caseKey: string;
    readonly condition: string;
    readonly holeId: string;
    readonly holeType: string;
    readonly lenientHit: boolean;
    readonly strictHit: boolean;
    readonly firstHitRank: number | null;
    readonly regionStatus: string | null;
    readonly seedObservationCount: number;
  }[];
  readonly chainHoles: readonly {
    readonly caseKey: string;
    readonly condition: string;
    readonly holeId: string;
    readonly holeType: string;
    readonly expectedType: string | null;
    readonly regionStatus: string | null;
    readonly regionError: string | null;
    readonly detectionError: string | null;
    readonly qualificationError: string | null;
    readonly rawCandidateCount: number;
    readonly qualifiedCount: number;
    readonly qualificationFailureReasons: readonly string[];
    readonly candidates: readonly {
      readonly rank: number;
      readonly detectorType: string;
      readonly nodeIds: readonly string[];
      readonly structuralScore: number;
      readonly significance: number;
      readonly classification: string | null;
      readonly classificationStatus: string | null;
      readonly explanationCount: number;
      readonly generatedRequests: number;
      readonly rankedRequests: number;
    }[];
  }[];
}

export function buildReport(run: {
  readonly nowIso: string;
  readonly light: boolean;
  readonly cases: readonly CaseRecord[];
}): ReportData {
  const conditions = CONDITIONS.map((condition) => {
    const cases = run.cases.filter((c) => c.corpus.condition === condition);
    const totalHoles = cases.reduce((a, c) => a + c.robustness.holesPlanted, 0);
    const holesDetected = cases.reduce((a, c) => a + c.robustness.holesDetected, 0);
    const holesDetectedStrict = cases.reduce((a, c) => a + c.robustness.holesDetectedStrict, 0);
    const hardFailures = cases.reduce((a, c) => a + c.robustness.hardFailures.length, 0);
    const mean = (sel: (m: CaseMetrics) => number): number => {
      const vals = cases.map((c) => sel(c.metrics));
      return vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length;
    };
    const sum = (sel: (m: CaseMetrics) => number): number => cases.reduce((a, c) => a + sel(c.metrics), 0);
    return {
      condition,
      cases: cases.length,
      totalHoles,
      holesDetected,
      holesDetectedStrict,
      hookHitRate: totalHoles === 0 ? 0 : holesDetected / totalHoles,
      strictHitRate: totalHoles === 0 ? 0 : holesDetectedStrict / totalHoles,
      robustness: holesDetected === 0 ? 0 : holesDetectedStrict / holesDetected,
      errAtK: mean((m) => m.holes.errAtK),
      candidatePrecision: mean((m) => m.holes.candidatePrecision),
      fprProxy: mean((m) => m.holes.fprProxy),
      surfaceRecallAt1: mean((m) => m.entity.surfaceRecallAt1),
      entityPrecision: mean((m) => m.entity.entityPrecision),
      relationPrecision: mean((m) => m.relation.precisionAtThreshold),
      relationRecall: mean((m) => m.relation.recallAtThreshold),
      observationCoverage: mean((m) => m.materialization.observationCoverage),
      classificationCoverage: mean((m) => m.classification.classificationCoverage),
      holesWithSignalAlignment: sum((m) => m.evidence.holesWithSignalAlignment),
      hardFailures,
      materializedEntities: sum((m) => m.entity.materializedEntities),
      graphNodes: sum((m) => m.graph.graphNodes),
      graphEdges: sum((m) => m.graph.graphEdges),
    } as ConditionSummary;
  });

  const typeCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  const evidenceCounts = new Map<string, number>();
  const explanationCounts = new Map<string, number>();
  for (const c of run.cases) {
    for (const t of c.metrics.allTypeDistribution) typeCounts.set(t.type, (typeCounts.get(t.type) ?? 0) + t.count);
    for (const s of c.metrics.allStatusDistribution) statusCounts.set(s.status, (statusCounts.get(s.status) ?? 0) + s.count);
    for (const e of c.metrics.evidence.evidenceTypeCoverage) evidenceCounts.set(e.type, (evidenceCounts.get(e.type) ?? 0) + e.count);
    for (const e of c.metrics.explanation.typeCoverage) explanationCounts.set(e.type, (explanationCounts.get(e.type) ?? 0) + e.count);
  }
  const sorted = (m: ReadonlyMap<string, number>): ReadonlyArray<{ type: string; count: number }> =>
    [...m.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => (a.type < b.type ? -1 : 1));
  const sortedStatus = (m: ReadonlyMap<string, number>): ReadonlyArray<{ status: string; count: number }> =>
    [...m.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => (a.status < b.status ? -1 : 1));

  const hardFailures = run.cases.flatMap((c) =>
    c.robustness.hardFailures.map((f) => ({
      caseKey: c.corpus.caseKey,
      condition: c.corpus.condition,
      holeId: f.holeId,
      stage: f.stage,
      message: f.message,
    })),
  );

  const verdicts = run.cases.flatMap((c) =>
    c.robustness.verdicts.map((v) => ({
      caseKey: c.corpus.caseKey,
      condition: c.corpus.condition,
      holeId: v.holeId,
      holeType: v.holeType,
      lenientHit: v.lenientHit,
      strictHit: v.strictHit,
      firstHitRank: v.firstHitRank,
      regionStatus: v.regionStatus,
      seedObservationCount: v.seedObservationCount,
    })),
  );

  return {
    nowIso: run.nowIso,
    light: run.light,
    conditions,
    perCase: run.cases.map((c) => ({ caseKey: c.corpus.caseKey, condition: c.corpus.condition as EvaluationCondition, metrics: c.metrics })),
    allTypeDistribution: sorted(typeCounts),
    allStatusDistribution: sortedStatus(statusCounts),
    allEvidenceTypes: sorted(evidenceCounts),
    allExplanationTypes: sorted(explanationCounts),
    hardFailures,
    verdicts,
    chainHoles: run.cases.flatMap((c) =>
      c.chain.entries.map((e) => ({
        caseKey: c.corpus.caseKey,
        condition: c.corpus.condition,
        holeId: e.holeId,
        holeType: e.holeType,
        expectedType: e.expectedType,
        regionStatus: e.region?.status ?? null,
        regionError: e.regionError?.message ?? null,
        detectionError: e.detectionError?.message ?? null,
        qualificationError: e.qualificationError?.message ?? null,
        rawCandidateCount: e.detection?.candidateCount ?? 0,
        qualifiedCount: e.qualifiedCandidateCount,
        qualificationFailureReasons: [...new Set(e.qualificationFailureReasons ?? [])],
        candidates: e.candidates.map((cand) => ({
          rank: cand.rank,
          detectorType: cand.rawCandidate.detectorType,
          nodeIds: cand.rawCandidate.nodeIds,
          structuralScore: cand.structuralScore,
          significance: cand.significance,
          classification: cand.classification?.type ?? null,
          classificationStatus: cand.classification?.status ?? null,
          explanationCount: cand.explanationSet?.explanationCount ?? 0,
          generatedRequests: cand.evidenceGeneration?.candidateRequestCount ?? 0,
          rankedRequests: cand.selection?.rankedRequestCount ?? 0,
        })),
      })),
    ),
  };
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function mdTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (cells: readonly string[]): string =>
    `| ${cells.map((c, i) => c.padEnd(w[i]!)).join(' | ')} |`;
  const sep = `| ${w.map((n) => '-'.repeat(n)).join(' | ')} |`;
  return [line(headers), sep, ...rows.map(line)].join('\n');
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Artifact writers
// ---------------------------------------------------------------------------

function jsonOf(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function writeBenchmarkArtifacts(rootDir: string, data: ReportData): Promise<void> {
  await fs.mkdir(rootDir, { recursive: true });
  const perCaseDir = path.join(rootDir, 'per-case');
  await fs.mkdir(perCaseDir, { recursive: true });

  const artifacts = new Map<string, string>();
  artifacts.set('README.md', renderReadme(data));
  artifacts.set('summary.json', jsonOf(data));
  artifacts.set('viability.md', renderViability(data));
  artifacts.set('condition-summary.md', renderConditionSummary(data));
  artifacts.set('holes.json', jsonOf({ labels: syntheticLabels, entries: data.chainHoles, verdicts: data.verdicts }));

  for (const c of data.perCase) {
    artifacts.set(path.join('per-case', `${c.caseKey}.${c.condition}.json`), jsonOf(c.metrics));
  }

  const manifest: Record<string, unknown> = {
    labels: syntheticLabels,
    generatedAt: data.nowIso,
    light: data.light,
    sources: {
      corpus: 'packages/platform/tests/benchmark/corpus.ts',
      pipeline: 'packages/platform/tests/benchmark/pipeline.ts',
      holes: 'packages/platform/tests/benchmark/holes.ts',
      robustness: 'packages/platform/tests/benchmark/robustness.ts',
      metrics: 'packages/platform/tests/benchmark/metrics.ts',
      report: 'packages/platform/tests/benchmark/report.ts',
    },
  };
  for (const [name, content] of artifacts) {
    manifest[name] = sha256Hex([content]);
  }
  artifacts.set('manifest.json', jsonOf(manifest));

  for (const [name, content] of artifacts) {
    const file = path.join(rootDir, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf8');
  }
}

// ---------------------------------------------------------------------------
// README index
// ---------------------------------------------------------------------------

function renderReadme(data: ReportData): string {
  return `${headerBlock(data.nowIso, data.light)}

# INDAGO Prototype Pilot Benchmark — Artifact Index

This directory contains output from the **internal prototype pilot evaluation**.
Every artifact is generated deterministically from the same seeded synthetic
corpus; nothing here should be read as production, field, or third-party
validation.

| Artifact | Contents |
| --- | --- |
| \`manifest.json\` | Run metadata + SHA-256 content hashes of every artifact (reproducibility) |
| \`summary.json\` | Full machine-readable summary (all conditions + per-case metrics) |
| \`condition-summary.md\` | Side-by-side CLEAN / NOISY_MISSING / ADVERSARIAL indicator table |
| \`viability.md\` | 12-section internal viability assessment |
| \`per-case/*.json\` | Raw metric families for each case / condition |

## Run scope
- Generated at (analyst-supplied, not wall-clock): \`${data.nowIso}\`
- Light-mode (subset): \`${String(data.light)}\`
- Conditions evaluated: ${data.conditions.map((c) => `${c.condition} (${c.cases} case${c.cases === 1 ? '' : 's'})`).join(', ')}
`;
}

// ---------------------------------------------------------------------------
// Condition summary
// ---------------------------------------------------------------------------

function renderConditionSummary(data: ReportData): string {
  const rows = data.conditions.map((c) => [
    c.condition,
    String(c.cases),
    // prettier-ignore
    `${c.holesDetected}/${c.totalHoles}`,
    pct(c.hookHitRate),
    pct(c.strictHitRate),
    pct(c.errAtK),
    pct(c.robustness),
    pct(c.candidatePrecision),
    pct(c.fprProxy),
    pct(c.surfaceRecallAt1),
    pct(c.relationRecall),
    pct(c.classificationCoverage),
    String(c.hardFailures),
  ]);
  return `${headerBlock(data.nowIso, data.light)}

# Condition Summary — Prototype Pilot Evaluation

Table values are deterministic aggregates over regenerated engine output.
ERR@K uses K = 3 (reciprocal rank of the first hole-hitting candidate, worst-case
0). FPR proxy = qualified candidates / detector pair-evaluations
(documentation-driven true-negative stand-in — NOT a calibrated rate).

${mdTable(
  [
    'Condition',
    'Cases',
    'Holes hit',
    'Hit rate',
    'Strict hit',
    'ERR@3',
    'Robustness',
    'Cand. prec.',
    'FPR proxy',
    'Ent. recall@1',
    'Rel. recall',
    'Class. cover',
    'Hard fails',
  ],
  rows,
)}

## Raw indicator detail

${data.conditions
  .map((c) => `${c.condition}: ${c.holesDetectedStrict}/${c.holesDetected} strict, ENT recall=${pct(c.surfaceRecallAt1)}, REL precision=${pct(c.relationPrecision)}, observation coverage=${pct(c.observationCoverage)}`)
  .join('\n')}
`;
}

function renderViability(data: ReportData): string {
  const knownFailures = data.hardFailures.map((f) => `- \`${f.caseKey}\` (${f.condition}) \`${f.holeId}\` → ${f.stage}: ${f.message}`);

  return `${headerBlock(data.nowIso, data.light)}
<!-- ${NOTICE_LABELS.banner} · ${NOTICE_LABELS.corpus} · ${NOTICE_LABELS.mode} · ${NOTICE_LABELS.nonEndorsement} -->

# INDAGO Prototype — Internal Viability Assessment (12 Sections)

**Status: INTERNAL PROTOTYPE PILOT EVALUATION on a SYNTHETIC / DE-IDENTIFIED
CORPUS. Not a production validation, not an independent audit, not a
calibrated-quantity claim.**

## 1. Executive summary
This pilot runs the real INDAGO deterministic engines (ingestion → entity
resolution → relation resolution → graph → hole detection → gap classification →
competing explanations → evidence-request generation → PR18 selection) on a
seeded, synthetic, de-identified corpus modelling a fraud-network dossier.
The table in \`condition-summary.md\` reports per-condition indicators.

## 2. Evaluation corpus & ground truth
- ${data.perCase.length} case/condition packages; ${data.conditions.reduce((a, c) => a + c.totalHoles, 0)} planted holes total.
- Ground truth planted tables: identities (canonical + aliases + strong ids),
  edges (witnessed/withheld), contradictions, holes (type, endpoints,
  decisive evidence types, held-out records).
- Corpus generator: \`corpus.ts\`, RNG is seeded per (case, condition) —
  byte-reproducible. HELDOUT records are excluded by design (SYS-01).

## 3. Scope & boundaries
Covered: acquisition/materialization, entity resolution, relation resolution,
contradiction handling, graph construction, hole detection, gap classification,
competing explanations, evidence-request generation, PR18 selection.
NOT covered: real acquisition, OCR quality, multi-case interference,
human-in-the-loop review, deployment, security reviews.

## 4. Conditions
- CLEAN (easy): minor alias noise, no deletions/withholding.
- NOISY_MISSING: 40% alias rate, 12% duplicates, 18% deletions, 22% withheld
  edges, temporal shifts.
- ADVERSARIAL: 50% alias rate, 16% duplicates, 22% deletions, shared id collision.

## 5. Metrics methodology
Nine metric families (\`metrics.ts\`): materialization, entity resolution
(alias-level recall@1/precision), relation resolution (pair+type match
precision/recall), contradiction recall (proxy), graph construction, hole
detection & ranking (ERR@K, strict/lenient, candidate precision, FPR proxy),
gap-classification coverage, competing-explanation breadth, evidence-step
retention + signal alignment. Every ratio is a raw quotient; denominators are
reported alongside.

## 6. Results overview
${mdTable(
  ['Condition', 'Hit rate', 'Strict hit', 'ERR@3', 'Robustness'],
  data.conditions.map((c) => [c.condition, pct(c.hookHitRate), pct(c.strictHitRate), pct(c.errAtK), pct(c.robustness)]),
)}

## 7. Hole detection & ranking
- ERR@K (K=3) = mean reciprocal rank of the first candidate hitting each
  planted hole (0 when none). A hole whose endpoints never co-appear is only
  detectable structurally (MISSING_PATH via a shared neighbour), which is an
  acknowledged, realistic limitation of the planted-fixture design.
- Detector type distribution per planted type: see \`holes.json\` verdicts.

## 8. Robustness analysis
Robustness = strictHoles / lenientHoles for each condition. Strict gate requires
every hitting candidate's nodes to be attributable to planted-hole owners
(fragmented + merged entities are tolerated), i.e. the signal survives the
tolerance gates without relying on unexplained noise.

## 9. Failure analysis
Count of typed hard failures recorded by the harness (per-stage, never aborting):

| Condition | Hard failures |
| --- | --- |
${data.conditions.map((c) => `| ${c.condition} | ${c.hardFailures} |`).join('\n')}

${knownFailures.length > 0 ? `## 9b. Recorded hard failures

${knownFailures.join('\n')}
` : ''}
## 9c. GAP corpus detector retarget (honest-fixture decision)
The four GAP corpus cases (GAP-01..04) were originally planted one-per-detector
(MISSING_EDGE / MISSING_PATH / TEMPORAL_GAP / COMMUNITY_BOUNDARY). Measured on
this prototype engine with the frozen 0.70/0.70 qualify gates:

- GAP-01 MISSING_EDGE (J1↔J2): qualifies honestly on CLEAN (structural ~0.74).
- GAP-02 MISSING_PATH (K1…K3) and GAP-04 COMMUNITY_BOUNDARY (M3↔M5) sat at
  structural 0.64–0.68 — a structural ceiling, not a corpus artifact:
  - MISSING_PATH always emits 3-node candidates and requires ABSENT ≤4-hop
    alternate paths, so extra (needed) connectivity suppresses the candidate;
    its connectivity never rises above ~0.5, capping structural below 0.70.
  - COMMUNITY_BOUNDARY uses basis CROSS_COMMUNITY_HYPOTHESIS_CONTEXT
    (0.65 pattern ceiling) and needs the pair DISCONNECTED across real
    communities, again capping connectivity ~0.5.
  Both detectors nonetheless parse their difficulty honestly: they raised
  correlated candidates that the frozen gates correctly rejected.
- Per the pilot maintainer's decision, GAP-02 and GAP-04 were RETARGETED to
  MISSING_EDGE on the SAME repeatedly co-mentioned, never-documented pairs
  (K2↔K3, M3↔M5). The planted gap is unchanged; the pair's own exact detector
  now clears the gates honestly (0.71–0.77), aided by genuine cross-community
  support in the two-clique GAP-04 fixture. GAP-03 TEMPORAL_GAP remains a
  documented honest-0 (single-version corpus has no true temporal gap).
  The MISSING_PATH / COMMUNITY_BOUNDARY ceiling measurement remains recorded
  in \`holes.json\` \`qualificationFailureReasons\` for the GAP rows.

## 10. Limitations & caveats
- Synthetic corpus: real-world acquisition noise is far harsher; results are
  indicative of prototype behaviour only.
- FPR proxy uses detector \`pairEvaluations\` as a true-negative stand-in.
- Entity metrics are alias-level (synthetic-reference-grade), not
  reference-level on real documents.
- Hole hit = node-set membership; a genuine but unplanted structural surprise
  counts as a false positive in candidate precision by design.

## 11. Reproducibility & determinism
- Single command: \`npm run bench:pilot\` (full) or \`INDAGO_BENCH_LIGHT=1 npm run bench:pilot\`.
- Seeded PRNGs; \`nowIso\` fixed at \`${data.nowIso}\`; no wall clock in scores;
  \`manifest.json\` hashes every artifact. Re-running yields byte-identical
  artifacts (timing diagnostics excluded from hashes).

## 12. Recommendations & next steps
- Tier 1: widen planted-hole fidelity (co-mention paths + shared-neighbour
  fixtures) to separate MISSING_EDGE vs MISSING_PATH semantics.
- Tier 2: add real multi-document acquisition fixture with OCR/corrected text.
- Tier 3: calibration study mapping these pilot ratios onto prototype
  thresholds before any production claim.
`;
}