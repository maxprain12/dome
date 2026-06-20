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
} from './types';
import { OPENROUTER_CURATED_SPECS } from './catalogs/openrouter';

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
  | 'dome'
  | 'ollama'
  | 'copilot'
  | 'deepseek'
  | 'minimax'
  | 'openrouter'
  | 'moonshot'
  | 'qwen'
  | 'opencode'
  | 'opencode-go';

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
  'gemini-3-flash-preview': { input: 0.5, output: 3, cacheRead: 0.05, cacheWrite: 0.5 },
  'gemini-3-pro-preview': { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 2 },
  'gemini-2.5-flash': { input: 0.15, output: 0.6, cacheRead: 0.0375, cacheWrite: 0.15 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4, cacheRead: 0.025, cacheWrite: 0.1 },
};

/** Zero cost for free/local models */
export const FREE_COST: ModelCost = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

/** OpenRouter preset list; full catalog loaded via API in Settings. */
export const OPENROUTER_MODELS: ModelDefinition[] = OPENROUTER_CURATED_SPECS.map((s) => ({
  id: s.id,
  name: s.name,
  reasoning: s.reasoning,
  input: [...s.input] as ModelInputType[],
  contextWindow: s.contextWindow,
  maxTokens: s.maxTokens,
  recommended: s.recommended,
  description: s.description,
  api: 'openai-completions',
  cost: FREE_COST,
}));

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
  {
    id: 'text-embedding-3-large',
    name: 'Embedding 3 Large',
    dimensions: 3072,
    cost: { input: 0.13 },
  },
  {
    id: 'text-embedding-ada-002',
    name: 'Ada 002',
    dimensions: 1536,
    cost: { input: 0.1 },
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
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 1048576,
    maxTokens: 65536,
    recommended: true,
    description: 'Equilibrado: velocidad, escala e inteligencia de vanguardia',
    api: 'google-generative-ai',
    cost: GOOGLE_COSTS['gemini-3-flash-preview'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro Preview',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 1048576,
    maxTokens: 65536,
    description: 'Mejor modelo para comprensión multimodal y codificación',
    api: 'google-generative-ai',
    cost: GOOGLE_COSTS['gemini-3-pro-preview'],
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    reasoning: false,
    input: ['text', 'image'],
    contextWindow: 1048576,
    maxTokens: 65536,
    description: 'Modelo rápido y eficiente de la familia Gemini 2.5',
    api: 'google-generative-ai',
    cost: GOOGLE_COSTS['gemini-2.5-flash'],
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
    id: 'text-embedding-004',
    name: 'Text Embedding 004',
    dimensions: 768,
    recommended: true,
    cost: { input: 0.00001 },
  },
  {
    id: 'gemini-embedding-001',
    name: 'Gemini Embedding 001',
    dimensions: 3072,
    cost: { input: 0.00001 },
  },
];

export const OLLAMA_EMBEDDING_MODELS: EmbeddingModelDefinition[] = [
  {
    id: 'nomic-embed-text',
    name: 'Nomic Embed Text',
    dimensions: 768,
    recommended: true,
  },
  {
    id: 'mxbai-embed-large',
    name: 'mxbai-embed-large',
    dimensions: 1024,
  },
  {
    id: 'all-minilm',
    name: 'all-minilm',
    dimensions: 384,
  },
];

/** Providers exposed in Settings → AI → Embeddings (cloud APIs with embedding endpoints). */
export type EmbeddingsProviderType = 'openai' | 'google' | 'ollama';

export const EMBEDDINGS_PROVIDER_IDS: EmbeddingsProviderType[] = ['openai', 'google', 'ollama'];

export const DOME_MODELS: ModelDefinition[] = [
  {
    id: 'dome/auto',
    name: 'Dome Auto',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 200000,
    maxTokens: 32000,
    recommended: true,
    description: 'Selección automática de modelo según tu plan y cuota',
    api: 'openai-completions',
    cost: FREE_COST,
    compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
  },
];

// =============================================================================
// Provider Definitions
// =============================================================================

export const PROVIDERS: Record<AIProviderType, ProviderDefinition> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-5.2, GPT-5 y o3',
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
    description: 'Claude 4.6 y Claude 4.5',
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
    description: 'Gemini 3 Flash Preview, 3 Pro Preview y 2.5 Flash',
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
  dome: {
    id: 'dome',
    name: 'Dome',
    description: 'Provider administrado por suscripción',
    icon: 'dome',
    models: DOME_MODELS,
    supportsEmbeddings: false,
    supportsStreaming: true,
    supportsTools: true,
    apiKeyPlaceholder: 'Conecta tu cuenta de Dome',
    docsUrl: 'https://dome.so',
    baseUrl: 'https://provider.dome.so',
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local y privado',
    icon: 'ollama',
    models: [], // Loaded dynamically
    embeddingModels: OLLAMA_EMBEDDING_MODELS,
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
    models: [
      {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        reasoning: false,
        input: ['text'],
        contextWindow: 128000,
        maxTokens: 8192,
        recommended: true,
        description: 'DeepSeek V3 — chat general con tools',
        api: 'openai-completions',
        compat: { supportsTools: true, supportsStreaming: true },
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek Reasoner',
        reasoning: true,
        input: ['text'],
        contextWindow: 128000,
        maxTokens: 8192,
        description: 'DeepSeek R1 — razonamiento extendido',
        api: 'openai-completions',
        compat: { supportsTools: true, supportsStreaming: true },
      },
    ],
    supportsEmbeddings: false,
    supportsStreaming: true,
    supportsTools: true,
    apiKeyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com',
    baseUrl: 'https://api.deepseek.com/v1',
  },
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    description: 'MiniMax M-series via Anthropic-compatible API',
    icon: 'minimax',
    models: [
      {
        id: 'MiniMax-M3',
        name: 'MiniMax M3',
        reasoning: true,
        input: ['text', 'image', 'video'],
        contextWindow: 1000000,
        maxTokens: 16384,
        recommended: true,
        description: 'Agentic reasoning, tools, image & video understanding',
        api: 'anthropic-messages',
        compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
      },
      {
        id: 'MiniMax-M2.7',
        name: 'MiniMax M2.7',
        reasoning: true,
        input: ['text'],
        contextWindow: 204800,
        maxTokens: 8192,
        description: 'M2.7 — text and tools only',
        api: 'anthropic-messages',
        compat: { supportsTools: true, supportsStreaming: true },
      },
      {
        id: 'MiniMax-M2.7-highspeed',
        name: 'MiniMax M2.7 Highspeed',
        reasoning: true,
        input: ['text'],
        contextWindow: 204800,
        maxTokens: 8192,
        description: 'M2.7 highspeed variant',
        api: 'anthropic-messages',
        compat: { supportsTools: true, supportsStreaming: true },
      },
      {
        id: 'MiniMax-M2.5',
        name: 'MiniMax M2.5',
        reasoning: true,
        input: ['text'],
        contextWindow: 204800,
        maxTokens: 16384,
        description: 'M2.5 — text and tools only',
        api: 'anthropic-messages',
        compat: { supportsTools: true, supportsStreaming: true },
      },
      {
        id: 'MiniMax-M2.5-highspeed',
        name: 'MiniMax M2.5 Highspeed',
        reasoning: true,
        input: ['text'],
        contextWindow: 204800,
        maxTokens: 16384,
        description: 'M2.5 highspeed variant',
        api: 'anthropic-messages',
        compat: { supportsTools: true, supportsStreaming: true },
      },
    ],
    supportsEmbeddings: false,
    supportsStreaming: true,
    supportsTools: true,
    apiKeyPlaceholder: 'sk-cp-...',
    baseUrl: 'https://api.minimax.io',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'API unificada para cientos de modelos (OpenAI, Anthropic, Google…)',
    icon: 'openrouter',
    models: OPENROUTER_MODELS,
    supportsEmbeddings: false,
    supportsStreaming: true,
    supportsTools: true,
    apiKeyPlaceholder: 'sk-or-v1-…',
    docsUrl: 'https://openrouter.ai/settings/keys',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  moonshot: {
    id: 'moonshot',
    name: 'Moonshot',
    description: 'Kimi K2',
    icon: 'moonshot',
    models: [
      {
        id: 'kimi-k2-0905-preview',
        name: 'Kimi K2 (0905)',
        reasoning: false,
        input: ['text'],
        contextWindow: 256000,
        maxTokens: 16384,
        recommended: true,
        description: 'Kimi K2 — agentic, tools',
        api: 'openai-completions',
        compat: { supportsTools: true, supportsStreaming: true },
      },
      {
        id: 'moonshot-v1-128k',
        name: 'Moonshot v1 128k',
        reasoning: false,
        input: ['text'],
        contextWindow: 128000,
        maxTokens: 8192,
        description: 'Contexto largo',
        api: 'openai-completions',
        compat: { supportsTools: true, supportsStreaming: true },
      },
      {
        id: 'moonshot-v1-32k',
        name: 'Moonshot v1 32k',
        reasoning: false,
        input: ['text'],
        contextWindow: 32000,
        maxTokens: 8192,
        api: 'openai-completions',
        compat: { supportsTools: true, supportsStreaming: true },
      },
      {
        id: 'moonshot-v1-8k',
        name: 'Moonshot v1 8k',
        reasoning: false,
        input: ['text'],
        contextWindow: 8000,
        maxTokens: 4096,
        api: 'openai-completions',
        compat: { supportsTools: true, supportsStreaming: true },
      },
    ],
    supportsEmbeddings: false,
    supportsStreaming: true,
    supportsTools: true,
    apiKeyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.moonshot.cn',
    baseUrl: 'https://api.moonshot.cn/v1',
  },
  qwen: {
    id: 'qwen',
    name: 'Qwen',
    description: 'Qwen 3 y Coder',
    icon: 'qwen',
    models: [
      {
        id: 'qwen-max',
        name: 'Qwen Max',
        reasoning: false,
        input: ['text'],
        contextWindow: 32000,
        maxTokens: 8192,
        recommended: true,
        description: 'Modelo insignia de Qwen',
        api: 'openai-completions',
        compat: { supportsTools: true, supportsStreaming: true },
      },
      {
        id: 'qwen-plus',
        name: 'Qwen Plus',
        reasoning: false,
        input: ['text'],
        contextWindow: 131072,
        maxTokens: 8192,
        description: 'Equilibrio coste/rendimiento',
        api: 'openai-completions',
        compat: { supportsTools: true, supportsStreaming: true },
      },
      {
        id: 'qwen-turbo',
        name: 'Qwen Turbo',
        reasoning: false,
        input: ['text'],
        contextWindow: 1000000,
        maxTokens: 8192,
        description: 'Rápido y económico',
        api: 'openai-completions',
        compat: { supportsTools: true, supportsStreaming: true },
      },
      {
        id: 'qwen3-coder-plus',
        name: 'Qwen3 Coder Plus',
        reasoning: false,
        input: ['text'],
        contextWindow: 1000000,
        maxTokens: 65536,
        description: 'Especializado en código',
        api: 'openai-completions',
        compat: { supportsTools: true, supportsStreaming: true },
      },
    ],
    supportsEmbeddings: false,
    supportsStreaming: true,
    supportsTools: true,
    apiKeyPlaceholder: 'sk-...',
    docsUrl: 'https://bailian.console.aliyun.com',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  opencode: {
    id: 'opencode',
    name: 'OpenCode Zen',
    description: 'Proxy multi-modelo vía opencode.ai/zen',
    icon: 'opencode',
    models: [
      {
        id: 'claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5',
        reasoning: true,
        input: ['text', 'image'],
        contextWindow: 200000,
        maxTokens: 64000,
        recommended: true,
        description: 'Claude Sonnet vía OpenCode Zen',
        api: 'anthropic-messages',
        compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
      },
      {
        id: 'claude-haiku-4-5',
        name: 'Claude Haiku 4.5',
        reasoning: true,
        input: ['text', 'image'],
        contextWindow: 200000,
        maxTokens: 64000,
        description: 'Claude Haiku vía OpenCode Zen',
        api: 'anthropic-messages',
        compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
      },
      {
        id: 'gpt-5.2',
        name: 'GPT-5.2',
        reasoning: true,
        input: ['text', 'image'],
        contextWindow: 400000,
        maxTokens: 128000,
        description: 'GPT-5.2 vía OpenCode Zen',
        api: 'openai-responses',
        compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
      },
      {
        id: 'gemini-3-flash',
        name: 'Gemini 3 Flash',
        reasoning: true,
        input: ['text', 'image'],
        contextWindow: 1048576,
        maxTokens: 65536,
        description: 'Gemini 3 Flash vía OpenCode Zen',
        api: 'google-generative-ai',
        compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
      },
      {
        id: 'big-pickle',
        name: 'Big Pickle',
        reasoning: true,
        input: ['text'],
        contextWindow: 200000,
        maxTokens: 32000,
        description: 'Modelo gratuito OpenCode',
        api: 'openai-completions',
        compat: { supportsTools: true, supportsStreaming: true },
      },
    ],
    supportsEmbeddings: false,
    supportsStreaming: true,
    supportsTools: true,
    apiKeyPlaceholder: 'OPENCODE_API_KEY',
    docsUrl: 'https://opencode.ai',
    baseUrl: 'https://opencode.ai/zen/v1',
  },
  'opencode-go': {
    id: 'opencode-go',
    name: 'OpenCode Go',
    description: 'Modelos Go/asia vía opencode.ai/zen/go',
    icon: 'opencode',
    models: [
      {
        id: 'deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        reasoning: true,
        input: ['text'],
        contextWindow: 1000000,
        maxTokens: 384000,
        recommended: true,
        description: 'DeepSeek V4 Flash — rápido y económico',
        api: 'openai-completions',
        compat: { supportsTools: true, supportsStreaming: true },
      },
      {
        id: 'deepseek-v4-pro',
        name: 'DeepSeek V4 Pro',
        reasoning: true,
        input: ['text'],
        contextWindow: 1000000,
        maxTokens: 384000,
        description: 'DeepSeek V4 Pro — máxima calidad',
        api: 'openai-completions',
        compat: { supportsTools: true, supportsStreaming: true },
      },
      {
        id: 'kimi-k2.6',
        name: 'Kimi K2.6',
        reasoning: true,
        input: ['text', 'image'],
        contextWindow: 262144,
        maxTokens: 65536,
        description: 'Kimi K2.6 con visión',
        api: 'openai-completions',
        compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
      },
      {
        id: 'minimax-m3',
        name: 'MiniMax M3',
        reasoning: true,
        input: ['text', 'image'],
        contextWindow: 512000,
        maxTokens: 131072,
        description: 'MiniMax M3 vía OpenCode Go',
        api: 'anthropic-messages',
        compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
      },
      {
        id: 'qwen3.7-plus',
        name: 'Qwen3.7 Plus',
        reasoning: true,
        input: ['text', 'image'],
        contextWindow: 262144,
        maxTokens: 65536,
        description: 'Qwen3.7 Plus con visión',
        api: 'anthropic-messages',
        compat: { supportsTools: true, supportsVision: true, supportsStreaming: true },
      },
      {
        id: 'glm-5.2',
        name: 'GLM-5.2',
        reasoning: true,
        input: ['text'],
        contextWindow: 202752,
        maxTokens: 32768,
        description: 'GLM-5.2 vía OpenCode Go',
        api: 'openai-completions',
        compat: { supportsTools: true, supportsStreaming: true },
      },
    ],
    supportsEmbeddings: false,
    supportsStreaming: true,
    supportsTools: true,
    apiKeyPlaceholder: 'OPENCODE_API_KEY',
    docsUrl: 'https://opencode.ai/docs/es/go/',
    baseUrl: 'https://opencode.ai/zen/go/v1',
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
    case 'google': return 'gemini-3-flash-preview';
    case 'dome': return 'dome/auto';
    case 'ollama': return 'llama3.2';
    case 'copilot': return 'gpt-4o';
    case 'deepseek': return 'deepseek-chat';
    case 'minimax': return 'MiniMax-M3';
    case 'openrouter': return 'anthropic/claude-sonnet-4.5';
    case 'moonshot': return 'moonshot-v1-8k';
    case 'qwen': return 'qwen-max';
    case 'opencode': return 'claude-sonnet-4-5';
    case 'opencode-go': return 'deepseek-v4-flash';
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
 * Check if a model supports native video input
 */
export function modelSupportsVideo(model: ModelDefinition): boolean {
  return model.input.includes('video');
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
    case 'openrouter':
    case 'moonshot':
    case 'qwen':
    case 'opencode':
    case 'opencode-go':
      return 'openai-completions';
    case 'anthropic':
      return 'anthropic-messages';
    case 'dome':
      return 'openai-completions';
    case 'google':
      return 'google-generative-ai';
    case 'ollama':
      return 'ollama';
    default:
      return 'openai-completions';
  }
}
