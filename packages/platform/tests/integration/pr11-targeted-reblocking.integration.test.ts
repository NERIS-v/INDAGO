// ============================================================================
// Phase 5A-PR11 — Targeted Reblocking persistence integration (REAL Postgres).
//
// Purpose: prove the targeted-reblock boundary end-to-end against real
// Postgres exactly as the PR11 ownership decision documents it:
//
//   - Persisted PR6 region is the ONLY admissible membership source.
//   - M-A08 blocking is reused (via the pure core) for the bounded region
//     universe, never a case-wide rerun.
//   - The bounded pair set is handed to M-A09, which proposes hypotheses via
//     the lifecycle-preserving upsert (PROPOSED at most).
//   - The run record is idempotent (identical re-run converges to one row).
//   - REGION_NOT_PERSISTED rejects unpersisted regions.
//
// REQUIRES TEST_DATABASE_URL/schema; suite skips cleanly when unset.
// ============================================================================

import { describe, expect, beforeAll, afterAll, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { RegionIdentityV1, TemporalInterval } from '@indago/contracts';
import { buildRegionIdentity, hashRegionIdentity } from '@indago/graph-hole-region';
import { RESOLUTION_PROPOSAL_THRESHOLD } from '@indago/entity-resolution';
import { TargetedReblockError } from '@indago/targeted-reblocking';
import {
  GraphHoleRegionAnalysisStore,
  type RegionAnalysisRecord,
} from '../../src/persistence/graph-hole-region-analysis-store.js';
import { runTargetedReblockForRegion } from '../../src/services/targeted-reblocking.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// ----------------------------------------------------------------------------
// Fixture builders
// ----------------------------------------------------------------------------

function temporalInterval(
  start: string,
  end: string,
): {
  validFrom: { value: string; precision: 'day' };
  validTo: { value: string; precision: 'day' };
  precision: 'day';
  semantics: 'inferred';
} {
  return {
    validFrom: { value: start, precision: 'day' },
    validTo: { value: end, precision: 'day' },
    precision: 'day',
    semantics: 'inferred',
  };
}

function makeRegionIdentity(params: {
  caseId: string;
  graphVersionId: string;
  seedObservationIds: readonly string[];
  nodeIds: readonly string[];
  temporalContext?: TemporalInterval;
}): { identity: RegionIdentityV1; regionId: string } {
  const identity = buildRegionIdentity({
    caseId: params.caseId,
    graphVersionId: params.graphVersionId,
    nodeIds: [...params.nodeIds].sort(),
    edgeIds: [],
    seedObservationIds: [...params.seedObservationIds].sort(),
    ...(params.temporalContext ? { temporalContext: params.temporalContext } : {}),
  });
  return { identity: identity as unknown as RegionIdentityV1, regionId: hashRegionIdentity(identity as never) };
}

// ----------------------------------------------------------------------------
// Suite
// ----------------------------------------------------------------------------

describe.skipIf(!TEST_DATABASE_URL)(
  'PR11 Targeted Reblocking integration (real Postgres)',
  () => {
    let prisma: PrismaClient;
    let regionStore: GraphHoleRegionAnalysisStore;

    const caseId = randomUUID();
    const otherCaseId = randomUUID();
    const investigationId = randomUUID();
    const graphVersionId = randomUUID();
    const nodeA = randomUUID();
    const nodeB = randomUUID();
    const nodeIds = [nodeA, nodeB];

    const seedObsId = randomUUID();
    const obsAId = randomUUID();
    const obsBId = randomUUID();
    const sourceId = randomUUID();
    const artifactId = randomUUID();

    function provenance() {
      return {
        sourceId,
        artifactId,
        extractor: 'pr11-integration-test',
        extractionMethod: 'fixture',
      };
    }

    async function seedEvidenceAndObservations() {
      await prisma.source.create({
        data: {
          id: sourceId,
          caseId,
          investigationId,
          catalog: 'MANUAL',
          declaredCatalog: 'MANUAL',
          name: 'PR11 fixture source',
        },
      });
      await prisma.evidence.create({
        data: {
          id: randomUUID(),
          investigationId,
          caseId,
          operationId: randomUUID(),
          sourceId,
          sourceName: 'PR11 fixture source',
          evidenceType: 'NARRATIVE',
          title: 'PR11 fixture evidence',
          artifactId,
        },
      });

      const evidenceId = (
        await prisma.evidence.findFirst({ where: { investigationId, caseId } })
      )!.id;

      const rowFor = (id: string, entityIds: string[], observedOn: string) => ({
        id,
        identityKey: `pr11:${id}`,
        evidenceId,
        sourceId,
        investigationId,
        caseId,
        type: 'EVENT_OCCURRENCE',
        content: 'PR11 fixture observation',
        strength: 0.5,
        candidateMentions: [],
        provenance: provenance(),
        eventTime: { value: observedOn, precision: 'day' as const },
        entityIds,
        createdAt: new Date(),
      });

      // obsA / obsB touch region nodes (node observation membership). The seed
      // observation does not touch a node but is an explicit region seed.
      await prisma.observation.createMany({
        data: [
          rowFor(seedObsId, [], '2023-01-01T00:00:00.000Z'),
          rowFor(obsAId, [nodeA], '2023-02-15T00:00:00.000Z'),
          rowFor(obsBId, [nodeB], '2023-03-15T00:00:00.000Z'),
        ],
      });
    }

    async function seedCandidates() {
      // Two PERSON candidates with an identical canonical name ("Rahul Sharma")
      // in DIFFERENT observations → Pass-3 NAME_INITIAL_BLOCK groups them and
      // M-A09 compares them as an EXACT_MATCH name pair → PROPOSED.
      const candidates = [obsAId, obsBId].map((observationId, i) => ({
        id: randomUUID(),
        identityKey: `pr11:candidate:${i}`,
        observationId,
        investigationId,
        caseId,
        text: 'Rahul Sharma',
        start: 0,
        end: 12,
        entityType: 'PERSON',
        extractionMethod: 'HEURISTIC',
        canonicalMatchValue: 'rahul sharma',
        provenance: provenance(),
      }));
      await prisma.entityMentionCandidate.createMany({ data: candidates });
      return candidates.map((c) => c.id);
    }

    async function persistRegionFixture(nodes: readonly string[] = nodeIds) {
      const { identity, regionId } = makeRegionIdentity({
        caseId,
        graphVersionId,
        seedObservationIds: [seedObsId],
        nodeIds: nodes,
        temporalContext: temporalInterval(
          '2023-01-01T00:00:00.000Z',
          '2023-06-01T00:00:00.000Z',
        ),
      });
      const region = {
        regionId,
        graphVersionId,
        identity,
        status: 'SATURATED',
        truncated: false,
        limitations: [],
        maxExpansionRounds: 2,
        maxRegionNodes: 500,
        maxRegionEdges: 500,
        maxContextObservations: 500,
        expansionRounds: 1,
        seedObservationIds: [seedObsId],
        resolvedSeedNodeIds: [...nodes].slice(0, 1),
        unresolvedSeedEntityIds: [],
        seedEdgeIds: [],
        nodeIds: nodes,
        edgeIds: [],
        roundRecords: [],
        saturation: { saturated: true, consecutiveSatisfyingRounds: 1 },
        semanticExpansion: {
          status: 'DISABLED',
          rounds: 0,
          totalSemanticResults: 0,
          totalMappedNodes: 0,
          totalUnresolved: 0,
          totalRejected: 0,
          semanticNodeBoundReached: false,
          totalResultsBoundReached: false,
          providerTruncated: false,
        },
        temporalContext: identity.temporalContext,
      };
      await regionStore.persistRegionAnalysis({ caseId, investigationId, region: region as never });
      return { regionId, record: region as never };
    }

    beforeAll(async () => {
      prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL! } } });
      regionStore = new GraphHoleRegionAnalysisStore(prisma);

      for (const csId of [caseId, otherCaseId]) {
        await prisma.temporalStateChange?.deleteMany({ where: { caseId: csId } });
        await prisma.entityHypothesis.deleteMany({ where: { caseId: csId } });
        await prisma.targetedReblockRun.deleteMany({ where: { caseId: csId } });
        await prisma.candidatePair.deleteMany({ where: { caseId: csId } });
        await prisma.entityMentionCandidate.deleteMany({ where: { caseId: csId } });
        await prisma.observation.deleteMany({ where: { caseId: csId } });
        await prisma.evidence.deleteMany({ where: { caseId: csId } });
        await prisma.source.deleteMany({ where: { caseId: csId } });
        await prisma.graphHoleRegionAnalysis.deleteMany({ where: { caseId: csId } });
      }
    });

    afterAll(async () => {
      for (const csId of [caseId, otherCaseId]) {
        await prisma.entityHypothesis.deleteMany({ where: { caseId: csId } });
        await prisma.targetedReblockRun.deleteMany({ where: { caseId: csId } });
        await prisma.candidatePair.deleteMany({ where: { caseId: csId } });
        await prisma.entityMentionCandidate.deleteMany({ where: { caseId: csId } });
        await prisma.observation.deleteMany({ where: { caseId: csId } });
        await prisma.evidence.deleteMany({ where: { caseId: csId } });
        await prisma.source.deleteMany({ where: { caseId: csId } });
        await prisma.graphHoleRegionAnalysis.deleteMany({ where: { caseId: csId } });
      }
      await prisma.$disconnect();
    });

    it('rejects an unpersisted region with REGION_NOT_PERSISTED', async () => {
      let error: TargetedReblockError | null = null;
      try {
        await runTargetedReblockForRegion({
          caseId,
          investigationId,
          graphVersionId,
          regionId: '0'.repeat(64),
          regionPolicyVersion: 'v1',
        });
      } catch (e) {
        error = e as TargetedReblockError;
      }
      expect(error).toBeInstanceOf(TargetedReblockError);
      expect(error!.code).toBe('REGION_NOT_PERSISTED');
    });

    it('runs a targeted reblock for a persisted region with full durability', async () => {
      const { regionId } = await persistRegionFixture();
      await seedEvidenceAndObservations();
      await seedCandidates();

      const output = await runTargetedReblockForRegion({
        caseId,
        investigationId,
        graphVersionId,
        regionId,
        regionPolicyVersion: 'v1',
      });

      const record = output.record;
      expect(record.runId).toMatch(/^[a-f0-9]{64}$/);
      expect(record.caseId).toBe(caseId);
      expect(record.graphVersionId).toBe(graphVersionId);
      expect(record.regionId).toBe(regionId);
      expect(record.policyVersion).toBe('v1');
      expect(record.counts.pairDraftCount).toBeGreaterThan(0);
      expect(record.counts.pairCreatedCount).toBe(record.counts.pairDraftCount);
      expect(record.counts.pairReusedCount).toBe(0);
      expect(record.counts.resolverHandoffCount).toBe(record.counts.pairDraftCount);
      // Two identical-name PERSON candidates in distinct observations resolve
      // to an EXACT_MATCH proposal — exactly one fresh proposal expected.
      expect(record.counts.resolverProposedCount).toBe(1);
      expect(record.accounting.membershipRule).toBe('REGION_OBSERVATION_MEMBERSHIP_V1');
      expect(record.accounting.candidateUniverseProcessed).toBe(2);
      expect(record.truncated).toBe(false);

      const durable = await prisma.targetedReblockRun.findUnique({
        where: { runId: record.runId },
      });
      expect(durable).not.toBeNull();
      expect(durable!.identityKey).toBe(record.identityKey);

      const pairs = await prisma.candidatePair.findMany({ where: { caseId } });
      expect(pairs.length).toBe(record.counts.pairDraftCount);

      const hypotheses = await prisma.entityHypothesis.findMany({ where: { caseId } });
      expect(hypotheses).toHaveLength(1);
      expect(hypotheses[0]!.status).toBe('PROPOSED');
      expect(hypotheses[0]!.score).toBeGreaterThanOrEqual(RESOLUTION_PROPOSAL_THRESHOLD);
    });

    it('identical re-run converges to the same run identity (idempotent)', async () => {
      const region = await persistRegionFixture();
      const first = await runTargetedReblockForRegion({
        caseId,
        investigationId,
        graphVersionId,
        regionId: region.regionId,
        regionPolicyVersion: 'v1',
      });
      const second = await runTargetedReblockForRegion({
        caseId,
        investigationId,
        graphVersionId,
        regionId: region.regionId,
        regionPolicyVersion: 'v1',
      });

      expect(second.record.runId).toBe(first.record.runId);
      expect(second.record.identityKey).toBe(first.record.identityKey);
      // No duplicate durable hypothesis from the re-run (lifecycle-preserving).
      const pairRows = await prisma.candidatePair.findMany({ where: { caseId } });
      const hypotheses = await prisma.entityHypothesis.findMany({ where: { caseId } });
      const pairIdSet = new Set(pairRows.map((p) => p.id));
      const matching = hypotheses.filter((h) => pairIdSet.has(h.candidatePairId));
      expect(matching).toHaveLength(1);
      // Only one durable run row for the identical identity.
      const runs = await prisma.targetedReblockRun.count({ where: { caseId } });
      expect(runs).toBe(1);
    });

    it('a region with a narrower node set scopes membership (isolation of region scope)', async () => {
      // Same case + candidates, but a region that only touches nodeA: the
      // member observation set differs, so the run identity differs and only
      // obsA's candidate enters the universe → no pairs, no proposals.
      const { regionId: narrowRegionId } = await persistRegionFixture([
        nodeA,
      ]);
      const output = await runTargetedReblockForRegion({
        caseId,
        investigationId,
        graphVersionId,
        regionId: narrowRegionId,
        regionPolicyVersion: 'v1',
      });

      expect(output.record.regionId).toBe(narrowRegionId);
      expect(output.record.accounting.regionObservationCount).toBe(2); // seed + nodeA obs
      expect(output.record.accounting.candidateUniverseEligible).toBe(1);
      expect(output.record.accounting.candidateUniverseProcessed).toBe(1);
      expect(output.record.counts.pairDraftCount).toBe(0);
      expect(output.record.counts.resolverProposedCount).toBe(0);
      expect(output.record.truncated).toBe(false);
    });
  },
);