/**
 * Centralized AI Model Definitions
 * 
 * Based on clawdbot's provider definitions, updated with latest models.
 * This file serves as the single source of truth for all AI providers and models.
 */

import type {
  ModelApi,
  ModelCost,
  ModelCompatConfig,
  ModelInputType,
  ZERO_COST,
} from './types';

// =============================================================================
// Types
// =============================================================================

export interface ModelDefinition {
  id: string;
  name: string;
  reasoning: boolean;
  input: ModelInputType[];
  contextWindow: number;
  maxTokens: number;
  recommended?: boolean;
  description?: string;
  /** API type for this model */
  api?: ModelApi;
  /** Cost per 1M tokens */
  cost?: ModelCost;
  /** Custom headers for API requests */
  headers?: Record<string, string>;
  /** Model-specific compatibility settings */
  compat?: ModelCompatConfig;
  /** Provider-specific alias */
  alias?: string;
}

export interface EmbeddingModelDefinition {
  id: string;
  name: string;
  dimensions?: number;
  recommended?: boolean;
  /** Cost per 1M tokens (input only for embeddings) */
  cost?: { input: number };
}

export interface ProviderDefinition {
  id: AIProviderType;
  name: string;
  description: string;
  icon: string;
  models: ModelDefinition[];
  embeddingModels?: EmbeddingModelDefinition[];
  supportsEmbeddings: boolean;
  supportsStreaming?: boolean;
  supportsTools?: boolean;
  apiKeyPlaceholder?: string;
  docsUrl?: string;
  /** Base URL for the provider API */
  baseUrl?: string;
}

export type AIProviderType = 
  | 'openai' 
  | 'anthropic' 
  | 'google' 
  | 'ollama'
  | 'copilot'
  | 'deepseek'
  | 'minimax'
  | 'moonshot'
  | 'qwen';

// =============================================================================
// Cost Definitions (per 1M tokens in USD)
// =============================================================================

const OPENAI_COSTS: Record<string, ModelCost> = {
  'gpt-4o': { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 2.5 },
  'gpt-4o-mini': { input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0.15 },
  'gpt-4.1': { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6, cacheRead: 0.1, cacheWrite: 0.4 },
  'o1': { input: 15, output: 60, cacheRead: 7.5, cacheWrite: 15 },
  'o1-mini': { input: 1.1, output: 4.4, cacheRead: 0.55, cacheWrite: 1.1 },
  'o1-pro': { input: 150, output: 600, cacheRead: 75, cacheWrite: 150 },
  'o3': { input: 10, output: 40, cacheRead: 2.5, cacheWrite: 10 },
  'o3-mini': { input: 1.1, output: 4.4, cacheRead: 0.55, cacheWrite: 1.1 },
  'o4-mini': { input: 1.1, output: 4.4, cacheRead: 0.55, cacheWrite: 1.1 },
};

const ANTHROPIC_COSTS: Record<string, ModelCost> = {
  'claude-sonnet-4-20250514': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-opus-4-20250514': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-3-7-sonnet-20250219': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
  'claude-3-opus-20240229': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
};

const GOOGLE_COSTS: Record<string, ModelCost> = {
  'gemini-2.5-pro-preview-06-05': { input: 1.25, output: 10, cacheRead: 0.31, cacheWrite: 1.25 },
  'gemini-2.5-flash-preview-05-20': { input: 0.15, output: 0.6, cacheRead: 0.0375, cacheWrite: 0.15 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4, cacheRead: 0.025, cacheWrite: 0.1 },
  'gemini-2.0-flash-lite': { input: 0.075, output: 0.3, cacheRead: 0.01875, cacheWrite: 0.075 },
  'gemini-3-pro-preview': { input: 1.25, output: 10, cacheRead: 0.31, cacheWrite: 1.25 },
  'gemini-3-flash-preview': { input: 0.15, output: 0.6, cacheRead: 0.0375, cacheWrite: 0.15 },
};

/** Zero cost for free/local models */
export const FREE_COST: ModelCost = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

// =============================================================================
// OpenAI Models
// =============================================================================

export const OPENAI_MODELS: ModelDefinition[] = [
  // GPT-4o Series
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 128000,
    maxTokens: 16384,
    recommended: true,
    description: 'Más rápido y económico',
    api: 'openai-completions',
    cost: OPENAI_COSTS['gpt-4o'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 128000,
    maxTokens: 16384,
    description: 'Económico para tareas simples',
    api: 'openai-completions',
    cost: OPENAI_COSTS['gpt-4o-mini'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  // GPT-4.1 Series
  {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 1047576,
    maxTokens: 32768,
    description: 'Contexto de 1M tokens',
    api: 'openai-completions',
    cost: OPENAI_COSTS['gpt-4.1'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  {
    id: 'gpt-4.1-mini',
    name: 'GPT-4.1 Mini',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 1047576,
    maxTokens: 32768,
    description: 'Contexto de 1M, económico',
    api: 'openai-completions',
    cost: OPENAI_COSTS['gpt-4.1-mini'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  // o1 Series (Reasoning)
  {
    id: 'o1',
    name: 'o1',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 100000,
    description: 'Razonamiento avanzado',
    api: 'openai-completions',
    cost: OPENAI_COSTS['o1'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true, supportsReasoningEffort: true },
  },
  {
    id: 'o1-mini',
    name: 'o1-mini',
    reasoning: true,
    input: ['text'],
    contextWindow: 128000,
    maxTokens: 65536,
    description: 'Razonamiento económico',
    api: 'openai-completions',
    cost: OPENAI_COSTS['o1-mini'],
    compat: { supportsTools: true, supportsStreaming: true, supportsReasoningEffort: true },
  },
  {
    id: 'o1-pro',
    name: 'o1-pro',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 100000,
    description: 'Razonamiento profesional',
    api: 'openai-completions',
    cost: OPENAI_COSTS['o1-pro'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true, supportsReasoningEffort: true },
  },
  // o3 Series (Reasoning)
  {
    id: 'o3',
    name: 'o3',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 100000,
    description: 'Siguiente gen razonamiento',
    api: 'openai-completions',
    cost: OPENAI_COSTS['o3'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true, supportsReasoningEffort: true },
  },
  {
    id: 'o3-mini',
    name: 'o3-mini',
    reasoning: true,
    input: ['text'],
    contextWindow: 200000,
    maxTokens: 100000,
    description: 'o3 económico',
    api: 'openai-completions',
    cost: OPENAI_COSTS['o3-mini'],
    compat: { supportsTools: true, supportsStreaming: true, supportsReasoningEffort: true },
  },
  // o4 Series (Reasoning)
  {
    id: 'o4-mini',
    name: 'o4-mini',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 100000,
    description: 'Último modelo de razonamiento',
    api: 'openai-completions',
    cost: OPENAI_COSTS['o4-mini'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true, supportsReasoningEffort: true },
  },
];

export const OPENAI_EMBEDDING_MODELS: EmbeddingModelDefinition[] = [
  {
    id: 'text-embedding-3-small',
    name: 'Embedding 3 Small',
    dimensions: 1536,
    recommended: true,
    cost: { input: 0.02 },
  },
  {
    id: 'text-embedding-3-large',
    name: 'Embedding 3 Large',
    dimensions: 3072,
    cost: { input: 0.13 },
  },
  {
    id: 'text-embedding-ada-002',
    name: 'Ada 002 (Legacy)',
    dimensions: 1536,
    cost: { input: 0.1 },
  },
];

// =============================================================================
// Anthropic Models
// =============================================================================

export const ANTHROPIC_MODELS: ModelDefinition[] = [
  // Claude 4 Series
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 64000,
    recommended: true,
    description: 'Mejor balance calidad/costo',
    api: 'anthropic-messages',
    cost: ANTHROPIC_COSTS['claude-sonnet-4-20250514'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  {
    id: 'claude-opus-4-20250514',
    name: 'Claude Opus 4',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 32000,
    description: 'Máxima capacidad',
    api: 'anthropic-messages',
    cost: ANTHROPIC_COSTS['claude-opus-4-20250514'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  // Claude 3.7 Series
  {
    id: 'claude-3-7-sonnet-20250219',
    name: 'Claude 3.7 Sonnet',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 128000,
    description: 'Con razonamiento extendido',
    api: 'anthropic-messages',
    cost: ANTHROPIC_COSTS['claude-3-7-sonnet-20250219'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  // Claude 3.5 Series
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 8192,
    description: 'Alta calidad',
    api: 'anthropic-messages',
    cost: ANTHROPIC_COSTS['claude-3-5-sonnet-20241022'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 8192,
    description: 'Rápido y económico',
    api: 'anthropic-messages',
    cost: ANTHROPIC_COSTS['claude-3-5-haiku-20241022'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  // Claude 3 Series (Legacy)
  {
    id: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 4096,
    description: 'Legacy, alta capacidad',
    api: 'anthropic-messages',
    cost: ANTHROPIC_COSTS['claude-3-opus-20240229'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
];

// =============================================================================
// Google Gemini Models
// =============================================================================

export const GOOGLE_MODELS: ModelDefinition[] = [
  // Gemini 2.5 Series
  {
    id: 'gemini-2.5-pro-preview-06-05',
    name: 'Gemini 2.5 Pro',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 1048576,
    maxTokens: 65536,
    description: 'Pro con razonamiento',
    api: 'google-generative-ai',
    cost: GOOGLE_COSTS['gemini-2.5-pro-preview-06-05'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  {
    id: 'gemini-2.5-flash-preview-05-20',
    name: 'Gemini 2.5 Flash',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 1048576,
    maxTokens: 65536,
    recommended: true,
    description: 'Rápido con razonamiento',
    api: 'google-generative-ai',
    cost: GOOGLE_COSTS['gemini-2.5-flash-preview-05-20'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  // Gemini 2.0 Series
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 1048576,
    maxTokens: 8192,
    description: 'Rápido y estable',
    api: 'google-generative-ai',
    cost: GOOGLE_COSTS['gemini-2.0-flash'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  {
    id: 'gemini-2.0-flash-lite',
    name: 'Gemini 2.0 Flash Lite',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 1048576,
    maxTokens: 8192,
    description: 'Ultra económico',
    api: 'google-generative-ai',
    cost: GOOGLE_COSTS['gemini-2.0-flash-lite'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  // Gemini 3 Series (Preview)
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro (Preview)',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 1048576,
    maxTokens: 65536,
    description: 'Próxima generación Pro',
    api: 'google-generative-ai',
    cost: GOOGLE_COSTS['gemini-3-pro-preview'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash (Preview)',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 1048576,
    maxTokens: 65536,
    description: 'Próxima generación Flash',
    api: 'google-generative-ai',
    cost: GOOGLE_COSTS['gemini-3-flash-preview'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
];

export const GOOGLE_EMBEDDING_MODELS: EmbeddingModelDefinition[] = [
  {
    id: 'text-embedding-004',
    name: 'Text Embedding 004',
    dimensions: 768,
    recommended: true,
    cost: { input: 0.00001 }, // Basically free
  },
];

// =============================================================================
// Provider Definitions
// =============================================================================

export const PROVIDERS: Record<AIProviderType, ProviderDefinition> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, o1, o3 y embeddings',
    icon: 'openai',
    models: OPENAI_MODELS,
    embeddingModels: OPENAI_EMBEDDING_MODELS,
    supportsEmbeddings: true,
    supportsStreaming: true,
    supportsTools: true,
    apiKeyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.openai.com',
    baseUrl: 'https://api.openai.com/v1',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 4, 3.7 y 3.5',
    icon: 'anthropic',
    models: ANTHROPIC_MODELS,
    supportsEmbeddings: false,
    supportsStreaming: true,
    supportsTools: true,
    apiKeyPlaceholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com',
    baseUrl: 'https://api.anthropic.com',
  },
  google: {
    id: 'google',
    name: 'Google Gemini',
    description: 'Gemini 2.5, 2.0 y 3',
    icon: 'google',
    models: GOOGLE_MODELS,
    embeddingModels: GOOGLE_EMBEDDING_MODELS,
    supportsEmbeddings: true,
    supportsStreaming: true,
    supportsTools: true,
    apiKeyPlaceholder: 'AIza...',
    docsUrl: 'https://aistudio.google.com',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local y privado',
    icon: 'ollama',
    models: [], // Loaded dynamically
    supportsEmbeddings: true,
    supportsStreaming: true,
    supportsTools: true,
    baseUrl: 'http://localhost:11434',
  },
  copilot: {
    id: 'copilot',
    name: 'GitHub Copilot',
    description: 'Modelos vía GitHub',
    icon: 'github',
    models: [], // Loaded from catalogs/copilot.ts
    supportsEmbeddings: false,
    supportsStreaming: true,
    supportsTools: true,
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek V3 y R1',
    icon: 'deepseek',
    models: [],
    supportsEmbeddings: false,
    supportsStreaming: true,
    supportsTools: true,
    baseUrl: 'https://api.deepseek.com/v1',
  },
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    description: 'MiniMax M2',
    icon: 'minimax',
    models: [],
    supportsEmbeddings: false,
    supportsStreaming: true,
    supportsTools: true,
    baseUrl: 'https://api.minimax.chat/v1',
  },
  moonshot: {
    id: 'moonshot',
    name: 'Moonshot',
    description: 'Kimi K2',
    icon: 'moonshot',
    models: [],
    supportsEmbeddings: false,
    supportsStreaming: true,
    supportsTools: true,
    baseUrl: 'https://api.moonshot.cn/v1',
  },
  qwen: {
    id: 'qwen',
    name: 'Qwen',
    description: 'Qwen 3 y Coder',
    icon: 'qwen',
    models: [],
    supportsEmbeddings: false,
    supportsStreaming: true,
    supportsTools: true,
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the recommended model for a provider
 */
export function getRecommendedModel(providerId: AIProviderType): ModelDefinition | undefined {
  const provider = PROVIDERS[providerId];
  return provider?.models.find(m => m.recommended) || provider?.models[0];
}

/**
 * Get the recommended embedding model for a provider
 */
export function getRecommendedEmbeddingModel(providerId: AIProviderType): EmbeddingModelDefinition | undefined {
  const provider = PROVIDERS[providerId];
  return provider?.embeddingModels?.find(m => m.recommended) || provider?.embeddingModels?.[0];
}

/**
 * Get all providers as an array (useful for UI rendering)
 */
export function getProvidersArray(): ProviderDefinition[] {
  return Object.values(PROVIDERS);
}

/**
 * Get models for a specific provider
 */
export function getModelsForProvider(providerId: AIProviderType): ModelDefinition[] {
  return PROVIDERS[providerId]?.models || [];
}

/**
 * Get embedding models for a specific provider
 */
export function getEmbeddingModelsForProvider(providerId: AIProviderType): EmbeddingModelDefinition[] {
  return PROVIDERS[providerId]?.embeddingModels || [];
}

/**
 * Check if a provider supports embeddings
 */
export function providerSupportsEmbeddings(providerId: AIProviderType): boolean {
  return PROVIDERS[providerId]?.supportsEmbeddings ?? false;
}

/**
 * Check if a provider supports streaming
 */
export function providerSupportsStreaming(providerId: AIProviderType): boolean {
  return PROVIDERS[providerId]?.supportsStreaming ?? false;
}

/**
 * Check if a provider supports tools
 */
export function providerSupportsTools(providerId: AIProviderType): boolean {
  return PROVIDERS[providerId]?.supportsTools ?? false;
}

/**
 * Get default model ID for a provider
 */
export function getDefaultModelId(providerId: AIProviderType): string {
  const recommended = getRecommendedModel(providerId);
  if (recommended) return recommended.id;
  
  // Fallback defaults
  switch (providerId) {
    case 'openai': return 'gpt-4o';
    case 'anthropic': return 'claude-sonnet-4-20250514';
    case 'google': return 'gemini-2.5-flash-preview-05-20';
    case 'ollama': return 'llama3.2';
    case 'copilot': return 'gpt-4o';
    case 'deepseek': return 'deepseek-chat';
    case 'minimax': return 'abab6.5s-chat';
    case 'moonshot': return 'moonshot-v1-8k';
    case 'qwen': return 'qwen-max';
    default: return '';
  }
}

/**
 * Get default embedding model ID for a provider
 */
export function getDefaultEmbeddingModelId(providerId: AIProviderType): string {
  const recommended = getRecommendedEmbeddingModel(providerId);
  if (recommended) return recommended.id;
  
  // Fallback defaults
  switch (providerId) {
    case 'openai': return 'text-embedding-3-small';
    case 'google': return 'text-embedding-004';
    case 'ollama': return 'mxbai-embed-large';
    default: return '';
  }
}

/**
 * Format context window size for display (e.g., "128K", "1M")
 */
export function formatContextWindow(contextWindow: number): string {
  if (contextWindow >= 1000000) {
    return `${(contextWindow / 1000000).toFixed(0)}M`;
  }
  return `${Math.round(contextWindow / 1000)}K`;
}

/**
 * Find a model by ID across all providers
 */
export function findModelById(modelId: string): { provider: AIProviderType; model: ModelDefinition } | undefined {
  for (const [providerId, provider] of Object.entries(PROVIDERS)) {
    const model = provider.models.find(m => m.id === modelId);
    if (model) {
      return { provider: providerId as AIProviderType, model };
    }
  }
  return undefined;
}

/**
 * Check if a model supports vision/images
 */
export function modelSupportsVision(model: ModelDefinition): boolean {
  return model.input.includes('image') || model.compat?.supportsVision === true;
}

/**
 * Check if a model supports tools
 */
export function modelSupportsTools(model: ModelDefinition): boolean {
  return model.compat?.supportsTools === true;
}

/**
 * Get the API type for a model
 */
export function getModelApiType(model: ModelDefinition, providerId: AIProviderType): ModelApi {
  if (model.api) return model.api;
  
  // Default API types by provider
  switch (providerId) {
    case 'openai':
    case 'copilot':
    case 'deepseek':
    case 'minimax':
    case 'moonshot':
    case 'qwen':
      return 'openai-completions';
    case 'anthropic':
      return 'anthropic-messages';
    case 'google':
      return 'google-generative-ai';
    case 'ollama':
      return 'ollama';
    default:
      return 'openai-completions';
  }
}
