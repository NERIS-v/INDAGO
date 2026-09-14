// ============================================================================
// Completeness Overclaim Validator (Phase 5A-PR8)
//
// Validates category: completeness-overclaim.
//
// When the supplied context is incomplete, the analysis must not make
// absolute negative claims without qualifying the limitation.
//
// Severity: COMPLETENESS_OVERCLAIM is ERROR for absolute absence claims
// made over an incomplete context — an exhaustive "no evidence exists"
// assertion when the context is known-truncated is a hard epistemic
// contradiction with the observed incompleteness.
//
// Exception: when the assessment is INSUFFICIENT_CONTEXT, the analysis
// has already acknowledged the limitation and absolute claims are not
// flagged.
// ============================================================================

import type { ValidationFinding } from './types.js';
import { VALIDATION_FINDING_CODE } from './types.js';

interface ContextCompleteness {
  readonly semanticRetrievalTruncated: boolean;
  readonly regionLimited: boolean;
  readonly observationContextLimited: boolean;
  readonly hypothesisContextLimited: boolean;
  readonly hypothesisGroupingTruncated: boolean;
  readonly temporalContextLimited: boolean;
  readonly contextBudgetLimited: boolean;
}

const ABSOLUTE_NEGATIVE_CLAIMS: readonly string[] = [
  'no evidence exists',
  'no evidence was found',
  'there is no evidence',
  'no observations support',
  'no supporting evidence',
  'no support exists',
  'no information exists',
  'absolutely no evidence',
  'completely insufficient',
  'entirely absent',
  'no proof exists',
];

function isContextIncomplete(completeness: ContextCompleteness): boolean {
  return (
    completeness.semanticRetrievalTruncated ||
    completeness.regionLimited ||
    completeness.observationContextLimited ||
    completeness.hypothesisContextLimited ||
    completeness.hypothesisGroupingTruncated ||
    completeness.temporalContextLimited ||
    completeness.contextBudgetLimited
  );
}

function checkAbsoluteNegativeClaim(
  text: string,
  path: string,
  fieldLabel: string,
): ValidationFinding | null {
  const lower = text.toLowerCase();
  for (const pattern of ABSOLUTE_NEGATIVE_CLAIMS) {
    if (lower.includes(pattern)) {
      return {
        code: VALIDATION_FINDING_CODE.COMPLETENESS_OVERCLAIM,
        severity: 'ERROR',
        path,
        message:
          `${fieldLabel} makes absolute negative claim "${pattern}" but the ` +
          'supplied context may be incomplete',
      };
    }
  }
  return null;
}

export function validateCompleteness(
  analysis: {
    readonly reasoning: ReadonlyArray<{
      readonly id: string;
      readonly statement: string;
    }>;
    readonly uncertainty: {
      readonly note: string | null;
    };
    readonly candidateAssessment: string;
  },
  completeness: ContextCompleteness,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  if (!isContextIncomplete(completeness)) return findings;

  if (analysis.candidateAssessment === 'INSUFFICIENT_CONTEXT') return findings;

  for (let i = 0; i < analysis.reasoning.length; i++) {
    const step = analysis.reasoning[i]!;
    const f = checkAbsoluteNegativeClaim(
      step.statement,
      `analysis.reasoning[${i}].statement`,
      `Reasoning step "${step.id}"`,
    );
    if (f) findings.push(f);
  }

  if (analysis.uncertainty.note !== null) {
    const f = checkAbsoluteNegativeClaim(
      analysis.uncertainty.note,
      'analysis.uncertainty.note',
      'Uncertainty note',
    );
    if (f) findings.push(f);
  }

  return findings;
}
