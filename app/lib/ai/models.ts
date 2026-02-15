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
  'gpt-5.2': { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 1.75 },
  'gpt-5': { input: 1.25, output: 10, cacheRead: 0.625, cacheWrite: 1.25 },
  'gpt-5-mini': { input: 0.4, output: 1.6, cacheRead: 0.1, cacheWrite: 0.4 },
  'gpt-5-nano': { input: 0.05, output: 0.4, cacheRead: 0.025, cacheWrite: 0.05 },
  'gpt-oss-120b': { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 },
};

const ANTHROPIC_COSTS: Record<string, ModelCost> = {
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-4-5': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

const GOOGLE_COSTS: Record<string, ModelCost> = {
  'gemini-3-flash': { input: 0.5, output: 3, cacheRead: 0.05, cacheWrite: 0.5 },
  'gemini-3-pro': { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 2 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4, cacheRead: 0.025, cacheWrite: 0.1 },
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
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 400000,
    maxTokens: 32768,
    recommended: true,
    description: 'Mejor modelo para codificación y tareas de agente',
    api: 'openai-completions',
    cost: OPENAI_COSTS['gpt-5.2'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  {
    id: 'gpt-5',
    name: 'GPT-5',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 128000,
    maxTokens: 32768,
    description: 'Modelo de razonamiento inteligente con esfuerzo configurable',
    api: 'openai-completions',
    cost: OPENAI_COSTS['gpt-5'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 128000,
    maxTokens: 16384,
    description: 'Versión más rápida y económica para tareas bien definidas',
    api: 'openai-completions',
    cost: OPENAI_COSTS['gpt-5-mini'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  {
    id: 'gpt-5-nano',
    name: 'GPT-5 Nano',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 128000,
    maxTokens: 8192,
    description: 'El más rápido y económico de la serie GPT-5',
    api: 'openai-completions',
    cost: OPENAI_COSTS['gpt-5-nano'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  {
    id: 'gpt-oss-120b',
    name: 'GPT-OSS 120B',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 128000,
    maxTokens: 16384,
    description: 'Modelo open-weight más potente, cabe en GPU H100',
    api: 'openai-completions',
    cost: OPENAI_COSTS['gpt-oss-120b'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
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
];

// =============================================================================
// Anthropic Models
// =============================================================================

export const ANTHROPIC_MODELS: ModelDefinition[] = [
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 64000,
    description: 'Nuestro modelo más inteligente para agentes y codificación',
    api: 'anthropic-messages',
    cost: ANTHROPIC_COSTS['claude-opus-4-6'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 64000,
    recommended: true,
    description: 'Mejor combinación de velocidad e inteligencia',
    api: 'anthropic-messages',
    cost: ANTHROPIC_COSTS['claude-sonnet-4-5'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 32000,
    description: 'Nuestro modelo más rápido con inteligencia de vanguardia',
    api: 'anthropic-messages',
    cost: ANTHROPIC_COSTS['claude-haiku-4-5'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
];

export const ANTHROPIC_EMBEDDING_MODELS: EmbeddingModelDefinition[] = [
  {
    id: 'voyage-multimodal-3',
    name: 'Voyage Multimodal 3',
    recommended: true,
    cost: { input: 0.12 },
  },
];

// =============================================================================
// Google Gemini Models
// =============================================================================

export const GOOGLE_MODELS: ModelDefinition[] = [
  {
    id: 'gemini-3-flash',
    name: 'Gemini 3 Flash',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 1048576,
    maxTokens: 65536,
    recommended: true,
    description: 'Equilibrado: velocidad, escala e inteligencia de vanguardia',
    api: 'google-generative-ai',
    cost: GOOGLE_COSTS['gemini-3-flash'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  {
    id: 'gemini-3-pro',
    name: 'Gemini 3 Pro',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 1048576,
    maxTokens: 65536,
    description: 'Mejor modelo para comprensión multimodal y codificación',
    api: 'google-generative-ai',
    cost: GOOGLE_COSTS['gemini-3-pro'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 1048576,
    maxTokens: 8192,
    description: 'Flash más rápido, optimizado para rentabilidad',
    api: 'google-generative-ai',
    cost: GOOGLE_COSTS['gemini-2.5-flash-lite'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
];

export const GOOGLE_EMBEDDING_MODELS: EmbeddingModelDefinition[] = [
  {
    id: 'gemini-embedding-001',
    name: 'Gemini Embedding 001',
    recommended: true,
    cost: { input: 0.00001 },
  },
];

// =============================================================================
// Provider Definitions
// =============================================================================

export const PROVIDERS: Record<AIProviderType, ProviderDefinition> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-5.2, GPT-5 y embeddings',
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
    description: 'Claude 4.6, 4.5 y Voyage embeddings',
    icon: 'anthropic',
    models: ANTHROPIC_MODELS,
    embeddingModels: ANTHROPIC_EMBEDDING_MODELS,
    supportsEmbeddings: true,
    supportsStreaming: true,
    supportsTools: true,
    apiKeyPlaceholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com',
    baseUrl: 'https://api.anthropic.com',
  },
  google: {
    id: 'google',
    name: 'Google Gemini',
    description: 'Gemini 3 Flash, 3 Pro y 2.5 Flash Lite',
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
    case 'openai': return 'gpt-5.2';
    case 'anthropic': return 'claude-sonnet-4-5';
    case 'google': return 'gemini-3-flash';
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
    case 'anthropic': return 'voyage-multimodal-3';
    case 'google': return 'gemini-embedding-001';
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
