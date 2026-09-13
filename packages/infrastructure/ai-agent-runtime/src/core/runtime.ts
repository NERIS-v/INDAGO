// ============================================================================
// AI runtime (@indago/ai-agent-runtime)
//
// The primary public entry point. Execution-only: it returns results to the
// caller and NEVER makes domain decisions — it cannot create entities,
// relations, hypotheses, or modify any canonical/investigation state. It owns
// no domain prompts and no domain schemas; features supply both.
//
//   createAiRuntime(config?, { onEvent? })
//     .generate(request)               → text + execution metadata
//     .generateStructured(request, zod) → validated data + raw text + metadata
//     .healthCheck()                   → provider reachability probe
//
// Reliability: transient failures are retried with bounded exponential
// backoff (honoring Retry-After within limits); exhaustion surfaces as
// RETRY_EXHAUSTED carrying the last provider error as `cause`.
// ============================================================================

import { randomUUID } from 'node:crypto';
import type { z } from 'zod';

import { AiRuntimeError } from '../errors/ai-runtime-error.js';
import { AI_RUNTIME_POLICY } from '../config/types.js';
import type { AiConfig } from '../config/types.js';
import { loadAiConfig } from '../config/load.js';
import type { AIProvider, AIProviderHealth } from '../providers/types.js';
import { createLLMProvider } from '../providers/factory.js';
import type { ResolutionContext } from '../budgets/validate.js';
import { resolveRequest } from '../budgets/validate.js';
import type { RetryPolicy } from '../reliability/retry.js';
import { withBoundedRetry } from '../reliability/retry.js';
import { parseJsonText } from '../structured-output/parse.js';
import { validateStructured } from '../structured-output/validate.js';
import { buildExecutionMetadata } from '../metadata/execution.js';
import type {
  LLMExecutionMetadata,
  LLMGenerationResult,
  LLMStructuredResult,
} from '../metadata/execution.js';
import type { AiRuntimeCapabilities } from './capabilities.js';
import type {
  AiRuntimeEvent,
  LLMRequest,
} from './types.js';

export interface AiRuntimeOptions {
  /** Optional observability hook. Events NEVER contain prompts, context, responses or secrets. */
  readonly onEvent?: (event: AiRuntimeEvent) => void;
}

export interface AiRuntime {
  readonly config: AiConfig;
  readonly provider: AIProvider;
  readonly capabilities: AiRuntimeCapabilities;
  generate(request: LLMRequest): Promise<LLMGenerationResult>;
  generateStructured<T>(request: LLMRequest, schema: z.ZodType<T>): Promise<LLMStructuredResult<T>>;
  healthCheck(): Promise<AIProviderHealth>;
}

interface ExecuteOutcome {
  readonly metadata: LLMExecutionMetadata;
  readonly providerResult: Awaited<ReturnType<AIProvider['generate']>>;
}

function retryPolicyFor(config: AiConfig): RetryPolicy {
  return {
    maxRetries: config.budgets.maxRetries,
    baseDelayMs: config.budgets.retryBaseDelayMs,
    maxDelayMs: config.budgets.maxRetryDelayMs,
  };
}

class AiRuntimeImpl implements AiRuntime {
  readonly config: AiConfig;
  readonly provider: AIProvider;
  readonly runtimePolicyVersion = AI_RUNTIME_POLICY.policyVersion;

  constructor(
    config: AiConfig,
    private readonly options?: AiRuntimeOptions,
  ) {
    this.config = config;
    this.provider = createLLMProvider(config);
  }

  get capabilities(): AiRuntimeCapabilities {
    return {
      generate: this.provider.capabilities.generate,
      generateStructured: this.provider.capabilities.generateStructured,
      healthCheck: this.provider.capabilities.healthCheck,
    };
  }

  private emit(event: AiRuntimeEvent): void {
    this.options?.onEvent?.(event);
  }

  private defaultModel(): string | undefined {
    if (this.config.provider === 'gemini') {
      return this.config.gemini.defaultModel ?? this.config.defaultModel;
    }
    return this.config.ollama.defaultModel ?? this.config.defaultModel;
  }

  private resolutionContext(): ResolutionContext {
    return {
      provider: this.config.provider,
      defaultModel: this.defaultModel(),
      budgets: this.config.budgets,
    };
  }

  private async execute(request: LLMRequest, forceJson: boolean): Promise<ExecuteOutcome> {
    const requestId = randomUUID();
    const startedAt = new Date();
    const startedMs = Date.now();
    const eventModel = request.model ?? this.defaultModel() ?? '(unresolved)';

    let retryCount = 0;
    try {
      const resolvedRequest = resolveRequest(
        forceJson ? { ...request, responseFormat: 'json' } : request,
        this.resolutionContext(),
      );

      if (forceJson && !this.provider.capabilities.generateStructured) {
        throw new AiRuntimeError(
          'UNSUPPORTED_CAPABILITY',
          `Provider "${this.config.provider}" does not support structured generation`,
        );
      }
      if (!forceJson && !this.provider.capabilities.generate) {
        throw new AiRuntimeError(
          'UNSUPPORTED_CAPABILITY',
          `Provider "${this.config.provider}" does not support plain generation`,
        );
      }

      this.emit({
        kind: 'start',
        requestId,
        provider: this.config.provider,
        model: resolvedRequest.model,
        retryCount: 0,
      });

      const providerResult = await withBoundedRetry(
        () => this.provider.generate(resolvedRequest),
        {
          policy: retryPolicyFor(this.config),
          signal: resolvedRequest.signal,
          onRetry: (lastError, attempt, delayMs) => {
            retryCount = attempt;
            this.emit({
              kind: 'retry',
              requestId,
              provider: this.config.provider,
              model: resolvedRequest.model,
              errorCode: lastError.code,
              attempt,
              delayMs,
              retryCount,
            });
          },
        },
      );

      const completedAt = new Date();
      const metadata = buildExecutionMetadata({
        provider: this.config.provider,
        model: resolvedRequest.model,
        requestId,
        startedAt,
        completedAt,
        finishReason: providerResult.finishReason,
        usage: providerResult.usage,
        modelVersion: providerResult.modelVersion,
        promptVersion: resolvedRequest.promptVersion,
        schemaVersion: resolvedRequest.schemaVersion,
        policyVersion: resolvedRequest.policyVersion,
        retryCount,
      });

      this.emit({
        kind: 'success',
        requestId,
        provider: this.config.provider,
        model: resolvedRequest.model,
        retryCount,
        latencyMs: metadata.latencyMs,
      });

      return { metadata, providerResult };
    } catch (error) {
      this.emit({
        kind: 'failure',
        requestId,
        provider: this.config.provider,
        model: eventModel,
        errorCode: error instanceof AiRuntimeError ? error.code : 'INVALID_PROVIDER_RESPONSE',
        retryCount,
        latencyMs: Date.now() - startedMs,
      });
      throw error;
    }
  }

  async generate(request: LLMRequest): Promise<LLMGenerationResult> {
    const outcome = await this.execute(request, false);
    return { text: outcome.providerResult.text, metadata: outcome.metadata };
  }

  async generateStructured<T>(request: LLMRequest, schema: z.ZodType<T>): Promise<LLMStructuredResult<T>> {
    const outcome = await this.execute(request, true);
    const parsed = parseJsonText(outcome.providerResult.text);
    const data = validateStructured(parsed, schema);
    return { data, rawText: outcome.providerResult.text, metadata: outcome.metadata };
  }

  async healthCheck(): Promise<AIProviderHealth> {
    if (!this.provider.capabilities.healthCheck) {
      throw new AiRuntimeError(
        'UNSUPPORTED_CAPABILITY',
        `Provider "${this.config.provider}" does not offer health checks`,
      );
    }
    return this.provider.healthCheck();
  }
}

export function createAiRuntime(config?: AiConfig, options?: AiRuntimeOptions): AiRuntime {
  return new AiRuntimeImpl(config ?? loadAiConfig(), options);
}