// ============================================================================
// Graph-Hole Validation Core (Phase 5A-PR8)
//
// The main deterministic validator for GraphHoleAnalysisResult. Composes
// all per-category validators, deduplicates findings, and produces the
// sorted ValidatedGraphHoleAnalysis result.
//
// Design rules:
//   - PURE: no clock, no randomness, no network, no database, no I/O.
//   - DETERMINISTIC: same inputs → byte-equivalent findings array.
//   - NO MUTATION: never rewrites, removes, or substitutes any ID or claim
//     in the analysis output.
//   - CLOSED-WORLD: inputs are exactly (result, context, serializedContext).
// ============================================================================

import type { GraphHoleAnalysisResult } from '@indago/graph-hole-analysis';
import { canonicalStringify } from '@indago/graph-hole-analysis';

import type {
  ValidationFinding,
  ValidatedGraphHoleAnalysis,
  ValidationSummary,
} from './types.js';
import { buildContextReferenceSets } from './validate-references.js';
import {
  validateReferences,
  validateNodeReferences,
  validateEdgeReferences,
} from './validate-references.js';
import {
  validateIdentity,
  validateContextDigest,
  validateContextBinding,
  validateAuthorityVersion,
} from './validate-identity.js';
import { validateTemporalConsistency } from './validate-temporal.js';
import { validateEvidenceClassification } from './validate-evidence-classification.js';
import { validateProvenance } from './validate-provenance.js';
import { validateRelationshipConsistency } from './validate-relationship.js';
import { validateContradictionPreservation } from './validate-contradiction.js';
import { validateStructuralSignalConsistency } from './validate-structural-signal.js';
import { validateEpistemicSafety } from './validate-epistemic-safety.js';
import { validateCompleteness } from './validate-completeness.js';

/** The number of distinct validation categories checked. */
const CHECKED_CATEGORIES = 15;

/**
 * Sort findings deterministically: path → code → referenceId → message.
 */
function sortFindings(findings: ValidationFinding[]): ValidationFinding[] {
  return [...findings].sort((a, b) => {
    const pathCmp = a.path.localeCompare(b.path);
    if (pathCmp !== 0) return pathCmp;
    const codeCmp = a.code.localeCompare(b.code);
    if (codeCmp !== 0) return codeCmp;
    const refA = a.referenceId ?? '';
    const refB = b.referenceId ?? '';
    const refCmp = refA.localeCompare(refB);
    if (refCmp !== 0) return refCmp;
    return a.message.localeCompare(b.message);
  });
}

/**
 * Deduplicate findings by composite key (path + code + referenceId).
 */
function deduplicateFindings(findings: ValidationFinding[]): ValidationFinding[] {
  const seen = new Set<string>();
  const unique: ValidationFinding[] = [];
  for (const f of findings) {
    const key = `${f.path}|${f.code}|${f.referenceId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(f);
  }
  return unique;
}

/**
 * Validate a GraphHoleAnalysisResult against its bounded context.
 *
 * @param result  - The PR7 analysis result (stamped with identity + execution metadata).
 * @param context - The PR7 bounded context (what the model received).
 * @param serializedContext - The canonical serialized context (user message).
 * @returns The deterministic validation result with sorted, deduped findings.
 */
export function validateGraphHoleAnalysis(
  result: GraphHoleAnalysisResult,
  context: {
    readonly caseId: string;
    readonly graphVersionId: string;
    readonly regionId: string;
    readonly analysisPolicyVersion: string;
    readonly candidate: {
      readonly candidateId: string;
      readonly structuralBasis: string;
      readonly regionStatus: string;
      readonly holeType: string;
      readonly expectedRelationshipType: string | null;
      readonly nodeIds: readonly string[];
      readonly observedEdgeIds: readonly string[];
    };
    readonly observations: ReadonlyArray<{ readonly id: string; readonly sourceId: string; readonly validityInterval?: { readonly validFrom: { readonly value: string }; readonly validTo?: { readonly value: string } | undefined } | null; readonly eventTime?: string | undefined }>;
    readonly atomicHypotheses: ReadonlyArray<{ readonly derivedId: string; readonly hypothesisType: string; readonly predicate: string; readonly subject: string; readonly object: string }>;
    readonly groups: ReadonlyArray<{ readonly groupId: string }>;
    readonly structuralSignals: ReadonlyArray<{ readonly id: string; readonly kindLabel: string }>;
    readonly contradictions: ReadonlyArray<{
      readonly id: string;
      readonly observationId: string | null;
      readonly hypothesisId: string | null;
      readonly contradictsObservationId: string | null;
      readonly contradictsHypothesisId: string | null;
    }>;
    readonly provenance: ReadonlyArray<{
      readonly sourceId: string;
      readonly observedFactIds: readonly string[];
    }>;
    readonly completeness: {
      readonly semanticRetrievalTruncated: boolean;
      readonly regionLimited: boolean;
      readonly observationContextLimited: boolean;
      readonly hypothesisContextLimited: boolean;
      readonly hypothesisGroupingTruncated: boolean;
      readonly temporalContextLimited: boolean;
      readonly contextBudgetLimited: boolean;
    };
    readonly candidateTemporalScope: {
      readonly validFrom: { readonly value: string };
      readonly validTo?: { readonly value: string } | undefined;
    } | null;
    readonly temporalContext: {
      readonly validFrom: { readonly value: string };
      readonly validTo?: { readonly value: string } | undefined;
    } | null;
    readonly counts: {
      readonly serializedContextChars: number;
      readonly [key: string]: number;
    };
  },
  serializedContext: string,
): ValidatedGraphHoleAnalysis {
  const analysis = result.analysis;

  // Precompute reference sets for O(1) membership testing.
  const refSets = buildContextReferenceSets(context);

  // Collect all findings from every validator.
  const allFindings: ValidationFinding[] = [];

  // §1-6 Reference existence (observation, hypothesis, group, entity/node refs)
  allFindings.push(...validateReferences(analysis, refSets));

  // §7 Entity/node references (candidate nodeIds → structural signals)
  allFindings.push(
    ...validateNodeReferences(context.candidate.nodeIds, refSets),
  );

  // §7b Candidate edge references
  allFindings.push(
    ...validateEdgeReferences(context.candidate.observedEdgeIds, refSets),
  );

  // §2 Candidate identity
  allFindings.push(...validateIdentity(result, context));

  // §3 Context digest
  allFindings.push(...validateContextDigest(result.contextSha256, serializedContext));

  // §3b Context binding (canonical serialization of context matches serializedContext)
  allFindings.push(
    ...validateContextBinding(context, serializedContext, canonicalStringify),
  );

  // §14 Authority/version consistency
  allFindings.push(...validateAuthorityVersion(result, context));

  // §8 Temporal consistency
  allFindings.push(
    ...validateTemporalConsistency(analysis, {
      candidateTemporalScope: context.candidateTemporalScope,
      temporalContext: context.temporalContext,
      observations: context.observations,
    }),
  );

  // §9 Evidence classification consistency
  allFindings.push(...validateEvidenceClassification(analysis.reasoning));

  // §10 Provenance consistency
  allFindings.push(
    ...validateProvenance(analysis, {
      observations: context.observations,
      provenance: context.provenance,
    }),
  );

  // §11 Relationship consistency
  allFindings.push(
    ...validateRelationshipConsistency(analysis, {
      candidate: { expectedRelationshipType: context.candidate.expectedRelationshipType },
      atomicHypotheses: context.atomicHypotheses,
    }),
  );

  // §12 Contradiction preservation
  allFindings.push(
    ...validateContradictionPreservation(analysis, {
      contradictions: context.contradictions,
    }),
  );

  // §13 Structural-signal consistency
  allFindings.push(
    ...validateStructuralSignalConsistency(
      {
        candidate: context.candidate,
        structuralSignals: context.structuralSignals,
      },
      analysis.reasoning,
    ),
  );

  // §15 Forbidden epistemic claims
  allFindings.push(...validateEpistemicSafety(analysis));

  // §16 Completeness overclaim (informed by context completeness flags)
  allFindings.push(
    ...validateCompleteness(analysis, context.completeness),
  );

  // Deduplicate and sort findings deterministically.
  const findings = sortFindings(deduplicateFindings(allFindings));

  const errorCount = findings.filter((f) => f.severity === 'ERROR').length;
  const warningCount = findings.filter((f) => f.severity === 'WARNING').length;

  const summary: ValidationSummary = {
    errorCount,
    warningCount,
    checkedCategories: CHECKED_CATEGORIES,
  };

  return {
    valid: errorCount === 0,
    findings,
    summary,
  };
}
