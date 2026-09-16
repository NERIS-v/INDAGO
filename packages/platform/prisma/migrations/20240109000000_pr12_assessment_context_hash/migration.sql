-- ============================================================================
-- Phase 5A-PR12 — GraphHoleAssessment.contextSha256 (AI-skip gate)
--
-- The bounded analysis context digest recorded on each assessment APPENDED BY
-- THE PR12 RUNTIME. V1 semantic: when the newly-built analysis context hashes
-- to the SAME digest as the last REASSESSMENT/QUALIFICATION assessment, the
-- AI analyst+validator+judge stages are SKIPPED deterministically
-- (SKIPPED_CONTEXT_UNCHANGED). Null on assessments written by earlier stages
-- (pre-PR12 PR6 persistence) — those never short-circuit the AI gate.
--
-- Backward compatible: additive nullable column; no backfill required.
-- ============================================================================

-- AlterTable
ALTER TABLE "GraphHoleAssessment"
    ADD COLUMN "contextSha256" TEXT;