// Phase 5A-PR6 — candidate identity persistence contract.
//
// PR6 persists GraphHole candidates keyed by deterministic identity
// (candidateId = SHA-256 of the canonical candidate identity). The platform
// store recomputes the identity server-side and REJECTS a mismatch. These
// tests pin the properties that recomputation depends on:
//
//   1. the store's derivation (identity rebuilt from a raw candidate) yields
//      EXACTLY the same candidateId the detector produced — for every
//      candidate of a real detection pass;
//   2. the package's own computeCandidateId agrees with the persisted
//      candidateId;
//   3. canonical node order NEVER matters (canonicalization sorts) — the
//      store persists sorted arrays and must hash to the same id;
//   4. digests are stable lowercase 64-char hex.

import { describe, expect, it } from 'vitest';
import { buildDetectionContext, detectGraphHoleCandidates } from '../src/index.js';
import {
  canonicalizeGraphHoleCandidateIdentity,
  type GraphHoleCandidateIdentityV1,
} from '@indago/contracts';
import { makeCandidateIdentity, computeCandidateId } from '../src/candidate.js';
import { sha256Hex } from '../src/sha256.js';
import {
  mkNode,
  mkEdge,
  mkRelationHypothesis,
  obs,
  baseInput,
  uuid,
} from './helpers.js';

function shuffled<T>(values: readonly T[]): T[] {
  return [...values].sort(() => (Math.random() > 0.5 ? 1 : -1));
}

// Mirror of the platform store's identity derivation (graph-hole-store.ts).
function storeDerivedIdentity(
  raw: {
    caseId: string;
    graphVersionId: string;
    detectorType: string;
    nodeIds: readonly string[];
    expectedRelationshipType: string | null;
    temporalScope: unknown;
    detectionPolicyVersion: string;
  },
): GraphHoleCandidateIdentityV1 {
  const identity: GraphHoleCandidateIdentityV1 = {
    caseId: raw.caseId,
    graphVersionId: raw.graphVersionId,
    holeType: raw.detectorType,
    canonicalNodeIds: [...raw.nodeIds],
    detectionPolicyVersion: raw.detectionPolicyVersion,
  };
  if (raw.expectedRelationshipType !== null) {
    identity.expectedRelationshipType = raw.expectedRelationshipType;
  }
  if (raw.temporalScope !== undefined) {
    identity.temporalScope = raw.temporalScope as never;
  }
  return identity;
}

function makeInput() {
  const N1 = uuid();
  const N2 = uuid();
  const N3 = uuid();
  const N4 = uuid();
  const O1 = uuid();
  const S1 = uuid();
  const H1 = uuid();
  const H2 = uuid();
  return baseInput({
    nodes: [mkNode(N1), mkNode(N2), mkNode(N3), mkNode(N4)],
    // N3-N4 is observed; N1 and N2 are isolated hypothesis leaves.
    edges: [mkEdge(uuid(), N3, N4)],
    observations: [obs(O1, S1)],
    relationHypotheses: [
      mkRelationHypothesis(H1, N1, N2, {
        relationType: 'communication',
        evidenceBasis: [O1],
      }),
      mkRelationHypothesis(H2, N3, N4, {
        relationType: 'communication',
        evidenceBasis: [O1],
      }),
    ],
  });
}

describe('PR6 persisted candidateId recomputation', () => {
  it('store derivation reproduces the detector candidateId for every candidate', () => {
    const { candidates } = detectGraphHoleCandidates(makeInput());
    expect(candidates.length).toBeGreaterThan(0);
    for (const raw of candidates) {
      const identity = storeDerivedIdentity(raw);
      const recomputed = sha256Hex(canonicalizeGraphHoleCandidateIdentity(identity));
      expect(recomputed).toBe(raw.candidateId);
    }
  });

  it('package computeCandidateId agrees with the persisted candidateId', () => {
    const input = makeInput();
    const { candidates } = detectGraphHoleCandidates(input);
    expect(candidates.length).toBeGreaterThan(0);
    const context = buildDetectionContext(input);
    for (const raw of candidates) {
      const candidate = {
        nodeIds: raw.nodeIds,
        detectorType: raw.detectorType,
        expectedRelationshipType: raw.expectedRelationshipType,
        temporalScope: raw.temporalScope ?? null,
        observedEdgeIds: raw.observedEdgeIds,
        supportingHypothesisIds: raw.supportingHypothesisIds,
        supportingObservationIds: raw.supportingObservationIds,
        contradictingObservationIds: raw.contradictingObservationIds,
        structuralBasis: raw.structuralBasis,
      };
      expect(makeCandidateIdentity(context, candidate)).toEqual(storeDerivedIdentity(raw));
      expect(computeCandidateId(context, candidate)).toBe(raw.candidateId);
    }
  });

  it('node ordering never changes the persisted candidateId', () => {
    const { candidates } = detectGraphHoleCandidates(makeInput());
    const raw = candidates.find((c) => c.nodeIds.length > 1);
    expect(raw).toBeDefined();
    const original = raw!.candidateId;
    const shuffledIdentity = storeDerivedIdentity({
      ...raw!,
      nodeIds: shuffled(raw!.nodeIds),
    });
    expect(sha256Hex(canonicalizeGraphHoleCandidateIdentity(shuffledIdentity))).toBe(original);
  });

  it('digests are stable lowercase 64-char hex', () => {
    const { candidates } = detectGraphHoleCandidates(makeInput());
    expect(candidates.length).toBeGreaterThan(0);
    for (const raw of candidates) {
      expect(raw.candidateId).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe('PR6 scoring metadata is NOT part of candidate identity', () => {
  it('the persisted candidateId is determined only by the frozen identity fields', () => {
    const { candidates } = detectGraphHoleCandidates(makeInput());
    const raw = candidates[0];
    // The identity derivation NEVER reads scoring/qualification fields — the
    // store hashes the frozen identity object only. That is what makes
    // re-scoring the same candidate a reassessment, not a new GraphHole.
    const identity = storeDerivedIdentity(raw);
    const a = sha256Hex(canonicalizeGraphHoleCandidateIdentity(identity));
    expect(a).toBe(raw.candidateId);
    // Deterministic: same correct candidate twice produces the same id.
    expect(a).toBe(sha256Hex(canonicalizeGraphHoleCandidateIdentity(identity)));
  });
});