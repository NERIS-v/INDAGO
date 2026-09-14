// ============================================================================
// Core LLM execution types (@indago/ai-agent-runtime)
//
// Provider-agnostic request/result model. The runtime knows ONLY generic LLM
// execution concepts — providers, models, messages, budgets, reliability and
// execution metadata. It never interprets domain meaning (no GraphHole, no
// entities, no investigations, no analytical semantics).
// ============================================================================

import type { z } from 'zod';

import type { AiProviderKind } from '../config/types.js';
import type { AiBudgets } from '../budgets/limits.js';
import type { AiRuntimeErrorCode } from '../errors/ai-runtime-error.js';

export type LLMRole = 'system' | 'user' | 'assistant';
export type LLMResponseFormat = 'text' | 'json';

export interface LLMMessage {
  readonly role: LLMRole;
  readonly content: string;
}

/**
 * A generic, provider-neutral generation request. Feature packages construct
 * these; they never contain provider-specific request types.
 */
export interface LLMRequest {
  /** Optional explicit provider target. MUST equal the runtime's provider or the request is rejected — there is no implicit switching. */
  readonly provider?: AiProviderKind;
  /** Model id. Optional only when the runtime config provides a default model. Never inferred from content. */
  readonly model?: string;
  readonly systemPrompt?: string;
  readonly messages?: readonly LLMMessage[];
  readonly responseFormat?: LLMResponseFormat;
  /** Optional caller-supplied zod schema (informational at the request level; supplied explicitly to generateStructured). */
  readonly outputSchema?: z.ZodType<unknown>;
  /** Runtime-internal: the provider-native JSON Schema representation of the feature zod schema. Set by the runtime for generateStructured; callers MUST NOT set it manually. */
  readonly jsonSchema?: Readonly<Record<string, unknown>>;
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  /** Opaque caller metadata, never interpreted or logged by the runtime. */
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** Reproducibility metadata (recorded, never interpreted). */
  readonly promptVersion?: string;
  readonly schemaVersion?: string;
  readonly policyVersion?: string;
}

/** Fully-resolved request: model, budgets and timeouts are decided (no more defaults). */
export interface ResolvedLLMRequest {
  readonly provider: AiProviderKind;
  readonly model: string;
  readonly systemPrompt?: string;
  readonly messages: readonly LLMMessage[];
  readonly responseFormat: LLMResponseFormat;
  /** Provider-native JSON Schema for the call (set by the runtime for generateStructured). Absent for plain generate. */
  readonly jsonSchema?: Readonly<Record<string, unknown>>;
  readonly maxOutputTokens: number;
  readonly temperature?: number;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly promptVersion?: string;
  readonly schemaVersion?: string;
  readonly policyVersion?: string;
  readonly budgets: AiBudgets;
}

export type LLMFinishReason = 'stop' | 'length' | 'content-filter' | 'other' | 'unknown';

/** Token usage reported by a provider. Never fabricated — only populated when the provider actually reports it. */
export interface LLMUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

/** Safe observability events. NEVER contain prompts, context, responses or secrets. */
export type AiRuntimeEvent =
  | {
      readonly kind: 'start';
      readonly requestId: string;
      readonly provider: AiProviderKind;
      readonly model: string;
      readonly retryCount: 0;
    }
  | {
      readonly kind: 'retry';
      readonly requestId: string;
      readonly provider: AiProviderKind;
      readonly model: string;
      readonly errorCode: AiRuntimeErrorCode;
      readonly attempt: number;
      readonly delayMs: number;
      readonly retryCount: number;
    }
  | {
      readonly kind: 'success';
      readonly requestId: string;
      readonly provider: AiProviderKind;
      readonly model: string;
      readonly retryCount: number;
      readonly latencyMs: number;
    }
  | {
      readonly kind: 'failure';
      readonly requestId: string;
      readonly provider: AiProviderKind;
      readonly model: string;
      readonly errorCode: string;
      readonly retryCount: number;
      readonly latencyMs: number;
    };