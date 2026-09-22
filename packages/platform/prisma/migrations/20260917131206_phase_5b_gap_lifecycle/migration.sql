-- ============================================================================
-- Phase 5B-PR1 — GraphHole Gap Lifecycle
--
-- Adds the persistence boundary for:
--   GraphHole -> InvestigativeGap
--
-- Also introduces EvidenceRequest as the downstream workflow object.
--
-- IMPORTANT:
--   - GraphHole / GraphHoleAssessment / TargetedReblockRun are owned by
--     earlier migrations and are NOT recreated here.
--   - CaseReassessmentChange / CaseReassessmentCursor / ReassessmentRun
--     are owned by PR12 and are NOT recreated here.
--   - This migration intentionally contains only the 5B gap-lifecycle
--     persistence changes.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- GraphHole -> InvestigativeGap linkage
-- ----------------------------------------------------------------------------

ALTER TABLE "GraphHole"
ADD COLUMN "investigationGapId" TEXT;


-- ----------------------------------------------------------------------------
-- InvestigativeGap
-- ----------------------------------------------------------------------------

CREATE TABLE "InvestigativeGap" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "graphHoleCandidateId" TEXT NOT NULL,
    "graphHoleId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IDENTIFIED',
    "priority" TEXT NOT NULL,
    "impact" DOUBLE PRECISION NOT NULL,
    "expectedInformationValue" DOUBLE PRECISION,
    "relatedEntityIds" JSONB,
    "relatedHypothesisIds" JSONB,
    "evidenceRequestIds" JSONB,
    "resolution" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "InvestigativeGap_pkey"
        PRIMARY KEY ("id")
);


-- ----------------------------------------------------------------------------
-- EvidenceRequest
-- ----------------------------------------------------------------------------

CREATE TABLE "EvidenceRequest" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "gapId" TEXT NOT NULL,
    "candidateSnapshot" JSONB NOT NULL,
    "utilityScore" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "requestedBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "fulfillingObservationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceRequest_pkey"
        PRIMARY KEY ("id")
);


-- ----------------------------------------------------------------------------
-- InvestigativeGap indexes
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX "InvestigativeGap_identityKey_key"
    ON "InvestigativeGap"("identityKey");

CREATE INDEX "InvestigativeGap_caseId_status_idx"
    ON "InvestigativeGap"("caseId", "status");

CREATE INDEX "InvestigativeGap_investigationId_status_idx"
    ON "InvestigativeGap"("investigationId", "status");

CREATE INDEX "InvestigativeGap_caseId_graphHoleCandidateId_idx"
    ON "InvestigativeGap"("caseId", "graphHoleCandidateId");

CREATE INDEX "InvestigativeGap_graphHoleId_idx"
    ON "InvestigativeGap"("graphHoleId");


-- ----------------------------------------------------------------------------
-- EvidenceRequest indexes
-- ----------------------------------------------------------------------------

CREATE INDEX "EvidenceRequest_caseId_status_idx"
    ON "EvidenceRequest"("caseId", "status");


-- ----------------------------------------------------------------------------
-- GraphHole lookup index
-- ----------------------------------------------------------------------------

CREATE INDEX "GraphHole_investigationGapId_idx"
    ON "GraphHole"("investigationGapId");