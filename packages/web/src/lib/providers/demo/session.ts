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
import type { BreakthroughRunResult, Phase2RunResult } from "../types";

const sessionEvidenceByInvestigation = new Map<string, Evidence[]>();

/**
 * PASS 3 — session-scoped store of deterministic breakthrough runs (Exhibit
 *   719 live ingestion against Case B), keyed by investigationId. Kept SEPARATE
 *   from the generic evidence registry so a breakthrough evidence package is
 *   listed exactly once: breakthrough records are hydrated into the fresh
 *   workspace stores (per-navigation bundles) rather than double-listed as
 *   session evidence.
 */
const sessionBreakthroughByInvestigation = new Map<string, BreakthroughRunResult[]>();

/**
 * PASS 4 — session-scoped store of deterministic Phase-2 S1 runs (the WJA audit
 *   / financial document live ingestion against Case B), keyed by
 *   investigationId. Same exact-once rule as the breakthrough registry: the
 *   Phase-2 S1 evidence package is hydrated into fresh workspace stores, never
 *   double-listed as generic session evidence.
 */
const sessionPhase2ByInvestigation = new Map<string, Phase2RunResult[]>();

/**
 * PASS 4 — session-scoped PROGRESSION gate for the Phase-2 analysis. Even the
 * enriched real-case envelope carries the derived Phase-2 data; the surfaces
 * stay gated (phase2Ready = false) until this flag records that the Phase-2
 * kickoff actually happened. Kept as its own registry so the gate is explicit
 * and deterministic — a run without a kickoff can never reveal the analysis.
 */
const sessionPhase2StartedByInvestigation = new Set<string>();

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

/** Record one deterministic breakthrough run for an investigation. */
export function addDemoSessionBreakthrough(
  investigationId: string,
  run: BreakthroughRunResult,
): void {
  const current = sessionBreakthroughByInvestigation.get(investigationId) ?? [];
  sessionBreakthroughByInvestigation.set(investigationId, [...current, run]);
}

/** List breakthrough runs for an investigation (empty if none). */
export function listDemoSessionBreakthrough(
  investigationId: string,
): BreakthroughRunResult[] {
  return sessionBreakthroughByInvestigation.get(investigationId) ?? [];
}

/** Record one deterministic Phase-2 S1 run for an investigation. */
export function addDemoSessionPhase2(
  investigationId: string,
  run: Phase2RunResult,
): void {
  const current = sessionPhase2ByInvestigation.get(investigationId) ?? [];
  sessionPhase2ByInvestigation.set(investigationId, [...current, run]);
}

/** List Phase-2 S1 runs for an investigation (empty if none). */
export function listDemoSessionPhase2(
  investigationId: string,
): Phase2RunResult[] {
  return sessionPhase2ByInvestigation.get(investigationId) ?? [];
}

/** Mark the Phase-2 analysis as having begun for an investigation. Idempotent. */
export function markDemoSessionPhase2(investigationId: string): void {
  sessionPhase2StartedByInvestigation.add(investigationId);
}

/** Whether the Phase-2 analysis has begun for an investigation in this session. */
export function demoSessionPhase2Started(investigationId: string): boolean {
  return sessionPhase2StartedByInvestigation.has(investigationId);
}

/** Clear all session evidence (demo reset / tests). */
export function resetDemoSession(): void {
  sessionEvidenceByInvestigation.clear();
  sessionBreakthroughByInvestigation.clear();
  sessionPhase2ByInvestigation.clear();
  sessionPhase2StartedByInvestigation.clear();
}