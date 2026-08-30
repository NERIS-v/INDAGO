// ============================================================================
// Manual evidence-ingestion replay (dev tooling, not part of the app runtime).
//
// Re-opens the most recent terminal InvestigationRun (FAILED) and re-drives the
// durable ingest-evidence handler against the ORIGINAL BullMQ job payload, so
// the run, attempts, artifact, extraction, normalization, source/evidence and
// observations all land in Neon exactly as a live re-queue would have.
//
// Run from packages/platform with DATABASE_URL + REDIS_URL exported:
//   npx tsx scripts/replay-evidence.ts
// ============================================================================

import { Queue } from "bullmq";
import Redis from "ioredis";
import { db } from "../src/db/prisma.js";
import { handleIngestEvidenceJob } from "../src/queue/ingest-evidence.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const investigationQueue = new Queue("investigation-pipeline", {
  connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null }),
});

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const argOf = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const forcedJobId = argOf("--job");
  const forcedInv = argOf("--inv");

  // ---- 1. Survey recent runs -------------------------------------------------
  const runs = await db.investigationRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 6,
  });
  console.log("=== Recent InvestigationRuns ===");
  for (const r of runs) {
    const evidenceCount = await db.evidence.count({
      where: { investigationId: r.investigationId },
    });
    const observationCount = await db.observation.count({
      where: { investigationId: r.investigationId },
    });
    console.log(
      `- run=${r.id} inv=${r.investigationId} case=${r.caseId} status=${r.status} state=${r.state} evidence=${evidenceCount} obs=${observationCount} error=${r.error ?? "-"} created=${r.createdAt.toISOString()}`,
    );
  }

  // ---- 2. Survey queue jobs --------------------------------------------------
  const jobs = await investigationQueue.getJobs([
    "failed",
    "completed",
    "waiting",
    "active",
    "delayed",
    "prioritized",
  ]);
  const sorted = [...jobs].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  console.log("\n=== ingest-evidence queue jobs (recent first) ===");
  for (const j of sorted.slice(0, 10)) {
    const inv =
      j.data && typeof j.data === "object" && "investigationId" in j.data
        ? String((j.data as { investigationId: string }).investigationId)
        : "?";
    const title =
      j.data && typeof j.data === "object" && "evidenceTitle" in j.data
        ? String((j.data as { evidenceTitle: string }).evidenceTitle)
        : "?";
    console.log(
      `- id=${j.id} name=${j.name} inv=${inv} title="${title}" state=${await j.getState()} attempts=${j.attemptsMade} failedReason=${j.failedReason ?? "-"}`,
    );
  }

  // ---- 3. Select replay target ----------------------------------------------
  let run: typeof runs[number] | undefined;
  let job: (typeof sorted)[number] | undefined;
  if (forcedJobId) {
    job = sorted.find((j) => j.id === forcedJobId);
    if (job) {
      const inv =
        job.data && typeof job.data === "object" && "investigationId" in job.data
          ? String((job.data as { investigationId: string }).investigationId)
          : undefined;
      run = inv
        ? runs.find((r) => r.investigationId === inv) ??
          (await db.investigationRun.findFirst({
            where: { investigationId: inv },
            orderBy: { createdAt: "desc" },
          }))
        : undefined;
    }
  } else if (forcedInv) {
    run = runs.find((r) => r.investigationId === forcedInv) ??
      (await db.investigationRun.findFirst({
        where: { investigationId: forcedInv },
        orderBy: { createdAt: "desc" },
      }));
    job = sorted.find((j) => {
      const inv =
        j.data && typeof j.data === "object" && "investigationId" in j.data
          ? String((j.data as { investigationId: string }).investigationId)
          : "";
      return j.name === "ingest-evidence" && inv === forcedInv;
    });
  } else {
    // Most recent terminal run that still has a matching queue job.
    for (const candidate of runs) {
      if (!["FAILED", "CANCELLED", "COMPLETED"].includes(candidate.status)) continue;
      const match = sorted.find((j) => {
        const inv =
          j.data && typeof j.data === "object" && "investigationId" in j.data
            ? String((j.data as { investigationId: string }).investigationId)
            : "";
        return j.name === "ingest-evidence" && inv === candidate.investigationId;
      });
      if (match) {
        run = candidate;
        job = match;
        break;
      }
    }
  }

  if (!run || !job) {
    console.error(
      "\nNo terminal run with a matching queue job found to replay. Nothing to do.",
    );
    await investigationQueue.close();
    await db.$disconnect();
    process.exit(1);
  }

  console.log(`\n=== REPLAY TARGET ===`);
  console.log(`run=${run.id} inv=${run.investigationId} state=${run.state}/${run.status}`);
  console.log(`job=${job.id} attempts=${job.attemptsMade} failedReason=${job.failedReason ?? "-"}`);

  // Re-open a TERMINAL run exactly as a fresh submission would create it.
  // Non-terminal runs (e.g. ANALYZING after a successful earlier file) are
  // left untouched — the handler's re-entrant ladder handles them correctly.
  if (["FAILED", "CANCELLED", "COMPLETED"].includes(run.status)) {
    await db.investigationRun.update({
      where: { id: run.id },
      data: { state: "CREATED", status: "RUNNING", error: null },
    });
    console.log(`Reopened run ${run.id} -> CREATED/RUNNING`);
  } else {
    console.log(`Run is already non-terminal (${run.state}/${run.status}); no re-open needed.`);
  }

  // ---- 4. Re-drive the durable handler with the original payload ------------
  const fakeJob = {
    id: `${job.id}-replay`,
    name: "ingest-evidence",
    data: job.data,
    attemptsMade: 0,
    opts: { attempts: 3 },
  } as unknown as Parameters<typeof handleIngestEvidenceJob>[0];

  await handleIngestEvidenceJob(fakeJob);
  console.log("\nhandleIngestEvidenceJob completed without throwing.");

  // ---- 5. Verify ------------------------------------------------------------
  const after = await db.investigationRun.findUniqueOrThrow({
    where: { id: run.id },
  });
  const evidence = await db.evidence.count({
    where: { investigationId: run.investigationId },
  });
  const observations = await db.observation.count({
    where: { investigationId: run.investigationId },
  });
  const attempts = await db.ingestionAttempt.count({
    where: { investigationId: run.investigationId },
  });
  console.log("\n=== POST-REPLAY STATE ===");
  console.log(
    `run=${after.id} status=${after.status} state=${after.state} error=${after.error ?? "-"}`,
  );
  console.log(`evidence=${evidence} observations=${observations} attempts(rows)=${attempts}`);

  await investigationQueue.close();
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error("Replay failed:", err);
  await db.$disconnect();
  process.exit(1);
});