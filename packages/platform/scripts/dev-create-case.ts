// ============================================================================
// Dev tooling: provision a Case row directly (the same boundary POST
// /investigations/start uses — caseStore.ensureCase). Strictly for manual
// testing: there is no case-creation REST endpoint yet; cases are provisioned
// when an investigation starts. The demo principal is scoped to the two
// DEMO_ALLOWED_CASES ids + INDAGO_DEV_ALLOWED_CASES grants, so to be reachable
// through the live-mode web flow a case id must be one of those.
//
// Usage (from packages/platform):
//   npx tsx scripts/dev-create-case.ts [caseId] [assignedTo]
//   default caseId = 550e8400-e29b-41d4-a716-446655440010 (demo-allowed)
//
// Listing existing cases without creating:
//   npx tsx scripts/dev-create-case.ts --list
// ============================================================================

import { caseStore } from "../src/persistence/case-store.js";
import { db } from "../src/db/prisma.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes("--list")) {
    const cases = await db.case.findMany({ orderBy: { updatedAt: "desc" } });
    const runs = await db.investigationRun.findMany({
      select: { caseId: true, investigationId: true, status: true },
      orderBy: { createdAt: "desc" },
    });
    console.log(`Cases in backend: ${cases.length}`);
    for (const c of cases) {
      console.log(
        `- id=${c.id} title="${c.title}" status=${c.status} assignedTo=${c.assignedTo} created=${c.createdAt.toISOString()}`,
      );
    }
    console.log(`Runs in backend: ${runs.length}`);
    for (const r of runs) {
      console.log(`- inv=${r.investigationId} case=${r.caseId} status=${r.status}`);
    }
    return;
  }

  const [rawCaseId, rawAssignee] = argv;
  const caseId = rawCaseId ?? "550e8400-e29b-41d4-a716-446655440010";
  const assignedTo = rawAssignee ?? "usr_demo_123";

  const existing = await db.case.findUnique({ where: { id: caseId } });
  if (existing) {
    console.log(`Case ${caseId} already exists (${existing.status}). Nothing to do.`);
    return;
  }

  await caseStore.ensureCase(caseId, assignedTo);
  const created = await db.case.findUnique({ where: { id: caseId } });
  if (!created) throw new Error("Case provisioning failed — was not persisted");
  console.log(`Case created:`);
  console.log(`- id=${created.id} title="${created.title}" status=${created.status}`);
  console.log(
    `- This id is in the demo principal allow-list, so live-mode web flow (/investigations/new with NEXT_PUBLIC_DATA_MODE=live) can start an investigation + upload evidence for it.`,
  );
}

main()
  .catch((err) => {
    console.error("Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());