/**
 * Provider Discovery
 * 
 * Automatic discovery of available AI providers from environment variables
 * and configuration.
 * Based on clawdbot's src/agents/models-config.providers.ts
 */

import type { ModelDefinitionConfig, ModelProviderConfig } from './types';
import type { AIProviderType, ModelDefinition } from './models';
import { getCopilotModels } from './catalogs/copilot';

// =============================================================================
// Environment Variable Keys
// =============================================================================

const ENV_KEYS = {
  // OpenAI
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  OPENAI_BASE_URL: 'OPENAI_BASE_URL',
  
  // Anthropic
  ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
  
  // Google
  GOOGLE_API_KEY: 'GOOGLE_API_KEY',
  GEMINI_API_KEY: 'GEMINI_API_KEY',
  
  // Ollama
  OLLAMA_BASE_URL: 'OLLAMA_BASE_URL',
  OLLAMA_HOST: 'OLLAMA_HOST',
  
  // MiniMax
  MINIMAX_API_KEY: 'MINIMAX_API_KEY',
  MINIMAX_GROUP_ID: 'MINIMAX_GROUP_ID',
  
  // Moonshot
  MOONSHOT_API_KEY: 'MOONSHOT_API_KEY',
  
  // Qwen
  QWEN_API_KEY: 'QWEN_API_KEY',
  DASHSCOPE_API_KEY: 'DASHSCOPE_API_KEY',
  
  // DeepSeek
  DEEPSEEK_API_KEY: 'DEEPSEEK_API_KEY',
  
  // Search APIs
  BRAVE_API_KEY: 'BRAVE_API_KEY',
  PERPLEXITY_API_KEY: 'PERPLEXITY_API_KEY',
  OPENROUTER_API_KEY: 'OPENROUTER_API_KEY',
} as const;

// =============================================================================
// Discovery Results
// =============================================================================

export interface DiscoveredProvider {
  id: AIProviderType;
  name: string;
  available: boolean;
  apiKey?: string;
  baseUrl?: string;
  models?: ModelDefinition[];
  source: 'env' | 'config' | 'auto';
}

export interface DiscoveryResult {
  providers: DiscoveredProvider[];
  searchApis: {
    brave: boolean;
    perplexity: boolean;
    openrouter: boolean;
  };
}

// =============================================================================
// Environment Helpers
// =============================================================================

function getEnv(key: string): string | undefined {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined') {
    return undefined;
  }
  
  // Node.js environment
  return process.env[key];
}

function hasEnv(key: string): boolean {
  const value = getEnv(key);
  return !!value && value.trim().length > 0;
}

// =============================================================================
// Provider-Specific Discovery
// =============================================================================

async function discoverOllama(): Promise<DiscoveredProvider> {
  const baseUrl = getEnv(ENV_KEYS.OLLAMA_BASE_URL) || getEnv(ENV_KEYS.OLLAMA_HOST) || 'http://localhost:11434';
  
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    
    if (!response.ok) {
      return { id: 'ollama', name: 'Ollama', available: false, baseUrl, source: 'auto' };
    }
    
    const data = await response.json() as { models?: Array<{ name: string }> };
    const models: ModelDefinition[] = (data.models ?? []).map(m => ({
      id: m.name,
      name: m.name,
      reasoning: m.name.includes('thinking') || m.name.includes('reason'),
      input: ['text'],
      contextWindow: 128000,
      maxTokens: 8192,
      api: 'ollama' as const,
    }));
    
    return {
      id: 'ollama',
      name: 'Ollama',
      available: true,
      baseUrl,
      models,
      source: 'auto',
    };
  } catch {
    return { id: 'ollama', name: 'Ollama', available: false, baseUrl, source: 'auto' };
  }
}

function discoverOpenAI(): DiscoveredProvider {
  const apiKey = getEnv(ENV_KEYS.OPENAI_API_KEY);
  const baseUrl = getEnv(ENV_KEYS.OPENAI_BASE_URL);
  
  return {
    id: 'openai',
    name: 'OpenAI',
    available: !!apiKey,
    apiKey: apiKey ? '***' : undefined,
    baseUrl,
    source: apiKey ? 'env' : 'config',
  };
}

function discoverAnthropic(): DiscoveredProvider {
  const apiKey = getEnv(ENV_KEYS.ANTHROPIC_API_KEY);
  
  return {
    id: 'anthropic',
    name: 'Anthropic',
    available: !!apiKey,
    apiKey: apiKey ? '***' : undefined,
    source: apiKey ? 'env' : 'config',
  };
}

function discoverGoogle(): DiscoveredProvider {
  const apiKey = getEnv(ENV_KEYS.GOOGLE_API_KEY) || getEnv(ENV_KEYS.GEMINI_API_KEY);
  
  return {
    id: 'google',
    name: 'Google Gemini',
    available: !!apiKey,
    apiKey: apiKey ? '***' : undefined,
    source: apiKey ? 'env' : 'config',
  };
}

function discoverMiniMax(): DiscoveredProvider {
  const apiKey = getEnv(ENV_KEYS.MINIMAX_API_KEY);
  const groupId = getEnv(ENV_KEYS.MINIMAX_GROUP_ID);
  
  return {
    id: 'minimax',
    name: 'MiniMax',
    available: !!apiKey && !!groupId,
    apiKey: apiKey ? '***' : undefined,
    source: apiKey ? 'env' : 'config',
  };
}

function discoverMoonshot(): DiscoveredProvider {
  const apiKey = getEnv(ENV_KEYS.MOONSHOT_API_KEY);
  
  return {
    id: 'moonshot',
    name: 'Moonshot',
    available: !!apiKey,
    apiKey: apiKey ? '***' : undefined,
    source: apiKey ? 'env' : 'config',
  };
}

function discoverQwen(): DiscoveredProvider {
  const apiKey = getEnv(ENV_KEYS.QWEN_API_KEY) || getEnv(ENV_KEYS.DASHSCOPE_API_KEY);
  
  return {
    id: 'qwen',
    name: 'Qwen',
    available: !!apiKey,
    apiKey: apiKey ? '***' : undefined,
    source: apiKey ? 'env' : 'config',
  };
}

function discoverDeepSeek(): DiscoveredProvider {
  const apiKey = getEnv(ENV_KEYS.DEEPSEEK_API_KEY);
  
  return {
    id: 'deepseek',
    name: 'DeepSeek',
    available: !!apiKey,
    apiKey: apiKey ? '***' : undefined,
    source: apiKey ? 'env' : 'config',
  };
}

function discoverCopilot(): DiscoveredProvider {
  // Copilot requires GitHub authentication, can't detect from env
  const models = getCopilotModels();
  
  return {
    id: 'copilot',
    name: 'GitHub Copilot',
    available: false, // Requires OAuth
    models,
    source: 'config',
  };
}

// =============================================================================
// Main Discovery Function
// =============================================================================

/**
 * Discover all available AI providers.
 */
export async function discoverProviders(): Promise<DiscoveryResult> {
  const ollama = await discoverOllama();

  const providers: DiscoveredProvider[] = [
    discoverOpenAI(),
    discoverAnthropic(),
    discoverGoogle(),
    ollama,
    discoverCopilot(),
    discoverDeepSeek(),
    discoverMiniMax(),
    discoverMoonshot(),
    discoverQwen(),
  ];

  const searchApis = {
    brave: hasEnv(ENV_KEYS.BRAVE_API_KEY),
    perplexity: hasEnv(ENV_KEYS.PERPLEXITY_API_KEY),
    openrouter: hasEnv(ENV_KEYS.OPENROUTER_API_KEY),
  };

  return { providers, searchApis };
}

/**
 * Get available providers (only those that are ready to use).
 */
export async function getAvailableProviders(): Promise<DiscoveredProvider[]> {
  const result = await discoverProviders();
  return result.providers.filter(p => p.available);
}

/**
 * Check if a specific provider is available.
 */
export async function isProviderAvailable(providerId: AIProviderType): Promise<boolean> {
  const result = await discoverProviders();
  const provider = result.providers.find(p => p.id === providerId);
  return provider?.available ?? false;
}

/**
 * Get the best available provider for general use.
 */
export async function getBestAvailableProvider(): Promise<DiscoveredProvider | null> {
  const available = await getAvailableProviders();
  
  // Priority order
  const priority: AIProviderType[] = [
    'anthropic',
    'openai',
    'google',
    'ollama',
    'deepseek',
  ];
  
  for (const id of priority) {
    const provider = available.find(p => p.id === id);
    if (provider) return provider;
  }
  
  return available[0] ?? null;
}

// =============================================================================
// Provider Config Builder
// =============================================================================

/**
 * Build a ModelProviderConfig from a discovered provider.
 */
export function buildProviderConfig(provider: DiscoveredProvider): ModelProviderConfig | null {
  if (!provider.available) return null;
  
  const models: ModelDefinitionConfig[] = (provider.models ?? []).map(m => ({
    id: m.id,
    name: m.name,
    api: m.api,
    reasoning: m.reasoning,
    input: m.input,
    cost: m.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: m.contextWindow,
    maxTokens: m.maxTokens,
  }));
  
  return {
    baseUrl: provider.baseUrl ?? '',
    apiKey: provider.apiKey,
    models,
  };
}
