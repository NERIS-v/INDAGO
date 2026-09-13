import { describe, expect, it } from 'vitest';
import {
  evaluateQualificationGates,
  candidateInRegionScope,
  isResolvedCandidate,
} from '../src/qualify.js';
import { mkCandidate, mkEdge, mkRegion, mkObservation } from './helpers.js';
import type { RawGraphHoleCandidate } from '@indago/contracts';
import type { GraphHoleRegion } from '@indago/graph-hole-region';
import { resolveIndependentSupportUnits } from '../src/support-units.js';
import {
  deriveStructuralComponents,
  deriveEvidenceSupportScore,
  deriveExpectedInformationValue,
  deriveSignificance,
} from '../src/scoring.js';
import { temporalGateIsValid } from '../src/temporal.js';
import type { ScoringContext, SupportInput } from '../src/scoring.js';
import { mkHypothesisContext, mkAtomic, mkNode, CASE_ID, VERSION_ID } from './helpers.js';
import type { TemporalInterval } from '@indago/contracts';

const N1 = 'N1';
const N2 = 'N2';
const N3 = 'N3';
const N4 = 'N4';
const E31 = 'E31';
const E32 = 'E32';
const E41 = 'E41';
const E42 = 'E42';

function edgeOverrides(status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE'): Partial<import('@indago/contracts').GraphEdge> {
  return { status };
}

function fullScoreCtx(overrides?: {
  communityMap?: ReadonlyMap<string, string>;
  temporalContext?: TemporalInterval | null;
}): ScoringContext {
  return {
    region: mkRegion({
      nodeIds: [N1, N2, N3, N4],
      edgeIds: [E31, E32, E41, E42],
      temporalContext: overrides?.temporalContext,
    }),
    hypothesisContext: mkHypothesisContext([
      mkAtomic('A1', N1, { referencedCanonicalEntityIds: [N1, N2] }),
      mkAtomic('A2', N2, { referencedCanonicalEntityIds: [N1, N2] }),
    ]),
    observations: [
      mkObservation('O1', { sourceContextId: 'ctx-1', strength: 0.85 }),
      mkObservation('O2', { sourceContextId: 'ctx-2', strength: 0.75 }),
    ],
    neighborDegrees: new Map([[N1, 2], [N2, 2], [N3, 2], [N4, 2]]),
    communities: overrides?.communityMap ?? null,
  };
}

function defaultCandidate(): RawGraphHoleCandidate {
  return mkCandidate({
    nodeIds: [N1, N2],
    observedEdgeIds: [E31, E32, E41, E42],
    supportingObservationIds: ['O1', 'O2'],
  });
}

function gateParams(overrides: Partial<Parameters<typeof evaluateQualificationGates>[0]> = {}) {
  const candidate = overrides.candidate ?? defaultCandidate();
  const observations = [
    mkObservation('O1', { sourceContextId: 'ctx-1', strength: 0.85 }),
    mkObservation('O2', { sourceContextId: 'ctx-2', strength: 0.75 }),
  ];
  const support = resolveIndependentSupportUnits(candidate, observations);
  const supportResolvable = support.missingObservationIds.length === 0;
  const ctx = fullScoreCtx();
  const structural = deriveStructuralComponents(candidate, ctx);
  const eiv = deriveEvidenceSupportScore(candidate, { result: support });
  const eivInfo = deriveExpectedInformationValue(candidate, { result: support });
  const significance = deriveSignificance(structural.structuralScore, eiv.score, eivInfo.score);
  const temporalValid = temporalGateIsValid({
    candidate,
    region: mkRegion(),
    observations,
    hypothesisContext: mkHypothesisContext([]),
  });
  return {
    candidate,
    caseId: CASE_ID,
    graphVersionId: VERSION_ID,
    region: mkRegion(),
    supportResolvable,
    supportResult: support,
    structuralScore: structural.structuralScore,
    significance,
    temporalValid,
    isDuplicate: false,
    resolved: false,
    ...overrides,
  } as Parameters<typeof evaluateQualificationGates>[0];
}

describe('candidateInRegionScope', () => {
  it('returns true when all candidate nodes and observed edges are within region scope', () => {
    const region = mkRegion({ nodeIds: [N1, N2, N3, N4], edgeIds: [E31, E32, E41, E42] });
    expect(candidateInRegionScope(defaultCandidate(), region)).toBe(true);
  });

  it('returns false when a candidate node is outside the region', () => {
    const candidate = mkCandidate({ nodeIds: [N1, 'OUT'] });
    const region = mkRegion({ nodeIds: [N1, N2, N3, N4], edgeIds: [E31] });
    expect(candidateInRegionScope(candidate, region)).toBe(false);
  });

  it('returns false when a candidate observed edge is outside the region', () => {
    const candidate = mkCandidate({ observedEdgeIds: [E31, 'EDGE-OUT'] });
    const region = mkRegion({ nodeIds: [N1, N2, N3, N4], edgeIds: [E31] });
    expect(candidateInRegionScope(candidate, region)).toBe(false);
  });
});

describe('isResolvedCandidate', () => {
  it('resolves when a non-observed edge connects two candidate nodes with matching relation type', () => {
    const candidate = mkCandidate({
      nodeIds: [N1, N2],
      observedEdgeIds: ['E-obs-1'],
      expectedRelationshipType: 'communication',
    });
    const edges = [mkEdge('E-NEW', N1, N2, { relationType: 'communication' })];
    expect(isResolvedCandidate(candidate, edges)).toBe(true);
  });

  it('does not resolve when a non-observed edge does not match expected type', () => {
    const candidate = mkCandidate({
      nodeIds: [N1, N2],
      observedEdgeIds: ['E-obs-1'],
      expectedRelationshipType: 'communication',
    });
    const edges = [mkEdge('E-NEW', N1, N2, { relationType: 'employment' })];
    expect(isResolvedCandidate(candidate, edges)).toBe(false);
  });

  it('resolves when expectedRelationshipType is null and any non-observed edge connects', () => {
    const candidate = mkCandidate({
      nodeIds: [N1, N2],
      observedEdgeIds: ['E-obs-1'],
      expectedRelationshipType: null,
    });
    const edges = [mkEdge('E-NEW', N1, N2, { relationType: 'employment' })];
    expect(isResolvedCandidate(candidate, edges)).toBe(true);
  });

  it('does not resolve when the connecting edge is ARCHIVED', () => {
    const candidate = mkCandidate({
      nodeIds: [N1, N2],
      observedEdgeIds: ['E-obs-1'],
      expectedRelationshipType: null,
    });
    const edges = [mkEdge('E-NEW', N1, N2, { status: 'ARCHIVED' })];
    expect(isResolvedCandidate(candidate, edges)).toBe(false);
  });

  it('does not resolve when all connecting edges are in the observed set', () => {
    const candidate = mkCandidate({
      nodeIds: [N1, N2],
      observedEdgeIds: ['E-ONLY'],
      expectedRelationshipType: null,
    });
    const edges = [mkEdge('E-ONLY', N1, N2)];
    expect(isResolvedCandidate(candidate, edges)).toBe(false);
  });
});

describe('evaluateQualificationGates', () => {
  it('qualifies a well-formed candidate passing all gates', () => {
    const params = gateParams();
    const { qualified, reasons } = evaluateQualificationGates(params);
    expect(qualified).toBe(true);
    expect(reasons).toEqual([]);
  });

  it('rejects REGION_TRUNCATED when region.truncated is true', () => {
    const params = gateParams({ region: mkRegion({ truncated: true }) });
    const { qualified, reasons } = evaluateQualificationGates(params);
    expect(qualified).toBe(false);
    expect(reasons).toContain('REGION_TRUNCATED');
  });

  it('rejects REGION_NOT_SATURATED when region.status is not SATURATED', () => {
    const params = gateParams({ region: mkRegion({ status: 'LIMITED' }) });
    const { qualified, reasons } = evaluateQualificationGates(params);
    expect(qualified).toBe(false);
    expect(reasons).toContain('REGION_NOT_SATURATED');
  });

  it('rejects INSUFFICIENT_SUPPORT when support units below threshold', () => {
    const params = gateParams({
      supportResult: { keys: ['only-one'], missingObservationIds: [] },
      supportResolvable: true,
    });
    const { qualified, reasons } = evaluateQualificationGates(params);
    expect(qualified).toBe(false);
    expect(reasons).toContain('INSUFFICIENT_SUPPORT');
  });

  it('rejects LOW_STRUCTURAL_SCORE when below minimum', () => {
    const params = gateParams({ structuralScore: 0.50 });
    const { qualified, reasons } = evaluateQualificationGates(params);
    expect(qualified).toBe(false);
    expect(reasons).toContain('LOW_STRUCTURAL_SCORE');
  });

  it('rejects LOW_SIGNIFICANCE when below minimum', () => {
    const params = gateParams({ significance: 0.50 });
    const { qualified, reasons } = evaluateQualificationGates(params);
    expect(qualified).toBe(false);
    expect(reasons).toContain('LOW_SIGNIFICANCE');
  });

  it('rejects DUPLICATE when isDuplicate is true', () => {
    const params = gateParams({ isDuplicate: true });
    const { qualified, reasons } = evaluateQualificationGates(params);
    expect(qualified).toBe(false);
    expect(reasons).toContain('DUPLICATE');
  });

  it('rejects ALREADY_RESOLVED when resolved is true', () => {
    const params = gateParams({ resolved: true });
    const { qualified, reasons } = evaluateQualificationGates(params);
    expect(qualified).toBe(false);
    expect(reasons).toContain('ALREADY_RESOLVED');
  });

  it('rejects TEMPORAL_INCONSISTENCY when temporalValid is false', () => {
    const params = gateParams({ temporalValid: false });
    const { qualified, reasons } = evaluateQualificationGates(params);
    expect(qualified).toBe(false);
    expect(reasons).toContain('TEMPORAL_INCONSISTENCY');
  });

  it('rejects MISSING_AUTHORITY when candidate caseId mismatches', () => {
    const params = gateParams({ caseId: 'WRONG-CASE' });
    const { qualified, reasons } = evaluateQualificationGates(params);
    expect(qualified).toBe(false);
    expect(reasons).toContain('MISSING_AUTHORITY');
  });

  it('rejects MISSING_AUTHORITY when candidate graphVersionId mismatches', () => {
    const params = gateParams({ graphVersionId: 'WRONG-VERSION' });
    const { qualified, reasons } = evaluateQualificationGates(params);
    expect(qualified).toBe(false);
    expect(reasons).toContain('MISSING_AUTHORITY');
  });

  it('rejects MISSING_AUTHORITY when support observations are unresolvable', () => {
    const params = gateParams({ supportResolvable: false });
    const { qualified, reasons } = evaluateQualificationGates(params);
    expect(qualified).toBe(false);
    expect(reasons).toContain('MISSING_AUTHORITY');
  });

  it('accumulates all failing reasons sorted by enum order', () => {
    const params = gateParams({
      region: mkRegion({ truncated: true, status: 'LIMITED' }),
      structuralScore: 0.50,
      significance: 0.50,
    });
    const { qualified, reasons } = evaluateQualificationGates(params);
    expect(qualified).toBe(false);
    expect(reasons).toEqual(['REGION_TRUNCATED', 'REGION_NOT_SATURATED', 'LOW_STRUCTURAL_SCORE', 'LOW_SIGNIFICANCE']);
  });
});