// ============================================================================
// PR18 — Candidate evidence utility selection (Phase 5A)
//
// The PR18 entry point. Given PR17's candidate evidence requests + the bounded
// closed-world context, it:
//   1. validates the input boundary (policyVersion, computedAt, identity);
//   2. validates context binding (every discrimination target is a REAL
//      explanation id — CONTEXT_MISMATCH otherwise, fail-closed);
//   3. scores each candidate under the frozen PR10 policy (reusing components);
//   4. excludes existing-evidence-covered candidates (fail-closed);
//   5. deduplicates by the PR10 canonicalRequestKey (single source of truth),
//      merging collapsed-source provenance;
//   6. ranks by the frozen EVIDENCE_UTILITY_RANK_ORDER;
//   7. selects the bounded top-N (MAX_EVIDENCE_REQUESTS_PER_GAP), surfacing
//      truncation.
//
// PERSISTENCE-FREE and ACQUISITION-FREE: selection implies only "ranks highly
// under the frozen utility policy" — never approval/authorization/acquisition.
// ============================================================================

import {
  EVIDENCE_UTILITY_POLICY_VERSION,
  MAX_CANDIDATE_REQUESTS_CONSIDERED_PER_GAP,
  MAX_EVIDENCE_REQUESTS_PER_GAP,
} from '@indago/contracts';
import {
  NextBestEvidenceError,
  NEXT_BEST_EVIDENCE_ERROR_CODE,
} from '../errors.js';
import { compareRankedCandidates } from '../dedup.js';
import type { RankedEvidenceCandidate } from '../dedup.js';
import { buildDerivedCandidateContext } from './context.js';
import { scoreCandidate } from './score.js';
import type {
  CandidateEvidenceSelectionInput,
  CandidateEvidenceSelectionResult,
  RankedCandidateRequest,
  ScoredCandidateRequest,
} from './types.js';

const ISO_8601_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function invalid(message: string): NextBestEvidenceError {
  return new NextBestEvidenceError(NEXT_BEST_EVIDENCE_ERROR_CODE.INVALID_INPUT, message);
}

function toComparator(ranked: RankedCandidateRequest): RankedEvidenceCandidate {
  return {
    canonicalRequestKey: ranked.canonicalRequestKey,
    gapId: ranked.gapId,
    hypothesisIds: [...ranked.hypothesisIds],
    evidenceType: ranked.evidenceType,
    discriminatesAmongIds: [...ranked.discriminatesAmongIds],
    utility: ranked.utility,
    rationale: ranked.rationale,
    recommendationIndex: 0,
  };
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** Merge the provenance of all PR17 candidates collapsed into one identity. */
function mergeProvenance(group: readonly ScoredCandidateRequest[]): RankedCandidateRequest {
  const sorted = [...group].sort(
    (a, b) =>
      (a.candidate.canonicalRequestKey < b.candidate.canonicalRequestKey ? -1 : 1) ||
      (a.candidate.description ?? '').localeCompare(b.candidate.description ?? ''),
  );
  const winner = sorted[0]!;
  const sourceExplanationIds = sortedUnique(
    sorted.flatMap((s) => s.candidate.sourceExplanationIds ?? []),
  );
  return {
    rank: 0,
    canonicalRequestKey: winner.candidate.canonicalRequestKey,
    gapId: winner.candidate.gapId,
    evidenceType: winner.candidate.evidenceType,
    discriminatesAmongIds: [...winner.candidate.discriminatesAmongIds],
    hypothesisIds: [...winner.candidate.hypothesisIds],
    rationale: winner.candidate.rationale,
    description: winner.candidate.description,
    discriminationKind: winner.candidate.discriminationKind,
    temporalScope: winner.candidate.temporalScope ?? null,
    sourceExplanationIds,
    supportingObservationIds: sortedUnique(
      sorted.flatMap((s) => s.candidate.supportingObservationIds ?? []),
    ),
    structuralSignalIds: sortedUnique(
      sorted.flatMap((s) => s.candidate.structuralSignalIds ?? []),
    ),
    utility: winner.utility,
  };
}

/**
 * Rank + select PR17 candidate evidence requests under the frozen PR10 utility
 * policy. Pure, deterministic, persistence-free. Throws a typed
 * NextBestEvidenceError on input/policy/context violations.
 */
export function selectBestEvidenceFromCandidates(
  input: CandidateEvidenceSelectionInput,
): CandidateEvidenceSelectionResult {
  if (input === null || typeof input !== 'object') {
    throw invalid('input must be an object');
  }
  if (input.policyVersion !== EVIDENCE_UTILITY_POLICY_VERSION) {
    throw new NextBestEvidenceError(
      NEXT_BEST_EVIDENCE_ERROR_CODE.UNSUPPORTED_POLICY,
      `unsupported policyVersion: ${String(input.policyVersion)}`,
    );
  }
  if (
    input.computedAt === null ||
    typeof input.computedAt !== 'object' ||
    typeof input.computedAt.value !== 'string' ||
    !ISO_8601_UTC_PATTERN.test(input.computedAt.value)
  ) {
    throw invalid('computedAt must be a caller-supplied ISO-8601 UTC ObservedTime');
  }
  if (
    typeof input.investigationId !== 'string' ||
    input.investigationId.length === 0 ||
    typeof input.gapId !== 'string' ||
    input.gapId.length === 0
  ) {
    throw invalid('investigationId and gapId are required');
  }
  if (!Array.isArray(input.candidateRequests)) {
    throw invalid('candidateRequests must be an array');
  }
  if (input.context === null || typeof input.context !== 'object') {
    throw invalid('context is required');
  }

  // Context binding: every discrimination target must be a REAL explanation id
  // present in the closed-world (fail-closed — never score an invented target).
  if (input.context.representedExplanationIds !== undefined) {
    const realIds = new Set(input.context.representedExplanationIds);
    for (const c of input.candidateRequests) {
      for (const id of [...(c.discriminatesAmongIds ?? []), ...(c.sourceExplanationIds ?? [])]) {
        if (!realIds.has(id)) {
          throw new NextBestEvidenceError(
            NEXT_BEST_EVIDENCE_ERROR_CODE.CONTEXT_MISMATCH,
            `candidate references explanation id ${id} that is not in the closed-world represented set`,
          );
        }
      }
    }
  }

  // Gap isolation: every candidate must address the same gap as the evaluation input.
  for (const c of input.candidateRequests) {
    if (c.gapId !== input.gapId) {
      throw new NextBestEvidenceError(
        NEXT_BEST_EVIDENCE_ERROR_CODE.INCONSISTENT_GAP_ID,
        `candidate gapId ${c.gapId} differs from the evaluation gapId ${input.gapId}`,
      );
    }
  }

  const derived = buildDerivedCandidateContext(input.context);

  // Bounded processing: never exceed the upstream candidate set / PR10 consider cap.
  const candidateCount = input.candidateRequests.length;
  const processedCount = Math.min(candidateCount, MAX_CANDIDATE_REQUESTS_CONSIDERED_PER_GAP);
  const inputTruncated = candidateCount > processedCount;

  const scoredAll: ScoredCandidateRequest[] = [];
  let existingEvidenceExclusions = 0;
  for (let i = 0; i < processedCount; i += 1) {
    const candidate = input.candidateRequests[i];
    if (candidate === undefined) break;
    if (candidate === null || typeof candidate !== 'object' || !candidate.canonicalRequestKey) {
      throw new NextBestEvidenceError(
        NEXT_BEST_EVIDENCE_ERROR_CODE.INVALID_CANDIDATE,
        'a candidate request is malformed (missing canonicalRequestKey)',
      );
    }
    const { scored, covered } = scoreCandidate(candidate, {
      derived,
      gapTemporalScope: input.context.gapTemporalScope,
      existingEvidence: input.existingEvidence,
      sourceAvailabilityByType: input.sourceAvailabilityByType,
      sourceAccessibilityByType: input.sourceAccessibilityByType,
    });
    if (covered) {
      existingEvidenceExclusions += 1;
      continue;
    }
    scoredAll.push(scored);
  }

  // Dedup by the PR10 canonicalRequestKey (single source of truth), merging provenance.
  const groups = new Map<string, ScoredCandidateRequest[]>();
  for (const scored of scoredAll) {
    const key = scored.candidate.canonicalRequestKey;
    const existing = groups.get(key);
    if (existing === undefined) groups.set(key, [scored]);
    else existing.push(scored);
  }
  const deduplicatedCandidates = scoredAll.length - groups.size;
  const winners: RankedCandidateRequest[] = [];
  for (const group of groups.values()) {
    winners.push(mergeProvenance(group));
  }

  // Rank by the frozen order; bound output to MAX_EVIDENCE_REQUESTS_PER_GAP.
  winners.sort((a, b) => compareRankedCandidates(toComparator(a), toComparator(b)));

  const rankedLimitHit = winners.length > MAX_EVIDENCE_REQUESTS_PER_GAP;
  const selected = rankedLimitHit ? winners.slice(0, MAX_EVIDENCE_REQUESTS_PER_GAP) : winners;
  const rankedRequests: RankedCandidateRequest[] = selected.map((r, index) => ({
    ...r,
    rank: index + 1,
  }));

  const truncated = inputTruncated || rankedLimitHit;

  return {
    investigationId: input.investigationId,
    gapId: input.gapId,
    rankedRequests,
    consideredCount: winners.length,
    truncated,
    accounting: {
      candidatesSeen: processedCount,
      existingEvidenceExclusions,
      deduplicatedCandidates,
      distinctCandidates: winners.length,
      candidatesConsidered: winners.length,
      candidatesRanked: rankedRequests.length,
      truncated,
    },
    utilityPolicyVersion: EVIDENCE_UTILITY_POLICY_VERSION,
    computedAt: input.computedAt,
  };
}