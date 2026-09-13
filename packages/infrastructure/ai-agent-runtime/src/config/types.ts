// ============================================================================
// AI runtime configuration types (@indago/ai-agent-runtime)
//
// Configuration is EXPLICIT and deterministic: one selected provider, no
// hidden fallback chain. All environment values are parsed, validated, bounded
// and explicitly defaulted by load.ts.
// ============================================================================

import { AI_RUNTIME_POLICY_VERSION } from '@indago/contracts';
import type { AiRuntimePolicyVersion } from '@indago/contracts';

import type { AiBudgets } from '../budgets/limits.js';
import { DEFAULT_AI_BUDGETS } from '../budgets/limits.js';

export type AiProviderKind = 'gemini' | 'ollama';

export interface BaseProviderConfig {
  /** Provider API base URL. Never contains credentials. */
  readonly baseUrl: string;
  /** Optional provider default model. The runtime never hardcodes a model. */
  readonly defaultModel?: string;
  /** Timeout used by provider-side probes (health checks). Generation timeouts come per-request from the runtime budget. */
  readonly timeoutMs: number;
}

export interface GeminiProviderConfig extends BaseProviderConfig {
  /** API key. May be empty until configured; the factory refuses to build a Gemini provider without one. */
  readonly apiKey: string;
}

export interface OllamaProviderConfig extends BaseProviderConfig {}

export interface AiConfig {
  readonly provider: AiProviderKind;
  /** Optional global default model (falls through to per-provider default, then to the request). */
  readonly defaultModel?: string;
  readonly gemini: GeminiProviderConfig;
  readonly ollama: OllamaProviderConfig;
  readonly budgets: AiBudgets;
  readonly policyVersion: AiRuntimePolicyVersion;
}

/** The resolved budget/reliability policy the runtime will actually enforce. */
export interface AiRuntimePolicy {
  readonly policyVersion: AiRuntimePolicyVersion;
  readonly budgets: AiBudgets;
}

export const AI_RUNTIME_POLICY: AiRuntimePolicy = {
  policyVersion: AI_RUNTIME_POLICY_VERSION,
  budgets: DEFAULT_AI_BUDGETS,
};