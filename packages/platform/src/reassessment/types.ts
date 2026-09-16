// ============================================================================
// Reassessment Orchestrator — ports & shared shapes (Phase 5A-PR12)
//
// PR12 is an ORCHESTRATION LAYER. It owns NO scoring, NO hypothesis/entity/
// relation truth, NO criminality judgment. Every intelligence transition below
// flows through the deterministic pure core (@indago/graph-hole-reassessment)
// or the frozen PR6/PR7/PR10/PR11 stores/packages. Ports are the ONLY
// integration seams: PR11 into this boundary, PR7 AI analyst/judge, and the
// deterministic evidence/graph loaders.
// ============================================================================

import type {
  GraphHoleRegion,
  GraphExpansionProvider,
  ObservationResolver,
} from '@indago/graph-hole-region';
import type { ReassessmentEffectClass } from '@indago/contracts';

// ----------------------------------------------------------------------------
// Authorization scope — every load is re-anchored to these ids. A mismatch
// between any payload id and this scope is an AUTHORITY_MISMATCH (fail closed).
// ----------------------------------------------------------------------------

export interface ReassessmentScope {
  readonly caseId: string;
  readonly investigationId: string;
  /** The SINGLE authoritative graph version the reassessment binds to. */
  readonly graphVersionId: string;
}

// ----------------------------------------------------------------------------
// Reasoned list of the graph elements / evidence a change touched — the ONLY
// input the lazy affected-set resolution consumes (§ values from the audit).
// ----------------------------------------------------------------------------

export interface ChangeReference {
  readonly caseId: string;
  readonly triggerType: ReassessmentEffectClass;
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly observationIds: readonly string[];
}

// ----------------------------------------------------------------------------
// PR7 boundary (AI analyst + validator + judge). FAIL-CLOSED: when no runtime
// is configured the port is `null` and the AI stage records FAILED for that
// region — the deterministic stages (RESOLVED producer, supersession, cursor)
// still complete. Never used for impact analysis; never decides RESOLVED.
// ----------------------------------------------------------------------------

export interface AiAnalysisInput {
  readonly scope: ReassessmentScope;
  readonly regionId: string;
  readonly candidateId: string;
  readonly contextSha256: string;
  /** Deterministically serialized bounded context (audit only, never identity). */
  readonly contextSketch: unknown;
}

export interface AiAnalysisResult {
  readonly analysisId: string;
  readonly verdict: 'HOLE' | 'NO_HOLE' | 'INCONCLUSIVE';
  readonly confidence: number;
  readonly judgeDecision: 'APPROVE' | 'REJECT' | 'ESCALATE';
}

export type AiAnalysisPort = (input: AiAnalysisInput) => Promise<AiAnalysisResult>;

// ----------------------------------------------------------------------------
// PR11 boundary (targeted-reblocking). V1 integration is an EXPLICIT interface
// — the reassessment NEVER reaches into targeted-reblocking internals. When the
// port is absent the PR11 stage is skipped (never recursed, never auto-triggered).
// ----------------------------------------------------------------------------

export interface Pr11ReassessmentInput {
  readonly scope: ReassessmentScope;
  readonly regionId: string;
  readonly candidateIds: readonly string[];
  /** Caller-supplied display timestamp (computedAt), never part of identities. */
  readonly guardToken: string;
}

export type Pr11ReassessmentPort = (input: Pr11ReassessmentInput) => Promise<void>;

// ----------------------------------------------------------------------------
// Region build dependencies resolved by the platform runtime.
// ----------------------------------------------------------------------------

export interface PlatformRegionDependencies {
  readonly context: GraphExpansionProvider;
  readonly resolveObservations: ObservationResolver;
}

export interface ReassessmentRuntimeDeps {
  /** Bounded region builder (semantic expansion optional/DISABLED in V1). */
  readonly buildRegion: (
    input: import('@indago/graph-hole-region').BuildRegionInput,
  ) => Promise<GraphHoleRegion>;
  /** PR7 AI analyst/judge stage — NULL = fail closed (stage marked FAILED). */
  readonly aiAnalysis: AiAnalysisPort | null;
  /** PR11 targeted-reblocking boundary — absent = skipped. */
  readonly pr11: Pr11ReassessmentPort | null;
}