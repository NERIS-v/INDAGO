// ============================================================================
// Request budget validation + resolution (@indago/ai-agent-runtime)
//
// Turns a caller LLMRequest into a fully-resolved request BEFORE any provider
// call: model resolved, budgets enforced, timeouts capped. Oversized requests
// are rejected with a typed error — never truncated, never snipped.
// ============================================================================

import { AiRuntimeError } from '../errors/ai-runtime-error.js';
import type { AiBudgets } from './limits.js';
import type { AiProviderKind } from '../config/types.js';
import type {
  LLMRequest,
  LLMMessage,
  ResolvedLLMRequest,
} from '../core/types.js';

export interface ResolutionContext {
  readonly provider: AiProviderKind;
  readonly defaultModel?: string;
  readonly budgets: AiBudgets;
}

function inputChars(systemPrompt: string | undefined, messages: readonly LLMMessage[]): number {
  let total = systemPrompt?.length ?? 0;
  for (const message of messages) total += message.content.length;
  return total;
}

export function resolveRequest(request: LLMRequest, ctx: ResolutionContext): ResolvedLLMRequest {
  if (request.signal?.aborted) {
    throw new AiRuntimeError('ABORTED', 'LLM request was cancelled before it started');
  }

  if (request.provider !== undefined && request.provider !== ctx.provider) {
    throw new AiRuntimeError(
      'CONFIGURATION_ERROR',
      `Request targets provider "${request.provider}" but the runtime is configured for "${ctx.provider}" — the runtime never switches providers implicitly`,
    );
  }

  const model = (request.model?.trim() || ctx.defaultModel?.trim() || '').trim();
  if (model === '') {
    throw new AiRuntimeError(
      'CONFIGURATION_ERROR',
      'No model specified in the request and no default model configured',
    );
  }

  const messages = request.messages ?? [];

  const totalChars = inputChars(request.systemPrompt, messages);
  if (totalChars > ctx.budgets.maxInputChars) {
    throw new AiRuntimeError(
      'INPUT_TOO_LARGE',
      `Request context is ${totalChars} characters, exceeding the configured maxInputChars of ${ctx.budgets.maxInputChars}. The runtime never truncates analytical context.`,
    );
  }

  const messageCount = messages.length + (request.systemPrompt ? 1 : 0);
  if (messageCount > ctx.budgets.maxRequestMessages) {
    throw new AiRuntimeError(
      'INPUT_TOO_LARGE',
      `Request carries ${messageCount} messages, exceeding the configured maxRequestMessages of ${ctx.budgets.maxRequestMessages}.`,
    );
  }

  let maxOutputTokens = ctx.budgets.maxOutputTokens;
  if (request.maxOutputTokens !== undefined) {
    if (!Number.isInteger(request.maxOutputTokens) || request.maxOutputTokens < 1) {
      throw new AiRuntimeError(
        'CONFIGURATION_ERROR',
        `maxOutputTokens must be a positive integer, got ${String(request.maxOutputTokens)}`,
      );
    }
    if (request.maxOutputTokens > ctx.budgets.maxOutputTokens) {
      throw new AiRuntimeError(
        'OUTPUT_LIMIT_EXCEEDED',
        `Requested maxOutputTokens ${request.maxOutputTokens} exceeds the configured bound of ${ctx.budgets.maxOutputTokens}.`,
      );
    }
    maxOutputTokens = request.maxOutputTokens;
  }

  if (
    request.temperature !== undefined &&
    (!Number.isFinite(request.temperature) ||
      request.temperature < 0 ||
      request.temperature > 1)
  ) {
    throw new AiRuntimeError(
      'CONFIGURATION_ERROR',
      `temperature must be a finite number in [0,1], got ${String(request.temperature)}`,
    );
  }

  let timeoutMs = ctx.budgets.timeoutMs;
  if (request.timeoutMs !== undefined) {
    if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0) {
      throw new AiRuntimeError(
        'CONFIGURATION_ERROR',
        `timeoutMs must be a positive finite number, got ${String(request.timeoutMs)}`,
      );
    }
    timeoutMs = Math.min(request.timeoutMs, ctx.budgets.timeoutMs);
  }

  return {
    provider: ctx.provider,
    model,
    systemPrompt: request.systemPrompt,
    messages,
    responseFormat: request.responseFormat ?? 'text',
    maxOutputTokens,
    temperature: request.temperature,
    timeoutMs,
    signal: request.signal,
    metadata: request.metadata,
    promptVersion: request.promptVersion,
    schemaVersion: request.schemaVersion,
    policyVersion: request.policyVersion,
    budgets: ctx.budgets,
  };
}