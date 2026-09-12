import { describe, it, expect } from 'vitest';
import {
  MAX_SEMANTIC_CONTEXT_CHARS,
  MAX_SEMANTIC_CONTEXT_ITEMS,
  MAX_SEMANTIC_QUERY_CHARS,
} from '@indago/contracts';
import { buildRegionSemanticQuery } from '../src/index.js';
import type { SemanticContextItem } from '../src/index.js';

// ============================================================================
// Phase 5A-PR2 — buildRegionSemanticQuery determinism + bounded serialization
//
// The query text is the ONLY string the semantic retrieval port sees, so it is
// exercised directly: deterministic serialization, bounded prefixes, and the
// guarantee that the query is dominated by authoritative CONTEXT content rather
// than opaque identifiers ("never a UUID-only query").
// ============================================================================

function item(sourceId: string, content: string, sourceType: 'OBSERVATION' | 'DOCUMENT' = 'OBSERVATION'): SemanticContextItem {
  return { sourceType, sourceId, content };
}

describe('buildRegionSemanticQuery', () => {
  it('serializes context + sorted membership deterministically', () => {
    const items = [item('c', 'gamma text'), item('a', 'alpha text'), item('b', 'beta text')];
    const q = buildRegionSemanticQuery(items, ['n-3', 'n-1', 'n-2']);
    expect(q).toContain('alpha text');
    expect(q).toContain('beta text');
    expect(q).toContain('gamma text');
    expect(q).toContain('nodes: n-1 n-2 n-3');
    // Identical inputs ⇒ identical query (also stable across item order).
    expect(buildRegionSemanticQuery([...items].reverse(), ['n-3', 'n-1', 'n-2'])).toBe(q);
    expect(buildRegionSemanticQuery(items, ['n-1', 'n-1', 'n-2', 'n-3'])).toBe(q);
  });

  it('is deterministic regardless of the resolver’s return order', () => {
    const base = buildRegionSemanticQuery(
      [item('b', 'shared beta'), item('a', 'shared alpha')],
      ['n-1'],
    );
    const shuffled = buildRegionSemanticQuery(
      [item('a', 'shared alpha'), item('z', 'shared zoom')],
      ['n-1'],
    );
    // Items sort by (content, sourceType, sourceId) before serialization.
    expect(base).not.toBe(shuffled);
    expect(buildRegionSemanticQuery([item('z', 'shared zoom'), item('a', 'shared alpha')], ['n-1'])).toBe(shuffled);
    // Same content in different orders sorts by sourceId tiebreaker.
    expect(buildRegionSemanticQuery([item('b', 'same'), item('a', 'same')], ['n-1']))
      .toBe(buildRegionSemanticQuery([item('a', 'same'), item('b', 'same')], ['n-1']));
  });

  it('deduplicates the membership ids and always sorts them', () => {
    const q = buildRegionSemanticQuery([], ['n-9', 'n-1', 'n-9', 'n-5']);
    expect(q).toBe('context: (none) nodes: n-1 n-5 n-9');
    // Empty context + empty membership still yields a NON-EMPTY canonical query.
    const empty = buildRegionSemanticQuery([], []);
    expect(empty).toBe('context: (none) nodes:');
    expect(empty.length).toBeGreaterThan(0);
  });

  it('is NOT a UUID-only payload: authoritative context content dominates', () => {
    const q = buildRegionSemanticQuery(
      [item('obs-1', 'the suspect traveled by train to the station'), item('doc-2', 'the station closed at midnight')],
      ['n-1', 'n-2'],
    );
    // Primary recall signal is the context; ids appear only as supplementary.
    expect(q).toContain('the suspect traveled by train');
    expect(q).toContain('station');
    expect(q.split(' ').filter((t) => t.startsWith('n-')).length).toBeLessThanOrEqual(2);
  });

  it('bounds context units and context characters', () => {
    const manyItems = Array.from({ length: MAX_SEMANTIC_CONTEXT_ITEMS + 40 }, (_, i) =>
      item(`s-${String(i).padStart(4, '0')}`, `unit number ${String(i).padStart(4, '0')}`),
    );
    const q = buildRegionSemanticQuery(manyItems, ['n-1']);
    // Only the first MAX_SEMANTIC_CONTEXT_ITEMS sorted items may appear.
    for (let i = 0; i < MAX_SEMANTIC_CONTEXT_ITEMS; i++) {
      expect(q).toContain(`unit number ${String(i).padStart(4, '0')}`);
    }
    expect(q).not.toContain(`unit number ${String(MAX_SEMANTIC_CONTEXT_ITEMS).padStart(4, '0')}`);

    // Context section cap: a single giant item is truncated at the char budget.
    const giant = item('giant', 'x'.repeat(MAX_SEMANTIC_CONTEXT_CHARS * 2));
    const giantQ = buildRegionSemanticQuery([giant], ['n-1']);
    expect(giantQ).toContain('context:');
    // Equal inputs ⇒ deterministic truncated prefix (bounded, order-independent).
    expect(buildRegionSemanticQuery([giant], ['n-1'])).toBe(giantQ);
  });

  it('caps the total query length', () => {
    const giant = item('giant', 'x'.repeat(MAX_SEMANTIC_CONTEXT_CHARS));
    const q = buildRegionSemanticQuery([giant], ['n-1']);
    expect(q.length).toBeLessThanOrEqual(MAX_SEMANTIC_QUERY_CHARS);
  });
});