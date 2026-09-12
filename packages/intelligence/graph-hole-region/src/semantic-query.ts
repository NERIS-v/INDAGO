// ============================================================================
// Region semantic query construction (Phase 5A-PR2)
//
// The deterministic query text submitted to the SemanticRetrievalPort each
// expansion round is built from BOUNDED AUTHORITATIVE regional source material
// — NOT from opaque identifier lists as the primary content. The caller
// injects a case/graph-version/temporal-scoped resolver that returns the
// region's already-authorized semantic context (observations / source text
// units); this module deterministically serializes a bounded prefix of it into
// the query. Node ids remain present ONLY as supplementary stable identifiers.
//
// Invariants:
//   - Queries derive ONLY from authoritative region state available BEFORE the
//     round's retrieval (nodeIds, observationIds, injected context). Retrieved
//     text/similarities/orderings are NEVER fed back — no semantic feedback
//     loop can form (the resolver is read-only and never consults retrieval).
//   - Deterministic: identical inputs ⇒ identical query. Context items are
//     sorted by (canonical content, sourceType, sourceId) — input order from
//     the resolver cannot change the query.
//   - Hard-bounded: at most MAX_SEMANTIC_CONTEXT_ITEMS units, at most
//     MAX_SEMANTIC_CONTEXT_CHARS of context, total query capped at
//     MAX_SEMANTIC_QUERY_CHARS. Truncation is a deterministic bounded prefix,
//     never arrival-order dependent.
//   - Canonicalization delegates to the semantic-retrieval ENGINE rule (the
//     SAME rule the service applies at retrieval time), so the trace `query`
//     equals the text the port embeds.
// ============================================================================

import { canonicalizeSemanticText } from '@indago/semantic-retrieval';
import {
  MAX_SEMANTIC_CONTEXT_CHARS,
  MAX_SEMANTIC_CONTEXT_ITEMS,
  MAX_SEMANTIC_QUERY_CHARS,
} from '@indago/contracts';
import type { SemanticSourceType, TemporalInterval } from '@indago/contracts';

/** One bounded authoritative source item eligible to appear in a semantic query. */
export interface SemanticContextItem {
  readonly sourceType: SemanticSourceType;
  /** Canonical id of the source domain object (e.g. an ObservationId). */
  readonly sourceId: string;
  /** Authoritative regional source text (already-authorized, read-only). */
  readonly content: string;
}

/** What the injected context resolver is allowed to see (authoritative only). */
export interface RegionSemanticContextRequest {
  readonly caseId: string;
  readonly graphVersionId: string;
  readonly nodeIds: readonly string[];
  readonly observationIds: readonly string[];
  readonly temporalContext?: TemporalInterval | null;
}

/**
 * The AUTHORITATIVE regional semantic context dependency. Read-only and
 * case/graph-version/temporal-scoped: it returns established source material
 * for the requested region, never fabricated text, never retrieval results,
 * never entity/node resolution. The builder is deterministic regardless of the
 * resolver's return order.
 */
export type RegionSemanticContextResolver = (
  request: RegionSemanticContextRequest,
) => Promise<readonly SemanticContextItem[]>;

function canonicalOf(item: SemanticContextItem): string {
  return canonicalizeSemanticText(item.content);
}

/** Deterministic precedence: canonical content, then sourceType, then sourceId. */
function compareContextItems(a: SemanticContextItem, b: SemanticContextItem): number {
  const ca = canonicalOf(a);
  const cb = canonicalOf(b);
  if (ca !== cb) return ca < cb ? -1 : 1;
  if (a.sourceType !== b.sourceType) return a.sourceType < b.sourceType ? -1 : 1;
  if (a.sourceId !== b.sourceId) return a.sourceId < b.sourceId ? -1 : 1;
  return 0;
}

function boundedPrefix(text: string, maxLength: number): string {
  if (maxLength <= 0) return '';
  return text.length <= maxLength ? text : text.slice(0, maxLength);
}

/**
 * Build the deterministic, bounded semantic query for a region membership.
 *
 * `contextItems` come from the injected authoritative resolver; they are the
 * PRIMARY semantic content. `nodeIds` are sorted stable identifiers, listed
 * AFTER the context so they can never dominate the retrieval signal.
 */
export function buildRegionSemanticQuery(
  contextItems: readonly SemanticContextItem[],
  nodeIds: readonly string[],
): string {
  const sortedNodes = [...new Set(nodeIds)].sort();

  const boundedItems = [...contextItems].sort(compareContextItems).slice(0, MAX_SEMANTIC_CONTEXT_ITEMS);
  const joined = boundedItems.map((item) => canonicalOf(item)).join(' | ');
  const contextSection = boundedPrefix(joined, MAX_SEMANTIC_CONTEXT_CHARS);
  const contextLine = contextSection.length === 0 ? 'context: (none)' : `context: ${contextSection}`;
  const nodeLine = `nodes: ${sortedNodes.join(' ')}`;

  const raw = boundedPrefix(`${contextLine}\n${nodeLine}`, MAX_SEMANTIC_QUERY_CHARS);
  return canonicalizeSemanticText(raw);
}