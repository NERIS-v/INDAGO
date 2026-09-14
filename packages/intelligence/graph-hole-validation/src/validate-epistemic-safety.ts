// ============================================================================
// Epistemic Safety Validator (Phase 5A-PR8)
//
// Validates category: forbidden-epistemic-claims.
//
// The analysis must NOT assert criminality, guilt, intent, concealment,
// or conspiracy. Structured field/enum checks over bounded rules.
//
// Severity: FORBIDDEN_EPISTEMIC_CLAIM is ERROR for unequivocal assertions
// (criminality/guilt/intent/concealment/conspiracy). WARNING is no longer
// used for pattern matches — any match is a hard epistemic violation.
//
// Negation guard: legitimate negated discussion (e.g., "the model must not
// conclude is guilty") does not create an unintended false positive. A
// bounded list of negation-context tokens suppresses matches preceded by
// negation within a 40-character window.
// ============================================================================

import type { ValidationFinding } from './types.js';
import {
  VALIDATION_FINDING_CODE,
  FORBIDDEN_EPISTEMIC_PATTERNS,
  NEGATION_CONTEXT_TOKENS,
} from './types.js';

const NEGATION_WINDOW = 40;

function isNegatedBeforeMatch(lower: string, matchIndex: number): boolean {
  const start = Math.max(0, matchIndex - NEGATION_WINDOW);
  const window = lower.slice(start, matchIndex);
  for (const token of NEGATION_CONTEXT_TOKENS) {
    if (window.includes(token)) return true;
  }
  return false;
}

function checkForbiddenPatterns(
  text: string,
  path: string,
  fieldLabel: string,
): ValidationFinding | null {
  const lower = text.toLowerCase();
  for (const { category, patterns } of FORBIDDEN_EPISTEMIC_PATTERNS) {
    for (const pattern of patterns) {
      const idx = lower.indexOf(pattern.toLowerCase());
      if (idx !== -1 && !isNegatedBeforeMatch(lower, idx)) {
        return {
          code: VALIDATION_FINDING_CODE.FORBIDDEN_EPISTEMIC_CLAIM,
          severity: 'ERROR',
          path,
          message:
            `${fieldLabel} contains forbidden epistemic claim (${category}): ` +
            `matched pattern "${pattern}"`,
        };
      }
    }
  }
  return null;
}

const VALID_ASSESSMENTS = new Set([
  'STRUCTURALLY_PLAUSIBLE',
  'WEAKLY_SUPPORTED',
  'CONTRADICTED',
  'INSUFFICIENT_EVIDENCE',
  'INSUFFICIENT_CONTEXT',
]);

const VALID_MISSING_RELATIONSHIP_ASSESSMENTS = new Set([
  'CONSISTENT_WITH_GAP',
  'AMBIGUOUS',
  'CONTRADICTS_GAP',
  'INSUFFICIENT_EVIDENCE',
]);

const VALID_UNCERTAINTY_RATINGS = new Set([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);

const VALID_WARNING_CODES = new Set([
  'CONTEXT_INCOMPLETE',
  'TEMPORAL_CONFLICT',
  'TEMPORAL_PRECISION_LOW',
  'EVIDENCE_SPARSE',
  'CONTRADICTIONS_PRESENT',
  'NO_STRONG_EVIDENCE',
  'INFERENCE_ONLY',
]);

export function validateEpistemicSafety(analysis: {
  readonly candidateAssessment: string;
  readonly missingRelationship: {
    readonly assessment: string;
  };
  readonly reasoning: ReadonlyArray<{
    readonly id: string;
    readonly statement: string;
  }>;
  readonly uncertainty: {
    readonly rating: string;
    readonly note: string | null;
  };
  readonly alternativeExplanations: ReadonlyArray<{
    readonly title: string;
    readonly description: string;
    readonly uncertainty: number;
  }>;
  readonly warnings: ReadonlyArray<{
    readonly code: string;
  }>;
}): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  if (!VALID_ASSESSMENTS.has(analysis.candidateAssessment)) {
    findings.push({
      code: VALIDATION_FINDING_CODE.FORBIDDEN_EPISTEMIC_CLAIM,
      severity: 'ERROR',
      path: 'analysis.candidateAssessment',
      message: `Invalid candidate assessment "${analysis.candidateAssessment}"`,
    });
  }

  if (!VALID_MISSING_RELATIONSHIP_ASSESSMENTS.has(analysis.missingRelationship.assessment)) {
    findings.push({
      code: VALIDATION_FINDING_CODE.FORBIDDEN_EPISTEMIC_CLAIM,
      severity: 'ERROR',
      path: 'analysis.missingRelationship.assessment',
      message:
        `Invalid missing relationship assessment "${analysis.missingRelationship.assessment}"`,
    });
  }

  // Uncertainty rating enum defense (backstop against schema drift).
  if (!VALID_UNCERTAINTY_RATINGS.has(analysis.uncertainty.rating)) {
    findings.push({
      code: VALIDATION_FINDING_CODE.FORBIDDEN_EPISTEMIC_CLAIM,
      severity: 'ERROR',
      path: 'analysis.uncertainty.rating',
      message: `Invalid uncertainty rating "${analysis.uncertainty.rating}"`,
    });
  }

  // Warning code enum defense (backstop against schema drift).
  for (let i = 0; i < analysis.warnings.length; i++) {
    const w = analysis.warnings[i]!;
    if (!VALID_WARNING_CODES.has(w.code)) {
      findings.push({
        code: VALIDATION_FINDING_CODE.FORBIDDEN_EPISTEMIC_CLAIM,
        severity: 'ERROR',
        path: `analysis.warnings[${i}].code`,
        message: `Invalid warning code "${w.code}"`,
      });
    }
  }

  // Alternative explanation uncertainty range defense (must be 0–1).
  for (let i = 0; i < analysis.alternativeExplanations.length; i++) {
    const alt = analysis.alternativeExplanations[i]!;
    if (typeof alt.uncertainty === 'number' && (alt.uncertainty < 0 || alt.uncertainty > 1)) {
      findings.push({
        code: VALIDATION_FINDING_CODE.FORBIDDEN_EPISTEMIC_CLAIM,
        severity: 'ERROR',
        path: `analysis.alternativeExplanations[${i}].uncertainty`,
        message:
          `Alternative explanation uncertainty ${alt.uncertainty} is outside the valid range [0, 1]`,
      });
    }
  }

  for (let i = 0; i < analysis.reasoning.length; i++) {
    const step = analysis.reasoning[i]!;
    const f = checkForbiddenPatterns(
      step.statement,
      `analysis.reasoning[${i}].statement`,
      `Reasoning step "${step.id}"`,
    );
    if (f) findings.push(f);
  }

  if (analysis.uncertainty.note !== null) {
    const f = checkForbiddenPatterns(
      analysis.uncertainty.note,
      'analysis.uncertainty.note',
      'Uncertainty note',
    );
    if (f) findings.push(f);
  }

  for (let i = 0; i < analysis.alternativeExplanations.length; i++) {
    const alt = analysis.alternativeExplanations[i]!;
    const f = checkForbiddenPatterns(
      alt.description,
      `analysis.alternativeExplanations[${i}].description`,
      `Alternative explanation "${alt.title}"`,
    );
    if (f) findings.push(f);
  }

  return findings;
}
