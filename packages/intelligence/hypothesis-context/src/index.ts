// ============================================================================
// @indago/hypothesis-context — public surface (Phase 5A-PR3)
//
// Existing Hypotheses + Atomic/Grouped Context:
// a pure, read-only, derived representation of the authoritative hypothesis
// sources grouped by the frozen §18/§19 policy. See types.ts for the
// determinism and no-fabrication contract.
// ============================================================================

export { buildHypothesisContext } from './components.js';
export { normalizeAndSort, computeComponents, splitComponent } from './components.js';
export { fromRelation, fromEntity } from './atomic.js';
export { overlapNodeKeys, canonicalEntityIdsOf, compareAtomicOrder } from './canonical.js';

export {
  ATOMIC_CONTEXT_POLICY_VERSION,
} from './types.js';
export type {
  AtomicContextPolicyVersion,
  AtomicHypothesisType,
  AtomicNodeReference,
  AtomicRelationshipHypothesis,
  HypothesisContext,
  HypothesisContextAccounting,
  HypothesisContextInput,
  HypothesisGroup,
} from './types.js';