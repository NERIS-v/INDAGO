// ============================================================================
// Graph-Hole Analysis Policy (Phase 5A-PR7)
//
// Feature-owned versioning + bounds for the GraphHole AI analyst.
//
// Versioning discipline (never invent parallel identifiers):
//   - analysisPolicyVersion  identifies the ANALYST semantics of this feature
//     (what the prompt + context construction + output interpretation mean).
//     Analogous to @indago/hypothesis-context's ATOMIC_CONTEXT_POLICY_VERSION:
//     a feature-scoped version, separate from the shared graph-hole policy.
//   - The GLOBAL bounds (observations / hypotheses / nodes / edges) are NOT
//     re-derived here. They are consumed from the frozen GRAPH_HOLE_POLICY_V1
//     (single source of truth) — this module only maps them to the analyst
//     package and decides the EFFECTIVE per-package values.
//   - The AI runtime policy version (AI_RUNTIME_POLICY_VERSION = 'v2') stays
//     owned by @indago/ai-agent-runtime / @indago/contracts. It is recorded in
//     analysis execution metadata, never re-declared here.
//
// Bounds model:
//   The analyst package is a BOUNDED derived selection over an already-bounded
//   region (PR1) and already-grouped hypothesis context (PR3). The builder
//   enforces per-package caps (defaults from the frozen policy) and records the
//   exact effective counts + completeness flags so downstream code knows what
//   the model actually saw. Enforced caps NEVER silently drop and then pretend
//   nothing happened: any cap that caused exclusion is reported as an explicit
//   *Limited flag.
// ============================================================================

import {
  GRAPH_HOLE_POLICY_VERSION,
  GRAPH_HOLE_POLICY_V1,
  MAX_CONTEXT_OBSERVATIONS,
  MAX_GROUP_NODES,
  MAX_HYPOTHESES_IN_CONTEXT,
  MAX_ATOMIC_HYPOTHESES_PER_GROUP,
  MAX_REGION_NODES,
  MAX_REGION_EDGES,
} from '@indago/contracts';

/** Version of the GraphHole-analysis feature semantics (PR7 owns this). */
export const GRAPH_HOLE_ANALYSIS_POLICY_VERSION = 'v1' as const;
export type GraphHoleAnalysisPolicyVersion = typeof GRAPH_HOLE_ANALYSIS_POLICY_VERSION;

/** Version of the GraphHoleAnalysisV1 output schema (PR7 owns this). */
export const GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION = 'graph-hole-analysis-v1' as const;
export type GraphHoleAnalysisSchemaVersion = typeof GRAPH_HOLE_ANALYSIS_SCHEMA_VERSION;

/** Version of the feature system prompt (PR7 owns this). */
export const GRAPH_HOLE_ANALYSIS_PROMPT_VERSION = 'graph-hole-analysis-v1' as const;
export type GraphHoleAnalysisPromptVersion = typeof GRAPH_HOLE_ANALYSIS_PROMPT_VERSION;

/**
 * Per-package bounds for the AI context assembly. Every value defaults to the
 * frozen GRAPH_HOLE_POLICY_V1 bound. Callers may only NARROW a bound
 * (a value above the frozen ceiling is rejected at build time) — the analyst
 * never silently expands frozen bounds.
 */
export interface GraphHoleAnalysisBounds {
  /** Max observations in the AI package (default MIN(MAX_CONTEXT_OBSERVATIONS, aiContext.maxEvidencePerAiPackage)). */
  readonly maxObservations: number;
  /** Max atomic hypotheses in the AI package (default MAX_HYPOTHESES_IN_CONTEXT). */
  readonly maxHypotheses: number;
  /** Max nodes in the AI package (default MAX_REGION_NODES). */
  readonly maxNodes: number;
  /** Max edges in the AI package (default MAX_REGION_EDGES). */
  readonly maxEdges: number;
  /** Max serialized context chars; exceeding this is a hard, honest failure (CONTEXT_TOO_LARGE), never silent truncation. */
  readonly maxSerializedContextChars: number;
}

/**
 * Frozen default bounds. These are the values used when the caller supplies no
 * override, and they are the ceiling any caller-provided narrow must respect.
 */
export const DEFAULT_GRAPH_HOLE_ANALYSIS_BOUNDS: GraphHoleAnalysisBounds = {
  maxObservations: Math.min(
    MAX_CONTEXT_OBSERVATIONS,
    GRAPH_HOLE_POLICY_V1.aiContext.maxEvidencePerAiPackage,
  ),
  maxHypotheses: MAX_HYPOTHESES_IN_CONTEXT,
  maxNodes: MAX_REGION_NODES,
  maxEdges: MAX_REGION_EDGES,
  maxSerializedContextChars: 100_000,
};

/** Frozen grouping bounds preserved from the PR3 context (informational, not re-enforced). */
export const PR3_GROUPING_BOUNDS = {
  maxAtomicHypothesesPerGroup: MAX_ATOMIC_HYPOTHESES_PER_GROUP,
  maxGroupNodes: MAX_GROUP_NODES,
} as const;

/**
 * Validate a caller-supplied partial bounds override. Returns the effective
 * bounds. A value above the frozen ceiling is rejected (never widened); a
 * non-positive or non-finite value is rejected.
 */
export function resolveAnalysisBounds(
  override?: Partial<GraphHoleAnalysisBounds>,
): GraphHoleAnalysisBounds {
  const ensureFrozenCeiling = (field: keyof GraphHoleAnalysisBounds): number => {
    const ceiling = DEFAULT_GRAPH_HOLE_ANALYSIS_BOUNDS[field];
    const candidate = override?.[field] ?? ceiling;
    if (!Number.isInteger(candidate) || candidate <= 0) {
      throw new Error(
        `Invalid graph-hole analysis bound "${field}": must be a positive integer, got ${String(candidate)}`,
      );
    }
    if (candidate > ceiling) {
      throw new Error(
        `Graph-hole analysis bound "${field}" (${candidate}) exceeds the frozen ceiling (${ceiling}) — the analyst never expands frozen bounds`,
      );
    }
    return candidate;
  };

  return {
    maxObservations: ensureFrozenCeiling('maxObservations'),
    maxHypotheses: ensureFrozenCeiling('maxHypotheses'),
    maxNodes: ensureFrozenCeiling('maxNodes'),
    maxEdges: ensureFrozenCeiling('maxEdges'),
    maxSerializedContextChars: ensureFrozenCeiling('maxSerializedContextChars'),
  };
}

/** The graph-hole policy version consumed by context construction (authoritative). */
export const CONSUMED_GRAPH_HOLE_POLICY_VERSION = GRAPH_HOLE_POLICY_VERSION;