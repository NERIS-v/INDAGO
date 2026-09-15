-- ============================================================================
-- Phase 5A-PR11 — Targeted Reblocking: durable TargetedReblockRun
--
-- One authoritative row per targeted reblock execution identity. The run
-- identity is case-scoped and deterministic: the run's identityKey is the
-- canonical ordered representation of (caseId, graphVersionId, regionId,
-- regionPolicyVersion, policyVersion, selectedCandidateIds). runId is the
-- SHA-256 hex digest of that identity key, so identical re-runs converge to
-- one row and the DB unique constraint — never SELECT-then-INSERT — is the
-- duplicate-prevention mechanism (mirroring GraphHoleRegionAnalysis).
-- ============================================================================

-- CreateTable
CREATE TABLE "TargetedReblockRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "investigationId" TEXT,
    "graphVersionId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "regionPolicyVersion" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL DEFAULT 'v1',
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "accounting" JSONB NOT NULL,
    "counts" JSONB NOT NULL,
    "provenance" JSONB NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TargetedReblockRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TargetedReblockRun_identityKey_key" ON "TargetedReblockRun"("identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "TargetedReblockRun_runId_key" ON "TargetedReblockRun"("runId");

-- CreateIndex
CREATE INDEX "TargetedReblockRun_caseId_graphVersionId_idx" ON "TargetedReblockRun"("caseId", "graphVersionId");

-- CreateIndex
CREATE INDEX "TargetedReblockRun_regionId_idx" ON "TargetedReblockRun"("regionId");