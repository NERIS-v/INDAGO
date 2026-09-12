// ============================================================================
// Region semantic query construction (Phase 5A-PR2)
//
// The deterministic query text submitted to the SemanticRetrievalPort each
// expansion round. The query depends ONLY on the region's current canonical
// membership (sorted node ids), never on retrieved text/similarities — so same
// region state ⇒ same query, and no semantic feedback loop can form.
//
// Canonicalization delegates to the semantic-retrieval ENGINE's rule (the SAME
// rule the service applies to every query at retrieval time), keeping the trace
// `query` equal to the text the port actually embeds. Collapsing whitespace is
// a no-op here (node ids are UUID hex joined by single spaces) but the rule is
// shared, not copied.
// ============================================================================

import { canonicalizeSemanticText } from '@indago/semantic-retrieval';

/**
 * Deterministic semantic query for the current region membership:
 * `sortedUnique(nodeIds).join(' ')`, run through the canonical semantic text
 * rule. Throws only if nodeIds is empty (buildRegion never calls this on an
 * empty member set).
 */
export function regionSemanticQueryOf(nodeIds: readonly string[]): string {
  const sorted = [...new Set(nodeIds)].sort();
  return canonicalizeSemanticText(sorted.join(' '));
}