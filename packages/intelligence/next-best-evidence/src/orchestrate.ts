// ============================================================================
// Next-Best-Evidence Runtime — Orchestration (Phase 5A-PR10)
//
// The ONLY top-level entry point. Bounds the run to
// maxGapsPerSelectionRun (surfacing truncation, never silent), asserts the
// deterministic gate per gap, runs the pure per-gap selection core, and
// assembles the frozen NextBestEvidenceSelectionResult snapshot.
//
// PERSISTENCE-FREE and ACQUISITION-FREE by contract: this function never
// creates EvidenceRequest entities, never authorizes/acquir es evidence, and
// never mutates canonical state. It returns a ranked selection snapshot +
// audit accounting in metadata.
//
// DETERMINISTIC BY CONSTRUCTION: `computedAt` is REQUIRED input, not a wall
// clock. There is NO hidden default, NO silent wall-clock fallback and NO
// re-invented timestamp schema — the caller supplies a validated ISO-8601
// value at the boundary or the run fails closed with a typed INVALID_INPUT.
// ============================================================================

import {
  EVIDENCE_UTILITY_POLICY_VERSION,
  MAX_GAPS_PER_SELECTION_RUN,
  NEXT_BEST_EVIDENCE_POLICY_VERSION,
  ObservedTimeSchema,
} from '@indago/contracts';
import type { NextBestEvidenceSelectionResult } from '@indago/contracts';
import type { NextBestEvidenceSelectionInput } from './types.js';
import {
  NextBestEvidenceError,
  NEXT_BEST_EVIDENCE_ERROR_CODE,
} from './errors.js';
import { assertSelectionGate } from './gate.js';
import { selectForGap } from './select.js';

export interface SelectionRunOptions {
  /**
   * REQUIRED ISO-8601 observed-time value for `computedAt`. There is NO wall
   * clock and NO hidden default: the caller must supply a validated
   * ISO-8601 UTC timestamp at the boundary. A malformed, non-ISO-8601 or
   * missing value is a deterministic typed INVALID_INPUT failure (fail-closed).
   */
  readonly computedAt: string;
}

const ISO_8601_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function invalidComputedAtError(
  reason: 'MISSING_COMPUTED_AT' | 'INVALID_COMPUTED_AT',
  computedAt: unknown,
): NextBestEvidenceError {
  return new NextBestEvidenceError(
    NEXT_BEST_EVIDENCE_ERROR_CODE.INVALID_INPUT,
    reason === 'MISSING_COMPUTED_AT'
      ? 'SelectionRunOptions.computedAt is required; no wall clock is used.'
      : `SelectionRunOptions.computedAt is not a valid ISO-8601 UTC timestamp: ${String(computedAt)}`,
    reason === 'MISSING_COMPUTED_AT'
      ? {
          reason,
          expected: 'ISO-8601 UTC timestamp (e.g. 2026-01-01T00:00:00.000Z)',
        }
      : {
          reason,
          value: computedAt,
          expected: 'ISO-8601 UTC timestamp (e.g. 2026-01-01T00:00:00.000Z)',
        },
  );
}

function assertValidComputedAt(computedAt: unknown): string {
  // A missing/empty/malformed timestamp fails at the boundary with a typed
  // INVALID_INPUT — never defaults to a wall clock, never reaches the result.
  if (typeof computedAt !== 'string' || computedAt.length === 0) {
    throw invalidComputedAtError('MISSING_COMPUTED_AT', computedAt);
  }
  if (!ISO_8601_UTC_PATTERN.test(computedAt)) {
    throw invalidComputedAtError('INVALID_COMPUTED_AT', computedAt);
  }
  // Round-trip through the repository's frozen timestamp convention
  // (ObservedTimeSchema — the exact surface the result's `computedAt` uses),
  // so a structurally incompatible value cannot slip through.
  const parsed = ObservedTimeSchema.safeParse({
    value: computedAt,
    precision: 'exact',
  });
  if (!parsed.success) {
    throw invalidComputedAtError('INVALID_COMPUTED_AT', computedAt);
  }
  return computedAt;
}

/**
 * Run one bounded PR10 selection pass over the supplied gaps (all within one
 * investigation). Throws a typed NextBestEvidenceError when any gap fails its
 * deterministic gate. Deterministic output: `computedAt` is REQUIRED (no
 * wall clock); different inputs always produce different results, identical
 * inputs always produce byte-identical results.
 */
export function selectNextBestEvidence(
  input: NextBestEvidenceSelectionInput,
  options: SelectionRunOptions,
): NextBestEvidenceSelectionResult {
  // `options?.` keeps the boundary defensive for JS callers: omitting the
  // whole options object must fail typed (INVALID_INPUT), never with a raw
  // TypeError. `computedAt` remains REQUIRED — there is no wall-clock default.
  const computedAt = assertValidComputedAt(options?.computedAt);
  const gapsRequested = input.gaps.length;
  const gapsProcessed = Math.min(gapsRequested, MAX_GAPS_PER_SELECTION_RUN);
  const runTruncated = gapsRequested > gapsProcessed;

  const gapSelections: NextBestEvidenceSelectionResult['selections'] = [];
  const gapSummaries: unknown[] = [];
  const provenance: unknown[] = [];

  for (let i = 0; i < gapsProcessed; i += 1) {
    const gapInput = input.gaps[i];
    if (gapInput === undefined) break;

    assertSelectionGate(gapInput, input.investigationId);

    const core = selectForGap(gapInput);

    gapSummaries.push(core.accounting);

    core.rankedRequests.forEach((ranked, index) => {
      provenance.push({
        gapId: core.gapId,
        rank: index + 1,
        canonicalRequestKey: ranked.canonicalRequestKey,
      });
    });

    gapSelections.push({
      gapId: core.gapId,
      rankedRequests: core.rankedRequests.map((ranked, index) => ({
        rank: index + 1,
        candidateRequest: {
          canonicalRequestKey: ranked.canonicalRequestKey,
          gapId: ranked.gapId,
          hypothesisIds: [...ranked.hypothesisIds],
          evidenceType: ranked.evidenceType,
          discriminatesAmongIds: [...ranked.discriminatesAmongIds],
          utility: ranked.utility,
          rationale: ranked.rationale,
        },
      })),
      consideredCount: core.accounting.candidatesConsidered,
      truncated: core.accounting.truncated,
    });
  }

  const computedAtValue = {
    value: computedAt,
    precision: 'exact' as const,
  };

  return {
    investigationId: input.investigationId,
    selections: gapSelections,
    boundsPolicyVersion: NEXT_BEST_EVIDENCE_POLICY_VERSION,
    utilityPolicyVersion: EVIDENCE_UTILITY_POLICY_VERSION,
    computedAt: computedAtValue,
    metadata: {
      customFields: {
        selectionRun: {
          gapsRequested,
          gapsProcessed,
          runTruncated,
        },
        gapSummaries,
        provenance,
      },
    },
  };
}
