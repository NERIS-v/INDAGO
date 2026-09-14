// ============================================================================
// Relationship Consistency Validator (Phase 5A-PR8)
//
// Validates category: relationship-consistency.
//
// Deterministic structural checks (no prose parsing, no NLP):
//   1. missingRelationship.expectedRelationshipType vs candidate (existing).
//   2. Assessment-evidence coherence (existing).
//   3. Substitution detection on missingRelationship.supportingHypothesisIds:
//      - ENTITY_HYPOTHESIS used as direct relationship support → WARNING
//      - Predicate differs from expectedRelationshipType → WARNING
//        (chain support legitimately uses the same type; different type
//        suggests substitution without rejecting legitimate patterns)
//   4. Candidate node-set containment is deferred: context carries graph-node
//      UUIDs on candidate.nodeIds but hypothesis subject/object are
//      canonical_entity strings — no entityId→nodeId mapping is available
//      within the bounded context.
// ============================================================================

import type { ValidationFinding } from './types.js';
import { VALIDATION_FINDING_CODE } from './types.js';

const VALID_DIRECTIONS = new Set([
  'UNKNOWN',
  'SOURCE_TO_TARGET',
  'TARGET_TO_SOURCE',
  'BIDIRECTIONAL',
]);

interface ContextAtomicHypothesis {
  readonly derivedId: string;
  readonly hypothesisType: string;
  readonly predicate: string;
  readonly subject: string;
  readonly object: string;
}

export function validateRelationshipConsistency(
  analysis: {
    readonly missingRelationship: {
      readonly expectedRelationshipType: string | null;
      readonly direction: string;
      readonly assessment: string;
      readonly supportingObservationIds: readonly string[];
      readonly contradictingObservationIds: readonly string[];
      readonly supportingHypothesisIds: readonly string[];
    };
    readonly candidateAssessment: string;
  },
  context: {
    readonly candidate: {
      readonly expectedRelationshipType: string | null;
    };
    readonly atomicHypotheses: ReadonlyArray<ContextAtomicHypothesis>;
  },
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const mr = analysis.missingRelationship;

  // Rule 1: expectedRelationshipType match.
  if (mr.expectedRelationshipType !== context.candidate.expectedRelationshipType) {
    findings.push({
      code: VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY,
      severity: 'WARNING',
      path: 'analysis.missingRelationship.expectedRelationshipType',
      referenceId: mr.expectedRelationshipType ?? undefined,
      message:
        `Analysis missingRelationship.expectedRelationshipType "${mr.expectedRelationshipType}" ` +
        `does not match candidate expectedRelationshipType "${context.candidate.expectedRelationshipType}"`,
    });
  }

  // Rule 1b: direction enum defense (backstop against schema drift).
  if (!VALID_DIRECTIONS.has(mr.direction)) {
    findings.push({
      code: VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY,
      severity: 'ERROR',
      path: 'analysis.missingRelationship.direction',
      referenceId: mr.direction,
      message: `Unknown missingRelationship direction "${mr.direction}"`,
    });
  }

  // Rule 2: Assessment-evidence coherence.
  if (
    mr.assessment === 'CONSISTENT_WITH_GAP' &&
    mr.supportingObservationIds.length === 0 &&
    mr.contradictingObservationIds.length > 0
  ) {
    findings.push({
      code: VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY,
      severity: 'WARNING',
      path: 'analysis.missingRelationship.assessment',
      message:
        'Missing relationship assessed as CONSISTENT_WITH_GAP but has ' +
        'contradicting observations and no supporting observations',
    });
  }

  if (
    mr.assessment === 'CONTRADICTS_GAP' &&
    mr.contradictingObservationIds.length === 0 &&
    mr.supportingObservationIds.length > 0
  ) {
    findings.push({
      code: VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY,
      severity: 'WARNING',
      path: 'analysis.missingRelationship.assessment',
      message:
        'Missing relationship assessed as CONTRADICTS_GAP but has ' +
        'supporting observations and no contradicting observations',
    });
  }

  // Rule 3: Substitution detection on supportingHypothesisIds.
  const hypothesisMap = new Map<string, ContextAtomicHypothesis>();
  for (const h of context.atomicHypotheses) {
    hypothesisMap.set(h.derivedId, h);
  }

  for (let i = 0; i < mr.supportingHypothesisIds.length; i++) {
    const hypId = mr.supportingHypothesisIds[i]!;
    const hyp = hypothesisMap.get(hypId);
    if (!hyp) continue; // reference existence is checked elsewhere.

    // 3a: ENTITY_HYPOTHESIS cannot directly support a relationship expectation.
    if (hyp.hypothesisType === 'ENTITY_HYPOTHESIS') {
      findings.push({
        code: VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY,
        severity: 'WARNING',
        path: `analysis.missingRelationship.supportingHypothesisIds[${i}]`,
        referenceId: hypId,
        message:
          `Supporting hypothesis "${hypId}" is an ENTITY_HYPOTHESIS which ` +
          'cannot directly support a relationship expectation',
      });
    }

    // 3b: Predicate differs from expected relationship type.
    if (
      mr.expectedRelationshipType !== null &&
      hyp.predicate !== mr.expectedRelationshipType &&
      hyp.hypothesisType === 'RELATION_HYPOTHESIS'
    ) {
      findings.push({
        code: VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY,
        severity: 'WARNING',
        path: `analysis.missingRelationship.supportingHypothesisIds[${i}]`,
        referenceId: hypId,
        message:
          `Supporting hypothesis "${hypId}" has predicate "${hyp.predicate}" ` +
          `which differs from the expected missing relationship type ` +
          `"${mr.expectedRelationshipType}" (possible substitution)`,
      });
    }
  }

  return findings;
}
