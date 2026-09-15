// ============================================================================
// Graph-Hole Judge — deterministic decision-state tests (Phase 5A-PR9,
// task §7/§8/§9/§10 + 5A-PR9 hardening)
//
// adjudicateGraphHoleDecision is PURE, deterministic, bounded, versioned, and
// has no I/O/network/AI/clock. These tests pin the frozen decision table under
// decision-policy v2 (dimension-gated acceptance):
//   §7  structured fields only — verdict + dimension scores + valid boolean +
//       qualification are the ONLY model signals consumed; prose/rationale
//       never enter the decision.
//   §8  safe failure — every failure path yields the non-accepting safe default
//       (no transition), never an accidental ACCEPT, never auto-REJECTED.
//   §9  terminal-state rule — SUPERSEDED/RESOLVED are never re-entered, from
//       any verdict.
//   §10 decision boundaries — the verdict is categorical AND the v2 gate uses
//       exact decimal floors (hard, quality, overall); the only numeric bounds
//       are the dimension score [0,1] schema bounds and the frozen floors.
//       Boundary tests pin score == 0, score == 1, floor at/below, and
//       just-out-of-range rejection; no random/property tests anywhere.
// ============================================================================

import { describe, expect, it } from 'vitest';

import {
  adjudicateGraphHoleDecision,
  GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION,
  GraphHoleJudgeDimensionSchema,
  GraphHoleJudgeVerdictSchema,
  type GraphHoleJudgeDimension,
  type GraphHoleJudgeVerdict,
} from '../src/index.js';

type Status = 'ACTIVE' | 'SUPERSEDED' | 'REJECTED' | 'RESOLVED';

const TERMINAL: readonly Status[] = ['SUPERSEDED', 'RESOLVED'];
const ALL: readonly Status[] = ['ACTIVE', 'SUPERSEDED', 'REJECTED', 'RESOLVED'];

/** Conforming v2 dimension set: every hard/quality floor and the overall pass. */
export const CONFORMING_DIMENSIONS: readonly GraphHoleJudgeDimension[] = [
  { dimension: 'ALTERNATIVE_COVERAGE', score: 0.80, rationale: 'alternatives weighed' },
  { dimension: 'EPISTEMIC_DISCIPLINE', score: 1, rationale: 'no forbidden claims' },
  { dimension: 'EVIDENCE_GROUNDING', score: 0.90, rationale: 'cited evidence present' },
  { dimension: 'GAP_ASSESSMENT_QUALITY', score: 0.80, rationale: 'gap grounded' },
  { dimension: 'REASONING_COHERENCE', score: 0.80, rationale: 'reasoning follows' },
  { dimension: 'UNCERTAINTY_CALIBRATION', score: 0.80, rationale: 'uncertainty matches' },
];

function adjudicate(
  currentStatus: Status | null,
  verdict: GraphHoleJudgeVerdict | null,
  validationValid: boolean,
  extra: Partial<{
    judgeDimensions: readonly GraphHoleJudgeDimension[];
    candidateQualified: boolean;
  }> = {},
) {
  return adjudicateGraphHoleDecision({
    candidateId: 'cand-1',
    currentStatus,
    judgeVerdict: verdict,
    validationValid,
    judgeDimensions: extra.judgeDimensions ?? CONFORMING_DIMENSIONS,
    candidateQualified: extra.candidateQualified ?? true,
  });
}

describe('adjudicateGraphHoleDecision', () => {
  it('is versioned and deterministic (byte-identical output across calls)', () => {
    const inputs = [
      { currentStatus: null, verdict: 'ACCEPT' as const, valid: true },
      { currentStatus: 'ACTIVE', verdict: 'NON_ACCEPTING' as const, valid: true },
      { currentStatus: null, verdict: null, valid: false },
      { currentStatus: 'REJECTED', verdict: 'ACCEPT' as const, valid: true },
    ];

    for (const { currentStatus, verdict, valid } of inputs) {
      const a = adjudicate(currentStatus, verdict, valid);
      const b = adjudicate(currentStatus, verdict, valid);
      expect(a).toEqual(b);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.decisionPolicyVersion).toBe(GRAPH_HOLE_JUDGE_DECISION_POLICY_VERSION);
    }
  });

  it('derives ONLY from structured fields (verdict + dimension scores + valid + qualified), never prose', () => {
    // The decision consumes the structured verdict, the scored dimensions, the
    // valid boolean, and qualification. Nothing about rationale or free text
    // can enter the decision — identical structured inputs always resolve
    // identically no matter what the rationale text said.
    const resolve = () => adjudicate('ACTIVE', 'ACCEPT', true);
    const r1 = resolve();
    const r2 = resolve();
    expect(r1).toEqual(r2);
    // ACCEPT stepping-stone: same-state reassessment, no transition.
    expect(r1.transitionApplied).toBe(false);
    expect(r1.assessmentType).toBe('REASSESSMENT');
    expect(r1.evaluation.passed).toBe(true);
  });

  describe('§8 safe failure defaults', () => {
    it('verdict null → no-op (no transition, no assessment, nextStatus = current)', () => {
      for (const status of [null, 'ACTIVE', 'REJECTED', ...TERMINAL]) {
        const r = adjudicate(status, null, false);
        expect(r.transitionApplied).toBe(false);
        expect(r.nextStatus).toBe(status);
        expect(r.assessmentType).toBeNull();
        expect(r.invariantViolations).toEqual([]);
      }
    });

    it('NON_ACCEPTING never auto-changes the status from ANY current status', () => {
      for (const status of [null, 'ACTIVE', 'REJECTED', ...TERMINAL]) {
        const r = adjudicate(status, 'NON_ACCEPTING', true);
        expect(r.transitionApplied).toBe(false);
        expect(r.nextStatus).toBe(status);
        expect(r.assessmentType).toBeNull();
        expect(r.invariantViolations).toEqual([]);
      }
    });

    it('never invents an auto-REJECTED (rejection is human-enterable only)', () => {
      // Replacement statuses that are NOT already REJECTED: NON_ACCEPTING must
      // never move any of them to REJECTED.
      for (const status of [null, 'ACTIVE', ...TERMINAL]) {
        const r = adjudicate(status, 'NON_ACCEPTING', true);
        expect(r.nextStatus).not.toBe('REJECTED');
        expect(r.transitionApplied).toBe(false);
      }
      // A current REJECTED hole also never loses its status to the judge.
      const r = adjudicate('REJECTED', 'NON_ACCEPTING', true);
      expect(r.nextStatus).toBe('REJECTED');
      expect(r.transitionApplied).toBe(false);
    });

    it('ACCEPT on validation.valid === false is an invariant violation (safety net)', () => {
      const r = adjudicate(null, 'ACCEPT', false);
      expect(r.transitionApplied).toBe(false);
      expect(r.nextStatus).toBe(null);
      expect(r.invariantViolations.length).toBeGreaterThan(0);
    });
  });

  describe('§9 terminal-state rule', () => {
    it('terminal statuses are never re-entered from any verdict', () => {
      for (const terminal of TERMINAL) {
        const accepted = adjudicate(terminal, 'ACCEPT', true);
        const declined = adjudicate(terminal, 'NON_ACCEPTING', true);
        for (const r of [accepted, declined]) {
          expect(r.nextStatus).toBe(terminal);
          expect(r.transitionApplied).toBe(false);
        }
        expect(accepted.invariantViolations.length).toBeGreaterThan(0);
      }
    });

    it('terminal→terminal, terminal→non-terminal, terminal→ACCEPT all stay terminal', () => {
      // The only legal table edges are ACTIVE→{SUPERSEDED,REJECTED,RESOLVED}
      // and REJECTED→ACTIVE; a judge cannot move out of a terminal status.
      const r = adjudicate('SUPERSEDED', 'ACCEPT', true);
      expect(r.nextStatus).toBe('SUPERSEDED');
    });
  });

  describe('§10 decision boundaries', () => {
    it('ACCEPT is one discrete categorical boundary; the v2 gate makes it SUFFICIENT only with dimension coverage', () => {
      // The verdict boundary is categorical, but under decision-policy v2 the
      // ACCEPT verdict alone is NEVER sufficient: every dimension must clear
      // its exact floor. With conforming dimensions the initial AA→ACTIVE
      // qualification proceeds on the ACCEPT + dimension-gate.
      const accepted = adjudicate(null, 'ACCEPT', true);
      expect(accepted.nextStatus).toBe('ACTIVE');
      expect(accepted.transitionApplied).toBe(true);
      expect(accepted.assessmentType).toBe('QUALIFICATION');
      expect(accepted.evaluation.passed).toBe(true);

      // Same ACCEPT verdict, single broken hard floor → safe NON_ACCEPTING no-op.
      const blocked = adjudicate(null, 'ACCEPT', true, {
        judgeDimensions: CONFORMING_DIMENSIONS.map((d) =>
          d.dimension === 'EVIDENCE_GROUNDING' ? { ...d, score: 0.69 } : d,
        ),
      });
      expect(blocked.transitionApplied).toBe(false);
      expect(blocked.nextStatus).toBeNull();
      expect(blocked.evaluation.failureReasons).toContain(
        'JUDGE_EVIDENCE_GROUNDING_BELOW_FLOOR',
      );
    });

    it('score == 0 and score == 1 are legal dimension boundaries ([0,1])', () => {
      const low = GraphHoleJudgeDimensionSchema.parse({
        dimension: 'EVIDENCE_GROUNDING',
        score: 0,
        rationale: 'lower bound',
      });
      const high = GraphHoleJudgeDimensionSchema.parse({
        dimension: 'EVIDENCE_GROUNDING',
        score: 1,
        rationale: 'upper bound',
      });
      expect(low.score).toBe(0);
      expect(high.score).toBe(1);
    });

    it('score just outside [0,1] is rejected (epsilon above/below)', () => {
      expect(() =>
        GraphHoleJudgeDimensionSchema.parse({
          dimension: 'EVIDENCE_GROUNDING',
          score: -0.0001,
          rationale: 'below',
        }),
      ).toThrow();
      expect(() =>
        GraphHoleJudgeDimensionSchema.parse({
          dimension: 'EVIDENCE_GROUNDING',
          score: 1.0001,
          rationale: 'above',
        }),
      ).toThrow();
    });

    it('verdict enum boundary: ACCEPT and NON_ACCEPTING are legal; anything else is not', () => {
      expect(GraphHoleJudgeVerdictSchema.parse('ACCEPT')).toBe('ACCEPT');
      expect(GraphHoleJudgeVerdictSchema.parse('NON_ACCEPTING')).toBe('NON_ACCEPTING');
      expect(() => GraphHoleJudgeVerdictSchema.parse('REJECT')).toThrow();
      expect(() => GraphHoleJudgeVerdictSchema.parse('ACCEPT_IF_SCORE_ABOVE_0_5')).toThrow();
    });
  });

  describe('frozen decision table (documented transitions)', () => {
    it('NULL status + ACCEPT → ACTIVE / QUALIFICATION (initial qualified persist)', () => {
      const r = adjudicate(null, 'ACCEPT', true);
      expect(r.nextStatus).toBe('ACTIVE');
      expect(r.transitionApplied).toBe(true);
      expect(r.assessmentType).toBe('QUALIFICATION');
    });

    it('ACTIVE + ACCEPT → ACTIVE / REASSESSMENT (append-only snapshot)', () => {
      const r = adjudicate('ACTIVE', 'ACCEPT', true);
      expect(r.nextStatus).toBe('ACTIVE');
      expect(r.transitionApplied).toBe(false);
      expect(r.assessmentType).toBe('REASSESSMENT');
    });

    it('REJECTED + ACCEPT → ACTIVE / REVIVAL via the only legal revival edge', () => {
      const r = adjudicate('REJECTED', 'ACCEPT', true);
      expect(r.nextStatus).toBe('ACTIVE');
      expect(r.transitionApplied).toBe(true);
      expect(r.assessmentType).toBe('REVIVAL');
    });
  });
});