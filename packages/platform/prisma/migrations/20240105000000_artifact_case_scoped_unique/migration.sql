-- H1: Artifact identity scoped to (caseId, contentHash).
-- The contentHash global-unique index promoted cross-case rows to a single
-- content-addressed row, letting one case's provenance clobber another's.
-- Drop it and add a composite unique key per case.

-- DropIndex
DROP INDEX "Artifact_contentHash_key";

-- CreateIndex
CREATE UNIQUE INDEX "Artifact_caseId_contentHash_key" ON "Artifact"("caseId", "contentHash");