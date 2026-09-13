// ============================================================================
// Provider factory (@indago/ai-agent-runtime)
//
// Explicit, deterministic provider construction from a validated AiConfig.
// There is NO hidden fallback chain — a Gemini config NEVER silently becomes
// Ollama (or vice versa). Unknown kinds are a hard error. A provider missing
// its required secret (GEMINI_API_KEY) is a configuration error at build time.
// A provider failure remains a provider failure.
// ============================================================================

import { AiRuntimeError } from '../errors/ai-runtime-error.js';
import type { AiConfig } from '../config/types.js';
import type { AIProvider } from './types.js';
import { GeminiProvider } from './gemini.js';
import { OllamaGenerationProvider } from './ollama.js';

export function createLLMProvider(config: AiConfig): AIProvider {
  switch (config.provider) {
    case 'gemini': {
      if (config.gemini.apiKey === '') {
        throw new AiRuntimeError(
          'CONFIGURATION_ERROR',
          'GEMINI_API_KEY is not configured; the gemini provider requires a key',
        );
      }
      return new GeminiProvider(config.gemini);
    }
    case 'ollama':
      return new OllamaGenerationProvider(config.ollama);
    default: {
      // Fail loudly to the provider inventory, never fall back.
      throw new AiRuntimeError(
        'PROVIDER_NOT_FOUND',
        `No AI provider registered for "${String(config.provider as string)}"`,
      );
    }
  }
}