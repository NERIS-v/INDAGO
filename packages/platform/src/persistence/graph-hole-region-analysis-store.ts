// ============================================================================
// GraphHoleRegionAnalysisStore (Phase 5A-PR6)
//
// Single authoritative persistence boundary for region-analysis results.
// Responsibility: make region analysis durable so equivalent analysis is not
// repeated and so reassessment/history stays traceable and policy/version
// aware.
//
// The store NEVER builds regions and NEVER derives identity: it receives an
// already-derived GraphHoleRegion (@indago/graph-hole-region) and persists it.
// Identity is recomputed server-side ONLY to verify the supplied regionId
// (security: no client-supplied digest is trusted blindly).
//
// Idempotency: the row is guarded by identityKey @unique plus the composite
// @@unique([regionId, caseId, graphVersionId, regionPolicyVersion]); writes go
// through createMany({ skipDuplicates: true }) inside an interactive
// transaction, so the DB constraint — never SELECT-then-INSERT — is the
// duplicate-prevention mechanism.
//
// Boundedness: only the bounded region facts (seed/node/edge id sets, status,
// truncation flag, temporal context, small summary) are persisted — never the
// graph payload the analysis ran over (the canonical identity already
// content-addresses the full context).
// ============================================================================

import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import {
  canonicalizeRegionIdentity,
  type RegionIdentityV1,
} from '@indago/contracts';
import type { GraphHoleRegion } from '@indago/graph-hole-region';
import { hashRegionIdentity } from '@indago/graph-hole-region';
import { db } from '../db/prisma.js';
import { GraphHoleStoreError } from './graph-hole-errors.js';

/** Bounded, intentionally small persisted summary — never a graph payload. */
export interface RegionAnalysisSummary {
  readonly expansionRounds: number;
  readonly finalNodeCount: number;
  readonly finalEdgeCount: number;
  readonly finalSeedObservationCount: number;
  readonly limitationCodes: readonly string[];
  readonly semanticExpansionStatus: string;
}

export interface RegionAnalysisRecord {
  readonly id: string;
  readonly identityKey: string;
  readonly regionId: string;
  readonly caseId: string;
  readonly investigationId: string | null;
  readonly graphVersionId: string;
  readonly regionPolicyVersion: string;
  readonly semanticRetrievalPolicyVersion: string;
  readonly status: string;
  readonly truncated: boolean;
  readonly seedObservationIds: readonly string[];
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly temporalContext: unknown;
  readonly summary: RegionAnalysisSummary | null;
  readonly analyzedAt: Date;
}

export interface PersistRegionAnalysisInput {
  readonly caseId: string;
  readonly investigationId?: string;
  readonly region: GraphHoleRegion;
}

type RegionAnalysisRow = NonNullable<
  Awaited<ReturnType<PrismaClient['graphHoleRegionAnalysis']['findFirst']>>
>;

function toRecord(row: RegionAnalysisRow): RegionAnalysisRecord {
  return {
    id: row.id,
    identityKey: row.identityKey,
    regionId: row.regionId,
    caseId: row.caseId,
    investigationId: row.investigationId,
    graphVersionId: row.graphVersionId,
    regionPolicyVersion: row.regionPolicyVersion,
    semanticRetrievalPolicyVersion: row.semanticRetrievalPolicyVersion,
    status: row.status,
    truncated: row.truncated,
    seedObservationIds: row.seedObservationIds as unknown as readonly string[],
    nodeIds: row.nodeIds as unknown as readonly string[],
    edgeIds: row.edgeIds as unknown as readonly string[],
    temporalContext: row.temporalContext,
    summary: row.summary as unknown as RegionAnalysisSummary | null,
    analyzedAt: row.analyzedAt,
  };
}

function buildSummary(region: GraphHoleRegion): RegionAnalysisSummary {
  return {
    expansionRounds: region.expansionRounds,
    finalNodeCount: region.nodeIds.length,
    finalEdgeCount: region.edgeIds.length,
    finalSeedObservationCount: region.seedObservationIds.length,
    limitationCodes: [...region.limitations],
    semanticExpansionStatus: region.semanticExpansion.status,
  };
}

export class GraphHoleRegionAnalysisStore {
  constructor(private readonly prisma: PrismaClient = db) {}

  async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(fn, { maxWait: 30_000, timeout: 60_000 });
  }

  /** The canonical persisted identity string for a region identity. */
  regionIdentityKey(identity: RegionIdentityV1): string {
    return canonicalizeRegionIdentity(identity);
  }

  /**
   * Idempotent region-analysis persist. Repeated/concurrent invocation of the
   * same logical region converges to ONE authoritative record.
   */
  async persistRegionAnalysis(
    input: PersistRegionAnalysisInput,
  ): Promise<{ created: boolean; record: RegionAnalysisRecord }> {
    const { caseId, region } = input;
    if (region.identity.caseId !== caseId) {
      throw new GraphHoleStoreError(
        'AUTHORITY_MISMATCH',
        `Cannot persist region for case ${region.identity.caseId} under case ${caseId}`,
      );
    }
    const identityKey = this.regionIdentityKey(region.identity);
    const recomputedRegionId = hashRegionIdentity(region.identity);
    if (recomputedRegionId !== region.regionId) {
      throw new GraphHoleStoreError(
        'INVALID_IDENTITY',
        `regionId mismatch: supplied ${region.regionId}, recomputed ${recomputedRegionId}`,
      );
    }

    const data = {
      identityKey,
      regionId: region.regionId,
      caseId,
      investigationId: input.investigationId ?? null,
      graphVersionId: region.identity.graphVersionId,
      regionPolicyVersion: region.identity.regionPolicyVersion,
      semanticRetrievalPolicyVersion: region.identity.semanticRetrievalPolicyVersion,
      status: region.status,
      truncated: region.truncated,
      seedObservationIds: region.seedObservationIds as unknown as Prisma.InputJsonValue,
      nodeIds: region.nodeIds as unknown as Prisma.InputJsonValue,
      edgeIds: region.edgeIds as unknown as Prisma.InputJsonValue,
      temporalContext: region.identity.temporalContext ?? Prisma.JsonNull,
      summary: buildSummary(region) as unknown as Prisma.InputJsonValue,
    };

    return this.transaction(async (tx) => {
      const result = await tx.graphHoleRegionAnalysis.createMany({
        data,
        skipDuplicates: true,
      });
      const row = await tx.graphHoleRegionAnalysis.findFirst({
        where: { identityKey, caseId },
      });
      if (!row) {
        throw new GraphHoleStoreError(
          'NOT_FOUND',
          `Region analysis not found after persist (${identityKey})`,
        );
      }
      return { created: result.count > 0, record: toRecord(row) };
    });
  }

  /**
   * No-repeat lookup. A caller MUST consult this before launching an
   * equivalent analysis (same canonical identity, same graph version, same
   * policies). Returns an existing analysis record or null.
   */
  async findCompletedByRegionIdentity(input: {
    readonly caseId: string;
    readonly graphVersionId: string;
    readonly identity: RegionIdentityV1;
  }): Promise<RegionAnalysisRecord | null> {
    if (input.identity.caseId !== input.caseId) {
      throw new GraphHoleStoreError(
        'AUTHORITY_MISMATCH',
        `Region lookup scoped to ${input.caseId} but identity carries ${input.identity.caseId}`,
      );
    }
    const identityKey = this.regionIdentityKey(input.identity);
    const row = await this.prisma.graphHoleRegionAnalysis.findFirst({
      where: {
        caseId: input.caseId,
        graphVersionId: input.graphVersionId,
        identityKey,
      },
    });
    return row ? toRecord(row) : null;
  }

  /**
   * Equivalent-analysis lookup by the persisted composite identity
   * (regionId + graphVersionId + policy versions), matching the PR6
   * "equivalent = persisted identity" definition.
   */
  async findCompletedByRegionId(input: {
    readonly caseId: string;
    readonly graphVersionId: string;
    readonly regionId: string;
    readonly regionPolicyVersion: string;
    readonly semanticRetrievalPolicyVersion: string;
  }): Promise<RegionAnalysisRecord | null> {
    const row = await this.prisma.graphHoleRegionAnalysis.findFirst({
      where: {
        caseId: input.caseId,
        graphVersionId: input.graphVersionId,
        regionId: input.regionId,
        regionPolicyVersion: input.regionPolicyVersion,
        semanticRetrievalPolicyVersion: input.semanticRetrievalPolicyVersion,
      },
    });
    return row ? toRecord(row) : null;
  }

  /**
   * Equivalent-analysis lookup by the persisted composite identity WITHOUT a
   * semantic-retrieval filter. PR11 region references carry only the graph-hole
   * policy version, so this lookup is keyed on the @@unique composite identity
   * [regionId, caseId, graphVersionId, regionPolicyVersion] — the same durable
   * identity PR6 guarantees never repeats.
   */
  async findCompletedByRegionIdAndPolicy(input: {
    readonly caseId: string;
    readonly graphVersionId: string;
    readonly regionId: string;
    readonly regionPolicyVersion: string;
  }): Promise<RegionAnalysisRecord | null> {
    const row = await this.prisma.graphHoleRegionAnalysis.findFirst({
      where: {
        caseId: input.caseId,
        graphVersionId: input.graphVersionId,
        regionId: input.regionId,
        regionPolicyVersion: input.regionPolicyVersion,
      },
    });
    return row ? toRecord(row) : null;
  }

  /**
   * Bounded, case-scoped region listing for PR12 impacted-region resolution:
   * the LATEST analysis record per DISTINCT regionId (a regionId is content-
   * addressed, so one row per (regionId, graphVersionId, policies) — newest
   * analyzedAt wins). Deterministic order: analyzedAt asc. Never a case-wide
   * scan — hard `take` bound, and consumers immediately filter by the resolved
   * affected region set.
   */
  async listLatestRegionsByCase(
    caseId: string,
    options: { limit: number },
  ): Promise<readonly RegionAnalysisRecord[]> {
    const rows = await this.prisma.graphHoleRegionAnalysis.findMany({
      where: { caseId },
      orderBy: [{ analyzedAt: 'asc' }, { id: 'asc' }],
      take: options.limit,
    });
    const latestById = new Map<string, RegionAnalysisRecord>();
    for (const row of rows) latestById.set(row.regionId, toRecord(row));
    return [...latestById.values()].sort((a, b) =>
      a.regionId < b.regionId ? -1 : a.regionId > b.regionId ? 1 : 0,
    );
  }
}

/** Convenience singleton bound to the platform Prisma client. */
export const graphHoleRegionAnalysisStore = new GraphHoleRegionAnalysisStore();