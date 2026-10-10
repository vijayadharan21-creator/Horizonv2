import dotenv from 'dotenv';
dotenv.config();

/**
 * Validated AI configuration for TaskForge AI
 */
export const aiConfig = {
  provider: (process.env.AI_PROVIDER || 'ollama').toLowerCase().trim(),
  fallbackEnabled: process.env.AI_FALLBACK_ENABLED === 'true',
  ollama: {
    baseUrl: (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, ''),
    model: process.env.OLLAMA_MODEL || 'qwen3:4b',
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS) || 90000,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS) || 30000,
  },
  maxRetries: 2,
};

/**
 * Validate AI configuration at startup or runtime.
 * Throws or logs actionable configuration warnings.
 */
export const validateAiConfig = () => {
  const allowed = ['ollama', 'openai'];
  if (!allowed.includes(aiConfig.provider)) {
    throw new Error(
      `Invalid AI_PROVIDER="${aiConfig.provider}". Supported providers are: ${allowed.join(', ')}.`
    );
  }

  if (aiConfig.provider === 'openai' && !aiConfig.openai.apiKey && process.env.NODE_ENV !== 'test') {
    console.warn(
      '[AI Config Warning] AI_PROVIDER is set to "openai" but OPENAI_API_KEY is not defined in server environment.'
    );
  }

  if (aiConfig.provider === 'ollama' && !aiConfig.ollama.baseUrl) {
    throw new Error('OLLAMA_BASE_URL must be specified when using Ollama AI provider.');
  }

  return true;
};

/**
 * Probe local Ollama without exposing internals.
 */
export const probeOllama = async () => {
  const result = {
    reachable: false,
    modelInstalled: false,
    models: [],
  };

  try {
    const response = await fetch(`${aiConfig.ollama.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return result;
    const payload = await response.json();
    const models = (payload.models || []).map((m) => m.name).filter(Boolean);
    result.reachable = true;
    result.models = models;
    result.modelInstalled = models.some(
      (name) =>
        name === aiConfig.ollama.model ||
        name.startsWith(`${aiConfig.ollama.model}:`) ||
        name.split(':')[0] === aiConfig.ollama.model.split(':')[0]
    );
  } catch {
    // Offline or refused
  }

  return result;
};

/**
 * Returns safe provider metadata without exposing API keys or secrets
 */
export const getSafeAiStatus = () => {
  return {
    activeProvider: aiConfig.provider,
    fallbackEnabled: aiConfig.fallbackEnabled,
    ollama: {
      configuredModel: aiConfig.ollama.model,
      baseUrl: aiConfig.ollama.baseUrl,
      timeoutMs: aiConfig.ollama.timeoutMs,
    },
    openai: {
      configuredModel: aiConfig.openai.model,
      hasKeyConfigured: Boolean(aiConfig.openai.apiKey),
    },
    status: 'configured',
    timestamp: new Date().toISOString(),
  };
};

export default aiConfig;
