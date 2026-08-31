import { z } from 'zod';
import {
  CandidatePairIdSchema,
  CaseIdSchema,
  InvestigationIdSchema,
  EntityMentionCandidateIdSchema,
} from '../common/ids.js';
import { ObservedTimeSchema } from '../common/timestamps.js';
import { MetadataSchema } from '../common/metadata.js';

// ============================================================================
// Candidate Pair (M-A08)
//
// M-A08 answers:
//   "Which entity-like mentions are worth comparing?"
//
// M-A08 does NOT answer:
//   "Are these mentions the same entity?"
//
// Therefore CandidatePair:
//   - joins two EntityMentionCandidates that entered the SAME comparison
//     universe via at least one deterministic blocking pass
//   - is UNORDERED — canonical left/right ordering is deterministic
//   - is SAME-CASE ONLY — cross-case pairs are never generated (v1)
//   - records WHICH blocking passes independently discovered the pair
//   - preserves the two underlying candidates (it never collapses them)
//
// CandidatePair is an operational / comparison artifact. It is NOT a match
// decision. It carries NO score, confidence, similarity, EntityId, or
// hypothesis reference — those belong to Entity Resolution (M-A09).
//
// Boundary:
//   CandidatePair ≠ EntityCandidate / EntityResolutionCandidate (resolution)
//   CandidatePair ≠ EntityHypothesis (identity proposition)
//   CandidatePair ≠ Entity (canonical identity)
// ============================================================================

// ============================================================================
// BlockingPass — canonical v1 taxonomy of deterministic blocking passes
//
// ONLY passes actually implemented in this PR are included. A pass is a
// DETERMINISTIC rule that groups candidates into a block (a set of records
// that are plausible to compare). It never implies shared identity.
// ============================================================================

export const BlockingPassSchema = z.enum([
  'EXACT_STRONG_IDENTIFIER',
  'EXACT_CANONICAL_VALUE',
  'NAME_INITIAL_BLOCK',
]).describe('Deterministic blocking passes implemented in M-A08 (v1)');
export type BlockingPass = z.infer<typeof BlockingPassSchema>;

// ============================================================================
// CandidatePair — worth-comparing record between two mentions
//
// One row per unordered (candidateA, candidateB) pair within a case. The id
// is a deterministic UUID derived from (caseId, canonicalLeftCandidateId,
// canonicalRightCandidateId) — so a pair generated on any pass, in any order,
// from any retry converges to the SAME durable row.
// ============================================================================

export const CandidatePairSchema = z.object({
  /** Deterministic UUID derived from (caseId, canonicalLeft, canonicalRight) */
  id: CandidatePairIdSchema,

  /** Case boundary the pair lives in — same-case only (v1 isolation invariant) */
  caseId: CaseIdSchema,

  /** Investigation scope owning both candidates (denormalized for indexing) */
  investigationId: InvestigationIdSchema.optional(),

  /** Lexically smaller candidate id (canonical ordering) */
  leftCandidateId: EntityMentionCandidateIdSchema,

  /** Lexically larger candidate id (canonical ordering) */
  rightCandidateId: EntityMentionCandidateIdSchema,

  /** Every blocking pass that independently discovered this pair (non-empty) */
  blockingPasses: z.array(BlockingPassSchema).min(1).max(100)
    .describe('Deterministic-ordered list of passes that produced this pair'),

  createdAt: ObservedTimeSchema,
  metadata: MetadataSchema.optional(),
}).strict()
  .refine(
    (obj) => obj.leftCandidateId !== obj.rightCandidateId,
    { message: 'leftCandidateId and rightCandidateId must differ (no self-pair)' },
  );
export type CandidatePair = z.infer<typeof CandidatePairSchema>;
