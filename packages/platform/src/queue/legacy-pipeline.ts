// ============================================================================
// LEGACY Run-State Pipeline (isolated)
//
// The original investigation run-state pipeline (CREATED → INGESTING →
// NORMALIZING → ANALYZING → DISCOVERING) drove fake/mock graph ingestion via
// USE_MOCK_INGESTION or the legacy HTTP /ingest service.
//
// This pipeline has been isolated behind LEGACY_PIPELINE_ENABLED=true
// (default: OFF). Evidence ingestion now runs exclusively through the
// canonical @indago/ingestion path (see ingest-evidence.ts); the run stays
// in CREATED until evidence arrives.
//
// This file is intentionally frozen — legacy behavior in, legacy behavior out.
// No new capabilities are added here.
// ============================================================================

import { randomUUID } from "node:crypto";
import type { Job } from "bullmq";
import type { Prisma } from "@prisma/client";
import {
  type InvestigationRunState,
} from "@indago/contracts";
import { db } from "../db/prisma.js";
import { emitProgressEvent } from "../realtime/sse.js";
import { validateClaim, ClaimGroundingError } from "../security/grounding.js";
import { transitionState } from "./transitions.js";

export function extractRunIdFromJobData(data: unknown): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "runId" in data &&
    typeof (data as Record<string, unknown>).runId === "string"
  ) {
    return String((data as Record<string, unknown>).runId);
  }
  return "";
}

/**
 * Legacy run-state handler. No-op unless LEGACY_PIPELINE_ENABLED=true.
 */
export async function handleLegacyRunStateJob(job: Job): Promise<void> {
  if (process.env.LEGACY_PIPELINE_ENABLED !== "true") {
    return;
  }

  const runId = extractRunIdFromJobData(job.data);
  if (!runId) {
    throw new Error(`Malformed run-state job: missing runId`);
  }

  const run = await db.investigationRun.findUniqueOrThrow({ where: { id: runId } });

  try {
    switch (run.state as InvestigationRunState) {
      case "CREATED": {
        await transitionState(run.id, "INGESTING", "PIPELINE_START");
        break;
      }

      case "INGESTING": {
        console.log(`[LegacyWorker] Task 3: Ingesting case data for run ${run.id}...`);
        emitProgressEvent(run.investigationId, "INGESTING", "Fetching case data from Ingestion Service...");

        const context: Record<string, unknown> =
          typeof run.contextData === "object" && run.contextData !== null
            ? (run.contextData as Record<string, unknown>)
            : {};

        let graphData: unknown;

        if (process.env.USE_MOCK_INGESTION === "true") {
          console.log(`[LegacyWorker] USE_MOCK_INGESTION is true. Using synthetic graph data.`);
          graphData = {
            nodes: [
              { id: "node-1", label: "Suspect", properties: { name: "Synthetic Entity A" } },
              { id: "node-2", label: "Bank Account", properties: { accountNumber: "XXXX-9021" } },
            ],
            edges: [
              { from: "node-1", to: "node-2", relation: "CONTROLS" },
            ],
          };
        } else {
          console.log(`[LegacyWorker] Fetching real data from Ingestion API...`);
          const targetUrl = process.env.INGESTION_SERVICE_URL || "http://localhost:8080";

          const response = await fetch(`${targetUrl}/ingest`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ caseId: context.caseId }),
          });

          if (!response.ok) {
            throw new Error(`Ingestion service returned status ${response.status}`);
          }

          graphData = await response.json();
        }

        await db.investigationRun.update({
          where: { id: run.id },
          data: {
            contextData: {
              ...context,
              graph: toJson(graphData),
              ingestedAt: new Date().toISOString(),
            },
          },
        });

        console.log(`[LegacyWorker] Task 4: Graph state successfully persisted for run ${run.id}`);
        emitProgressEvent(run.investigationId, "GRAPH_READY", JSON.stringify(graphData));

        await transitionState(run.id, "NORMALIZING", "INGESTION_COMPLETE");
        break;
      }

      case "NORMALIZING": {
        console.log(`[LegacyWorker] Task 3.5: Normalizing case data for run ${run.id}...`);
        emitProgressEvent(run.investigationId, "NORMALIZING", "Normalizing graph data format...");

        await transitionState(run.id, "ANALYZING", "NORMALIZATION_COMPLETE");
        break;
      }

      case "ANALYZING": {
        const agentDecision = {
          proposedClaim: {
            text: "Found a hidden connection to Account Y.",
            referencedIds: ["valid_id_456"],
          },
        };

        const toolResult = { data: [{ id: "valid_id_456" }] };

        if (agentDecision.proposedClaim) {
          try {
            await validateClaim(
              run.investigationId,
              {
                id: randomUUID(),
                claimText: agentDecision.proposedClaim.text,
                referencedIds: agentDecision.proposedClaim.referencedIds,
              },
              toolResult,
            );
          } catch (error) {
            if (error instanceof ClaimGroundingError) {
              console.warn(`[GROUNDING FAILED] Agent hallucinated. Replanning run ${run.id}`);
              await db.investigationRun.update({
                where: { id: run.id },
                data: { state: "ANALYZING" },
              });
              emitProgressEvent(run.investigationId, "FAILED", `Grounding failed: ${error.message}`);
              return;
            }
            throw error;
          }
        }

        await transitionState(run.id, "DISCOVERING", "ANALYSIS_COMPLETE");
        break;
      }

      case "WAITING_FOR_EVIDENCE": {
        await db.investigationRun.update({
          where: { id: run.id },
          data: { status: "PAUSED" },
        });
        break;
      }

      default: {
        break;
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[LegacyWorker] Failed during state execution for run ${run.id}:`, error);
    emitProgressEvent(run.investigationId, "FAILED", `Error: ${message}`);

    await db.investigationRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        contextData: {
          ...(typeof run.contextData === "object" && run.contextData !== null
            ? (run.contextData as Record<string, unknown>)
            : {}),
          lastError: message,
        },
      },
    });
    throw error;
  }
}

function toJson(input: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
}