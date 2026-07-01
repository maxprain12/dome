/**
 * Provider auth helpers for renderer preflight checks.
 * Keep Ollama hostname logic in sync with packages/ai/src/ollama-mode.ts and electron/ai/provider-auth.cjs.
 *
 * @see docs/features/ai-provider-auth.md
 */

export type OllamaMode = 'local' | 'cloud';

const LOCAL_OLLAMA_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function resolveOllamaMode(baseUrl?: string): OllamaMode {
  if (!baseUrl || !String(baseUrl).trim()) {
    return 'local';
  }
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return LOCAL_OLLAMA_HOSTS.has(hostname) ? 'local' : 'cloud';
  } catch {
    return 'local';
  }
}

export function ollamaRequiresApiKey(baseUrl?: string): boolean {
  return resolveOllamaMode(baseUrl) === 'cloud';
}

export function isOllamaCloudMissingApiKey(baseUrl?: string, apiKey?: string): boolean {
  return ollamaRequiresApiKey(baseUrl) && !(apiKey && String(apiKey).trim());
}
