// ============================================================================
// PR-3 — Context Resolver (selection → provider-backed display data)
//
// The resolver is the ONLY place that turns an InvestigativeContext into
// current, provider-owned data. Consumers never branch on provider seams
// themselves: they call resolveContext() and render whatever discriminated
// ContextResolution they receive. This is the differentiated step that keeps
// "selection" and "resolution" as separate concerns:
//
//   selected { entity, ENT_VICTOR }  →  resolved Victor Aldridge (current data)
//   selected { hypothesis, HYP_1 }   →  resolved via the hypothesis ENGINE seam
//   selected { anomaly, x }          →  unsupported (no adapter yet, PR-5)
//
// Data-mode honesty: live UNSUPPORTED failures become an `unsupported`
// resolution (≠ nothing-selected), NOT_FOUND becomes `not-found`, and any
// other provider failure becomes `error`.
//
// Source guarantees:
//   - imports provider INTERFACES (types.ts) + the workspace context seam —
//     NEVER providers/demo, providers/live, or demo fixtures.
//   - hypothesis authority stays in the hypothesis engine (robustness seam);
//     no duplicate InvestigativeLeadReport is introduced here.
//   - observation has NO get-by-id seam, so it resolves through
//     listByInvestigation + find (the demo observation set is small and
//     deterministic; pageSize caps the read).
// ============================================================================

import type { WorkspaceProviders } from "@/lib/providers/types";
import { ProviderError } from "@/lib/providers/types";
import type { InvestigativeContext, ContextKind } from "./investigative-context";

// ----------------------------------------------------------------------------
// Discriminated resolution model
// ----------------------------------------------------------------------------

export interface ContextDisplayRow {
  readonly label: string;
  readonly value: string;
}

export interface ContextDisplay {
  /** Primary object label (e.g. canonicalName, evidence title). */
  readonly title: string;
  /** Secondary classifier line (e.g. "Entity · ACTIVE"). */
  readonly subtitle: string;
  /** One- or two-line plain-language summary. */
  readonly summary: string;
  /** Deterministic, presentational facts about the object. */
  readonly rows: readonly ContextDisplayRow[];
}

export type ContextResolution =
  | {
      readonly status: "resolved";
      readonly kind: ContextKind;
      readonly id: string;
      readonly display: ContextDisplay;
    }
  | {
      readonly status: "unsupported";
      readonly kind: ContextKind;
      readonly id: string;
      readonly reason: string;
    }
  | {
      readonly status: "not-found";
      readonly kind: ContextKind;
      readonly id: string;
    }
  | {
      readonly status: "error";
      readonly kind: ContextKind;
      readonly id: string;
      readonly message: string;
    };

export function resolutionStatus(
  resolution: ContextResolution,
): ContextResolution["status"] {
  return resolution.status;
}

export function isResolved(resolution: ContextResolution | null): resolution is Extract<
  ContextResolution,
  { status: "resolved" }
> {
  return resolution !== null && resolution.status === "resolved";
}

// ----------------------------------------------------------------------------
// Error mapping
// ----------------------------------------------------------------------------

function toResolutionFailure(
  context: InvestigativeContext,
  err: unknown,
): Extract<ContextResolution, { status: "not-found" | "unsupported" | "error" }> {
  if (err instanceof ProviderError) {
    if (err.code === "NOT_FOUND") {
      return { status: "not-found", kind: context.kind, id: context.id };
    }
    if (err.code === "UNSUPPORTED") {
      return {
        status: "unsupported",
        kind: context.kind,
        id: context.id,
        reason: "This selection is not supported in the current data mode.",
      };
    }
    return { status: "error", kind: context.kind, id: context.id, message: err.message };
  }
  return {
    status: "error",
    kind: context.kind,
    id: context.id,
    message: err instanceof Error ? err.message : "An unexpected error occurred.",
  };
}

// ----------------------------------------------------------------------------
// Per-kind resolvers
// ----------------------------------------------------------------------------

async function resolveEntity(
  workspace: WorkspaceProviders,
  context: InvestigativeContext,
): Promise<ContextResolution> {
  try {
    const entity = await workspace.entities.get(context.id);
    return {
      status: "resolved",
      kind: context.kind,
      id: context.id,
      display: {
        title: entity.canonicalName,
        subtitle: `Entity · ${entity.status}`,
        summary: "Canonical identity within the investigation. Observation and evidence links are current provider data.",
        rows: [
          { label: "Observations", value: String(entity.observationIds.length) },
          { label: "Evidence", value: String(entity.evidenceIds.length) },
          { label: "Identity hypotheses", value: String(entity.hypothesisIds.length) },
          { label: "Role hypotheses", value: String(entity.roleHypothesisIds.length) },
        ],
      },
    };
  } catch (err) {
    return toResolutionFailure(context, err);
  }
}

async function resolveEvidence(
  workspace: WorkspaceProviders,
  context: InvestigativeContext,
): Promise<ContextResolution> {
  try {
    const item = await workspace.evidence.get(context.id);
    const observed = item.observedAt?.value
      ? new Date(item.observedAt.value).toISOString().slice(0, 10)
      : "Unknown";
    return {
      status: "resolved",
      kind: context.kind,
      id: context.id,
      display: {
        title: item.title,
        subtitle: `Evidence · ${item.type} · ${item.status}`,
        summary:
          item.description?.trim() || "Evidence package ingested into the investigation.",
        rows: [
          { label: "Type", value: item.type },
          { label: "Status", value: item.status },
          { label: "Observed", value: observed },
          { label: "Observations extracted", value: String(item.observationCount) },
        ],
      },
    };
  } catch (err) {
    return toResolutionFailure(context, err);
  }
}

async function resolveObservation(
  workspace: WorkspaceProviders,
  context: InvestigativeContext,
): Promise<ContextResolution> {
  try {
    const page = await workspace.observations.listByInvestigation(workspace.investigationId, {
      pageSize: 200,
    });
    const observation = page.items.find((o) => o.id === context.id);
    if (!observation) return { status: "not-found", kind: context.kind, id: context.id };
    return {
      status: "resolved",
      kind: context.kind,
      id: context.id,
      display: {
        title: `Observation ${context.id.slice(0, 8)}`,
        subtitle: `Observation · ${observation.type}`,
        summary: observation.content,
        rows: [
          { label: "Type", value: observation.type },
          { label: "Entities", value: String(observation.entityIds.length) },
        ],
      },
    };
  } catch (err) {
    return toResolutionFailure(context, err);
  }
}

async function resolveLead(
  workspace: WorkspaceProviders,
  context: InvestigativeContext,
): Promise<ContextResolution> {
  try {
    const lead = await workspace.leads.get(context.id);
    return {
      status: "resolved",
      kind: context.kind,
      id: context.id,
      display: {
        title: lead.title,
        subtitle: `Lead · ${lead.status}`,
        summary: lead.description,
        rows: [
          { label: "Priority", value: lead.priority },
          { label: "Confidence", value: String(lead.confidence) },
        ],
      },
    };
  } catch (err) {
    return toResolutionFailure(context, err);
  }
}

async function resolveGap(
  workspace: WorkspaceProviders,
  context: InvestigativeContext,
): Promise<ContextResolution> {
  try {
    const gap = await workspace.gaps.get(context.id);
    return {
      status: "resolved",
      kind: context.kind,
      id: context.id,
      display: {
        title: gap.title,
        subtitle: `Gap · ${gap.type}`,
        summary: gap.description,
        rows: [
          { label: "Status", value: gap.status },
          { label: "Priority", value: gap.priority },
          { label: "Impact", value: String(gap.impact) },
          { label: "Affected entities", value: String((gap.relatedEntityIds ?? []).length) },
        ],
      },
    };
  } catch (err) {
    return toResolutionFailure(context, err);
  }
}

async function resolveRelation(
  workspace: WorkspaceProviders,
  context: InvestigativeContext,
): Promise<ContextResolution> {
  try {
    const relation = await workspace.relations.get(context.id);
    return {
      status: "resolved",
      kind: context.kind,
      id: context.id,
      display: {
        title: relation.relationType.toUpperCase(),
        subtitle: `Relation · ${relation.status}`,
        summary: `Proposed relationship between ${relation.sourceEntityId.slice(
          0,
          8,
        )} and ${relation.targetEntityId.slice(0, 8)} (${relation.relationType}).`,
        rows: [
          { label: "Type", value: relation.relationType },
          { label: "Support", value: String(relation.support) },
          { label: "Status", value: relation.status },
          { label: "Evidence basis", value: String((relation.evidenceBasis ?? []).length) },
        ],
      },
    };
  } catch (err) {
    return toResolutionFailure(context, err);
  }
}

async function resolveHypothesis(
  workspace: WorkspaceProviders,
  context: InvestigativeContext,
): Promise<ContextResolution> {
  try {
    // Hypothesis authority stays in the hypothesis engine seam (robustness
    // measurement). We surface its deterministic output — we never re-derive
    // or fabricate an InvestigativeLeadReport here.
    const result = await workspace.robustness.getResult(workspace.investigationId, context.id);
    return {
      status: "resolved",
      kind: context.kind,
      id: context.id,
      display: {
        title: `Hypothesis ${context.id.slice(0, 8)}`,
        subtitle: "Hypothesis · engine robustness",
        summary:
          "Robustness assessment from the hypothesis engine. Score is perturbation stability, not a truth probability.",
        rows: [
          { label: "Robustness", value: `${result.robustnessScore}/100` },
          { label: "Confidence", value: String(result.confidence) },
          { label: "Stable iterations", value: String(result.stableIterations) },
          { label: "Unstable iterations", value: String(result.unstableIterations) },
          { label: "Sensitive observations", value: String(result.sensitiveObservations.length) },
        ],
      },
    };
  } catch (err) {
    return toResolutionFailure(context, err);
  }
}

async function resolveCrossCase(
  workspace: WorkspaceProviders,
  context: InvestigativeContext,
): Promise<ContextResolution> {
  try {
    const page = await workspace.crossCase.listForeignOverlays(workspace.caseId, {
      pageSize: 100,
    });
    const overlay = page.items.find((o) => o.ref === context.id);
    if (!overlay) return { status: "not-found", kind: context.kind, id: context.id };
    return {
      status: "resolved",
      kind: context.kind,
      id: context.id,
      display: {
        title: overlay.title,
        subtitle: `Cross-case · ${overlay.ref}`,
        summary: overlay.summary,
        rows: [
          { label: "Boundary", value: overlay.caseId },
          { label: "Local match", value: overlay.localTargetMatch },
          { label: "Bridge support", value: `${Math.round(overlay.bridgeSupport * 100)}%` },
          { label: "Foreign nodes", value: String(overlay.nodes.length) },
        ],
      },
    };
  } catch (err) {
    return toResolutionFailure(context, err);
  }
}

// ----------------------------------------------------------------------------
// Registry + entry point
// ----------------------------------------------------------------------------

const RESOLVERS: Partial<Record<ContextKind, (ws: WorkspaceProviders, ctx: InvestigativeContext) => Promise<ContextResolution>>> = {
  entity: resolveEntity,
  evidence: resolveEvidence,
  observation: resolveObservation,
  lead: resolveLead,
  gap: resolveGap,
  relation: resolveRelation,
  hypothesis: resolveHypothesis,
  "cross-case": resolveCrossCase,
  // anomaly has no provider seam in PR-3 — the registry intentionally omits
  // it so the fallback yields a deterministic `unsupported` resolution.
};

/** Resolve a selection into current provider-backed display data. Never
 *  throws; every failure collapses into a discriminated resolution state. */
export async function resolveContext(
  workspace: WorkspaceProviders,
  context: InvestigativeContext,
): Promise<ContextResolution> {
  const resolver = RESOLVERS[context.kind];
  if (!resolver) {
    return {
      status: "unsupported",
      kind: context.kind,
      id: context.id,
      reason: "No context adapter exists for this object kind yet.",
    };
  }
  return resolver(workspace, context);
}