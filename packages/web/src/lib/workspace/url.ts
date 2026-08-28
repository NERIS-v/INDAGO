// ============================================================================
// Workspace URL helper
//
// Central construction of investigation workspace URLs so that caseId is NEVER
// dropped during navigation (the F-PR2 hotfix regression guard). Every
// investigation workspace route preserves ?caseId=<CASE_ID>. Consumers must
// use these helpers instead of hand-building URLs.
// ============================================================================

/** Build an investigation workspace URL, preserving the case boundary. */
export function investigationUrl(
  investigationId: string,
  caseId: string,
  subroute?: string,
): string {
  const base = `/investigations/${investigationId}${
    subroute ? `/${subroute}` : ""
  }`;
  return appendCaseId(base, caseId);
}

/** Append ?caseId= to an existing path (safe for overview or a subroute). */
export function appendCaseId(path: string, caseId: string): string {
  if (!caseId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}caseId=${encodeURIComponent(caseId)}`;
}