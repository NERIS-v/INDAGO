// ============================================================================
// Execution metadata (@indago/ai-agent-runtime)
//
// Every successful execution returns enough metadata for reproducibility and
// observability. Version dimensions are kept STRICTLY separate:
//   runtimePolicyVersion — the shared runtime policy/budget version (v2)
//   provider/model/modelVersion — WHAT executed the call
//   promptVersion / schemaVersion / policyVersion — feature-side versions,
//     recorded verbatim, never interpreted by the runtime
//
// Usage fields are ONLY populated when the provider actually reports token
// counts. They are never estimated or fabricated. Same for modelVersion:
// absent when a provider does not tell us the concrete model snapshot.
//
// Determinism caveat: identical metadata identifies a reproducibly-identifiable
// call. It does NOT claim the LLM is mathematically deterministic or that a
// re-run yields byte-identical output unless the provider guarantees it.
// ============================================================================

import { AI_RUNTIME_POLICY_VERSION } from '@indago/contracts';
import type { AiRuntimePolicyVersion } from '@indago/contracts';

import type { AiProviderKind } from '../config/types.js';
import type {
  LLMFinishReason,
  LLMUsage,
} from '../core/types.js';

export interface LLMExecutionMetadata {
  readonly runtimePolicyVersion: AiRuntimePolicyVersion;
  readonly provider: AiProviderKind;
  readonly model: string;
  readonly modelVersion?: string;
  readonly requestId: string;
  readonly promptVersion?: string;
  readonly schemaVersion?: string;
  readonly policyVersion?: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly latencyMs: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly finishReason: LLMFinishReason;
  readonly retryCount: number;
}

/** Plain (unstructured) generation result. */
export interface LLMGenerationResult {
  readonly text: string;
  readonly metadata: LLMExecutionMetadata;
}

/** Schema-backed generation result (data has passed zod validation). */
export interface LLMStructuredResult<T> {
  readonly data: T;
  readonly rawText: string;
  readonly metadata: LLMExecutionMetadata;
}

export interface ExecutionMetadataInput {
  readonly provider: AiProviderKind;
  readonly model: string;
  readonly requestId: string;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly finishReason: LLMFinishReason;
  readonly usage?: LLMUsage;
  readonly modelVersion?: string;
  readonly promptVersion?: string;
  readonly schemaVersion?: string;
  readonly policyVersion?: string;
  readonly retryCount: number;
}

export function buildExecutionMetadata(input: ExecutionMetadataInput): LLMExecutionMetadata {
  const latencyMs = Math.max(0, input.completedAt.getTime() - input.startedAt.getTime());
  return {
    runtimePolicyVersion: AI_RUNTIME_POLICY_VERSION,
    provider: input.provider,
    model: input.model,
    modelVersion: input.modelVersion,
    requestId: input.requestId,
    promptVersion: input.promptVersion,
    schemaVersion: input.schemaVersion,
    policyVersion: input.policyVersion,
    startedAt: input.startedAt.toISOString(),
    completedAt: input.completedAt.toISOString(),
    latencyMs,
    inputTokens: input.usage?.inputTokens,
    outputTokens: input.usage?.outputTokens,
    totalTokens: input.usage?.totalTokens,
    finishReason: input.finishReason,
    retryCount: input.retryCount,
  };
}