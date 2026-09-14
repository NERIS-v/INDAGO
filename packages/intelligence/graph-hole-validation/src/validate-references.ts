// ============================================================================
// Reference Existence Validators (Phase 5A-PR8)
//
// Validates categories: reference-existence, observation-references,
// hypothesis-references, grouped-hypothesis-references, entity/node-references.
//
// Every ID referenced in the GraphHoleAnalysisV1 output must exist in the
// supplied bounded context. The flat reference sets are precomputed once and
// shared across all sub-checks for O(1) membership testing.
// ============================================================================

import type { ValidationFinding } from './types.js';
import { VALIDATION_FINDING_CODE } from './types.js';

/** Precomputed reference sets from the context for O(1) lookups. */
export interface ContextReferenceSets {
  readonly observationIds: ReadonlySet<string>;
  readonly hypothesisIds: ReadonlySet<string>;
  readonly groupIds: ReadonlySet<string>;
  readonly structuralSignalIds: ReadonlySet<string>;
}

export function buildContextReferenceSets(context: {
  readonly observations: ReadonlyArray<{ readonly id: string }>;
  readonly atomicHypotheses: ReadonlyArray<{ readonly derivedId: string }>;
  readonly groups: ReadonlyArray<{ readonly groupId: string }>;
  readonly structuralSignals: ReadonlyArray<{ readonly id: string }>;
}): ContextReferenceSets {
  return {
    observationIds: new Set(context.observations.map((o) => o.id)),
    hypothesisIds: new Set(context.atomicHypotheses.map((a) => a.derivedId)),
    groupIds: new Set(context.groups.map((g) => g.groupId)),
    structuralSignalIds: new Set(context.structuralSignals.map((s) => s.id)),
  };
}

function checkObservationRef(
  id: string,
  path: string,
  refSets: ContextReferenceSets,
): ValidationFinding | null {
  if (!refSets.observationIds.has(id)) {
    return {
      code: VALIDATION_FINDING_CODE.INVALID_ANALYSIS_REFERENCE,
      severity: 'ERROR',
      path,
      referenceId: id,
      message: `Observation id "${id}" does not exist in the supplied context`,
    };
  }
  return null;
}

function checkHypothesisRef(
  id: string,
  path: string,
  refSets: ContextReferenceSets,
): ValidationFinding | null {
  if (!refSets.hypothesisIds.has(id)) {
    return {
      code: VALIDATION_FINDING_CODE.INVALID_ANALYSIS_REFERENCE,
      severity: 'ERROR',
      path,
      referenceId: id,
      message: `Hypothesis id "${id}" does not exist in the supplied context`,
    };
  }
  return null;
}

function checkGroupRef(
  id: string,
  path: string,
  refSets: ContextReferenceSets,
): ValidationFinding | null {
  if (!refSets.groupIds.has(id)) {
    return {
      code: VALIDATION_FINDING_CODE.INVALID_ANALYSIS_REFERENCE,
      severity: 'ERROR',
      path,
      referenceId: id,
      message: `Group id "${id}" does not exist in the supplied context`,
    };
  }
  return null;
}

function checkObservationRefs(
  ids: readonly string[],
  basePath: string,
  refSets: ContextReferenceSets,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  for (let i = 0; i < ids.length; i++) {
    const f = checkObservationRef(ids[i]!, `${basePath}[${i}]`, refSets);
    if (f) findings.push(f);
  }
  return findings;
}

function checkHypothesisRefs(
  ids: readonly string[],
  basePath: string,
  refSets: ContextReferenceSets,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  for (let i = 0; i < ids.length; i++) {
    const f = checkHypothesisRef(ids[i]!, `${basePath}[${i}]`, refSets);
    if (f) findings.push(f);
  }
  return findings;
}

/**
 * Validate all references in the analysis output against the context.
 * Covers: top-level observation/hypothesis/group refs,
 * missingRelationship refs, reasoning step refs,
 * alternative explanation refs, recommendedEvidence refs.
 */
export function validateReferences(
  analysis: {
    readonly supportingObservationIds: readonly string[];
    readonly contradictingObservationIds: readonly string[];
    readonly supportingHypothesisIds: readonly string[];
    readonly groupedHypothesisId: string | null;
    readonly missingRelationship: {
      readonly supportingObservationIds: readonly string[];
      readonly contradictingObservationIds: readonly string[];
      readonly supportingHypothesisIds: readonly string[];
      readonly groupedHypothesisId: string | null;
    };
    readonly reasoning: ReadonlyArray<{
      readonly id: string;
      readonly supportingObservationIds: readonly string[];
      readonly contradictingObservationIds: readonly string[];
      readonly referencedHypothesisIds: readonly string[];
    }>;
    readonly alternativeExplanations: ReadonlyArray<{
      readonly title: string;
      readonly supportingObservationIds: readonly string[];
      readonly contradictingObservationIds: readonly string[];
      readonly referencedHypothesisIds: readonly string[];
    }>;
    readonly recommendedEvidence: ReadonlyArray<{
      readonly evidenceType: string;
      readonly supportingObservationIds: readonly string[];
    }>;
  },
  refSets: ContextReferenceSets,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  // Top-level observation and hypothesis references
  findings.push(
    ...checkObservationRefs(
      analysis.supportingObservationIds,
      'analysis.supportingObservationIds',
      refSets,
    ),
  );
  findings.push(
    ...checkObservationRefs(
      analysis.contradictingObservationIds,
      'analysis.contradictingObservationIds',
      refSets,
    ),
  );
  findings.push(
    ...checkHypothesisRefs(
      analysis.supportingHypothesisIds,
      'analysis.supportingHypothesisIds',
      refSets,
    ),
  );
  if (analysis.groupedHypothesisId !== null) {
    const f = checkGroupRef(
      analysis.groupedHypothesisId,
      'analysis.groupedHypothesisId',
      refSets,
    );
    if (f) findings.push(f);
  }

  // Missing relationship references
  const mr = analysis.missingRelationship;
  findings.push(
    ...checkObservationRefs(
      mr.supportingObservationIds,
      'analysis.missingRelationship.supportingObservationIds',
      refSets,
    ),
  );
  findings.push(
    ...checkObservationRefs(
      mr.contradictingObservationIds,
      'analysis.missingRelationship.contradictingObservationIds',
      refSets,
    ),
  );
  findings.push(
    ...checkHypothesisRefs(
      mr.supportingHypothesisIds,
      'analysis.missingRelationship.supportingHypothesisIds',
      refSets,
    ),
  );
  if (mr.groupedHypothesisId !== null) {
    const f = checkGroupRef(
      mr.groupedHypothesisId,
      'analysis.missingRelationship.groupedHypothesisId',
      refSets,
    );
    if (f) findings.push(f);
  }

  // Reasoning step references
  for (let i = 0; i < analysis.reasoning.length; i++) {
    const step = analysis.reasoning[i]!;
    const base = `analysis.reasoning[${i}]`;
    findings.push(
      ...checkObservationRefs(step.supportingObservationIds, `${base}.supportingObservationIds`, refSets),
    );
    findings.push(
      ...checkObservationRefs(step.contradictingObservationIds, `${base}.contradictingObservationIds`, refSets),
    );
    findings.push(
      ...checkHypothesisRefs(step.referencedHypothesisIds, `${base}.referencedHypothesisIds`, refSets),
    );
  }

  // Alternative explanation references
  for (let i = 0; i < analysis.alternativeExplanations.length; i++) {
    const alt = analysis.alternativeExplanations[i]!;
    const base = `analysis.alternativeExplanations[${i}]`;
    findings.push(
      ...checkObservationRefs(alt.supportingObservationIds, `${base}.supportingObservationIds`, refSets),
    );
    findings.push(
      ...checkObservationRefs(alt.contradictingObservationIds, `${base}.contradictingObservationIds`, refSets),
    );
    findings.push(
      ...checkHypothesisRefs(alt.referencedHypothesisIds, `${base}.referencedHypothesisIds`, refSets),
    );
  }

  // Recommended evidence observation references
  for (let i = 0; i < analysis.recommendedEvidence.length; i++) {
    const rec = analysis.recommendedEvidence[i]!;
    const base = `analysis.recommendedEvidence[${i}]`;
    findings.push(
      ...checkObservationRefs(
        rec.supportingObservationIds,
        `${base}.supportingObservationIds`,
        refSets,
      ),
    );
  }

  return findings;
}

/**
 * Validate entity/node references: the candidate's nodeIds must exist
 * in the context's structural signals.
 */
export function validateNodeReferences(
  candidateNodeIds: readonly string[],
  refSets: ContextReferenceSets,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  for (let i = 0; i < candidateNodeIds.length; i++) {
    const nodeId = candidateNodeIds[i]!;
    if (!refSets.structuralSignalIds.has(nodeId)) {
      findings.push({
        code: VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY,
        severity: 'ERROR',
        path: `context.candidate.nodeIds[${i}]`,
        referenceId: nodeId,
        message: `Candidate node id "${nodeId}" does not exist in the supplied structural signals`,
      });
    }
  }
  return findings;
}

/**
 * Validate candidate edge references: the candidate's observedEdgeIds
 * must exist in the context's structural signals.
 */
export function validateEdgeReferences(
  candidateEdgeIds: readonly string[],
  refSets: ContextReferenceSets,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  for (let i = 0; i < candidateEdgeIds.length; i++) {
    const edgeId = candidateEdgeIds[i]!;
    if (!refSets.structuralSignalIds.has(edgeId)) {
      findings.push({
        code: VALIDATION_FINDING_CODE.GRAPH_INCONSISTENCY,
        severity: 'ERROR',
        path: `context.candidate.observedEdgeIds[${i}]`,
        referenceId: edgeId,
        message: `Candidate edge id "${edgeId}" does not exist in the supplied structural signals`,
      });
    }
  }
  return findings;
}
