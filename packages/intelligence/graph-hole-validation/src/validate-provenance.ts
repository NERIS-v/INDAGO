// ============================================================================
// Provenance Consistency Validator (Phase 5A-PR8)
//
// Validates category: provenance-consistency.
//
// Provenance records in the context link sourceId to observedFactIds.
// The validator verifies internal consistency of the context's provenance
// and that the analysis's observation references are traceable through
// to the provenance records.
//
// Gap #8: Per-reference paths for missing-source warnings (not a single
// blanket path). Each cited observation gets its own precise path.
// ============================================================================

import type { ValidationFinding } from './types.js';
import { VALIDATION_FINDING_CODE } from './types.js';

export interface ContextProvenanceRecord {
  readonly sourceId: string;
  readonly observedFactIds: readonly string[];
}

/**
 * Collect all (path, obsId) pairs from all analysis reference lists.
 */
function collectAllObservationPaths(analysis: {
  readonly supportingObservationIds: readonly string[];
  readonly contradictingObservationIds: readonly string[];
  readonly missingRelationship: {
    readonly supportingObservationIds: readonly string[];
    readonly contradictingObservationIds: readonly string[];
  };
  readonly reasoning: ReadonlyArray<{
    readonly supportingObservationIds: readonly string[];
    readonly contradictingObservationIds: readonly string[];
  }>;
  readonly alternativeExplanations: ReadonlyArray<{
    readonly supportingObservationIds: readonly string[];
    readonly contradictingObservationIds: readonly string[];
  }>;
  readonly recommendedEvidence: ReadonlyArray<{
    readonly supportingObservationIds: readonly string[];
  }>;
}): ReadonlyArray<{ readonly path: string; readonly obsId: string }> {
  const pairs: { path: string; obsId: string }[] = [];

  for (let i = 0; i < analysis.supportingObservationIds.length; i++) {
    pairs.push({
      path: `analysis.supportingObservationIds[${i}]`,
      obsId: analysis.supportingObservationIds[i]!,
    });
  }
  for (let i = 0; i < analysis.contradictingObservationIds.length; i++) {
    pairs.push({
      path: `analysis.contradictingObservationIds[${i}]`,
      obsId: analysis.contradictingObservationIds[i]!,
    });
  }

  const mr = analysis.missingRelationship;
  for (let i = 0; i < mr.supportingObservationIds.length; i++) {
    pairs.push({
      path: `analysis.missingRelationship.supportingObservationIds[${i}]`,
      obsId: mr.supportingObservationIds[i]!,
    });
  }
  for (let i = 0; i < mr.contradictingObservationIds.length; i++) {
    pairs.push({
      path: `analysis.missingRelationship.contradictingObservationIds[${i}]`,
      obsId: mr.contradictingObservationIds[i]!,
    });
  }

  for (let i = 0; i < analysis.reasoning.length; i++) {
    const step = analysis.reasoning[i]!;
    for (let j = 0; j < step.supportingObservationIds.length; j++) {
      pairs.push({
        path: `analysis.reasoning[${i}].supportingObservationIds[${j}]`,
        obsId: step.supportingObservationIds[j]!,
      });
    }
    for (let j = 0; j < step.contradictingObservationIds.length; j++) {
      pairs.push({
        path: `analysis.reasoning[${i}].contradictingObservationIds[${j}]`,
        obsId: step.contradictingObservationIds[j]!,
      });
    }
  }

  for (let i = 0; i < analysis.alternativeExplanations.length; i++) {
    const alt = analysis.alternativeExplanations[i]!;
    for (let j = 0; j < alt.supportingObservationIds.length; j++) {
      pairs.push({
        path: `analysis.alternativeExplanations[${i}].supportingObservationIds[${j}]`,
        obsId: alt.supportingObservationIds[j]!,
      });
    }
    for (let j = 0; j < alt.contradictingObservationIds.length; j++) {
      pairs.push({
        path: `analysis.alternativeExplanations[${i}].contradictingObservationIds[${j}]`,
        obsId: alt.contradictingObservationIds[j]!,
      });
    }
  }

  for (let i = 0; i < analysis.recommendedEvidence.length; i++) {
    const rec = analysis.recommendedEvidence[i]!;
    for (let j = 0; j < rec.supportingObservationIds.length; j++) {
      pairs.push({
        path: `analysis.recommendedEvidence[${i}].supportingObservationIds[${j}]`,
        obsId: rec.supportingObservationIds[j]!,
      });
    }
  }

  return pairs;
}

export function validateProvenance(
  analysis: {
    readonly supportingObservationIds: readonly string[];
    readonly contradictingObservationIds: readonly string[];
    readonly missingRelationship: {
      readonly supportingObservationIds: readonly string[];
      readonly contradictingObservationIds: readonly string[];
    };
    readonly reasoning: ReadonlyArray<{
      readonly supportingObservationIds: readonly string[];
      readonly contradictingObservationIds: readonly string[];
    }>;
    readonly alternativeExplanations: ReadonlyArray<{
      readonly supportingObservationIds: readonly string[];
      readonly contradictingObservationIds: readonly string[];
    }>;
    readonly recommendedEvidence: ReadonlyArray<{
      readonly supportingObservationIds: readonly string[];
    }>;
  },
  context: {
    readonly observations: ReadonlyArray<{ readonly id: string; readonly sourceId: string }>;
    readonly provenance: readonly ContextProvenanceRecord[];
  },
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  const obsSourceMap = new Map<string, string>();
  for (const obs of context.observations) {
    obsSourceMap.set(obs.id, obs.sourceId);
  }

  const provenanceSourceIds = new Set(context.provenance.map((p) => p.sourceId));

  // Context-internal: provenance observedFactId must exist in observations.
  for (let i = 0; i < context.provenance.length; i++) {
    const p = context.provenance[i]!;
    for (let j = 0; j < p.observedFactIds.length; j++) {
      const fid = p.observedFactIds[j]!;
      if (!obsSourceMap.has(fid)) {
        findings.push({
          code: VALIDATION_FINDING_CODE.PROVENANCE_MISMATCH,
          severity: 'ERROR',
          path: `context.provenance[${i}].observedFactIds[${j}]`,
          referenceId: fid,
          message:
            `Provenance observedFactId "${fid}" does not exist in context observations`,
        });
      }
    }
  }

  // Per-reference: analysis-cited observation whose source lacks provenance.
  const allPaths = collectAllObservationPaths(analysis);
  const seenMissingSource = new Set<string>();

  for (const { path, obsId } of allPaths) {
    const sourceId = obsSourceMap.get(obsId);
    if (sourceId !== undefined && !provenanceSourceIds.has(sourceId)) {
      const key = `${obsId}|${sourceId}`;
      if (!seenMissingSource.has(key)) {
        seenMissingSource.add(key);
        findings.push({
          code: VALIDATION_FINDING_CODE.PROVENANCE_MISMATCH,
          severity: 'WARNING',
          path,
          referenceId: obsId,
          message:
            `Analysis references observation "${obsId}" whose source "${sourceId}" ` +
            'does not appear in the context provenance records',
        });
      }
    }
  }

  return findings;
}
