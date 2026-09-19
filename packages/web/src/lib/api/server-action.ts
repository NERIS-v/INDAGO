"use server";

import {
  startInvestigation as apiStart,
  getInvestigationStatus as apiGetStatus,
  submitEvidence as apiSubmitEvidence,
  listObservations as apiListObservations,
  listEvidence as apiListEvidence,
  listCases as apiListCases,
  deleteCase as apiDeleteCase,
  getInvestigationGraph as apiGetGraph,
  listGraphVersions as apiListGraphVersions,
  getGraphVersionDetails as apiGetGraphVersionDetails,
  listTemporalBursts as apiListTemporalBursts,
  listCommunityCandidates as apiListCommunityCandidates,
  listBridgeCandidates as apiListBridgeCandidates,
  traverseGraph as apiTraverseGraph,
  listConnectingPaths as apiListConnectingPaths,
  getGraphCentrality as apiGetGraphCentrality,
  getGraphCommunities as apiGetGraphCommunities,
  getGraphValidAt as apiGetGraphValidAt,
  listLeads as apiListLeads,
  getLead as apiGetLead,
  generateLeads as apiGenerateLeads,
  attachLeadEvidence as apiAttachLeadEvidence,
  transitionLeadStatus as apiTransitionLeadStatus,
  listCrossCaseLinks as apiListCrossCaseLinks,
  generateCrossCaseLeads as apiGenerateCrossCaseLeads,
  pauseInvestigation as apiPauseInvestigation,
  resumeInvestigation as apiResumeInvestigation,
  resolveInvestigationReview as apiResolveInvestigationReview,
  listEntities as apiListEntities,
  listEntityHypotheses as apiListEntityHypotheses,
  acceptEntityHypothesis as apiAcceptEntityHypothesis,
  listRelations as apiListRelations,
  listCanonicalRelations as apiListCanonicalRelations,
  acceptRelationHypothesis as apiAcceptRelationHypothesis,
  rejectRelationHypothesis as apiRejectRelationHypothesis,
  reverseRelationHypothesis as apiReverseRelationHypothesis,
} from "@/lib/api/server";
import type {
  StartInvestigationResponse,
  InvestigationStatusResponse,
  EvidenceSubmissionRequest,
  EvidenceSubmissionResponse,
  ObservationsResponse,
  EvidenceListResponse,
  CasesResponse,
  DeleteCaseResponse,
  ProjectedGraphResponse,
  GraphVersionListResponse,
  GraphVersionDetailsResponse,
  TemporalBurstCandidatesResponse,
  CommunityCandidatesResponse,
  BridgeCandidatesResponse,
  TraversalResponse,
  ConnectingPathsResponse,
  CentralityResponse,
  CommunitiesResponse,
  ValidAtGraphResponse,
  LeadListResponse,
  LeadDetailResponse,
  GenerateLeadsResponse,
  AttachLeadEvidenceResponse,
  TransitionLeadStatusResponse,
  CrossCaseLinksResponse,
  GenerateCrossCaseLeadsResponse,
  RunCommandResponse,
  EntitiesResponse,
  EntityHypothesesResponse,
  EntityAcceptResponse,
  RelationsResponse,
  CanonicalRelationsResponse,
  RelationAcceptResponse,
  RelationDecisionResponse,
} from "@/lib/api/types";
import type { LeadStatus } from "@indago/contracts";

export async function startInvestigation(params: {
  caseId: string;
  investigationId: string;
}): Promise<StartInvestigationResponse> {
  return apiStart(params);
}

export async function getInvestigationStatus(
  investigationId: string,
  caseId: string,
): Promise<InvestigationStatusResponse> {
  return apiGetStatus(investigationId, caseId);
}

export async function submitEvidence(
  investigationId: string,
  request: Omit<EvidenceSubmissionRequest, "investigationId">,
): Promise<EvidenceSubmissionResponse> {
  return apiSubmitEvidence(investigationId, request);
}

export async function listObservations(
  investigationId: string,
): Promise<ObservationsResponse> {
  return apiListObservations(investigationId);
}

export async function listEvidence(
  investigationId: string,
): Promise<EvidenceListResponse> {
  return apiListEvidence(investigationId);
}

export async function listCases(): Promise<CasesResponse> {
  return apiListCases();
}

export async function deleteCase(caseId: string): Promise<DeleteCaseResponse> {
  return apiDeleteCase(caseId);
}

// ============================================================================
// Phase 4 server actions (graph, structural candidates, leads, cross-case,
// run control). Thin "use server" wrappers over lib/api/server — auth stays
// behind the server boundary.
// ============================================================================

export async function getInvestigationGraph(
  investigationId: string,
): Promise<ProjectedGraphResponse> {
  return apiGetGraph(investigationId);
}

export async function listGraphVersions(
  caseId: string,
  params?: { limit?: number; offset?: number },
): Promise<GraphVersionListResponse> {
  return apiListGraphVersions(caseId, params);
}

export async function getGraphVersionDetails(
  caseId: string,
  versionId: string,
): Promise<GraphVersionDetailsResponse> {
  return apiGetGraphVersionDetails(caseId, versionId);
}

export async function getTemporalBursts(
  investigationId: string,
): Promise<TemporalBurstCandidatesResponse> {
  return apiListTemporalBursts(investigationId);
}

export async function getCommunityCandidates(
  investigationId: string,
): Promise<CommunityCandidatesResponse> {
  return apiListCommunityCandidates(investigationId);
}

export async function getBridgeCandidates(
  investigationId: string,
  maxResults?: number,
): Promise<BridgeCandidatesResponse> {
  return apiListBridgeCandidates(investigationId, maxResults);
}

export async function traverseGraph(
  investigationId: string,
  startEntityId: string,
  hops?: number,
  maxPaths?: number,
): Promise<TraversalResponse> {
  return apiTraverseGraph(investigationId, startEntityId, hops, maxPaths);
}

export async function getConnectingPaths(
  investigationId: string,
  fromEntityId: string,
  toEntityId: string,
  hops?: number,
): Promise<ConnectingPathsResponse> {
  return apiListConnectingPaths(investigationId, fromEntityId, toEntityId, hops);
}

export async function getCentrality(
  investigationId: string,
  maxResults?: number,
): Promise<CentralityResponse> {
  return apiGetGraphCentrality(investigationId, maxResults);
}

export async function getCommunities(
  investigationId: string,
): Promise<CommunitiesResponse> {
  return apiGetGraphCommunities(investigationId);
}

export async function getValidAtGraph(
  caseId: string,
  at: string,
): Promise<ValidAtGraphResponse> {
  return apiGetGraphValidAt(caseId, at);
}

export async function listLeads(
  investigationId: string,
  status?: LeadStatus,
): Promise<LeadListResponse> {
  return apiListLeads(investigationId, status);
}

export async function getLead(
  investigationId: string,
  leadId: string,
): Promise<LeadDetailResponse> {
  return apiGetLead(investigationId, leadId);
}

export async function generateLeads(
  investigationId: string,
): Promise<GenerateLeadsResponse> {
  return apiGenerateLeads(investigationId);
}

export async function attachLeadEvidence(
  investigationId: string,
  leadId: string,
  request: {
    observationId: string;
    verdict: "FOR" | "AGAINST";
    rationale?: string;
  },
): Promise<AttachLeadEvidenceResponse> {
  return apiAttachLeadEvidence(investigationId, leadId, request);
}

export async function transitionLeadStatus(
  investigationId: string,
  leadId: string,
  toStatus: LeadStatus,
): Promise<TransitionLeadStatusResponse> {
  return apiTransitionLeadStatus(investigationId, leadId, toStatus);
}

export async function listCrossCaseLinks(
  investigationId: string,
  targetCaseId: string,
): Promise<CrossCaseLinksResponse> {
  return apiListCrossCaseLinks(investigationId, targetCaseId);
}

export async function generateCrossCaseLeads(
  investigationId: string,
  targetCaseId: string,
): Promise<GenerateCrossCaseLeadsResponse> {
  return apiGenerateCrossCaseLeads(investigationId, targetCaseId);
}

export async function pauseInvestigation(
  investigationId: string,
  reason: string,
): Promise<RunCommandResponse> {
  return apiPauseInvestigation(investigationId, reason);
}

export async function resumeInvestigation(
  investigationId: string,
): Promise<RunCommandResponse> {
  return apiResumeInvestigation(investigationId);
}

export async function resolveInvestigationReview(
  investigationId: string,
  outcome: "APPROVED" | "NEEDS_EVIDENCE",
  notes?: string,
): Promise<RunCommandResponse> {
  return apiResolveInvestigationReview(investigationId, outcome, notes);
}

// ============================================================================
// PR-21 — entities, entity hypotheses, relations (reads + authority)
// ============================================================================

export async function listEntities(
  investigationId: string,
): Promise<EntitiesResponse> {
  return apiListEntities(investigationId);
}

export async function listEntityHypotheses(
  investigationId: string,
): Promise<EntityHypothesesResponse> {
  return apiListEntityHypotheses(investigationId);
}

export async function acceptEntityHypothesis(
  investigationId: string,
  hypothesisId: string,
): Promise<EntityAcceptResponse> {
  return apiAcceptEntityHypothesis(investigationId, hypothesisId);
}

export async function listRelations(
  investigationId: string,
): Promise<RelationsResponse> {
  return apiListRelations(investigationId);
}

export async function listCanonicalRelations(
  investigationId: string,
): Promise<CanonicalRelationsResponse> {
  return apiListCanonicalRelations(investigationId);
}

export async function acceptRelationHypothesis(
  investigationId: string,
  hypothesisId: string,
): Promise<RelationAcceptResponse> {
  return apiAcceptRelationHypothesis(investigationId, hypothesisId);
}

export async function rejectRelationHypothesis(
  investigationId: string,
  hypothesisId: string,
): Promise<RelationDecisionResponse> {
  return apiRejectRelationHypothesis(investigationId, hypothesisId);
}

export async function reverseRelationHypothesis(
  investigationId: string,
  hypothesisId: string,
): Promise<RelationDecisionResponse> {
  return apiReverseRelationHypothesis(investigationId, hypothesisId);
}
