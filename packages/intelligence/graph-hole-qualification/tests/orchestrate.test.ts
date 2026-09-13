import { describe, expect, it } from 'vitest';
import { qualifyAndRankGraphHoleCandidates } from '../src/orchestrate.js';
import type { QualificationInput } from '../src/types.js';
import {
  CASE_ID,
  VERSION_ID,
  mkCandidate,
  mkEdge,
  mkHypothesisContext,
  mkAtomic,
  mkNode,
  mkObservation,
  mkRegion,
  qualifyingScenario,
} from './helpers.js';

describe('qualifyAndRankGraphHoleCandidates', () => {
  it('qualifies a single well-formed candidate and reports balanced accounting', () => {
    const input = qualifyingScenario();
    const result = qualifyAndRankGraphHoleCandidates(input);

    expect(result.caseId).toBe(input.caseId);
    expect(result.graphVersionId).toBe(input.graphVersionId);
    expect(result.candidates).toHaveLength(1);
    expect(result.qualifiedCandidates).toHaveLength(1);
    expect(result.rejectedCandidates).toHaveLength(0);

    const candidate = result.qualifiedCandidates[0]!;
    expect(candidate.qualified).toBe(true);
    expect(candidate.failureReasons).toEqual([]);
    expect(candidate.structuralScore).toBeGreaterThanOrEqual(0);
    expect(candidate.structuralScore).toBeLessThanOrEqual(1);
    expect(candidate.rankingKey).toBeTruthy();
    expect(candidate.regionStatus).toBe('SATURATED');

    expect(result.accounting.totalInputCandidates).toBe(1);
    expect(result.accounting.qualifiedCount).toBe(1);
    expect(result.accounting.rejectedCount).toBe(0);
    expect(result.accounting.qualifiedCount + result.accounting.rejectedCount).toBe(result.accounting.totalInputCandidates);
    expect(result.accounting.truncationRejections).toBe(0);
    expect(result.accounting.deduplicationRejections).toBe(0);
  });

  it('produces byte-identical output when candidates are presented in shuffled order', () => {
    const N1 = 'NA';
    const N2 = 'NB';
    const N3 = 'NC';
    const N4 = 'ND';
    const O1 = 'OA1';
    const O2 = 'OA2';
    const edges = [mkEdge('EA1', N3, N1), mkEdge('EA2', N3, N2), mkEdge('EA3', N4, N1), mkEdge('EA4', N4, N2)];
    const candidates = [
      mkCandidate({ candidateId: 'C1', nodeIds: [N1, N2], observedEdgeIds: edges.map(e=>e.id), supportingObservationIds: [O1, O2] }),
      mkCandidate({ candidateId: 'C2', nodeIds: [N3, N4], observedEdgeIds: edges.map(e=>e.id), supportingObservationIds: [O1, O2] }),
    ];
    const region = mkRegion({
      nodeIds: [N1, N2, N3, N4],
      edgeIds: edges.map(e=>e.id),
    });
    const hypothesisContext = mkHypothesisContext([
      mkAtomic('A1', N1, { referencedCanonicalEntityIds: [N1, N2] }),
      mkAtomic('A2', N2, { referencedCanonicalEntityIds: [N1, N2] }),
    ]);
    const observations = [mkObservation(O1), mkObservation(O2)];

    const baseInput: QualificationInput = {
      caseId: CASE_ID,
      graphVersionId: VERSION_ID,
      region,
      nodes: [],
      edges,
      hypothesisContext,
      candidates,
      observations,
    };
    const baseResult = qualifyAndRankGraphHoleCandidates(baseInput);

    const shuffledInput: QualificationInput = { ...baseInput, candidates: [...candidates].reverse() };
    const shuffledResult = qualifyAndRankGraphHoleCandidates(shuffledInput);

    expect(JSON.stringify(baseResult)).toBe(JSON.stringify(shuffledResult));
  });

  it('marks duplicate candidateIds, counting all but the first as DUPLICATE', () => {
    const input = qualifyingScenario();
    const duplicateCandidate = mkCandidate({
      candidateId: input.candidates[0]!.candidateId,
    });
    const dupeInput: QualificationInput = {
      ...input,
      candidates: [input.candidates[0]!, duplicateCandidate],
    };
    const result = qualifyAndRankGraphHoleCandidates(dupeInput);

    expect(result.candidates).toHaveLength(2);
    expect(result.qualifiedCandidates).toHaveLength(1);
    expect(result.rejectedCandidates).toHaveLength(1);
    expect(result.rejectedCandidates[0]!.failureReasons).toContain('DUPLICATE');
    expect(result.accounting.deduplicationRejections).toBe(1);
    expect(result.accounting.qualifiedCount + result.accounting.rejectedCount).toBe(2);
  });

  it('rejects all candidates when region is truncated', () => {
    const input = qualifyingScenario({ regions: mkRegion({ truncated: true }) });
    const result = qualifyAndRankGraphHoleCandidates(input);
    expect(result.qualifiedCandidates).toHaveLength(0);
    expect(result.rejectedCandidates).toHaveLength(1);
    expect(result.rejectedCandidates[0]!.failureReasons).toContain('REGION_TRUNCATED');
    expect(result.accounting.truncationRejections).toBe(1);
  });

  it('rejects all candidates when region is not SATURATED', () => {
    const input = qualifyingScenario({ regions: mkRegion({ status: 'LIMITED' }) });
    const result = qualifyAndRankGraphHoleCandidates(input);
    expect(result.qualifiedCandidates).toHaveLength(0);
    expect(result.rejectedCandidates[0]!.failureReasons).toContain('REGION_NOT_SATURATED');
  });

  it('preserves ALL candidates (qualified + rejected) in the candidates array', () => {
    const input = qualifyingScenario();
    const duplicateCandidate = mkCandidate({
      candidateId: input.candidates[0]!.candidateId,
    });
    const dupeInput: QualificationInput = {
      ...input,
      candidates: [input.candidates[0]!, duplicateCandidate],
    };
    const result = qualifyAndRankGraphHoleCandidates(dupeInput);
    expect(result.candidates.length).toBe(result.qualifiedCandidates.length + result.rejectedCandidates.length);
  });

  it('qualifiedCandidates are in ascending rankingKey order', () => {
    const N1 = 'NA';
    const N2 = 'NB';
    const N3 = 'NC';
    const N4 = 'ND';
    const O1 = 'OA1';
    const O2 = 'OA2';
    const edges = [mkEdge('EA1', N3, N1), mkEdge('EA2', N3, N2), mkEdge('EA3', N4, N1), mkEdge('EA4', N4, N2)];
    const candidate1 = mkCandidate({ candidateId: 'C1', nodeIds: [N1, N2], observedEdgeIds: edges.map(e=>e.id), supportingObservationIds: [O1, O2] });
    const candidate2 = mkCandidate({ candidateId: 'C2', nodeIds: [N1, N2], observedEdgeIds: edges.map(e=>e.id), supportingObservationIds: [O1, O2] });
    const region = mkRegion({ nodeIds: [N1, N2, N3, N4], edgeIds: edges.map(e=>e.id) });
    const hypothesisContext = mkHypothesisContext([
      mkAtomic('A1', N1, { referencedCanonicalEntityIds: [N1, N2] }),
      mkAtomic('A2', N2, { referencedCanonicalEntityIds: [N1, N2] }),
    ]);
    const input: QualificationInput = {
      caseId: CASE_ID,
      graphVersionId: VERSION_ID,
      region,
      nodes: [],
      edges,
      hypothesisContext,
      candidates: [candidate1, candidate2],
      observations: [mkObservation(O1), mkObservation(O2)],
    };
    const result = qualifyAndRankGraphHoleCandidates(input);
    for (let i = 1; i < result.qualifiedCandidates.length; i++) {
      const prev = result.qualifiedCandidates[i - 1]!.rankingKey;
      const curr = result.qualifiedCandidates[i]!.rankingKey;
      expect(prev <= curr).toBe(true);
    }
  });

  it('idempotent: same input twice yields identical JSON output', () => {
    const input = qualifyingScenario();
    const result1 = qualifyAndRankGraphHoleCandidates(input);
    const result2 = qualifyAndRankGraphHoleCandidates(input);
    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });
});