// ============================================================================
// Graph-Hole Validation Types (Phase 5A-PR8)
//
// Finding codes, severity levels, and the validated result contract. These
// types are frozen: downstream consumers and PR9 (LLM judge) depend on the
// exact shapes.
//
// Design rules:
//   - Deterministic: same input → byte-equivalent output. No clock, no
//     randomness, no network, no database.
//   - Pure validator: never mutates, repairs, or rewrites any ID or claim.
//   - Closed-world: inputs are GraphHoleAnalysisResult + GraphHoleAnalysisContext
//     + serializedContext. Nothing else.
// ============================================================================

// ============================================================================
// §1 Finding Codes
//
// Each code names one deterministic validation category. Codes are stable
// across versions — consumers may switch on them.
// ============================================================================

export const VALIDATION_FINDING_CODE = {
  INVALID_ANALYSIS_REFERENCE: 'INVALID_ANALYSIS_REFERENCE',
  IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
  CONTEXT_DIGEST_MISMATCH: 'CONTEXT_DIGEST_MISMATCH',
  CONTEXT_BINDING_MISMATCH: 'CONTEXT_BINDING_MISMATCH',
  TEMPORAL_CONTRADICTION: 'TEMPORAL_CONTRADICTION',
  GRAPH_INCONSISTENCY: 'GRAPH_INCONSISTENCY',
  EVIDENCE_CLASSIFICATION_MISMATCH: 'EVIDENCE_CLASSIFICATION_MISMATCH',
  PROVENANCE_MISMATCH: 'PROVENANCE_MISMATCH',
  FORBIDDEN_EPISTEMIC_CLAIM: 'FORBIDDEN_EPISTEMIC_CLAIM',
  COMPLETENESS_OVERCLAIM: 'COMPLETENESS_OVERCLAIM',
  CONTRADICTION_IGNORED: 'CONTRADICTION_IGNORED',
} as const;
export type ValidationFindingCode =
  (typeof VALIDATION_FINDING_CODE)[keyof typeof VALIDATION_FINDING_CODE];

// ============================================================================
// §2 Severity
//
// ERROR = must not proceed with this analysis as-is.
// WARNING = retainable but the analysis carries a known limitation.
//
// Frozen severity matrix (deterministic checks only):
//   INVALID_ANALYSIS_REFERENCE       ERROR
//   IDENTITY_MISMATCH                ERROR
//   CONTEXT_DIGEST_MISMATCH          ERROR
//   CONTEXT_BINDING_MISMATCH         ERROR
//   TEMPORAL_CONTRADICTION           ERROR (deterministic scope violation)
//   GRAPH_INCONSISTENCY              ERROR (structural impossibility)
//   EVIDENCE_CLASSIFICATION_MISMATCH WARNING
//   PROVENANCE_MISMATCH              ERROR (context-inconsistent) / WARNING (missing source)
//   FORBIDDEN_EPISTEMIC_CLAIM        ERROR (unequivocal criminality/guilt/intent)
//   COMPLETENESS_OVERCLAIM           ERROR (absolute absence claim over incomplete context)
//   CONTRADICTION_IGNORED            WARNING (relevant contradiction unaddressed)
// ============================================================================

export type ValidationSeverity = 'ERROR' | 'WARNING';

// ============================================================================
// §3 Validation Finding
//
// One deterministic finding. `path` is a dot-notation location within the
// analysis output; `referenceId` is the offending reference when applicable.
// Findings are sorted: path → code → referenceId → message.
// ============================================================================

export interface ValidationFinding {
  readonly code: ValidationFindingCode;
  readonly severity: ValidationSeverity;
  readonly path: string;
  readonly referenceId?: string;
  readonly message: string;
}

// ============================================================================
// §4 Summary
// ============================================================================

export interface ValidationSummary {
  readonly errorCount: number;
  readonly warningCount: number;
  readonly checkedCategories: number;
}

// ============================================================================
// §5 Validated Graph-Hole Analysis
//
// The complete validation result. `valid` is true IFF errorCount === 0.
// Warnings do NOT make the analysis invalid — they indicate known
// limitations that a downstream consumer may accept or reject.
// ============================================================================

export interface ValidatedGraphHoleAnalysis {
  readonly valid: boolean;
  readonly findings: readonly ValidationFinding[];
  readonly summary: ValidationSummary;
}

// ============================================================================
// §6 Forbidden Epistemic Claim Patterns
//
// Structured field/enum checks over bounded rules. NOT a fragile keyword
// blacklist over prose — these are specific claim patterns that must never
// appear in the analysis output's structured fields:
//   - criminality / guilt / intent / concealment / conspiracy
//   - "absence of evidence is evidence of concealment"
//
// Checks operate on: candidateAssessment, reasoning statements,
// missingRelationship assessment rationale, alternative explanations,
// and uncertainty notes.
//
// Negation guard: legitimate negated discussion (e.g., "the model must not
// conclude is guilty") does not create an unintended false positive.
// ============================================================================

/**
 * Forbidden claim categories. Each maps to a set of phrases that signal
 * the forbidden inference when found in unstructured text fields.
 */
export const FORBIDDEN_EPISTEMIC_PATTERNS: readonly {
  readonly category: string;
  readonly patterns: readonly string[];
}[] = [
  {
    category: 'criminality',
    patterns: ['is guilty', 'is criminally', 'committed the crime', 'is a criminal'],
  },
  {
    category: 'intent',
    patterns: ['intended to', 'deliberately ', 'with the intent', 'knowingly '],
  },
  {
    category: 'concealment',
    patterns: [
      'is concealing', 'is hiding evidence', 'is covering up',
      'absence of evidence is evidence', 'proves concealment',
    ],
  },
  {
    category: 'conspiracy',
    patterns: ['is conspiring', 'is part of a conspiracy', 'conspired to'],
  },
  {
    category: 'guilt',
    patterns: ['is responsible for', 'bears responsibility for the crime'],
  },
] as const;

/**
 * Bounded negation-context tokens. If a forbidden pattern match is preceded
 * within 40 characters by one of these tokens, the match is suppressed.
 * This prevents false positives on legitimate negated discussion such as
 * "the model must not conclude is guilty" or "there is no evidence of intent".
 */
export const NEGATION_CONTEXT_TOKENS: readonly string[] = [
  ' not ',
  'never ',
  'no evidence',
  'no indication',
  'does not',
  "doesn't",
  'did not',
  "didn't",
  'cannot ',
  "can't ",
  'is not ',
  'was not ',
  'are not ',
  'were not ',
  'lack of ',
  'absence of ',
] as const;
