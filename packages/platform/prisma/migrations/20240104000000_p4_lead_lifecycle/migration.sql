-- P4: InvestigativeLead backend lifecycle — Lead, LeadEvidenceLink, LeadEvent.
--
-- Lead: the persisted, reviewable investigation-loop record produced by
-- interpreting a P4 graph-analytics candidate (bridge / temporal burst /
-- community / cross-case match) into a line of inquiry. See schema.prisma
-- model comment for full identity/lifecycle discipline.
--
-- LeadEvidenceLink: dedicated evidence FOR/AGAINST attach surface (Phase-4
-- tracker gap: hypotheses already persist evidenceBasis/contradictions, but
-- there was no dedicated attach API or verdict rationale at the Lead level).
--
-- LeadEvent: append-only lead provenance/audit trail, mirroring
-- TemporalStateChange's append-only discipline (D6) at the Lead level.

CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "investigationId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "confidence" DOUBLE PRECISION NOT NULL,
    "posture" TEXT NOT NULL,
    "relatedEntityIds" JSONB NOT NULL,
    "supportingObservationIds" JSONB NOT NULL,
    "contradictingObservationIds" JSONB NOT NULL DEFAULT '[]',
    "relatedEvidenceIds" JSONB NOT NULL DEFAULT '[]',
    "gapIds" JSONB NOT NULL DEFAULT '[]',
    "sourceCandidateType" TEXT NOT NULL,
    "sourceCandidateKey" TEXT NOT NULL,
    "sourceCandidateSnapshot" JSONB NOT NULL,
    "alternativeExplanations" JSONB NOT NULL DEFAULT '[]',
    "provenance" JSONB NOT NULL,
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Lead_caseId_idx" ON "Lead"("caseId");
CREATE INDEX "Lead_investigationId_caseId_idx" ON "Lead"("investigationId", "caseId");
CREATE INDEX "Lead_caseId_status_idx" ON "Lead"("caseId", "status");
CREATE INDEX "Lead_sourceCandidateType_idx" ON "Lead"("sourceCandidateType");

CREATE TABLE "LeadEvidenceLink" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "leadId" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "rationale" TEXT,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadEvidenceLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadEvidenceLink_leadId_observationId_verdict_key"
  ON "LeadEvidenceLink"("leadId", "observationId", "verdict");
CREATE INDEX "LeadEvidenceLink_leadId_idx" ON "LeadEvidenceLink"("leadId");
CREATE INDEX "LeadEvidenceLink_observationId_idx" ON "LeadEvidenceLink"("observationId");

CREATE TABLE "LeadEvent" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "leadId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadEvent_leadId_sequence_key" ON "LeadEvent"("leadId", "sequence");
CREATE INDEX "LeadEvent_leadId_idx" ON "LeadEvent"("leadId");
CREATE INDEX "LeadEvent_caseId_idx" ON "LeadEvent"("caseId");

-- Append-only guard for LeadEvent, mirroring the TemporalStateChange trigger
-- (D6 discipline applied to lead provenance): rows are written once and
-- NEVER updated or deleted. TRUNCATE is deliberately NOT blocked — row-level
-- BEFORE triggers do not fire on TRUNCATE, preserving the legitimate
-- test/diagnostic reset seam while guaranteeing append-only row writes.

CREATE OR REPLACE FUNCTION guard_lead_event_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'lead_event is append-only: % is forbidden', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS lead_event_append_only ON "LeadEvent";
CREATE TRIGGER lead_event_append_only
    BEFORE UPDATE OR DELETE ON "LeadEvent"
    FOR EACH ROW
    EXECUTE FUNCTION guard_lead_event_append_only();
