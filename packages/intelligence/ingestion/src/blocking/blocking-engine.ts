// ============================================================================
// M-A08 Candidate Pair — blocking engine
//
// Deterministic multi-pass blocking. Turns EntityMentionCandidate[] into an
// unordered CandidatePair[] (comparison-universe) WITHOUT resolving identity.
//
// Pipeline (per §9 — a UNION, never a cascade):
//   Pass 1 → pairSet A
//   Pass 2 → pairSet B
//   Pass 3 → pairSet C
//   A ∪ B ∪ C → canonical pair identity → CandidatePairDraft[]
//
// A true match only needs to enter ONE valid blocking pass. Passes are
// independent; later passes never alter earlier ones.
//
// Bounded and deterministic:
//   - Map<BlockKey, Candidate[]> indexed grouping → O(N + generatedPairs)
//   - maxBlockSize caps any block; oversized blocks are SKIPPED for that pass
//   - same-observation pairs are excluded by default; configurable
//   - pair ids are deterministic, unordered, case-scoped
//
// PURE: no Prisma, BullMQ, Redis, network, clock, or random. Deterministic
// given the same (candidates, caseId, config).
// ============================================================================

import type { BlockingPass, EntityMentionCandidate } from '@indago/contracts';
import {
  areTypesCompatible,
  canonicalValueKey,
  nameInitialKey,
  strongIdentifierKey,
} from './blocking-passes.js';
import { canonicalizePairIds } from './blocking-identity.js';
import {
  CANDIDATE_PAIR_BOUNDS,
  type BlockingCandidate,
  type BlockingConfig,
  type BlockingMetrics,
  type BlockingResult,
  type CandidatePairDraft,
} from './types.js';

type KeyDeriver = (
  c: EntityMentionCandidate,
) => { key: string; pass: BlockingPass } | undefined;

const PASS_DERIVERS: ReadonlyArray<{ pass: BlockingPass; derive: KeyDeriver }> = [
  { pass: 'EXACT_STRONG_IDENTIFIER', derive: strongIdentifierKey },
  { pass: 'EXACT_CANONICAL_VALUE', derive: canonicalValueKey },
  { pass: 'NAME_INITIAL_BLOCK', derive: nameInitialKey },
];

interface MutableMetrics {
  blocksGenerated: number;
  blocksSkippedOversized: number;
  pairsPerPass: Record<BlockingPass, number>;
  rejectedSameObservation: number;
  uniquePairsAfterUnion: number;
}

function emptyMutableMetrics(): MutableMetrics {
  return {
    blocksGenerated: 0,
    blocksSkippedOversized: 0,
    pairsPerPass: {
      EXACT_STRONG_IDENTIFIER: 0,
      EXACT_CANONICAL_VALUE: 0,
      NAME_INITIAL_BLOCK: 0,
    },
    rejectedSameObservation: 0,
    uniquePairsAfterUnion: 0,
  };
}

function finalizeMetrics(m: MutableMetrics, candidates: number): BlockingMetrics {
  return {
    candidatesConsidered: candidates,
    blocksGenerated: m.blocksGenerated,
    blocksSkippedOversized: m.blocksSkippedOversized,
    pairsPerPass: { ...m.pairsPerPass },
    rejectedSameObservation: m.rejectedSameObservation,
    uniquePairsAfterUnion: m.uniquePairsAfterUnion,
  };
}

/**
 * Run one pass over the candidate set, returning an unordered pair set keyed
 * by the canonical pair identity (min|max). A block bigger than maxBlockSize
 * is skipped entirely for this pass (bounded behavior, never O(N²)).
 */
function runPass(
  pass: BlockingPass,
  derive: KeyDeriver,
  candidates: readonly BlockingCandidate[],
  allowSameObservation: boolean,
  metrics: MutableMetrics,
): ReadonlyMap<string, BlockingPass> {
  const buckets = new Map<string, BlockingCandidate[]>();
  for (const c of candidates) {
    const k = derive(c);
    if (k === undefined) continue;
    const list = buckets.get(k.key);
    if (list === undefined) buckets.set(k.key, [c]);
    else list.push(c);
  }

  let blocksGenerated = 0;
  let blocksSkipped = 0;
  const found = new Map<string, BlockingPass>();

  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    blocksGenerated++;
    if (bucket.length > CANDIDATE_PAIR_BOUNDS.maxBlockSize) {
      blocksSkipped++;
      continue; // pathological block — skip to stay bounded
    }

    const obsByCandidate = new Map<string, string>();
    for (const c of bucket) obsByCandidate.set(c.id, c.observationId);

    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i]!;
        const b = bucket[j]!;

        // Same-observation policy (default: no meaningful self-corroboration).
        if (!allowSameObservation && a.observationId === b.observationId) {
          metrics.rejectedSameObservation += 1;
          continue;
        }

        // Type compatibility — never pair across incompatible types, never
        // NULL↔typed, never OTHER-as-universal.
        if (!areTypesCompatible(a.entityType, b.entityType)) continue;

        const { left, right } = canonicalizePairIds(a.id, b.id);
        const pairKey = `${left}|${right}`;
        metrics.pairsPerPass[pass] += 1;
        found.set(pairKey, pass);
      }
    }
  }

  metrics.blocksGenerated += blocksGenerated;
  metrics.blocksSkippedOversized += blocksSkipped;
  return found;
}

/**
 * Deterministically block a set of same-case EntityMentionCandidates into an
 * unordered CandidatePair universe.
 *
 * caseId is required and embedded in every pair identity; the caller must
 * guarantee it passes a single-case candidate set (v1 is same-case only).
 */
export function blockCandidates(
  input: {
    readonly candidates: readonly BlockingCandidate[];
    readonly caseId: string;
    readonly investigationId?: string;
  },
  config: BlockingConfig = {},
): BlockingResult {
  const { candidates, caseId, investigationId } = input;
  const allowSameObservation = config.allowSameObservationPairs ?? false;
  const metrics = emptyMutableMetrics();

  // UNION of all independently-derived pass pair-sets, merging discovery passes.
  const pairPasses = new Map<string, Set<BlockingPass>>();
  for (const { pass, derive } of PASS_DERIVERS) {
    const found = runPass(pass, derive, candidates, allowSameObservation, metrics);
    for (const [pairKey, p] of found) {
      const set = pairPasses.get(pairKey);
      if (set === undefined) pairPasses.set(pairKey, new Set([p]));
      else set.add(p);
    }
  }

  // Deterministic output ordering: sort by canonical pair identity.
  const orderedPairs = [...pairPasses.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  );

  const drafts: CandidatePairDraft[] = orderedPairs.map(([pairKey, passes]) => {
    const [left, right] = pairKey.split('|');
    return {
      leftCandidateId: left!,
      rightCandidateId: right!,
      caseId,
      ...(investigationId !== undefined ? { investigationId } : {}),
      blockingPasses: [...passes].sort(),
    };
  });

  metrics.uniquePairsAfterUnion = drafts.length;
  return { drafts, metrics: finalizeMetrics(metrics, candidates.length) };
}
