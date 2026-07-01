/**
 * Ollama local vs cloud mode — inferred from Base URL hostname.
 * Keep in sync with app/lib/ai/providerAuth.ts (renderer mirror).
 *
 * @see docs/features/ai-provider-auth.md
 */

export type OllamaMode = 'local' | 'cloud';

/** Placeholder for OpenAI SDK when local Ollama needs no real auth. */
export const OLLAMA_LOCAL_PLACEHOLDER_KEY = 'ollama-local';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Resolve Ollama deployment mode from Base URL.
 * Local: localhost / 127.0.0.1 / [::1]. Everything else is cloud.
 */
export function resolveOllamaMode(baseUrl?: string): OllamaMode {
  if (!baseUrl || !String(baseUrl).trim()) {
    return 'local';
  }
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return LOCAL_HOSTS.has(hostname) ? 'local' : 'cloud';
  } catch {
    return 'local';
  }
}

/** True when Ollama cloud mode requires a stored API key. */
export function ollamaRequiresApiKey(baseUrl?: string): boolean {
  return resolveOllamaMode(baseUrl) === 'cloud';
}
