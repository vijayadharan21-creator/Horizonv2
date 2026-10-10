import { aiConfig } from '../../config/ai.config.js';

/**
 * Ollama AI Provider implementation using Ollama Chat API
 */
export class OllamaProvider {
  constructor(config = aiConfig.ollama) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.model = config.model;
    this.timeoutMs = config.timeoutMs || 45000;
  }

  /**
   * Strip Qwen/Ollama thinking traces that break JSON parsing.
   */
  _stripThinking(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<\|?thought[\s\S]*?<\/thought>/gi, '')
      .trim();
  }

  /**
   * Helper to extract JSON from model output if wrapped in markdown blocks
   */
  _extractJson(text) {
    if (!text || typeof text !== 'string') return null;
    const trimmed = this._stripThinking(text);

    // Check for markdown code fences
    const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = jsonMatch ? jsonMatch[1].trim() : trimmed;

    try {
      return JSON.parse(candidate);
    } catch {
      // Look for the first { or [ and last } or ]
      const firstCurly = candidate.indexOf('{');
      const lastCurly = candidate.lastIndexOf('}');
      if (firstCurly !== -1 && lastCurly > firstCurly) {
        try {
          return JSON.parse(candidate.slice(firstCurly, lastCurly + 1));
        } catch {
          // Ignore
        }
      }
      return null;
    }
  }

  /**
   * Send a structured chat completion request to local Ollama
   * @param {Object} options
   * @param {string} options.systemPrompt
   * @param {string} options.userPrompt
   * @param {import('zod').ZodSchema} [options.schema]
   * @returns {Promise<{ data: any, meta: any }>}
   */
  async generateStructured({ systemPrompt, userPrompt, schema }) {
    const endpoint = `${this.baseUrl}/api/chat`;

    const requestBody = {
      model: this.model,
      stream: false,
      format: 'json',
      think: false,
      messages: [
        {
          role: 'system',
          content: `${systemPrompt}\n\nIMPORTANT: You must reply ONLY with a valid JSON object matching the requested schema. Do not include markdown preamble, commentary, thinking traces, or text outside the JSON.`,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      options: {
        temperature: 0.1,
        num_predict: 2048,
      },
    };

    let response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (networkError) {
      clearTimeout(timer);
      if (networkError.name === 'AbortError') {
        const error = new Error(
          `Ollama request timed out after ${this.timeoutMs / 1000}s while generating inference with model "${this.model}".`
        );
        error.code = 'AI_TIMEOUT';
        error.recoverable = true;
        throw error;
      }

      const error = new Error(
        `Unable to reach local Ollama at ${this.baseUrl}. Please verify Ollama is running (e.g. run "ollama serve" or start the Ollama desktop application).`
      );
      error.code = 'OLLAMA_UNREACHABLE';
      error.recoverable = true;
      error.original = networkError.message;
      throw error;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      let errBody = '';
      try {
        errBody = await response.text();
      } catch {
        // Ignore
      }

      if (response.status === 404 || errBody.toLowerCase().includes('not found')) {
        const error = new Error(
          `Ollama model "${this.model}" was not found. Please install it by running "ollama pull ${this.model}".`
        );
        error.code = 'OLLAMA_MODEL_NOT_FOUND';
        error.recoverable = true;
        throw error;
      }

      const error = new Error(
        `Ollama returned HTTP error ${response.status}: ${errBody || response.statusText}`
      );
      error.code = 'OLLAMA_HTTP_ERROR';
      error.recoverable = response.status >= 500;
      throw error;
    }

    const payload = await response.json();
    const rawContent = this._stripThinking(payload?.message?.content || '');

    if (!rawContent.trim()) {
      const error = new Error('Ollama returned an empty response.');
      error.code = 'AI_EMPTY_RESPONSE';
      error.recoverable = true;
      throw error;
    }

    const parsedJson = this._extractJson(rawContent);
    if (!parsedJson) {
      const error = new Error(
        'Failed to parse structured JSON from Ollama response. Malformed output received.'
      );
      error.code = 'AI_MALFORMED_OUTPUT';
      error.recoverable = true;
      throw error;
    }

    let finalData = parsedJson;
    if (schema) {
      const parsed = schema.safeParse(parsedJson);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
          .join('; ');
        const error = new Error(`Ollama output schema validation failed: ${issues}`);
        error.code = 'AI_SCHEMA_VALIDATION_ERROR';
        error.recoverable = true;
        error.details = parsed.error.issues;
        throw error;
      }
      finalData = parsed.data;
    }

    return {
      data: finalData,
      meta: {
        provider: 'ollama',
        model: this.model,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}

export default new OllamaProvider();
