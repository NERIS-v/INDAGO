// ============================================================================
// INTERNAL PILOT EVALUATION  ·  PROTOTYPE BENCHMARK
// Terminal (CLI) presentation layer for the benchmark runner.
//
// Sparse, monochrome, cinematic. Only terminal presentation lives here —
// benchmark logic, metrics, scoring, and artifacts are untouched. Every value
// rendered is read from the actual run (config, verdicts, chain telemetry,
// report metrics). No fabricated numbers, no hardcoded completion states.
// ============================================================================

import { execFileSync } from 'node:child_process';
import { stdout } from 'node:process';

import { MIN_SIGNIFICANCE, MIN_STRUCTURAL_SCORE } from '@indago/contracts';

import { NOTICE_LABELS } from './labels.js';
import { envFlag } from './util.js';

// ---------------------------------------------------------------------------
// Rendering environment
// ---------------------------------------------------------------------------

export interface TerminalEnv {
  readonly width: number;
  /** Live cursor redraw (TTY, not CI, no dumb terminal, not forced quiet). */
  readonly interactive: boolean;
}

export function detectTerminalEnv(): TerminalEnv {
  const interactive =
    Boolean(stdout.isTTY) &&
    !envFlag('INDAGO_BENCH_QUIET', false) &&
    process.env.NO_COLOR === undefined &&
    process.env.TERM !== 'dumb';
  const columns = stdout.columns ?? 80;
  const width = Math.max(60, Math.min(100, columns - 1));
  return { width, interactive };
}

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`;
const faint = (s: string): string => `\x1b[2m${s}\x1b[0m`;

/** Thin monospace rule, optionally with a centered label. */
export function rule(env: TerminalEnv, label = ''): string {
  if (label === '') return '\u2500'.repeat(env.width);
  const n = env.width - label.length - 2;
  return `\u2500${'\u2500'.repeat(Math.floor(n / 2))} ${label} ${'\u2500'.repeat(Math.ceil(n / 2))}`;
}

// ---------------------------------------------------------------------------
// Output spool: an animated panel region floating above transparent log lines
// ---------------------------------------------------------------------------

const ANSI = /\x1b\[[0-9;]*m/g;

class Spool {
  private panelLines = 0;
  private below = 0;

  constructor(
    private readonly env: TerminalEnv,
  ) {}

  private clean(text: string): string {
    return this.env.interactive ? text : text.replace(ANSI, '');
  }

  /** Permanent, transparent log output below the panel region. */
  print(lines: readonly string[]): void {
    for (const line of lines) stdout.write(`${this.clean(line)}\n`);
    if (this.env.interactive) this.below += lines.length;
  }

  /** Redraw the animated panel region (no-op in compact/CI mode). */
  showPanel(lines: readonly string[]): void {
    if (!this.env.interactive) return;
    const up = this.panelLines + this.below;
    if (up > 0) stdout.write(`\x1b[${up}A\x1b[J`);
    for (const line of lines) stdout.write(`${line}\n`);
    this.panelLines = lines.length;
    this.below = 0;
  }

  /** Drop the panel region; the log continues below the last permanent line. */
  park(): void {
    if (!this.env.interactive) return;
    const up = this.panelLines + this.below;
    if (up > 0) stdout.write(`\x1b[${up}A\x1b[J`);
    this.panelLines = 0;
    this.below = 0;
  }
}

let spool: Spool | undefined;

/** Builder used by every render function below. */
function out(env: TerminalEnv): Spool {
  if (spool === undefined) spool = new Spool(env);
  return spool;
}

// ---------------------------------------------------------------------------
// Provenance / git identity
// ---------------------------------------------------------------------------

function gitHeadShort(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '\u2014n/a\u2014';
  }
}

export interface RunFrame {
  readonly light: boolean;
  readonly nowIso: string;
  readonly totalPackages: number;
  readonly conditions: readonly string[];
  readonly seedPolicy: string;
}

export function renderHeader(env: TerminalEnv, frame: RunFrame): void {
  out(env).print([
    '',
    rule(env, 'INDAGO'),
    '',
    bold(NOTICE_LABELS.banner),
    bold('PROTOTYPE PIPELINE BENCHMARK'),
    faint(`${NOTICE_LABELS.mode} \u00b7 a sparse, cinematic execution record`),
    '',
    `run             ${frame.light ? 'LIGHT subset' : 'full'}  \u00b7  ${frame.totalPackages} package${frame.totalPackages === 1 ? '' : 's'}`,
    `corpus          ${NOTICE_LABELS.corpus}`,
    `seed            ${frame.seedPolicy}`,
    `now             ${frame.nowIso}`,
    `sha             ${gitHeadShort()}`,
    `conditions      ${frame.conditions.join('  \u00b7  ')}`,
    '',
    faint(NOTICE_LABELS.disclaimer),
    rule(env),
  ]);
}

// ---------------------------------------------------------------------------
// Pipeline execution telemetry
// ---------------------------------------------------------------------------

export type StageStatus = 'EXECUTED' | 'WARNING' | 'NOT_RUN' | 'NOT_APPLICABLE' | 'FABRICATED';

export interface StageRow {
  readonly key: string;
  readonly status: StageStatus;
  readonly note?: string;
}

const STATUS_WORD: Record<StageStatus, string> = {
  EXECUTED: 'EXECUTED',
  WARNING: 'WARNING',
  NOT_RUN: 'NOT RUN',
  NOT_APPLICABLE: 'NOT APPLICABLE',
  FABRICATED: 'FABRICATED',
};

const STATUS_GLYPH: Record<StageStatus, string> = {
  EXECUTED: '\u2713',
  WARNING: '\u26a0',
  NOT_RUN: '\u2014',
  NOT_APPLICABLE: '\u2014',
  FABRICATED: '\u2715',
};

export function renderStageLedger(env: TerminalEnv, rows: readonly StageRow[]): void {
  const keyW = Math.max(11, ...rows.map((r) => r.key.length));
  const o = out(env);
  o.print(['', rule(env, 'PIPELINE EXECUTION \u2014 TELEMETRY'), '']);
  for (const r of rows) {
    const left = `  ${r.key.padEnd(keyW)}  ${STATUS_GLYPH[r.status]} ${STATUS_WORD[r.status].padEnd(13)}`;
    o.print([r.note ? `${left} ${faint(r.note)}` : left.trimEnd()]);
  }
  o.print(['', rule(env)]);
}

// ---------------------------------------------------------------------------
// Live per-condition progress panel + per-package result lines
// ---------------------------------------------------------------------------

export interface PackageFrame {
  readonly condition: string;
  readonly done: number;
  readonly total: number;
  readonly spec: string;
  readonly stage: string;
  readonly faults: number;
  readonly msec: number;
}

export function panelLines(env: TerminalEnv, f: PackageFrame): string[] {
  const sec = (f.msec / 1000).toFixed(1);
  const dim = env.interactive ? faint : (s: string): string => s;
  return [
    `${bold(f.condition)}  ${String(f.done).padStart(String(f.total).length)}/${f.total} \u00b7 ${sec}s`,
    `case            ${f.spec}`,
    `stage           ${f.stage}`,
    f.faults > 0 ? dim(`faults ${f.faults} so far \u2014 see recovery traces`) : dim('no hard failures so far'),
  ];
}

export function showPanelFrame(env: TerminalEnv, f: PackageFrame): void {
  out(env).showPanel(panelLines(env, f));
}

export function packageLine(env: TerminalEnv, f: PackageFrame, tag: string): void {
  const sec = (f.msec / 1000).toFixed(1);
  out(env).print([`${bold(f.condition.padEnd(14))}  ${f.spec.padEnd(22)}  ${faint(tag)}  ${faint(`\u00b7 ${sec}s`)}`]);
}

export function parkPanel(): void {
  if (spool !== undefined) spool.park();
}

// ---------------------------------------------------------------------------
// Failure / recovery causal traces (from real execution artifacts)
// ---------------------------------------------------------------------------

export interface HoleTrace {
  readonly holeId: string;
  readonly holeType: string;
  readonly hit: boolean;
  readonly firstHitRank: number | null;
  readonly seedObs: number;
  readonly regionStatus: string | null;
  readonly regionError: string | null;
  readonly regionNodes: number | null;
  readonly rawCandidates: number;
  readonly detectionError: string | null;
  readonly qualified: number;
  readonly qualificationError: string | null;
  readonly reasons: readonly string[];
}

export function renderConditionTraces(env: TerminalEnv, condition: string, traces: readonly HoleTrace[]): void {
  const o = out(env);
  o.print(['', rule(env, `${condition} \u2014 HOLE RECOVERY`), '']);
  if (traces.length === 0) {
    o.print(['  nothing to trace — no planted holes in this condition', '']);
    return;
  }
  for (const t of traces) {
    if (t.hit) {
      o.print([
        `  ${t.holeId} \u00b7 ${t.holeType.padEnd(14)}  ${bold('\u2713 resolved')}  ${faint(`rank ${t.firstHitRank ?? 'n/a'}`)}`,
      ]);
      continue;
    }
    o.print([`  ${t.holeId} \u00b7 ${t.holeType.padEnd(14)}  ${bold('\u2715 miss')}`]);
    o.print([`      seed obs     ${t.seedObs}`]);
    if (t.regionStatus === null) {
      o.print([`      region       \u2715 NOT BUILT  ${t.regionError ?? 'n/a'}`]);
      continue;
    }
    o.print([
      `      region       \u2713 BUILT  ${t.regionNodes != null ? `${t.regionNodes} nodes` : t.regionStatus}`,
    ]);
    if (t.rawCandidates === 0) {
      o.print([`      candidate    \u2715 NOT DETECTED${t.detectionError ? `  ${t.detectionError}` : ''}`]);
      continue;
    }
    o.print([`      candidate    \u2713 DETECTED  raw ${t.rawCandidates}`]);
    if (t.qualified === 0) {
      const reason = t.reasons.length > 0 ? t.reasons.join(', ') : t.qualificationError ?? 'unknown';
      o.print([`      qualification \u2715 REJECTED  ${reason}`]);
      if (t.reasons.length > 0) {
        o.print([
          `                     ${faint(`gates  structural \u2265 ${MIN_STRUCTURAL_SCORE.toFixed(2)} \u00b7 significance \u2265 ${MIN_SIGNIFICANCE.toFixed(2)}`)}`,
        ]);
      }
    } else {
      o.print([`      qualification \u2713 PASSED  no candidate matches planted endpoints/type`]);
    }
  }
  o.print(['', rule(env)]);
}

// ---------------------------------------------------------------------------
// Final summary + capability coverage + artifacts
// ---------------------------------------------------------------------------

export interface ConditionSummaryRow {
  readonly condition: string;
  readonly holesDetected: number;
  readonly holesPlanted: number;
  readonly strictHits: number;
  readonly errAtK: number;
}

export interface RunSummary {
  readonly conditions: readonly ConditionSummaryRow[];
  readonly entityPrecisionMean: number;
  readonly observationCoverageMean: number;
  readonly hardFailuresTotal: number;
  readonly packages: number;
}

export function renderResults(env: TerminalEnv, s: RunSummary): void {
  const o = out(env);
  o.print([
    '',
    rule(env, `SUMMARY \u2014 ${NOTICE_LABELS.mode}`),
    '',
    '  condition            holes       strict  err@3',
    ...s.conditions.map((c) => {
      const hitPct = c.holesPlanted === 0 ? '\u2013' : `${((c.holesDetected / c.holesPlanted) * 100).toFixed(0)}%`;
      return `    ${c.condition.padEnd(15)}  ${String(c.holesDetected).padStart(2)}/${String(c.holesPlanted).padEnd(5)} ${String(c.strictHits).padEnd(7)} ${c.errAtK.toFixed(3)}  ${faint(hitPct)}`;
    }),
    '',
    `entity precision ${(s.entityPrecisionMean * 100).toFixed(1)}% (mean)    observation coverage ${(s.observationCoverageMean * 100).toFixed(1)}% (mean)`,
    `hard failures ${s.hardFailuresTotal}`,
    '',
    rule(env, 'RESULT STATUS'),
    '',
    bold(NOTICE_LABELS.banner),
    bold(NOTICE_LABELS.corpus),
    bold('NOT PRODUCTION VALIDATION'),
    rule(env),
  ]);
}

export function renderCoverage(env: TerminalEnv, rows: readonly StageRow[]): void {
  const keyW = Math.max(12, ...rows.map((r) => r.key.length));
  const o = out(env);
  o.print(['', rule(env, 'CAPABILITY COVERAGE'), '']);
  for (const r of rows) {
    const left = `  ${r.key.padEnd(keyW)}  ${STATUS_GLYPH[r.status]} ${STATUS_WORD[r.status].padEnd(13)}`;
    o.print([r.note ? `${left} ${faint(r.note)}` : left.trimEnd()]);
  }
  o.print(['', rule(env)]);
}

export function renderArtifacts(env: TerminalEnv, images: readonly { readonly name: string; readonly path: string }[]): void {
  const o = out(env);
  o.print(['', rule(env, 'ARTIFACTS'), '']);
  for (const a of images) o.print([`  ${a.name.padEnd(10)} ${a.path}`]);
  o.print([rule(env)]);
}

export function renderEpilogue(env: TerminalEnv, nowIso: string, packages: number, msec: number): void {
  out(env).print([
    '',
    faint(`completed ${packages} package${packages === 1 ? '' : 's'} in ${msec} ms (diagnostic; excluded from content hashes)`),
    faint(`${NOTICE_LABELS.banner} \u00b7 deterministic reproduction at ${nowIso}`),
    '',
  ]);
}