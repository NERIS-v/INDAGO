"use server";

import {
  startInvestigation as apiStart,
  getInvestigationStatus as apiGetStatus,
  submitEvidence as apiSubmitEvidence,
} from "@/lib/api/server";
import type {
  StartInvestigationResponse,
  InvestigationStatusResponse,
  EvidenceSubmissionRequest,
  EvidenceSubmissionResponse,
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
