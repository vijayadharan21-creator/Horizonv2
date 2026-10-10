import { aiConfig } from '../../config/ai.config.js';
import ollamaProvider, { OllamaProvider } from './ollama.provider.js';
import openaiProvider, { OpenAIProvider } from './openai.provider.js';

/**
 * Unified AI Service orchestrator
 * Handles provider routing, fallback execution, and standardized response formatting.
 */
export class AiService {
  constructor({
    config = aiConfig,
    ollama = ollamaProvider,
    openai = openaiProvider,
  } = {}) {
    this.config = config;
    this.ollama = ollama;
    this.openai = openai;
  }

  /**
   * Get active provider instance
   */
  getPrimaryProvider() {
    return this.config.provider === 'openai' ? this.openai : this.ollama;
  }

  /**
   * Get secondary provider instance for fallback
   */
  getSecondaryProvider() {
    return this.config.provider === 'openai' ? this.ollama : this.openai;
  }

  /**
   * Centralized method to run a structured prompt through the AI pipeline
   * @param {Object} options
   * @param {string} options.systemPrompt
   * @param {string} options.userPrompt
   * @param {import('zod').ZodSchema} [options.schema]
   */
  async executeStructuredPrompt({ systemPrompt, userPrompt, schema }) {
    const primary = this.getPrimaryProvider();
    const primaryName = this.config.provider;

    try {
      // Primary provider attempt
      const result = await primary.generateStructured({
        systemPrompt,
        userPrompt,
        schema,
      });

      return {
        ...result,
        meta: {
          ...result.meta,
          fallbackUsed: false,
        },
      };
    } catch (primaryError) {
      // Check if fallback is permitted
      const canFallback =
        this.config.fallbackEnabled &&
        primaryError.recoverable !== false;

      if (!canFallback) {
        // Fallback disabled or non-recoverable: preserve and bubble up the primary error
        throw primaryError;
      }

      const secondary = this.getSecondaryProvider();
      const secondaryName = primaryName === 'openai' ? 'ollama' : 'openai';

      console.warn(
        `[AI Service Fallback] Primary provider "${primaryName}" failed (${primaryError.code || primaryError.message}). Falling back to "${secondaryName}".`
      );

      try {
        const secondaryResult = await secondary.generateStructured({
          systemPrompt,
          userPrompt,
          schema,
        });

        return {
          ...secondaryResult,
          meta: {
            ...secondaryResult.meta,
            fallbackUsed: true,
            fallbackReason: primaryError.message,
            primaryProviderFailed: primaryName,
          },
        };
      } catch (secondaryError) {
        // Both failed
        const combinedError = new Error(
          `AI service failed on both primary (${primaryName}: ${primaryError.message}) and fallback (${secondaryName}: ${secondaryError.message}).`
        );
        combinedError.code = 'AI_ALL_PROVIDERS_FAILED';
        combinedError.primaryError = primaryError;
        combinedError.secondaryError = secondaryError;
        throw combinedError;
      }
    }
  }
}

export default new AiService();
