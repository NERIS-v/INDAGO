// ============================================================================
// Temporal Consistency Validator (Phase 5A-PR8)
//
// Validates category: temporal-consistency.
//
// Deterministic temporal rules (no prose parsing, no NLP):
//   1. If candidateTemporalScope and temporalContext are both non-null and
//      disjoint, the analysis must emit a TEMPORAL_CONFLICT warning.
//   2. Every analysis-cited observation with a determinate interval strictly
//      disjoint from candidateTemporalScope is flagged as scope-exceeded.
//   3. Every analysis-cited observation with a determinate interval strictly
//      disjoint from temporalContext is flagged as window-exceeded.
//
// Deferred limitations (require NLP, not in scope):
//   - "non-overlap incorrectly represented as overlap" requires prose parsing
//   - "explicit event ordering contradiction" requires structured ordering
//   - "later evidence used as earlier evidence" requires temporal interpretation
//
// Severity: TEMPORAL_CONTRADICTION ERROR for deterministic scope violations;
// WARNING when analysis acknowledges the conflict (TEMPORAL_CONFLICT warning).
// ============================================================================

import type { ValidationFinding } from './types.js';
import { VALIDATION_FINDING_CODE } from './types.js';

interface TemporalInterval {
  readonly validFrom: { readonly value: string };
  readonly validTo?: { readonly value: string } | undefined;
}

/** Precedence of an interval boundary (later = later in time). */
function instantValue(iso: string): number {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return -Infinity;
  return at;
}

function intervalsOverlap(a: TemporalInterval | null, b: TemporalInterval | null): boolean {
  if (a === null || b === null) return false;
  const aStart = instantValue(a.validFrom.value);
  const aEnd = a.validTo ? instantValue(a.validTo.value) : Infinity;
  const bStart = instantValue(b.validFrom.value);
  const bEnd = b.validTo ? instantValue(b.validTo.value) : Infinity;
  return aStart <= bEnd && bStart <= aEnd;
}

function intervalDisjointFromWindow(
  obsInterval: TemporalInterval,
  window: TemporalInterval,
): boolean {
  return !intervalsOverlap(obsInterval, window);
}

/**
 * Collect all (path, obsId) pairs from all analysis reference lists.
 */
function collectObservationPaths(analysis: {
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

  return pairs;
}

/**
 * Validate temporal consistency of the analysis output.
 */
export function validateTemporalConsistency(
  analysis: {
    readonly warnings: ReadonlyArray<{ readonly code: string }>;
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
  },
  context: {
    readonly candidateTemporalScope: TemporalInterval | null;
    readonly temporalContext: TemporalInterval | null;
    readonly observations: ReadonlyArray<{
      readonly id: string;
      readonly validityInterval?: TemporalInterval | null;
      readonly eventTime?: string | undefined;
    }>;
  },
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  // Rule 1: candidateTemporalScope vs temporalContext disjoint without warning.
  if (
    context.candidateTemporalScope !== null &&
    context.temporalContext !== null &&
    !intervalsOverlap(context.temporalContext, context.candidateTemporalScope)
  ) {
    const hasTemporalWarning = analysis.warnings.some(
      (w) => w.code === 'TEMPORAL_CONFLICT',
    );
    if (!hasTemporalWarning) {
      findings.push({
        code: VALIDATION_FINDING_CODE.TEMPORAL_CONTRADICTION,
        severity: 'WARNING',
        path: 'analysis.warnings',
        message:
          'Candidate temporal scope does not overlap region temporal context ' +
          'but no TEMPORAL_CONFLICT warning was emitted',
      });
    }
  }

  // Build observation lookup for interval data.
  const obsById = new Map<string, {
    readonly validityInterval?: TemporalInterval | null;
    readonly eventTime?: string | undefined;
  }>();
  for (const obs of context.observations) {
    obsById.set(obs.id, obs);
  }

  // Rules 2-3: scope containment for cited observations.
  const citedObs = collectObservationPaths(analysis);
  const seenScopeKeys = new Set<string>();

  for (const { path, obsId } of citedObs) {
    const obs = obsById.get(obsId);
    if (!obs) continue;

    // Determine the observation's effective interval.
    const obsInterval: TemporalInterval | null =
      obs.validityInterval ?? null;

    // Rule 2: observation entirely outside candidate temporal scope.
    if (
      context.candidateTemporalScope !== null &&
      obsInterval !== null &&
      intervalDisjointFromWindow(obsInterval, context.candidateTemporalScope)
    ) {
      const key = `scope|${obsId}`;
      if (!seenScopeKeys.has(key)) {
        seenScopeKeys.add(key);
        findings.push({
          code: VALIDATION_FINDING_CODE.TEMPORAL_CONTRADICTION,
          severity: 'ERROR',
          path,
          referenceId: obsId,
          message:
            `Analysis references observation "${obsId}" whose temporal interval ` +
            `is strictly outside the candidate temporal scope`,
        });
      }
    }

    // Rule 3: observation entirely outside region temporal context.
    if (
      context.temporalContext !== null &&
      obsInterval !== null &&
      intervalDisjointFromWindow(obsInterval, context.temporalContext)
    ) {
      const key = `window|${obsId}`;
      if (!seenScopeKeys.has(key)) {
        seenScopeKeys.add(key);
        findings.push({
          code: VALIDATION_FINDING_CODE.TEMPORAL_CONTRADICTION,
          severity: 'ERROR',
          path,
          referenceId: obsId,
          message:
            `Analysis references observation "${obsId}" whose temporal interval ` +
            `is strictly outside the region temporal context window`,
        });
      }
    }
  }

  return findings;
}
