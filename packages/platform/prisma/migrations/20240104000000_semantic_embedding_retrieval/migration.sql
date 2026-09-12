-- ============================================================================
-- Phase 5A-PR1.5: Semantic embedding + retrieval (pgvector)
--
-- Requires the pgvector extension (vector type + cosine distance).
-- CI runs this against pgvector/pgvector:pg16; Neon provides vector natively.
-- The `vector` column is managed ONLY in raw SQL (Prisma models it as
-- Unsupported), so a future `prisma migrate dev` drift diff MUST NOT drop it.
-- V1 ships NO ANN index — retrieval is exact cosine distance (see footer note).
-- ============================================================================

-- CreateExtension (declared as `extensions = [vector]` in schema.prisma)
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";

-- CreateTable
CREATE TABLE "SemanticTextUnit" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "temporalScope" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SemanticTextUnit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SemanticEmbedding" (
    "id" TEXT NOT NULL,
    "semanticTextUnitId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "embeddingPolicyVersion" TEXT NOT NULL,
    "vector" vector(768) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SemanticEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SemanticTextUnit_caseId_sourceType_sourceId_key" ON "SemanticTextUnit"("caseId", "sourceType", "sourceId");
CREATE INDEX "SemanticTextUnit_caseId_idx" ON "SemanticTextUnit"("caseId");
CREATE INDEX "SemanticTextUnit_contentHash_idx" ON "SemanticTextUnit"("contentHash");

CREATE UNIQUE INDEX "SemanticEmbedding_semanticTextUnitId_providerId_modelId_modelV_key" ON "SemanticEmbedding"("semanticTextUnitId", "providerId", "modelId", "modelVersion", "embeddingPolicyVersion");
CREATE INDEX "SemanticEmbedding_caseId_providerId_modelId_modelVersion_embed_idx" ON "SemanticEmbedding"("caseId", "providerId", "modelId", "modelVersion", "embeddingPolicyVersion");

-- AddForeignKey
ALTER TABLE "SemanticEmbedding" ADD CONSTRAINT "SemanticEmbedding_semanticTextUnitId_fkey" FOREIGN KEY ("semanticTextUnitId") REFERENCES "SemanticTextUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- NOTE: NO ANN index in V1. Retrieval uses EXACT cosine distance ordering
--   ORDER BY (e."vector" <=> query_vector) ASC, u."id" ASC
-- A global HNSW index over vectors that belong to many cases / providers /
-- models / policies is SAFE-UNSOUND for the required filtering semantics:
-- ANN candidate generation is not scoped to the search identity and can
-- therefore return INCOMPLETE filtered results (candidates pruned before the
-- caseId/providerId/modelId/modelVersion/embeddingPolicyVersion/contentHash/
-- temporal filters apply). ANN/HNSW is intentionally DEFERRED until dataset
-- scale and an identity-aware filtering/index strategy justify it. The plain
-- btree indexes above keep the filtered access paths exact and cheap.