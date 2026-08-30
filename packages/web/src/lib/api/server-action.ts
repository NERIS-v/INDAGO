"use server";

import {
  startInvestigation as apiStart,
  getInvestigationStatus as apiGetStatus,
  submitEvidence as apiSubmitEvidence,
  listObservations as apiListObservations,
  listEvidence as apiListEvidence,
  listCases as apiListCases,
  deleteCase as apiDeleteCase,
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
} from "@/lib/api/types";

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
