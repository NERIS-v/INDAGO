// ============================================================================
// M-A10 Relation Resolution — PR-31 FIX 7: contradiction producer
//
// The scoring engine already consumes `explicitContradictions`, but until this
// producer existed NOTHING ever wrote them from observation content — PR-30
// verdict: "contradictions CONFIRMED (no producer ever writes them)". As a
// result the −0.25 hardContradiction weight could never fire on a fresh case.
//
// This module deterministically PRODUCES a contradiction observation set from
// the case's observation content. Precision over recall, always:
//
//   - An observation is ONLY flagged when its free text carries an explicit
//     negative claim polarity (denial / dispute / rebuttal / false claim /
//     fraudulent) toward a claimed relationship — never mere absence, never a
//     neutral "no" inside an unrelated sentence.
//   - The resolver only ever treats a flagged observation as a contradiction
//     for a relation pair whose evidence basis actually INCLUDES that
//     observation (source-grounded co-occurrence) — so a flagged single-entity
//     note can never contaminate a pair it does not touch.
//
// PURE: deterministic, no Prisma / network / clock / random. Given the same
// observations it returns the same set, so re-runs converge to the same
// hard-contradiction outcome.
// ============================================================================

import type { Observation } from '@indago/contracts';

/**
 * Explicit negative-claim-polarity phrases. Every entry is a strong dispute /
 * denial / false-claim construct directed at a claimed relationship. Deliberate
 * conservative vocabulary: precision over recall — the whole point of a hard
 * contradiction is that it must be GLARING, not inferred.
 */
const NEGATIVE_CLAIM_POLARITY_TERMS: readonly string[] = [
  'denies',
  'denied',
  'deny',
  'denying',
  'disputes',
  'disputed',
  'disputing',
  'rebuts',
  'rebutted',
  'contrary to',
  'false claim',
  'false statement',
  'no transaction',
  'never occurred',
  'never authorised',
  'never authorized',
  'did not authorize',
  'did not authorise',
  'not authorized',
  'not authorised',
  'refused',
  'refuse',
  'refusing',
  'contradicts',
  'contradicting',
  'contradicted',
  'fabricated',
  'forged',
  'fraudulent',
];

/** Normalize a phrase into a caller-safe, case-folded search token. */
const normalizeTerm = (term: string): string => term.trim().toLowerCase();

/**
 * Whether the observation's free text carries an explicit negative claim
 * polarity. Content absent → false (ABSENT ≠ DIFFERENT — no text is never a
 * contradiction).
 */
export function hasNegativeClaimPolarity(content: string | undefined | null): boolean {
  if (content === undefined || content === null || content.length === 0) return false;
  const lower = content.toLowerCase();
  return NEGATIVE_CLAIM_POLARITY_TERMS.some((term) =>
    lower.includes(normalizeTerm(term)),
  );
}

/**
 * Deterministically produce the contradiction observation set for a case.
 *
 * Only observations whose free text carries an explicit negative claim polarity
 * are flagged. The resolver confines the effect: a flagged id only counts as a
 * contradiction for pairs whose co-occurrence evidence includes it, and the
 * contradiction is carried with provenance (`resolution.contradictions`).
 *
 * Returns a fresh Set (never the identity of any input object).
 */
export function detectExplicitRelationContradictions(
  observations: readonly Observation[],
): Set<string> {
  const flagged = new Set<string>();
  for (const observation of observations) {
    if (hasNegativeClaimPolarity(observation.content)) {
      flagged.add(observation.id);
    }
  }
  return flagged;
}