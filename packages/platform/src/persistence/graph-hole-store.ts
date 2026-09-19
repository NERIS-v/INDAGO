// ============================================================================
// GraphHoleStore (Phase 5A-PR6)
//
// Single authoritative persistence + lifecycle owner for GraphHole
// intelligence findings.
//
//   Ownership:
//     - Producer: PR4/PR5 deterministic pipeline (persistence-free by design).
//     - Persistence & intelligence lifecycle: THIS store (states
//       ACTIVE / SUPERSEDED / REJECTED / RESOLVED).
//     - Human consequential state: owned by the Phase-4 Lead authority
//       (LeadEvent append-only). A persisted GraphHole is an INTELLIGENCE
//       FINDING, never a workflow object — there is NO second lifecycle.
//
//   Identity discipline (server-side recomputation, never blind trust):
//     - identityKey = canonical candidate identity STRING.
//     - candidateId  = SHA-256(canonicalizeGraphHoleCandidateIdentity()).
//     - The store REBUILDS the identity from the raw candidate and rejects a
//       mismatch (INVALID_IDENTITY) before writing.
//     - scoringPolicyVersion is persisted METADATA only; it is NOT part of
//       candidate identity (re-scoring the same candidate is a reassessment,
//       not a new GraphHole).
//
//   Idempotency (the DB constraint, never SELECT-then-INSERT):
//     - GraphHole guarded by identityKey @unique + @@unique([caseId, candidateId]).
//     - GraphHoleDetectorContribution guarded by its identityKey @unique and
//       @@unique([graphHoleId, detectorType, detectionPolicyVersion]).
//     - createMany({ skipDuplicates: true }) inside an interactive transaction
//       makes repeated/concurrent identical runs converge to ONE record.
//     - GraphHoleAssessment carries logicalKey @unique = candidateId:sha256(snapshot):
//       identical re-runs dedup; genuinely conflicting concurrent assessments
//       surface as P2002 and propagate (caller retries with a fresh sequence).
//
//   Supersession: the FIRST persist that reaches the DB demotes the prior
//   ACTIVE record of the same logical hole and writes a SUPERSESSION
//   assessment on it. A re-run of an already-persisted candidate records a
//   reassessment instead of demoting again (single-demotion invariant).
//
//   Case isolation: every read/write is scoped by caseId. No case-wide scans.
// ============================================================================

import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import {
  GRAPH_HOLE_POLICY_VERSION,
  GraphHoleAssessmentTypeSchema,
  canTransitionGraphHoleStatus,
  canonicalizeDeterministic,
  canonicalizeGraphHoleCandidateIdentity,
  type GraphHoleAssessmentType,
  type GraphHoleCandidateIdentityV1,
  type GraphHolePersistenceStatus,
  type QualifiedGraphHoleCandidate,
  type RawGraphHoleCandidate,
} from '@indago/contracts';
import { buildDetectorContributionIdentityKey } from '@indago/contracts';
import { sha256Hex } from '@indago/graph-hole-region';
import { db } from '../db/prisma.js';
import { GraphHoleStoreError } from './graph-hole-errors.js';

// ============================================================================
// Public record types (typed, JSON columns decoded)
// ============================================================================

export interface GraphHoleRecord {
  readonly id: string;
  readonly identityKey: string;
  readonly candidateId: string;
  readonly caseId: string;
  readonly investigationId: string | null;
  readonly graphVersionId: string;
  readonly regionId: string;
  readonly holeType: string;
  readonly canonicalNodeIds: readonly string[];
  readonly expectedRelationshipType: string | null;
  readonly temporalScope: unknown;
  readonly detectionPolicyVersion: string;
  readonly scoringPolicyVersion: string;
  readonly qualificationPolicyVersion: string;
  readonly status: GraphHolePersistenceStatus;
  readonly structuralScore: number;
  readonly evidenceSupportScore: number;
  readonly expectedInformationValue: number;
  readonly significance: number;
  readonly supersedesGraphHoleId: string | null;
  readonly investigationGapId: string | null; // 5B Link
  readonly supersededAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface GraphHoleAssessmentRecord {
  readonly id: string;
  readonly graphHoleId: string;
  readonly caseId: string;
  readonly sequence: number;
  readonly logicalKey: string | null;
  readonly assessmentType: GraphHoleAssessmentType;
  readonly status: GraphHolePersistenceStatus;
  readonly graphVersionId: string;
  readonly detectionPolicyVersion: string;
  readonly scoringPolicyVersion: string;
  readonly qualificationPolicyVersion: string;
  readonly snapshot: unknown;
  readonly contextSha256: string | null;
  readonly reason: string | null;
  readonly createdAt: Date;
}

export interface PersistGraphHoleInput {
  readonly caseId: string;
  readonly investigationId?: string;
  /** The PR5 QUALIFIED candidate. REJECTED candidates are not persisted. */
  readonly qualification: QualifiedGraphHoleCandidate;
  /** QUALIFICATION for first persist; REASSESSMENT forces a reassessment record. */
  readonly assessmentType?: 'QUALIFICATION' | 'REASSESSMENT';
  /** Lineage: graphHoleId (same case) of the prior-version record to supersede. */
  readonly supersedesGraphHoleId?: string;
  /** Bounded analysis context digest (PR12 AI-skip gate); stored on the assessment. */
  readonly contextSha256?: string;
  readonly reason?: string;
}

export interface PersistGraphHoleResult {
  readonly created: boolean;
  readonly record: GraphHoleRecord;
  readonly assessment: GraphHoleAssessmentRecord;
}

export interface TransitionStatusInput {
  readonly caseId: string;
  readonly candidateId: string;
  readonly to: GraphHolePersistenceStatus;
  readonly reason?: string;
}

type GraphHoleRow = NonNullable<
  Awaited<ReturnType<PrismaClient['graphHole']['findFirst']>>
>;
type AssessmentRow = NonNullable<
  Awaited<ReturnType<PrismaClient['graphHoleAssessment']['findFirst']>>
>;

// ============================================================================
// Record mapping
// ============================================================================

function toGraphHoleRecord(row: GraphHoleRow): GraphHoleRecord {
  return {
    id: row.id,
    identityKey: row.identityKey,
    candidateId: row.candidateId,
    caseId: row.caseId,
    investigationId: row.investigationId,
    graphVersionId: row.graphVersionId,
    regionId: row.regionId,
    holeType: row.holeType,
    canonicalNodeIds: row.canonicalNodeIds as unknown as readonly string[],
    expectedRelationshipType: row.expectedRelationshipType,
    temporalScope: row.temporalScope,
    detectionPolicyVersion: row.detectionPolicyVersion,
    scoringPolicyVersion: row.scoringPolicyVersion,
    qualificationPolicyVersion: row.qualificationPolicyVersion,
    status: row.status as GraphHolePersistenceStatus,
    structuralScore: row.structuralScore,
    evidenceSupportScore: row.evidenceSupportScore,
    expectedInformationValue: row.expectedInformationValue,
    significance: row.significance,
    supersedesGraphHoleId: row.supersedesGraphHoleId,
    investigationGapId: row.investigationGapId, // 5B Link
    supersededAt: row.supersededAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toAssessmentRecord(row: AssessmentRow): GraphHoleAssessmentRecord {
  return {
    id: row.id,
    graphHoleId: row.graphHoleId,
    caseId: row.caseId,
    sequence: row.sequence,
    logicalKey: row.logicalKey,
    assessmentType: row.assessmentType as GraphHoleAssessmentType,
    status: row.status as GraphHolePersistenceStatus,
    graphVersionId: row.graphVersionId,
    detectionPolicyVersion: row.detectionPolicyVersion,
    scoringPolicyVersion: row.scoringPolicyVersion,
    qualificationPolicyVersion: row.qualificationPolicyVersion,
    snapshot: row.snapshot,
    contextSha256: row.contextSha256 ?? null,
    reason: row.reason,
    createdAt: row.createdAt,
  };
}

// ============================================================================
// Identity derivation (matches @indago/graph-hole-detection exactly:
// the same logical gap under the same graph/policy re-hashes the same id)
// ============================================================================

function toCandidateIdentity(raw: RawGraphHoleCandidate): GraphHoleCandidateIdentityV1 {
  const identity: GraphHoleCandidateIdentityV1 = {
    caseId: raw.caseId,
    graphVersionId: raw.graphVersionId,
    holeType: raw.detectorType,
    canonicalNodeIds: raw.nodeIds,
    detectionPolicyVersion: raw.detectionPolicyVersion,
  };
  if (raw.expectedRelationshipType !== null) {
    identity.expectedRelationshipType = raw.expectedRelationshipType;
  }
  if (raw.temporalScope !== undefined) {
    identity.temporalScope = raw.temporalScope;
  }
  return identity;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function stateEventSnapshot(row: GraphHoleRow, to: string): Prisma.InputJsonValue {
  return {
    candidateId: row.candidateId,
    caseId: row.caseId,
    graphVersionId: row.graphVersionId,
    status: to,
    holeType: row.holeType,
    structuralScore: row.structuralScore,
    evidenceSupportScore: row.evidenceSupportScore,
    expectedInformationValue: row.expectedInformationValue,
    significance: row.significance,
  } as unknown as Prisma.InputJsonValue;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

// ============================================================================
// GraphHoleStore
// ============================================================================

export class GraphHoleStore {
  constructor(private readonly prisma: PrismaClient = db) {}

  async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(fn, { maxWait: 30_000, timeout: 60_000 });
  }

  // --------------------------------------------------------------------------
  // Persist (creates or re-persists ONE canonical GraphHole per candidate)
  // --------------------------------------------------------------------------

  async persistGraphHole(
    input: PersistGraphHoleInput,
  ): Promise<PersistGraphHoleResult> {
    const { caseId, qualification } = input;
    const raw = qualification.rawCandidate;

    if (!qualification.qualified) {
      throw new GraphHoleStoreError(
        'UNQUALIFIED_CANDIDATE',
        `Refusing to persist unqualified candidate ${raw.candidateId}`,
      );
    }
    if (raw.caseId !== caseId) {
      throw new GraphHoleStoreError(
        'AUTHORITY_MISMATCH',
        `Cannot persist candidate for case ${raw.caseId} under case ${caseId}`,
      );
    }

    const identity = toCandidateIdentity(raw);
    const identityKey = canonicalizeGraphHoleCandidateIdentity(identity);
    const recomputedCandidateId = sha256Hex(identityKey);
    if (recomputedCandidateId !== raw.candidateId) {
      throw new GraphHoleStoreError(
        'INVALID_IDENTITY',
        `candidateId mismatch: supplied ${raw.candidateId}, recomputed ${recomputedCandidateId}`,
      );
    }

    const graphHoleData = {
      identityKey,
      candidateId: raw.candidateId,
      caseId,
      investigationId: input.investigationId ?? null,
      graphVersionId: raw.graphVersionId,
      regionId: raw.regionId,
      holeType: raw.detectorType,
      canonicalNodeIds: sortedUnique(raw.nodeIds) as unknown as Prisma.InputJsonValue,
      expectedRelationshipType: raw.expectedRelationshipType,
      temporalScope: raw.temporalScope ?? Prisma.JsonNull,
      detectionPolicyVersion: raw.detectionPolicyVersion,
      scoringPolicyVersion: qualification.scoringPolicyVersion,
      qualificationPolicyVersion: GRAPH_HOLE_POLICY_VERSION,
      status: 'ACTIVE' as const,
      structuralScore: qualification.structuralScore,
      evidenceSupportScore: qualification.evidenceSupportScore,
      expectedInformationValue: qualification.expectedInformationValue,
      significance: qualification.significance,
      supersedesGraphHoleId: input.supersedesGraphHoleId ?? null,
      supersededAt: null,
    };

    const contributionData = {
      identityKey: buildDetectorContributionIdentityKey({
        candidateId: raw.candidateId,
        detectorType: raw.detectorType,
        detectionPolicyVersion: raw.detectionPolicyVersion,
      }),
      graphHoleId: '', // filled after the row id is known
      caseId,
      candidateId: raw.candidateId,
      detectorType: raw.detectorType,
      detectionPolicyVersion: raw.detectionPolicyVersion,
      structuralBasis: raw.structuralBasis,
      supportingHypothesisIds: sortedUnique(raw.supportingHypothesisIds) as unknown as Prisma.InputJsonValue,
      supportingObservationIds: sortedUnique(raw.supportingObservationIds) as unknown as Prisma.InputJsonValue,
      contradictingObservationIds: sortedUnique(raw.contradictingObservationIds) as unknown as Prisma.InputJsonValue,
      observedEdgeIds: sortedUnique(raw.observedEdgeIds) as unknown as Prisma.InputJsonValue,
      detectorMetadata: raw.detectorMetadata as unknown as Prisma.InputJsonValue,
      provenance: raw.provenance as unknown as Prisma.InputJsonValue,
    };

    const snapshotLogicalKey = `${raw.candidateId}:${sha256Hex(
      canonicalizeDeterministic(qualification),
    )}`;

    const assessmentType =
      input.assessmentType ?? undefined; // decided inside the tx based on `created`

    return this.transaction(async (tx) => {
      let prior: GraphHoleRow | null = null;
      if (input.supersedesGraphHoleId) {
        prior = await tx.graphHole.findFirst({
          where: { id: input.supersedesGraphHoleId, caseId },
        });
        if (!prior) {
          throw new GraphHoleStoreError(
            'NOT_FOUND',
            `Supersede target ${input.supersedesGraphHoleId} not found for case ${caseId}`,
          );
        }
      }

      const insert = await tx.graphHole.createMany({
        data: graphHoleData,
        skipDuplicates: true,
      });
      const created = insert.count > 0;

      const row = await tx.graphHole.findFirst({
        where: { identityKey, caseId },
      });
      if (!row) {
        throw new GraphHoleStoreError(
          'NOT_FOUND',
          `GraphHole not found after persist (${identityKey})`,
        );
      }

      await tx.graphHoleDetectorContribution.createMany({
        data: { ...contributionData, graphHoleId: row.id },
        skipDuplicates: true,
      });

      if (!created) {
        // Re-persist / reassessment of the SAME candidate: refresh the
        // current record (idempotent — same values converge) and record the
        // reassessment with the deterministic logical key.
        await tx.graphHole.update({
          where: { id: row.id, caseId },
          data: {
            scoringPolicyVersion: qualification.scoringPolicyVersion,
            qualificationPolicyVersion: GRAPH_HOLE_POLICY_VERSION,
            status: 'ACTIVE',
            structuralScore: qualification.structuralScore,
            evidenceSupportScore: qualification.evidenceSupportScore,
            expectedInformationValue: qualification.expectedInformationValue,
            significance: qualification.significance,
          },
        });
      }

      const sequence = await this.nextAssessmentSequence(tx, row.id);
      const currentAssessment = await this.createAssessment(
        tx,
        {
          graphHoleId: row.id,
          caseId,
          sequence,
          logicalKey: snapshotLogicalKey,
          assessmentType: assessmentType ?? (created ? 'QUALIFICATION' : 'REASSESSMENT'),
          status: 'ACTIVE',
          graphVersionId: raw.graphVersionId,
          detectionPolicyVersion: raw.detectionPolicyVersion,
          scoringPolicyVersion: qualification.scoringPolicyVersion,
          qualificationPolicyVersion: GRAPH_HOLE_POLICY_VERSION,
          snapshot: qualification as unknown as Prisma.InputJsonValue,
          contextSha256: input.contextSha256 ?? null,
          reason: input.reason ?? (created ? null : 'reassessed'),
        },
      );

      // Single-demotion invariant: only the persist that CREATED the row
      // performs the supersession. Re-runs of an already-persisted candidate
      // never demote a second time (and never re-validate the now-SUPERSEDED
      // target - they converge as an idempotent no-op instead of erroring).
      if (prior && created) {
        if (prior.status !== 'ACTIVE') {
          throw new GraphHoleStoreError(
            'INVALID_SUPERSESSION',
            `Supersede target status is ${prior.status}, expected ACTIVE`,
          );
        }
        if (prior.candidateId === raw.candidateId) {
          throw new GraphHoleStoreError(
            'INVALID_SUPERSESSION',
            `Candidate cannot supersede its own prior record (${raw.candidateId})`,
          );
        }
        const demoted = await tx.graphHole.updateMany({
          where: { id: prior.id, caseId, status: 'ACTIVE' },
          data: { status: 'SUPERSEDED', supersededAt: new Date() },
        });
        if (demoted.count === 1) {
          const priorSequence = await this.nextAssessmentSequence(tx, prior.id);
          await this.createAssessment(
            tx,
            {
              graphHoleId: prior.id,
              caseId,
              sequence: priorSequence,
              logicalKey: null,
              assessmentType: 'SUPERSESSION',
              status: 'SUPERSEDED',
              graphVersionId: prior.graphVersionId,
              detectionPolicyVersion: prior.detectionPolicyVersion,
              scoringPolicyVersion: prior.scoringPolicyVersion,
              qualificationPolicyVersion: prior.qualificationPolicyVersion,
              snapshot: stateEventSnapshot(prior, 'SUPERSEDED'),
              reason: `supersededBy:${row.candidateId} (${row.id})`,
            },
          );
        }
      }

      const finalRow = await tx.graphHole.findFirstOrThrow({
        where: { id: row.id },
      });
      return {
        created,
        record: toGraphHoleRecord(finalRow),
        assessment: currentAssessment,
      };
    });
  }

  // --------------------------------------------------------------------------
  // Transitions (intelligence lifecycle only; human consequence = Lead)
  // --------------------------------------------------------------------------

  async transitionStatus(
    input: TransitionStatusInput,
  ): Promise<GraphHoleRecord> {
    const { caseId, candidateId, to } = input;
    const row = await this.prisma.graphHole.findFirst({
      where: { caseId, candidateId },
    });
    if (!row) {
      throw new GraphHoleStoreError(
        'NOT_FOUND',
        `No GraphHole for candidate ${candidateId} in case ${caseId}`,
      );
    }
    const from = row.status as GraphHolePersistenceStatus;
    if (!canTransitionGraphHoleStatus(from, to)) {
      throw new GraphHoleStoreError(
        'INVALID_TRANSITION',
        `Cannot transition GraphHole ${candidateId} from ${from} to ${to}`,
      );
    }

    return this.transaction(async (tx) => {
      const demoted = await tx.graphHole.updateMany({
        where: { id: row.id, caseId, status: from },
        data: {
          status: to,
          ...(to === 'SUPERSEDED' ? { supersededAt: new Date() } : {}),
        },
      });
      if (demoted.count !== 1) {
        throw new GraphHoleStoreError(
          'INVALID_TRANSITION',
          `Lost race: GraphHole ${candidateId} no longer ${from}`,
        );
      }
      const assessmentType: GraphHoleAssessmentType =
        to === 'SUPERSEDED'
          ? 'SUPERSESSION'
          : to === 'REJECTED'
            ? 'REJECTION'
            : to === 'ACTIVE'
              ? 'REVIVAL'
              : 'RESOLUTION';
      const sequence = await this.nextAssessmentSequence(tx, row.id);
      await this.createAssessment(
        tx,
        {
          graphHoleId: row.id,
          caseId,
          sequence,
          logicalKey: null,
          assessmentType,
          status: to,
          graphVersionId: row.graphVersionId,
          detectionPolicyVersion: row.detectionPolicyVersion,
          scoringPolicyVersion: row.scoringPolicyVersion,
          qualificationPolicyVersion: row.qualificationPolicyVersion,
          snapshot: stateEventSnapshot(row, to),
          reason: input.reason ?? null,
        },
      );
      const updated = await tx.graphHole.findFirstOrThrow({
        where: { id: row.id },
      });
      return toGraphHoleRecord(updated);
    });
  }

  // --------------------------------------------------------------------------
  // Phase 5B: Link Investigative Gap
  // --------------------------------------------------------------------------

  /**
   * 5B: Safely links an InvestigativeGap to a GraphHole.
   * Retries are safe, but linking to a DIFFERENT gap throws to protect integrity.
   */
  async attachInvestigationGap(input: {
    readonly caseId: string;
    readonly candidateId: string;
    readonly investigationGapId: string;
  }): Promise<{ attached: boolean; record: GraphHoleRecord }> {
    const existing = await this.prisma.graphHole.findUnique({
      where: { caseId_candidateId: { caseId: input.caseId, candidateId: input.candidateId } }
    });

    if (!existing) {
      throw new GraphHoleStoreError(
        'NOT_FOUND',
        `GraphHole not found for candidate ${input.candidateId}`
      );
    }

    // Idempotent retry: already linked to this exact gap
    if (existing.investigationGapId === input.investigationGapId) {
      return { attached: false, record: toGraphHoleRecord(existing) };
    }

    // Integrity guard: already linked to a different gap
    if (existing.investigationGapId !== null) {
      throw new GraphHoleStoreError(
        'INVALID_TRANSITION',
        `GraphHole ${input.candidateId} is already attached to gap ${existing.investigationGapId}`
      );
    }

    const updated = await this.prisma.graphHole.update({
      where: { id: existing.id },
      data: { investigationGapId: input.investigationGapId }
    });

    return { attached: true, record: toGraphHoleRecord(updated) };
  }

  // --------------------------------------------------------------------------
  // Reads (case-scoped; bounded — no case-wide scans)
  // --------------------------------------------------------------------------

  async findByIdentityKey(input: {
    readonly caseId: string;
    readonly identityKey: string;
  }): Promise<GraphHoleRecord | null> {
    const row = await this.prisma.graphHole.findFirst({
      where: { caseId: input.caseId, identityKey: input.identityKey },
    });
    return row ? toGraphHoleRecord(row) : null;
  }

  async findByCandidateId(input: {
    readonly caseId: string;
    readonly candidateId: string;
  }): Promise<GraphHoleRecord | null> {
    const row = await this.prisma.graphHole.findFirst({
      where: { caseId: input.caseId, candidateId: input.candidateId },
    });
    return row ? toGraphHoleRecord(row) : null;
  }

  /**
   * Bounded, case-scoped ACTIVE-hole listing (deterministic order: createdAt
   * asc, then id asc). PR6's "no case-wide scans" convention is preserved by
   * the hard `take` bound — consumers (PR12 affected-set resolution) always
   * combine this with a per-region/per-candidate filter, never the inverse.
   */
  async listActiveByCase(
    caseId: string,
    options: { limit: number; status?: readonly GraphHolePersistenceStatus[] },
  ): Promise<readonly GraphHoleRecord[]> {
    const statuses = options.status ?? ['ACTIVE'];
    const rows = await this.prisma.graphHole.findMany({
      where: { caseId, status: { in: [...statuses] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: options.limit,
    });
    return rows.map(toGraphHoleRecord);
  }

  /** Case-scoped holes bound to ONE region (supersession/affected-candidate targets). */
  async listByRegionId(input: {
    readonly caseId: string;
    readonly regionId: string;
    readonly status?: readonly GraphHolePersistenceStatus[];
  }): Promise<readonly GraphHoleRecord[]> {
    const statuses = input.status ?? ['ACTIVE'];
    const rows = await this.prisma.graphHole.findMany({
      where: {
        caseId: input.caseId,
        regionId: input.regionId,
        status: { in: [...statuses] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toGraphHoleRecord);
  }

  /**
   * supportingHypothesisIds per hole (from the detector contributions) —
   * the PR12 affected-set resolver's manual-scope hypothesis fan-out. Bounded
   * by the supplied graphHoleIds; case-scoped.
   */
  async supportingHypothesisIdsByHole(
    caseId: string,
    graphHoleIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    const result = new Map<string, readonly string[]>();
    if (graphHoleIds.length === 0) return result;
    const rows = await this.prisma.graphHoleDetectorContribution.findMany({
      where: {
        caseId,
        graphHoleId: { in: [...graphHoleIds] },
      },
      select: { graphHoleId: true, supportingHypothesisIds: true },
    });
    for (const row of rows) {
      const ids = row.supportingHypothesisIds as unknown as readonly string[];
      result.set(row.graphHoleId, [...ids].sort());
    }
    return result;
  }

  /** Append-only assessment history for one GraphHole, oldest first. */
  async listAssessments(input: {
    readonly caseId: string;
    readonly identityKey: string;
  }): Promise<readonly GraphHoleAssessmentRecord[]> {
    const row = await this.prisma.graphHole.findFirst({
      where: { caseId: input.caseId, identityKey: input.identityKey },
      select: { id: true },
    });
    if (!row) {
      throw new GraphHoleStoreError(
        'NOT_FOUND',
        `No GraphHole for identity ${input.identityKey} in case ${input.caseId}`,
      );
    }
    const rows = await this.prisma.graphHoleAssessment.findMany({
      where: { graphHoleId: row.id },
      orderBy: { sequence: 'asc' },
    });
    return rows.map(toAssessmentRecord);
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  private async nextAssessmentSequence(
    tx: Prisma.TransactionClient,
    graphHoleId: string,
  ): Promise<number> {
    const last = await tx.graphHoleAssessment.findFirst({
      where: { graphHoleId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    return (last?.sequence ?? 0) + 1;
  }

  /**
   * Append one assessment row. A P2002 collision is tolerated ONLY when it
   * is the deterministic logicalKey of an identical re-run (dedup — converge
   * to the already-recorded assessment). Any other collision is a genuine
   * concurrent conflict and PROPAGATES (caller retries with a fresh sequence).
   */
  private async createAssessment(
    tx: Prisma.TransactionClient,
    data: {
      graphHoleId: string;
      caseId: string;
      sequence: number;
      logicalKey: string | null;
      assessmentType: GraphHoleAssessmentType;
      status: GraphHolePersistenceStatus;
      graphVersionId: string;
      detectionPolicyVersion: string;
      scoringPolicyVersion: string;
      qualificationPolicyVersion: string;
      snapshot: Prisma.InputJsonValue;
      contextSha256?: string | null;
      reason: string | null;
    },
  ): Promise<GraphHoleAssessmentRecord> {
    const payload = {
      graphHoleId: data.graphHoleId,
      caseId: data.caseId,
      sequence: data.sequence,
      logicalKey: data.logicalKey,
      assessmentType: GraphHoleAssessmentTypeSchema.parse(data.assessmentType),
      status: data.status,
      graphVersionId: data.graphVersionId,
      detectionPolicyVersion: data.detectionPolicyVersion,
      scoringPolicyVersion: data.scoringPolicyVersion,
      qualificationPolicyVersion: data.qualificationPolicyVersion,
      snapshot: data.snapshot,
      contextSha256: data.contextSha256 ?? null,
      reason: data.reason,
    };
    try {
      await tx.$executeRaw`SAVEPOINT indago_assessment`;
    } catch (err) {
      throw err;
    }
    try {
      const row = await tx.graphHoleAssessment.create({ data: payload });
      await tx.$executeRaw`RELEASE SAVEPOINT indago_assessment`;
      return toAssessmentRecord(row);
    } catch (error) {
      try {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT indago_assessment`;
      } catch {
        throw error;
      }
      if (isDuplicateKeyError(error) && data.logicalKey !== null) {
        const existing = await tx.graphHoleAssessment.findFirst({
          where: {
            graphHoleId: data.graphHoleId,
            logicalKey: data.logicalKey,
          },
        });
        if (existing) {
          return toAssessmentRecord(existing);
        }
      }
      throw error;
    }
  }
}

/** Convenience singleton bound to the platform Prisma client. */
export const graphHoleStore = new GraphHoleStore();