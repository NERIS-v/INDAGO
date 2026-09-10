-- CreateTable
CREATE TABLE "InvestigationRun" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "currentStage" TEXT,
    "contextData" JSONB NOT NULL,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestigationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCheckpoint" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "toolResults" JSONB,
    "nextAction" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolExecution" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "detectedMimeType" TEXT NOT NULL,
    "declaredMimeType" TEXT,
    "originalFilename" TEXT,
    "contentSizeBytes" INTEGER NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "investigationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "hashVerified" BOOLEAN NOT NULL DEFAULT false,
    "mimeVerified" BOOLEAN NOT NULL DEFAULT false,
    "providerMetadata" JSONB,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionAttempt" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "sourceId" TEXT,
    "artifactId" TEXT,
    "parserId" TEXT,
    "parserVersion" TEXT,
    "format" TEXT,
    "error" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawExtraction" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "parserId" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "extraction" JSONB NOT NULL,
    "warnings" JSONB,
    "extractedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormalizedExtraction" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "normalizerId" TEXT NOT NULL,
    "normalizerVersion" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "canonicalFields" JSONB NOT NULL,
    "quality" JSONB NOT NULL,
    "lexicalStatistics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NormalizedExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "catalog" TEXT NOT NULL,
    "declaredCatalog" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceName" TEXT NOT NULL,
    "sourceDescription" TEXT,
    "evidenceType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "observedAt" JSONB,
    "artifactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL,
    "candidateMentions" JSONB NOT NULL,
    "provenance" JSONB NOT NULL,
    "observedAt" JSONB,
    "eventTime" JSONB,
    "sourceContextId" TEXT,
    "validityInterval" JSONB,
    "entityIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityMentionCandidate" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "start" INTEGER NOT NULL,
    "end" INTEGER NOT NULL,
    "entityType" TEXT,
    "extractionMethod" TEXT NOT NULL,
    "canonicalMatchValue" TEXT,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityMentionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidatePair" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "investigationId" TEXT,
    "leftCandidateId" TEXT NOT NULL,
    "rightCandidateId" TEXT NOT NULL,
    "blockingPasses" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidatePair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityHypothesis" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "investigationId" TEXT,
    "candidatePairId" TEXT NOT NULL,
    "entityId" TEXT,
    "resolvedEntityId" TEXT,
    "status" TEXT NOT NULL,
    "comparisonStatus" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "scoreModelVersion" TEXT NOT NULL,
    "supportingCandidateIds" JSONB NOT NULL,
    "supportingObservationIds" JSONB NOT NULL,
    "contradictingObservationIds" JSONB NOT NULL,
    "provenance" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityHypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "investigationId" TEXT,
    "canonicalName" TEXT NOT NULL,
    "entityType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "observationIds" JSONB NOT NULL,
    "hypothesisIds" JSONB NOT NULL,
    "sourceIdentifiers" JSONB,
    "provenance" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelationHypothesis" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "investigationId" TEXT,
    "sourceEntityId" TEXT NOT NULL,
    "targetEntityId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "support" DOUBLE PRECISION NOT NULL,
    "evidenceBasis" JSONB NOT NULL,
    "contradictions" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "scoreModelVersion" TEXT NOT NULL,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "evidenceStrength" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceCoverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "temporalCoverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "directed" BOOLEAN NOT NULL DEFAULT true,
    "validityInterval" JSONB,
    "temporalAssertions" JSONB,
    "provenance" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelationHypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relation" (
    "id" TEXT NOT NULL,
    "relationKey" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "investigationId" TEXT,
    "sourceEntityId" TEXT NOT NULL,
    "targetEntityId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "directed" BOOLEAN NOT NULL,
    "support" DOUBLE PRECISION NOT NULL,
    "evidenceBasis" JSONB NOT NULL,
    "contradictions" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "scoreModelVersion" TEXT NOT NULL,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "provenance" JSONB NOT NULL,
    "hypothesisId" TEXT NOT NULL,
    "validityInterval" JSONB,
    "temporalAssertions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "Relation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemporalStateChange" (
    "id" TEXT NOT NULL,
    "logicalKey" TEXT,
    "caseId" TEXT NOT NULL,
    "investigationId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "stateType" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eventTime" JSONB,
    "validityInterval" JSONB,
    "provenance" JSONB,
    "ingestedAt" TIMESTAMP(3),
    "transactionTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemporalStateChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedTo" TEXT NOT NULL,
    "jurisdiction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphVersion" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "investigationId" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "parentGraphVersionId" TEXT,
    "projectionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "nodeCount" INTEGER NOT NULL DEFAULT 0,
    "edgeCount" INTEGER NOT NULL DEFAULT 0,
    "checkpointId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraphVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvestigationRun_investigationId_key" ON "InvestigationRun"("investigationId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_hash_key" ON "AuditEvent"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "Artifact_contentHash_key" ON "Artifact"("contentHash");

-- CreateIndex
CREATE INDEX "Artifact_investigationId_idx" ON "Artifact"("investigationId");

-- CreateIndex
CREATE INDEX "Artifact_idempotencyKey_idx" ON "Artifact"("idempotencyKey");

-- CreateIndex
CREATE INDEX "IngestionAttempt_idempotencyKey_idx" ON "IngestionAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "IngestionAttempt_artifactId_idx" ON "IngestionAttempt"("artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionAttempt_investigationId_idempotencyKey_key" ON "IngestionAttempt"("investigationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "RawExtraction_artifactId_extractedAt_idx" ON "RawExtraction"("artifactId", "extractedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RawExtraction_attemptId_key" ON "RawExtraction"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "NormalizedExtraction_attemptId_key" ON "NormalizedExtraction"("attemptId");

-- CreateIndex
CREATE INDEX "NormalizedExtraction_investigationId_idx" ON "NormalizedExtraction"("investigationId");

-- CreateIndex
CREATE INDEX "NormalizedExtraction_artifactId_createdAt_idx" ON "NormalizedExtraction"("artifactId", "createdAt");

-- CreateIndex
CREATE INDEX "Source_caseId_idx" ON "Source"("caseId");

-- CreateIndex
CREATE INDEX "Source_investigationId_idx" ON "Source"("investigationId");

-- CreateIndex
CREATE INDEX "Evidence_caseId_idx" ON "Evidence"("caseId");

-- CreateIndex
CREATE INDEX "Evidence_sourceId_idx" ON "Evidence"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_investigationId_operationId_artifactId_key" ON "Evidence"("investigationId", "operationId", "artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "Observation_identityKey_key" ON "Observation"("identityKey");

-- CreateIndex
CREATE INDEX "Observation_investigationId_caseId_idx" ON "Observation"("investigationId", "caseId");

-- CreateIndex
CREATE INDEX "Observation_sourceId_idx" ON "Observation"("sourceId");

-- CreateIndex
CREATE INDEX "Observation_evidenceId_idx" ON "Observation"("evidenceId");

-- CreateIndex
CREATE INDEX "Observation_sourceContextId_idx" ON "Observation"("sourceContextId");

-- CreateIndex
CREATE INDEX "Observation_caseId_sourceContextId_idx" ON "Observation"("caseId", "sourceContextId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityMentionCandidate_identityKey_key" ON "EntityMentionCandidate"("identityKey");

-- CreateIndex
CREATE INDEX "EntityMentionCandidate_observationId_idx" ON "EntityMentionCandidate"("observationId");

-- CreateIndex
CREATE INDEX "EntityMentionCandidate_investigationId_caseId_idx" ON "EntityMentionCandidate"("investigationId", "caseId");

-- CreateIndex
CREATE INDEX "EntityMentionCandidate_entityType_idx" ON "EntityMentionCandidate"("entityType");

-- CreateIndex
CREATE UNIQUE INDEX "CandidatePair_identityKey_key" ON "CandidatePair"("identityKey");

-- CreateIndex
CREATE INDEX "CandidatePair_caseId_idx" ON "CandidatePair"("caseId");

-- CreateIndex
CREATE INDEX "CandidatePair_investigationId_caseId_idx" ON "CandidatePair"("investigationId", "caseId");

-- CreateIndex
CREATE INDEX "CandidatePair_leftCandidateId_idx" ON "CandidatePair"("leftCandidateId");

-- CreateIndex
CREATE INDEX "CandidatePair_rightCandidateId_idx" ON "CandidatePair"("rightCandidateId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityHypothesis_identityKey_key" ON "EntityHypothesis"("identityKey");

-- CreateIndex
CREATE INDEX "EntityHypothesis_caseId_idx" ON "EntityHypothesis"("caseId");

-- CreateIndex
CREATE INDEX "EntityHypothesis_investigationId_caseId_idx" ON "EntityHypothesis"("investigationId", "caseId");

-- CreateIndex
CREATE INDEX "EntityHypothesis_candidatePairId_idx" ON "EntityHypothesis"("candidatePairId");

-- CreateIndex
CREATE INDEX "EntityHypothesis_status_idx" ON "EntityHypothesis"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_identityKey_key" ON "Entity"("identityKey");

-- CreateIndex
CREATE INDEX "Entity_caseId_idx" ON "Entity"("caseId");

-- CreateIndex
CREATE INDEX "Entity_investigationId_caseId_idx" ON "Entity"("investigationId", "caseId");

-- CreateIndex
CREATE INDEX "Entity_status_idx" ON "Entity"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RelationHypothesis_identityKey_key" ON "RelationHypothesis"("identityKey");

-- CreateIndex
CREATE INDEX "RelationHypothesis_caseId_idx" ON "RelationHypothesis"("caseId");

-- CreateIndex
CREATE INDEX "RelationHypothesis_investigationId_caseId_idx" ON "RelationHypothesis"("investigationId", "caseId");

-- CreateIndex
CREATE INDEX "RelationHypothesis_sourceEntityId_idx" ON "RelationHypothesis"("sourceEntityId");

-- CreateIndex
CREATE INDEX "RelationHypothesis_targetEntityId_idx" ON "RelationHypothesis"("targetEntityId");

-- CreateIndex
CREATE INDEX "RelationHypothesis_status_idx" ON "RelationHypothesis"("status");

-- CreateIndex
CREATE INDEX "RelationHypothesis_relationType_idx" ON "RelationHypothesis"("relationType");

-- CreateIndex
CREATE UNIQUE INDEX "Relation_relationKey_key" ON "Relation"("relationKey");

-- CreateIndex
CREATE INDEX "Relation_caseId_idx" ON "Relation"("caseId");

-- CreateIndex
CREATE INDEX "Relation_investigationId_caseId_idx" ON "Relation"("investigationId", "caseId");

-- CreateIndex
CREATE INDEX "Relation_sourceEntityId_idx" ON "Relation"("sourceEntityId");

-- CreateIndex
CREATE INDEX "Relation_targetEntityId_idx" ON "Relation"("targetEntityId");

-- CreateIndex
CREATE INDEX "Relation_status_idx" ON "Relation"("status");

-- CreateIndex
CREATE INDEX "Relation_relationType_idx" ON "Relation"("relationType");

-- CreateIndex
CREATE UNIQUE INDEX "TemporalStateChange_logicalKey_key" ON "TemporalStateChange"("logicalKey");

-- CreateIndex
CREATE INDEX "TemporalStateChange_caseId_sequence_idx" ON "TemporalStateChange"("caseId", "sequence");

-- CreateIndex
CREATE INDEX "TemporalStateChange_caseId_entityType_entityId_idx" ON "TemporalStateChange"("caseId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "TemporalStateChange_entityId_idx" ON "TemporalStateChange"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "TemporalStateChange_caseId_entityType_entityId_sequence_key" ON "TemporalStateChange"("caseId", "entityType", "entityId", "sequence");

-- CreateIndex
CREATE INDEX "GraphVersion_caseId_versionNumber_idx" ON "GraphVersion"("caseId", "versionNumber");

-- CreateIndex
CREATE INDEX "GraphVersion_caseId_status_idx" ON "GraphVersion"("caseId", "status");

-- CreateIndex
CREATE INDEX "GraphVersion_caseId_projectionStatus_idx" ON "GraphVersion"("caseId", "projectionStatus");

-- CreateIndex
CREATE INDEX "GraphVersion_parentGraphVersionId_idx" ON "GraphVersion"("parentGraphVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "GraphVersion_caseId_versionNumber_key" ON "GraphVersion"("caseId", "versionNumber");

-- AddForeignKey
ALTER TABLE "AgentCheckpoint" ADD CONSTRAINT "AgentCheckpoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "InvestigationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolExecution" ADD CONSTRAINT "ToolExecution_runId_fkey" FOREIGN KEY ("runId") REFERENCES "InvestigationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionAttempt" ADD CONSTRAINT "IngestionAttempt_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawExtraction" ADD CONSTRAINT "RawExtraction_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "IngestionAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawExtraction" ADD CONSTRAINT "RawExtraction_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedExtraction" ADD CONSTRAINT "NormalizedExtraction_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "IngestionAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedExtraction" ADD CONSTRAINT "NormalizedExtraction_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityMentionCandidate" ADD CONSTRAINT "EntityMentionCandidate_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidatePair" ADD CONSTRAINT "CandidatePair_leftCandidateId_fkey" FOREIGN KEY ("leftCandidateId") REFERENCES "EntityMentionCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidatePair" ADD CONSTRAINT "CandidatePair_rightCandidateId_fkey" FOREIGN KEY ("rightCandidateId") REFERENCES "EntityMentionCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityHypothesis" ADD CONSTRAINT "EntityHypothesis_candidatePairId_fkey" FOREIGN KEY ("candidatePairId") REFERENCES "CandidatePair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

