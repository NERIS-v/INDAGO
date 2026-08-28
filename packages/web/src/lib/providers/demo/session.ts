// ============================================================================
// F-PR3 Demo Session Evidence Registry
//
// Deterministic, SESSION-scoped store of evidence submitted by the user during
// this browser session, keyed by investigationId.
//
// Why session-scoped (a documented deviation from F-PR2's per-workspace store):
// the New Investigation → Evidence Intake flow submits evidence before the
// investigation workspace exists, then navigates to that workspace. Because a
// fresh provider bundle is constructed per navigation (F-PR2 keeps no global
// singleton), the intake's in-memory state would otherwise be lost. This thin
// registry lets evidence submitted during intake be visible when the workspace
// later lists it, for the lifetime of the browser session.
//
// It remains deterministic (no randomness), holds ONLY canonical Evidence
// records (never file bytes), and does NOT replace the per-workspace store —
// it layers user-submitted demo evidence on top of the immutable fixtures.
// `resetDemoSession()` restores it to empty (used by tests and a future
// demo reset).
// ============================================================================

import type { Evidence } from "@indago/contracts";

const sessionEvidenceByInvestigation = new Map<string, Evidence[]>();

/** Record one submitted demo evidence item for an investigation. */
export function addDemoSessionEvidence(
  investigationId: string,
  evidence: Evidence,
): void {
  const current = sessionEvidenceByInvestigation.get(investigationId) ?? [];
  sessionEvidenceByInvestigation.set(investigationId, [...current, evidence]);
}

/** List user-submitted demo evidence for an investigation (empty if none). */
export function listDemoSessionEvidence(investigationId: string): Evidence[] {
  return sessionEvidenceByInvestigation.get(investigationId) ?? [];
}

/** Clear all session evidence (demo reset / tests). */
export function resetDemoSession(): void {
  sessionEvidenceByInvestigation.clear();
}