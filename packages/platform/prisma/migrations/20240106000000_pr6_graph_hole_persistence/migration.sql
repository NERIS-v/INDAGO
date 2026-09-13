-- Phase 5A-PR6: GraphHole intelligence persistence.
--
-- Creates the SINGLE authoritative persistence boundary for the deterministic
-- PR4/PR5 pipeline:
--   GraphHoleRegionAnalysis      — region-analysis results (no-repeat + traceability)
--   GraphHole                    — authoritative current intelligence finding per candidate
--   GraphHoleDetectorContribution — every detector that proposed a candidate (deduplication)
--   GraphHoleAssessment          — append-only assessment/state history
--
-- Identity discipline (mirrors the repo-wide identityKey convention):
--   - regionId / candidateId are SHA-256 of the canonical identity string and
--     are computed by @indago/graph-hole-region / @indago/graph-hole-detection.
--   - identityKey @unique stores the canonical identity STRING; the DB (not
--     SELECT-then-INSERT) is the duplicate-prevention mechanism.
--   - id is a random UUID RECORD id, distinct from the domain candidateId
--     (same stance as GraphVersion).
--
-- NO-FK DECOUPLING (intentional): caseId / graphVersionId / regionId /
-- supersedesGraphHoleId are plain indexed columns. Contribution + Assessment
-- are strict children of GraphHole and carry prisma FKs.
--
-- This migration is purely additive; it does not touch unrelated models.

-- CreateTable
CREATE TABLE "GraphHoleRegionAnalysis" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "investigationId" TEXT,
    "graphVersionId" TEXT NOT NULL,
    "regionPolicyVersion" TEXT NOT NULL,
    "semanticRetrievalPolicyVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "seedObservationIds" JSONB NOT NULL,
    "nodeIds" JSONB NOT NULL,
    "edgeIds" JSONB NOT NULL,
    "temporalContext" JSONB,
    "summary" JSONB,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraphHoleRegionAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GraphHoleRegionAnalysis_identityKey_key" ON "GraphHoleRegionAnalysis"("identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "GraphHoleRegionAnalysis_regionId_caseId_graphVersionId_regionPolicyVersion_key"
    ON "GraphHoleRegionAnalysis"("regionId", "caseId", "graphVersionId", "regionPolicyVersion");

-- CreateIndex
CREATE INDEX "GraphHoleRegionAnalysis_caseId_idx" ON "GraphHoleRegionAnalysis"("caseId");

-- CreateIndex
CREATE INDEX "GraphHoleRegionAnalysis_caseId_graphVersionId_idx"
    ON "GraphHoleRegionAnalysis"("caseId", "graphVersionId");

-- CreateIndex
CREATE INDEX "GraphHoleRegionAnalysis_graphVersionId_idx"
    ON "GraphHoleRegionAnalysis"("graphVersionId");

-- CreateTable
CREATE TABLE "GraphHole" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "investigationId" TEXT,
    "graphVersionId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "holeType" TEXT NOT NULL,
    "canonicalNodeIds" JSONB NOT NULL,
    "expectedRelationshipType" TEXT,
    "temporalScope" JSONB,
    "detectionPolicyVersion" TEXT NOT NULL,
    "scoringPolicyVersion" TEXT NOT NULL,
    "qualificationPolicyVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "structuralScore" DOUBLE PRECISION NOT NULL,
    "evidenceSupportScore" DOUBLE PRECISION NOT NULL,
    "expectedInformationValue" DOUBLE PRECISION NOT NULL,
    "significance" DOUBLE PRECISION NOT NULL,
    "supersedesGraphHoleId" TEXT,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraphHole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GraphHole_identityKey_key" ON "GraphHole"("identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "GraphHole_caseId_candidateId_key"
    ON "GraphHole"("caseId", "candidateId");

-- CreateIndex
CREATE INDEX "GraphHole_caseId_status_idx" ON "GraphHole"("caseId", "status");

-- CreateIndex
CREATE INDEX "GraphHole_graphVersionId_idx" ON "GraphHole"("graphVersionId");

-- CreateIndex
CREATE INDEX "GraphHole_regionId_idx" ON "GraphHole"("regionId");

-- CreateTable
CREATE TABLE "GraphHoleDetectorContribution" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "graphHoleId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "detectorType" TEXT NOT NULL,
    "detectionPolicyVersion" TEXT NOT NULL,
    "structuralBasis" TEXT NOT NULL,
    "supportingHypothesisIds" JSONB NOT NULL,
    "supportingObservationIds" JSONB NOT NULL,
    "contradictingObservationIds" JSONB NOT NULL,
    "observedEdgeIds" JSONB NOT NULL,
    "detectorMetadata" JSONB NOT NULL,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GraphHoleDetectorContribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GraphHoleDetectorContribution_identityKey_key"
    ON "GraphHoleDetectorContribution"("identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "GraphHoleDetectorContribution_graphHoleId_detectorType_detectionPolicyVersion_key"
    ON "GraphHoleDetectorContribution"("graphHoleId", "detectorType", "detectionPolicyVersion");

-- CreateIndex
CREATE INDEX "GraphHoleDetectorContribution_caseId_idx"
    ON "GraphHoleDetectorContribution"("caseId");

-- CreateIndex
CREATE INDEX "GraphHoleDetectorContribution_candidateId_idx"
    ON "GraphHoleDetectorContribution"("candidateId");

-- AddForeignKey
ALTER TABLE "GraphHoleDetectorContribution"
    ADD CONSTRAINT "GraphHoleDetectorContribution_graphHoleId_fkey"
    FOREIGN KEY ("graphHoleId") REFERENCES "GraphHole"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "GraphHoleAssessment" (
    "id" TEXT NOT NULL,
    "graphHoleId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "logicalKey" TEXT,
    "assessmentType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "graphVersionId" TEXT NOT NULL,
    "detectionPolicyVersion" TEXT NOT NULL,
    "scoringPolicyVersion" TEXT NOT NULL,
    "qualificationPolicyVersion" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GraphHoleAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GraphHoleAssessment_logicalKey_key" ON "GraphHoleAssessment"("logicalKey");

-- CreateIndex
CREATE UNIQUE INDEX "GraphHoleAssessment_graphHoleId_sequence_key"
    ON "GraphHoleAssessment"("graphHoleId", "sequence");

-- CreateIndex
CREATE INDEX "GraphHoleAssessment_graphHoleId_idx" ON "GraphHoleAssessment"("graphHoleId");

-- CreateIndex
CREATE INDEX "GraphHoleAssessment_caseId_idx" ON "GraphHoleAssessment"("caseId");

-- AddForeignKey
ALTER TABLE "GraphHoleAssessment"
    ADD CONSTRAINT "GraphHoleAssessment_graphHoleId_fkey"
    FOREIGN KEY ("graphHoleId") REFERENCES "GraphHole"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;