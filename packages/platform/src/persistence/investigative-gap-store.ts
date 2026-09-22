import { PrismaClient, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { db } from "../db/prisma.js";
import type { InvestigativeGap } from "@indago/contracts";
import { mapGapClassificationToGapType } from "../gaps/gap-type-mapping.js";

function toJson(input: unknown): Prisma.InputJsonValue {
  return (input === undefined ? Prisma.JsonNull : JSON.parse(JSON.stringify(input))) as Prisma.InputJsonValue;
}

function toIdArray(value: Prisma.JsonValue): string[] {
  if (!value || typeof value !== "object" || !Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function toObservedTime(date: Date) {
  return { value: date.toISOString(), precision: "exact" as const };
}

export interface UpsertInvestigativeGapInput {
  caseId: string;
  investigationId: string;
  graphHole: {
    id: string;
    candidateId: string;
    holeType: string;
  };
  classification: any | null; // GapClassificationV1 snapshot from PR14
}

export class InvestigativeGapStore {
  constructor(private readonly prisma: PrismaClient = db) {}

  /**
   * Derives the deterministic identity key and UUID for an InvestigativeGap.
   */
  private deriveIdentity(caseId: string, investigationId: string, graphHoleCandidateId: string) {
    // Canonical identity object exactly as defined in the spec
    const identityObj = {
      kind: "INVESTIGATIVE_GAP",
      version: "v1",
      caseId,
      investigationId,
      graphHoleCandidateId
    };
    
    const identityKey = JSON.stringify(identityObj, Object.keys(identityObj).sort());
    const id = createHash("sha256").update(identityKey).digest("hex");
    
    // Format as a standard UUID v4 shape for consistency
    const uuid = `${id.substring(0, 8)}-${id.substring(8, 12)}-4${id.substring(13, 16)}-a${id.substring(17, 20)}-${id.substring(20, 32)}`;
    
    return { identityKey, id: uuid };
  }

  /**
   * Idempotent upsert of an Investigative Gap from a Graph Hole.
   * Never overwrites human workflow status on a retry/reassessment.
   */
  async upsertFromGraphHole(
    input: UpsertInvestigativeGapInput,
  ): Promise<{ created: boolean; gap: InvestigativeGap }> {
    const { identityKey, id } = this.deriveIdentity(
      input.caseId,
      input.investigationId,
      input.graphHole.candidateId
    );

    const gapType = mapGapClassificationToGapType(
      input.classification?.type,
      input.graphHole.holeType
    );

    const readableType = (input.classification?.type || input.graphHole.holeType)
      .replaceAll("_", " ")
      .toLowerCase();
    
    const holeTypeReadable = input.graphHole.holeType.replaceAll("_", " ").toLowerCase();
    const title = `Investigative gap · ${holeTypeReadable}`;
    
    const reasonCodes = input.classification?.reasonCodes?.join(", ") || "None";
    const description = `A qualified ${holeTypeReadable} graph-hole candidate was classified as ${readableType}. Reason codes: ${reasonCodes}.`;

    const impact = input.classification?.impact ?? 0.5;
    const priority = input.classification?.priority ?? "MEDIUM";
    const expectedInformationValue = input.classification?.expectedInformationValue ?? null;

    const metadata = {
      customFields: {
        source: "GRAPH_HOLE_CLASSIFICATION",
        graphHoleCandidateId: input.graphHole.candidateId,
        classificationType: input.classification?.type ?? null,
        classificationStatus: input.classification?.status ?? null,
        reasonCodes: input.classification?.reasonCodes ?? [],
        supportingReferences: input.classification?.supportingReferences ?? {},
        contextSha256: input.classification?.contextSha256 ?? "fallback",
        classificationPolicyVersion: input.classification?.classificationPolicyVersion ?? "v1",
        suggestedActions: input.classification?.suggestedActions ?? [],
      }
    };

    const row = await this.prisma.investigativeGap.upsert({
      where: { identityKey },
      create: {
        id,
        identityKey,
        caseId: input.caseId,
        investigationId: input.investigationId,
        graphHoleCandidateId: input.graphHole.candidateId,
        graphHoleId: input.graphHole.id,
        type: gapType,
        title,
        description,
        status: "IDENTIFIED",
        priority,
        impact,
        expectedInformationValue,
        relatedEntityIds: toJson(input.classification?.relatedEntityIds ?? []),
        relatedHypothesisIds: toJson(input.classification?.relatedHypothesisIds ?? []),
        evidenceRequestIds: toJson([]),
        metadata: toJson(metadata)
      },
      update: {
        // Do NOT overwrite status, evidenceRequestIds, resolution, or timestamps
        type: gapType,
        priority,
        impact,
        expectedInformationValue,
        relatedEntityIds: toJson(input.classification?.relatedEntityIds ?? []),
        relatedHypothesisIds: toJson(input.classification?.relatedHypothesisIds ?? []),
        metadata: toJson(metadata)
      }
    });

    // Check if it was created just now by comparing createdAt and updatedAt
    const created = row.createdAt.getTime() === row.updatedAt.getTime();

    return {
      created,
      gap: this.mapToDTO(row)
    };
  }

  private mapToDTO(row: Prisma.InvestigativeGapGetPayload<Record<string, never>>): InvestigativeGap {
    return {
      id: row.id,
      caseId: row.caseId,
      investigationId: row.investigationId,
      type: row.type as any,
      title: row.title,
      description: row.description,
      status: row.status as any,
      priority: row.priority as any,
      impact: row.impact,
      expectedInformationValue: row.expectedInformationValue ?? undefined,
      relatedEntityIds: toIdArray(row.relatedEntityIds),
      relatedHypothesisIds: toIdArray(row.relatedHypothesisIds),
      evidenceRequestIds: toIdArray(row.evidenceRequestIds),
      resolution: row.resolution ?? undefined,
      createdAt: toObservedTime(row.createdAt),
      updatedAt: toObservedTime(row.updatedAt),
      resolvedAt: row.resolvedAt ? toObservedTime(row.resolvedAt) : undefined,
      metadata: row.metadata ? (row.metadata as any) : undefined
    };
  }
}

export const investigativeGapStore = new InvestigativeGapStore();