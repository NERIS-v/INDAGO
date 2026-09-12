import { describe, it, expect } from 'vitest';
import {
  MAX_SEMANTIC_CONTEXT_CHARS,
  MAX_SEMANTIC_CONTEXT_ITEMS,
  MAX_SEMANTIC_QUERY_CHARS,
  SemanticExpansionStatusSchema,
  SemanticNodeMappingReportSchema,
  SemanticExpansionTraceSchema,
  SemanticNodeMappingRejectionSchema,
} from '../src/index.js';

// ============================================================================
// Graph-Hole Semantic Region Expansion Contracts (Phase 5A-PR2)
//
// Pins the frozen semantic→node boundary: status vocabulary, the mapping
// report, and the per-region traceability block. Everything schema-level.
// ============================================================================

function uuidFor(seed: string): string {
  const hex = Buffer.from(seed, 'utf8').toString('hex').padEnd(32, '0');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

const N1 = uuidFor('sem-node-1');
const N2 = uuidFor('sem-node-2');
const U1 = uuidFor('text-unit-1');
const U2 = uuidFor('text-unit-2');
const S1 = uuidFor('source-1');
const S2 = uuidFor('source-2');
const HASH = '4bedba549e02ff9f47aa9ddef1b5f1c7b0d4f7b28f78642ef9c3a0d3c3f1c1a7';

describe('SemanticExpansionStatusSchema', () => {
  it('freezes the exact six-status vocabulary', () => {
    expect(Object.values(SemanticExpansionStatusSchema.enum)).toEqual([
      'DISABLED',
      'SUCCESS',
      'EMPTY',
      'PARTIAL',
      'DEGRADED',
      'LIMITED',
    ]);
  });

  it('rejects unknown statuses', () => {
    expect(SemanticExpansionStatusSchema.safeParse('COMPLETE').success).toBe(false);
    expect(SemanticExpansionStatusSchema.safeParse('FAILED').success).toBe(false);
  });
});

describe('SemanticNodeMappingRejectionSchema', () => {
  it('accepts exactly the two authoritative rejection reasons', () => {
    expect(Object.values(SemanticNodeMappingRejectionSchema.enum)).toEqual([
      'UNRESOLVED',
      'NON_NODE_SOURCE',
    ]);
  });

  it('rejects fuzzy/approximate reasons', () => {
    expect(SemanticNodeMappingRejectionSchema.safeParse('SIMILAR_NAME').success).toBe(false);
  });
});

describe('semantic query-context budget', () => {
  it('freezes the bounded-context query caps', () => {
    // Deterministic bounded serialization: item count, context chars, query length.
    expect(MAX_SEMANTIC_CONTEXT_ITEMS).toBeGreaterThan(0);
    expect(MAX_SEMANTIC_CONTEXT_CHARS).toBeGreaterThan(0);
    expect(MAX_SEMANTIC_QUERY_CHARS).toBeGreaterThan(MAX_SEMANTIC_CONTEXT_CHARS);
  });
});

describe('SemanticNodeMappingReportSchema', () => {
  it('accepts a complete mapping report', () => {
    const report = {
      mappedCount: 2,
      unresolvedCount: 1,
      rejectedCount: 1,
      rejectedReasons: [
        { reason: 'NON_NODE_SOURCE', count: 1 },
        { reason: 'UNRESOLVED', count: 1 },
      ],
      mappedNodeIds: [N1, N2],
      attribution: [
        {
          semanticTextUnitId: U1,
          sourceType: 'OBSERVATION',
          sourceId: S1,
          mappedNodeIds: [N1],
          outcome: 'MAPPED',
        },
        {
          semanticTextUnitId: U2,
          sourceType: 'OBSERVATION',
          sourceId: S2,
          mappedNodeIds: [],
          outcome: 'UNRESOLVED',
          rejectionReason: 'UNRESOLVED',
        },
      ],
    };
    const parsed = SemanticNodeMappingReportSchema.safeParse(report);
    expect(parsed.success).toBe(true);
  });

  it('requires counts to be non-negative integers', () => {
    const base = {
      mappedCount: 1,
      unresolvedCount: 0,
      rejectedCount: 0,
      rejectedReasons: [],
      mappedNodeIds: [N1],
      attribution: [],
    };
    expect(SemanticNodeMappingReportSchema.safeParse({ ...base, mappedCount: -1 }).success).toBe(false);
    expect(SemanticNodeMappingReportSchema.safeParse({ ...base, unresolvedCount: 1.5 }).success).toBe(false);
  });

  it('rejects a fabricated mapping (node id that is not a canonical graph node)', () => {
    const base = {
      mappedCount: 1,
      unresolvedCount: 0,
      rejectedCount: 0,
      rejectedReasons: [],
      mappedNodeIds: ['n-1'],
      attribution: [],
    };
    expect(SemanticNodeMappingReportSchema.safeParse(base).success).toBe(false);
  });

  it('requires attribution to match the outcome contract', () => {
    const bad = {
      mappedCount: 0,
      unresolvedCount: 0,
      rejectedCount: 1,
      rejectedReasons: [{ reason: 'UNRESOLVED', count: 1 }],
      mappedNodeIds: [],
      attribution: [
        {
          semanticTextUnitId: U1,
          sourceType: 'OBSERVATION',
          sourceId: S1,
          mappedNodeIds: [],
          outcome: 'MAPPED',
        },
      ],
    };
    // outcome MAPPED with no node ids and no rejection is incoherent.
    expect(SemanticNodeMappingReportSchema.safeParse(bad).success).toBe(false);
  });
});

describe('SemanticExpansionTraceSchema', () => {
  it('accepts the DISABLED trace (no semantic provider)', () => {
    const trace = {
      status: 'DISABLED',
      rounds: [],
      totalSemanticResults: 0,
      totalMappedNodes: 0,
      totalUnresolved: 0,
      totalRejected: 0,
      semanticNodeBoundReached: false,
      totalResultsBoundReached: false,
      providerTruncated: false,
    };
    expect(SemanticExpansionTraceSchema.safeParse(trace).success).toBe(true);
  });

  it('accepts a SUCCESS trace with ordered round records', () => {
    const trace = {
      status: 'SUCCESS',
      rounds: [
        {
          round: 1,
          query: 'n-1 n-2',
          queryHash: HASH,
          requestedLimit: 20,
          retrievedCount: 2,
          truncated: false,
          admittedNodeIds: [N1, N2],
          mappedCount: 2,
          unresolvedCount: 0,
          rejectedCount: 0,
        },
      ],
      totalSemanticResults: 2,
      totalMappedNodes: 2,
      totalUnresolved: 0,
      totalRejected: 0,
      semanticNodeBoundReached: false,
      totalResultsBoundReached: false,
      providerTruncated: false,
    };
    const parsed = SemanticExpansionTraceSchema.safeParse(trace);
    expect(parsed.success).toBe(true);
  });

  it('accepts a LIMITED trace carrying an explicit provider truncation', () => {
    const trace = {
      status: 'LIMITED',
      rounds: [
        {
          round: 1,
          query: 'n-1',
          queryHash: HASH,
          requestedLimit: 20,
          retrievedCount: 20,
          truncated: true,
          admittedNodeIds: [N1, N2],
          mappedCount: 2,
          unresolvedCount: 0,
          rejectedCount: 0,
        },
      ],
      totalSemanticResults: 20,
      totalMappedNodes: 2,
      totalUnresolved: 0,
      totalRejected: 0,
      semanticNodeBoundReached: false,
      totalResultsBoundReached: false,
      providerTruncated: true,
    };
    expect(SemanticExpansionTraceSchema.safeParse(trace).success).toBe(true);
  });

  it('rejects a trace missing the query hash', () => {
    const trace = {
      status: 'SUCCESS',
      rounds: [
        {
          round: 1,
          query: 'n-1',
          requestedLimit: 20,
          retrievedCount: 1,
          truncated: false,
          admittedNodeIds: [N1],
          mappedCount: 1,
          unresolvedCount: 0,
          rejectedCount: 0,
        },
      ],
      totalSemanticResults: 1,
      totalMappedNodes: 1,
      totalUnresolved: 0,
      totalRejected: 0,
      semanticNodeBoundReached: false,
      totalResultsBoundReached: false,
      providerTruncated: false,
    };
    expect(SemanticExpansionTraceSchema.safeParse(trace).success).toBe(false);
  });
});