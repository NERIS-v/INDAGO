-- ============================================================================
-- Phase 5A-PR12 — Incremental Graph-Hole Reassessment Ledger
--
-- CaseReassessmentChange  : per-case ordered change ledger. Each authoritative
--   change that may affect graph-hole intelligence gets one durable row keyed
--   by its deterministic changeId (SHA-256 of the canonical change identity).
--   `sequence` is per-case and monotonic (app-side max+1 under a transaction-
--   scoped advisory lock, mirroring GraphVersion allocation). The worker drains
--   PENDING changes in sequence order, coalesces them, and advances the cursor.
--
-- CaseReassessmentCursor  : per-case watermark (lastProcessedSequence).
--
-- ReassessmentRun         : append-only audit row per executed incremental run
--   (frozen IncrementalReassessmentRun envelope + cursorBefore/cursorAfter).
-- ============================================================================

-- CreateTable
CREATE TABLE "CaseReassessmentChange" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "graphVersionId" TEXT,
    "sequence" INTEGER NOT NULL,
    "changeId" TEXT NOT NULL,
    "trigger" JSONB NOT NULL,
    "effectClass" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseReassessmentChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaseReassessmentChange_changeId_key" ON "CaseReassessmentChange"("changeId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseReassessmentChange_caseId_sequence_key" ON "CaseReassessmentChange"("caseId", "sequence");

-- CreateIndex
CREATE INDEX "CaseReassessmentChange_caseId_sequence_idx" ON "CaseReassessmentChange"("caseId", "sequence");

-- CreateIndex
CREATE INDEX "CaseReassessmentChange_caseId_status_idx" ON "CaseReassessmentChange"("caseId", "status");

-- CreateIndex
CREATE INDEX "CaseReassessmentChange_graphVersionId_idx" ON "CaseReassessmentChange"("graphVersionId");

-- CreateTable
CREATE TABLE "CaseReassessmentCursor" (
    "caseId" TEXT NOT NULL,
    "lastProcessedSequence" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "policyVersion" TEXT NOT NULL DEFAULT 'v1',

    CONSTRAINT "CaseReassessmentCursor_pkey" PRIMARY KEY ("caseId")
);

-- CreateTable
CREATE TABLE "ReassessmentRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "investigationId" TEXT,
    "changeId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "graphVersionId" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL DEFAULT 'v1',
    "envelope" JSONB NOT NULL,
    "cursorBefore" INTEGER NOT NULL,
    "cursorAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReassessmentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReassessmentRun_runId_key" ON "ReassessmentRun"("runId");

-- CreateIndex
CREATE INDEX "ReassessmentRun_caseId_sequence_idx" ON "ReassessmentRun"("caseId", "sequence");

-- CreateIndex
CREATE INDEX "ReassessmentRun_changeId_idx" ON "ReassessmentRun"("changeId");

-- CreateIndex
CREATE INDEX "ReassessmentRun_caseId_idx" ON "ReassessmentRun"("caseId");