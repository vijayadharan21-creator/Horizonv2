import OpenAI from 'openai';
import { aiConfig } from '../../config/ai.config.js';

/**
 * OpenAI Cloud Provider implementation using official OpenAI Node.js SDK
 */
export class OpenAIProvider {
  constructor(config = aiConfig.openai) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeoutMs = config.timeoutMs || 30000;
    this._client = null;
  }

  /**
   * Lazy initialization of the OpenAI client
   */
  getClient() {
    if (!this._client) {
      if (!this.apiKey) {
        const error = new Error(
          'OpenAI API key is missing. Please configure OPENAI_API_KEY in the server environment.'
        );
        error.code = 'OPENAI_KEY_MISSING';
        error.recoverable = false;
        throw error;
      }
      this._client = new OpenAI({
        apiKey: this.apiKey,
        timeout: this.timeoutMs,
      });
    }
    return this._client;
  }

  /**
   * Helper to extract JSON from OpenAI output
   */
  _extractJson(text) {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();
    const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = jsonMatch ? jsonMatch[1].trim() : trimmed;

    try {
      return JSON.parse(candidate);
    } catch {
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
   * Send a structured chat completion request to OpenAI
   * @param {Object} options
   * @param {string} options.systemPrompt
   * @param {string} options.userPrompt
   * @param {import('zod').ZodSchema} [options.schema]
   * @returns {Promise<{ data: any, meta: any }>}
   */
  async generateStructured({ systemPrompt, userPrompt, schema }) {
    const client = this.getClient();

    let completion;
    try {
      completion = await client.chat.completions.create({
        model: this.model,
        response_format: { type: 'json_object' },
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: `${systemPrompt}\n\nIMPORTANT: Return strictly a valid JSON object matching the requested schema. No additional text or markdown commentary.`,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });
    } catch (err) {
      // Map SDK errors to clean, safe domain errors without leaking keys or stack traces
      const status = err.status || err.statusCode;
      let safeMessage = 'OpenAI API request failed.';
      let code = 'OPENAI_REQUEST_FAILED';
      let recoverable = false;

      if (status === 401) {
        safeMessage = 'OpenAI authentication failed. Please verify your OPENAI_API_KEY.';
        code = 'OPENAI_AUTH_FAILED';
        recoverable = false;
      } else if (status === 429) {
        safeMessage = 'OpenAI rate limit or credit quota exceeded. Please check your account usage.';
        code = 'OPENAI_RATE_LIMIT';
        recoverable = true;
      } else if (err.code === 'ETIMEDOUT' || err.name === 'TimeoutError') {
        safeMessage = `OpenAI request timed out after ${this.timeoutMs / 1000}s.`;
        code = 'AI_TIMEOUT';
        recoverable = true;
      } else if (status >= 500) {
        safeMessage = 'OpenAI cloud service is experiencing temporary server issues.';
        code = 'OPENAI_SERVER_ERROR';
        recoverable = true;
      }

      const error = new Error(safeMessage);
      error.code = code;
      error.recoverable = recoverable;
      error.statusCode = status;
      throw error;
    }

    const rawContent = completion.choices?.[0]?.message?.content || '';
    if (!rawContent.trim()) {
      const error = new Error('OpenAI returned an empty response.');
      error.code = 'AI_EMPTY_RESPONSE';
      error.recoverable = true;
      throw error;
    }

    const parsedJson = this._extractJson(rawContent);
    if (!parsedJson) {
      const error = new Error(
        'Failed to parse structured JSON from OpenAI output. Malformed JSON received.'
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
        const error = new Error(`OpenAI output schema validation failed: ${issues}`);
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
        provider: 'openai',
        model: this.model,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}

export default new OpenAIProvider();
