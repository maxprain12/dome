/**
 * AI Client - Unified AI interface for Dome
 * 
 * Provides a unified interface for chat, streaming, embeddings, and tools
 * across multiple providers (OpenAI, Anthropic, Google, Ollama, Synthetic, etc.)
 * 
 * Migrated and enhanced from clawdbot's AI system.
 */

// Import types to ensure global window.electron types are available
import type {} from '@/types/global';

import { db } from '../db/client';
import { getDefaultModelId } from './models';
import type { AIProviderType } from './models';
import type {
  ChatStreamChunk,
  ToolDefinition,
} from './types';
import { toOpenAIToolDefinitions, type AnyAgentTool } from './tools';
import { chunk as llmChunk } from 'llm-chunk';
import { isOllamaCloudMissingApiKey } from './providerAuth';

// =============================================================================
// Configuration Types
// =============================================================================

export type AIProvider = AIProviderType | 'local';

export interface AIConfig {
  provider: AIProvider;
  apiKey?: string;
  model?: string;
  embeddingModel?: string;
  baseURL?: string;
  ollamaBaseURL?: string;
  ollamaModel?: string;
  ollamaEmbeddingModel?: string;
  ollamaApiKey?: string;
}

/** User-added model ids per provider (Settings key `ai_custom_models`). */
export type CustomModelsByProvider = Partial<Record<AIProviderType, string[]>>;

export async function getCustomModelsByProvider(): Promise<CustomModelsByProvider> {
  try {
    const r = await db.getSetting('ai_custom_models');
    if (!r.data?.trim()) return {};
    const parsed = JSON.parse(r.data) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as CustomModelsByProvider;
    }
    return {};
  } catch {
    return {};
  }
}

export async function saveCustomModelsByProvider(map: CustomModelsByProvider): Promise<void> {
  await db.setSetting('ai_custom_models', JSON.stringify(map));
}

export async function appendCustomModelId(provider: AIProviderType, modelId: string): Promise<void> {
  const id = modelId.trim();
  if (!id) return;
  const map = await getCustomModelsByProvider();
  const list = map[provider] ?? [];
  if (list.includes(id)) return;
  map[provider] = [...list, id];
  await saveCustomModelsByProvider(map);
}

/** Updates only the active chat model for the current provider (does not change provider). */
export async function saveChatModelForProvider(provider: AIProvider, modelId: string): Promise<void> {
  const p: AIProviderType = provider === 'local' ? 'ollama' : (provider as AIProviderType);
  if (p === 'ollama') {
    await db.setSetting('ollama_model', modelId);
  } else {
    await db.setSetting('ai_model', modelId);
  }
}

// =============================================================================
// Configuration Management
// =============================================================================

export async function getAIConfig(): Promise<AIConfig | null> {
  try {
    const providerResult = await db.getSetting('ai_provider');
    const activeProvider = providerResult.data as string | null;
    // Per-provider credential slots; legacy shared keys as fallback
    const apiKeyResult = activeProvider
      ? await db.getSetting(`ai_api_key_${activeProvider}`)
      : { data: null };
    const legacyApiKeyResult = apiKeyResult.data ? { data: null } : await db.getSetting('ai_api_key');
    const modelResult = await db.getSetting('ai_model');
    const embeddingModelResult = await db.getSetting('ai_embedding_model');
    const baseURLResult = activeProvider
      ? await db.getSetting(`ai_base_url_${activeProvider}`)
      : { data: null };
    const legacyBaseURLResult = baseURLResult.data ? { data: null } : await db.getSetting('ai_base_url');
    const ollamaBaseURLResult = await db.getSetting('ollama_base_url');
    const ollamaModelResult = await db.getSetting('ollama_model');
    const ollamaApiKeyResult = await db.getSetting('ollama_api_key');
    const ollamaEmbeddingModelResult = await db.getSetting('ollama_embedding_model');

    if (!providerResult.data) return null;

    return {
      provider: providerResult.data as AIProvider,
      apiKey: apiKeyResult.data || legacyApiKeyResult.data || undefined,
      model: modelResult.data || undefined,
      embeddingModel: embeddingModelResult.data || undefined,
      baseURL: baseURLResult.data || legacyBaseURLResult.data || undefined,
      ollamaBaseURL: ollamaBaseURLResult.data || undefined,
      ollamaModel: ollamaModelResult.data || undefined,
      ollamaApiKey: ollamaApiKeyResult.data || undefined,
      ollamaEmbeddingModel: ollamaEmbeddingModelResult.data || undefined,
    };
  } catch (error) {
    console.error('Error getting AI config:', error);
    return null;
  }
}

export async function saveAIConfig(config: AIConfig): Promise<void> {
  await db.setSetting('ai_provider', config.provider);

  if (config.apiKey) {
    // Slot por proveedor (cambiar de provider conserva cada clave) + legacy
    await db.setSetting(`ai_api_key_${config.provider}`, config.apiKey);
    await db.setSetting('ai_api_key', config.apiKey);
  }
  if (config.model) {
    await db.setSetting('ai_model', config.model);
  }
  if (config.embeddingModel) {
    await db.setSetting('ai_embedding_model', config.embeddingModel);
  }
  if (config.baseURL) {
    await db.setSetting(`ai_base_url_${config.provider}`, config.baseURL);
    await db.setSetting('ai_base_url', config.baseURL);
  }
  if (config.ollamaBaseURL) {
    await db.setSetting('ollama_base_url', config.ollamaBaseURL);
  }
  if (config.ollamaModel) {
    await db.setSetting('ollama_model', config.ollamaModel);
  }
  if (config.ollamaEmbeddingModel) {
    await db.setSetting('ollama_embedding_model', config.ollamaEmbeddingModel);
  }

  console.info('AI config saved');
}

// =============================================================================
// Provider-Specific Implementations (via IPC to main process)
// =============================================================================

// Check if we're in Electron renderer
function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electron !== undefined;
}

// Generate unique stream ID
function generateStreamId(): string {
  return `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

const API_KEY_CHAT_PROVIDERS: AIProviderType[] = [
  'openai',
  'anthropic',
  'google',
  'minimax',
  'openrouter',
  'deepseek',
  'moonshot',
  'qwen',
  'opencode',
  'opencode-go',
];

const OAUTH_CHAT_PROVIDERS: AIProviderType[] = ['dome', 'copilot'];

/** Providers routed through ai:chat / ai:stream IPC (not ollama). */
type IpcCloudChatProvider = Exclude<AIProviderType, 'ollama'>;

export type ChatProviderReadyResult =
  | { ready: true }
  | { ready: false; messageKey: string };

/** Pre-flight check before starting a chat/agent run. */
export async function checkChatProviderReady(config: AIConfig): Promise<ChatProviderReadyResult> {
  const provider = config.provider === 'local' ? 'ollama' : config.provider;

  if (OAUTH_CHAT_PROVIDERS.includes(provider as AIProviderType)) {
    if (provider === 'dome') {
      const session = await window.electron?.domeAuth?.getSession?.();
      if (!session?.success || !session?.connected) {
        return { ready: false, messageKey: 'chat.no_ai_config' };
      }
      return { ready: true };
    }
    if (provider === 'copilot') {
      const status = await window.electron?.copilotAuth?.status?.();
      if (!status?.connected) {
        return { ready: false, messageKey: 'chat.no_ai_config' };
      }
      return { ready: true };
    }
  }

  if (API_KEY_CHAT_PROVIDERS.includes(provider as AIProviderType) && !config.apiKey) {
    return { ready: false, messageKey: 'chat.no_api_key' };
  }

  if (provider === 'ollama' && isOllamaCloudMissingApiKey(config.ollamaBaseURL, config.ollamaApiKey)) {
    return { ready: false, messageKey: 'chat.no_api_key' };
  }

  return { ready: true };
}

async function chatViaMainProcess(
  provider: IpcCloudChatProvider,
  messages: Array<{ role: string; content: string }>,
  model: string,
): Promise<string> {
  if (!isElectron()) {
    throw new Error('AI chat requires Electron environment');
  }
  const result = await window.electron.ai.chat(provider, messages, model);
  if (!result.success || !result.content) {
    throw new Error(result.error || `${provider} chat failed`);
  }
  return result.content;
}

async function* streamViaMainProcess(
  provider: IpcCloudChatProvider,
  messages: Array<{ role: string; content: string }>,
  model: string,
  tools?: ToolDefinition[],
  _signal?: AbortSignal,
): AsyncIterable<ChatStreamChunk> {
  if (!isElectron()) {
    throw new Error('AI streaming requires Electron environment');
  }

  const streamId = generateStreamId();
  const chunks: ChatStreamChunk[] = [];
  let done = false;
  let error: Error | null = null;
  let resolveWait: (() => void) | null = null;

  const unsubscribe = window.electron.ai.onStreamChunk((data: {
    streamId: string;
    type?: string;
    text?: string;
    error?: string;
    toolCall?: { id: string; name: string; arguments: string };
  }) => {
    if (data.streamId !== streamId) return;

    if (data.type === 'text' && data.text) {
      chunks.push({ type: 'text', text: data.text });
    } else if (data.type === 'tool_call' && data.toolCall) {
      chunks.push({
        type: 'tool_call',
        toolCall: {
          id: data.toolCall.id,
          name: data.toolCall.name,
          arguments: data.toolCall.arguments,
        },
      });
    } else if (data.type === 'done') {
      chunks.push({ type: 'done' });
      done = true;
    } else if (data.type === 'error') {
      error = new Error(data.error || 'Stream error');
      done = true;
    }

    if (resolveWait) resolveWait();
  });

  void window.electron.ai.stream(provider, messages, model, streamId, tools);

  try {
    while (!done || chunks.length > 0) {
      if (chunks.length > 0) {
        yield chunks.shift()!;
      } else if (!done) {
        await new Promise<void>((resolve) => { resolveWait = resolve; });
        resolveWait = null;
      }
    }
    if (error) throw error;
  } finally {
    unsubscribe();
  }
}

// OpenAI
export async function chatWithOpenAI(
  messages: Array<{ role: string; content: string }>,
  _apiKey: string, // API key is now fetched from main process
  model: string = 'gpt-5.2',
  _tools?: ToolDefinition[],
): Promise<string> {
  if (!isElectron()) {
    throw new Error('AI chat requires Electron environment');
  }

  const result = await window.electron.ai.chat('openai', messages, model);
  if (!result.success || !result.content) {
    throw new Error(result.error || 'OpenAI chat failed');
  }
  return result.content;
}

export async function* streamOpenAI(
  messages: Array<{ role: string; content: string }>,
  _apiKey: string,
  model: string = 'gpt-5.2',
  tools?: ToolDefinition[],
  _signal?: AbortSignal,
): AsyncIterable<ChatStreamChunk> {
  if (!isElectron()) {
    throw new Error('AI streaming requires Electron environment');
  }

  const streamId = generateStreamId();

  // Create a queue for incoming chunks
  const chunks: ChatStreamChunk[] = [];
  let done = false;
  let error: Error | null = null;
  let resolveWait: (() => void) | null = null;

  // Subscribe to stream chunks
  const unsubscribe = window.electron.ai.onStreamChunk((data: { streamId: string; type?: string; text?: string; error?: string; toolCall?: { id: string; name: string; arguments: string } }) => {
    if (data.streamId !== streamId) return;

    if (data.type === 'text' && data.text) {
      chunks.push({ type: 'text', text: data.text });
    } else if (data.type === 'tool_call' && data.toolCall) {
      chunks.push({
        type: 'tool_call',
        toolCall: {
          id: data.toolCall.id,
          name: data.toolCall.name,
          arguments: data.toolCall.arguments,
        },
      });
    } else if (data.type === 'done') {
      chunks.push({ type: 'done' });
      done = true;
    } else if (data.type === 'error') {
      error = new Error(data.error || 'Stream error');
      done = true;
    }

    if (resolveWait) resolveWait();
  });

  // Start the stream (pass tools for provider-level handling)
  window.electron.ai.stream('openai', messages, model, streamId, tools);

  try {
    while (!done || chunks.length > 0) {
      if (chunks.length > 0) {
        yield chunks.shift()!;
      } else if (!done) {
        // Wait for next chunk
        await new Promise<void>(resolve => { resolveWait = resolve; });
        resolveWait = null;
      }
    }

    if (error) throw error;
  } finally {
    unsubscribe();
  }
}

// Anthropic
export async function chatWithClaude(
  messages: Array<{ role: string; content: string }>,
  _apiKey: string,
  model: string = 'claude-sonnet-4-5',
  _tools?: ToolDefinition[],
): Promise<string> {
  if (!isElectron()) {
    throw new Error('AI chat requires Electron environment');
  }

  const result = await window.electron.ai.chat('anthropic', messages, model);
  if (!result.success || !result.content) {
    throw new Error(result.error || 'Anthropic chat failed');
  }
  return result.content;
}

export async function* streamClaude(
  messages: Array<{ role: string; content: string }>,
  _apiKey: string,
  model: string = 'claude-sonnet-4-5',
  tools?: ToolDefinition[],
  _signal?: AbortSignal,
): AsyncIterable<ChatStreamChunk> {
  if (!isElectron()) {
    throw new Error('AI streaming requires Electron environment');
  }

  const streamId = generateStreamId();

  const chunks: ChatStreamChunk[] = [];
  let done = false;
  let error: Error | null = null;
  let resolveWait: (() => void) | null = null;

  const unsubscribe = window.electron.ai.onStreamChunk((data: { streamId: string; type?: string; text?: string; error?: string; toolCall?: { id: string; name: string; arguments: string } }) => {
    if (data.streamId !== streamId) return;

    if (data.type === 'text' && data.text) {
      chunks.push({ type: 'text', text: data.text });
    } else if (data.type === 'tool_call' && data.toolCall) {
      chunks.push({
        type: 'tool_call',
        toolCall: {
          id: data.toolCall.id,
          name: data.toolCall.name,
          arguments: data.toolCall.arguments,
        },
      });
    } else if (data.type === 'done') {
      chunks.push({ type: 'done' });
      done = true;
    } else if (data.type === 'error') {
      error = new Error(data.error || 'Stream error');
      done = true;
    }

    if (resolveWait) resolveWait();
  });

  // Pass tools to main process for Anthropic API integration
  window.electron.ai.stream('anthropic', messages, model, streamId, tools);

  try {
    while (!done || chunks.length > 0) {
      if (chunks.length > 0) {
        yield chunks.shift()!;
      } else if (!done) {
        await new Promise<void>(resolve => { resolveWait = resolve; });
        resolveWait = null;
      }
    }

    if (error) throw error;
  } finally {
    unsubscribe();
  }
}

// Google Gemini
export async function chatWithGemini(
  messages: Array<{ role: string; content: string }>,
  _apiKey: string,
  model: string = 'gemini-3-flash',
): Promise<string> {
  if (!isElectron()) {
    throw new Error('AI chat requires Electron environment');
  }

  const result = await window.electron.ai.chat('google', messages, model);
  if (!result.success || !result.content) {
    throw new Error(result.error || 'Google Gemini chat failed');
  }
  return result.content;
}

export async function chatWithMiniMax(
  messages: Array<{ role: string; content: string }>,
  _apiKey: string,
  model: string = 'MiniMax-M3',
  _tools?: ToolDefinition[],
): Promise<string> {
  if (!isElectron()) {
    throw new Error('AI chat requires Electron environment');
  }

  const result = await window.electron.ai.chat('minimax', messages, model);
  if (!result.success || !result.content) {
    throw new Error(result.error || 'MiniMax chat failed');
  }
  return result.content;
}

export async function* streamMiniMax(
  messages: Array<{ role: string; content: string }>,
  _apiKey: string,
  model: string = 'MiniMax-M3',
  tools?: ToolDefinition[],
  _signal?: AbortSignal,
): AsyncIterable<ChatStreamChunk> {
  if (!isElectron()) {
    throw new Error('AI streaming requires Electron environment');
  }

  const streamId = generateStreamId();
  const chunks: ChatStreamChunk[] = [];
  let done = false;
  let error: Error | null = null;
  let resolveWait: (() => void) | null = null;

  const unsubscribe = window.electron.ai.onStreamChunk((data: { streamId: string; type?: string; text?: string; error?: string; toolCall?: { id: string; name: string; arguments: string } }) => {
    if (data.streamId !== streamId) return;

    if (data.type === 'text' && data.text) {
      chunks.push({ type: 'text', text: data.text });
    } else if (data.type === 'tool_call' && data.toolCall) {
      chunks.push({
        type: 'tool_call',
        toolCall: {
          id: data.toolCall.id,
          name: data.toolCall.name,
          arguments: data.toolCall.arguments,
        },
      });
    } else if (data.type === 'done') {
      chunks.push({ type: 'done' });
      done = true;
    } else if (data.type === 'error') {
      error = new Error(data.error || 'Stream error');
      done = true;
    }

    if (resolveWait) resolveWait();
  });

  window.electron.ai.stream('minimax', messages, model, streamId, tools);

  try {
    while (!done || chunks.length > 0) {
      if (chunks.length > 0) {
        yield chunks.shift()!;
      } else if (!done) {
        await new Promise<void>(resolve => { resolveWait = resolve; });
        resolveWait = null;
      }
    }

    if (error) throw error;
  } finally {
    unsubscribe();
  }
}

export async function chatWithOpenRouter(
  messages: Array<{ role: string; content: string }>,
  _apiKey: string,
  model: string = 'anthropic/claude-sonnet-4.5',
  _tools?: ToolDefinition[],
): Promise<string> {
  if (!isElectron()) {
    throw new Error('AI chat requires Electron environment');
  }

  const result = await window.electron.ai.chat('openrouter', messages, model);
  if (!result.success || !result.content) {
    throw new Error(result.error || 'OpenRouter chat failed');
  }
  return result.content;
}

export async function* streamOpenRouter(
  messages: Array<{ role: string; content: string }>,
  _apiKey: string,
  model: string = 'anthropic/claude-sonnet-4.5',
  tools?: ToolDefinition[],
  _signal?: AbortSignal,
): AsyncIterable<ChatStreamChunk> {
  if (!isElectron()) {
    throw new Error('AI streaming requires Electron environment');
  }

  const streamId = generateStreamId();
  const chunks: ChatStreamChunk[] = [];
  let done = false;
  let error: Error | null = null;
  let resolveWait: (() => void) | null = null;

  const unsubscribe = window.electron.ai.onStreamChunk((data: { streamId: string; type?: string; text?: string; error?: string; toolCall?: { id: string; name: string; arguments: string } }) => {
    if (data.streamId !== streamId) return;

    if (data.type === 'text' && data.text) {
      chunks.push({ type: 'text', text: data.text });
    } else if (data.type === 'tool_call' && data.toolCall) {
      chunks.push({
        type: 'tool_call',
        toolCall: {
          id: data.toolCall.id,
          name: data.toolCall.name,
          arguments: data.toolCall.arguments,
        },
      });
    } else if (data.type === 'done') {
      chunks.push({ type: 'done' });
      done = true;
    } else if (data.type === 'error') {
      error = new Error(data.error || 'Stream error');
      done = true;
    }

    if (resolveWait) resolveWait();
  });

  window.electron.ai.stream('openrouter', messages, model, streamId, tools);

  try {
    while (!done || chunks.length > 0) {
      if (chunks.length > 0) {
        yield chunks.shift()!;
      } else if (!done) {
        await new Promise<void>((resolve) => { resolveWait = resolve; });
        resolveWait = null;
      }
    }

    if (error) throw error;
  } finally {
    unsubscribe();
  }
}

export type ProviderModelRow = {
  id: string;
  name: string;
  contextWindow: number;
  reasoning: boolean;
  input: Array<'text' | 'image' | 'video'>;
  maxTokens: number;
  recommended?: boolean;
  description?: string;
  api: string;
};

export type ProviderModelsListResult = {
  success: boolean;
  models?: ProviderModelRow[];
  error?: string;
};

/** True when the value is a display-only mask from db:settings:get (not a real API key). */
export function isMaskedSecretValue(value: string | undefined | null): boolean {
  if (!value) return false;
  const s = value.trim();
  if (s === '••••••••') return true;
  return /^.{1,3}\u2026.{4}$/.test(s) || /^.{1,3}\.{3}.{4}$/.test(s);
}

function apiKeyForProviderFetch(apiKey?: string): string | undefined {
  const trimmed = apiKey?.trim();
  if (!trimmed || isMaskedSecretValue(trimmed)) return undefined;
  return trimmed;
}

export async function fetchOpenRouterModels(
  apiKey?: string,
): Promise<ProviderModelsListResult> {
  if (!isElectron()) {
    return { success: false, error: 'OpenRouter listing requires Electron.' };
  }
  return window.electron.ai.listOpenRouterModels(apiKeyForProviderFetch(apiKey));
}

export async function fetchProviderModels(
  provider: AIProviderType,
  apiKey?: string,
): Promise<ProviderModelsListResult> {
  if (!isElectron()) {
    return { success: false, error: 'Provider model listing requires Electron.' };
  }
  const key = apiKeyForProviderFetch(apiKey);
  if (provider === 'openrouter') {
    return fetchOpenRouterModels(key);
  }
  return window.electron.ai.listProviderModels({ provider, apiKey: key });
}

export async function chatWithDome(
  messages: Array<{ role: string; content: string }>,
  model: string = 'dome/auto',
): Promise<string> {
  if (!isElectron()) {
    throw new Error('AI chat requires Electron environment');
  }

  const result = await window.electron.ai.chat('dome', messages, model);
  if (!result.success || !result.content) {
    throw new Error(result.error || 'Dome provider chat failed');
  }
  return result.content;
}

export async function* streamDome(
  messages: Array<{ role: string; content: string }>,
  model: string = 'dome/auto',
  tools?: ToolDefinition[],
): AsyncIterable<ChatStreamChunk> {
  if (!isElectron()) {
    throw new Error('AI streaming requires Electron environment');
  }

  const streamId = generateStreamId();
  const chunks: ChatStreamChunk[] = [];
  let done = false;
  let error: Error | null = null;
  let resolveWait: (() => void) | null = null;

  const unsubscribe = window.electron.ai.onStreamChunk((data: { streamId: string; type?: string; text?: string; error?: string; toolCall?: { id: string; name: string; arguments: string } }) => {
    if (data.streamId !== streamId) return;

    if (data.type === 'text' && data.text) {
      chunks.push({ type: 'text', text: data.text });
    } else if (data.type === 'tool_call' && data.toolCall) {
      chunks.push({
        type: 'tool_call',
        toolCall: {
          id: data.toolCall.id,
          name: data.toolCall.name,
          arguments: data.toolCall.arguments,
        },
      });
    } else if (data.type === 'done') {
      chunks.push({ type: 'done' });
      done = true;
    } else if (data.type === 'error') {
      error = new Error(data.error || 'Stream error');
      done = true;
    }

    if (resolveWait) resolveWait();
  });

  window.electron.ai.stream('dome', messages, model, streamId, tools);

  try {
    while (!done || chunks.length > 0) {
      if (chunks.length > 0) {
        yield chunks.shift()!;
      } else if (!done) {
        await new Promise<void>((resolve) => { resolveWait = resolve; });
        resolveWait = null;
      }
    }
    if (error) throw error;
  } finally {
    unsubscribe();
  }
}

export async function* streamGemini(
  messages: Array<{ role: string; content: string }>,
  _apiKey: string,
  model: string = 'gemini-3-flash',
  tools?: ToolDefinition[],
  _signal?: AbortSignal,
): AsyncIterable<ChatStreamChunk> {
  if (!isElectron()) {
    throw new Error('AI streaming requires Electron environment');
  }

  const streamId = generateStreamId();

  const chunks: ChatStreamChunk[] = [];
  let done = false;
  let error: Error | null = null;
  let resolveWait: (() => void) | null = null;

  const unsubscribe = window.electron.ai.onStreamChunk((data: { streamId: string; type?: string; text?: string; error?: string; toolCall?: { id: string; name: string; arguments: string } }) => {
    if (data.streamId !== streamId) return;

    if (data.type === 'text' && data.text) {
      chunks.push({ type: 'text', text: data.text });
    } else if (data.type === 'tool_call' && data.toolCall) {
      chunks.push({
        type: 'tool_call',
        toolCall: {
          id: data.toolCall.id,
          name: data.toolCall.name,
          arguments: data.toolCall.arguments,
        },
      });
    } else if (data.type === 'done') {
      chunks.push({ type: 'done' });
      done = true;
    } else if (data.type === 'error') {
      error = new Error(data.error || 'Stream error');
      done = true;
    }

    if (resolveWait) resolveWait();
  });

  // Pass tools for Gemini Function Calling (converted in main process)
  window.electron.ai.stream('google', messages, model, streamId, tools);

  try {
    while (!done || chunks.length > 0) {
      if (chunks.length > 0) {
        yield chunks.shift()!;
      } else if (!done) {
        await new Promise<void>(resolve => { resolveWait = resolve; });
        resolveWait = null;
      }
    }

    if (error) throw error;
  } finally {
    unsubscribe();
  }
}

// Ollama (local streaming)
export async function* streamOllama(
  messages: Array<{ role: string; content: string }>,
  model: string,
  _signal?: AbortSignal,
  tools?: ToolDefinition[],
): AsyncIterable<ChatStreamChunk> {
  if (!isElectron()) {
    throw new Error('AI streaming requires Electron environment');
  }

  const streamId = generateStreamId();

  const chunks: ChatStreamChunk[] = [];
  let done = false;
  let error: Error | null = null;
  let resolveWait: (() => void) | null = null;

  const unsubscribe = window.electron.ai.onStreamChunk((data: { streamId: string; type?: string; text?: string; error?: string; toolCall?: { id: string; name: string; arguments: string } }) => {
    if (data.streamId !== streamId) return;

    if (data.type === 'thinking' && data.text) {
      chunks.push({ type: 'thinking', text: data.text });
    } else if (data.type === 'text' && data.text) {
      chunks.push({ type: 'text', text: data.text });
    } else if (data.type === 'tool_call' && data.toolCall) {
      chunks.push({
        type: 'tool_call',
        toolCall: {
          id: data.toolCall.id,
          name: data.toolCall.name,
          arguments: data.toolCall.arguments,
        },
      });
    } else if (data.type === 'done') {
      chunks.push({ type: 'done' });
      done = true;
    } else if (data.type === 'error') {
      error = new Error(data.error || 'Stream error');
      done = true;
    }

    if (resolveWait) resolveWait();
  });

  void window.electron.ai.stream('ollama', messages, model, streamId, tools);

  try {
    while (!done || chunks.length > 0) {
      if (chunks.length > 0) {
        yield chunks.shift()!;
      } else if (!done) {
        await new Promise<void>(resolve => { resolveWait = resolve; });
        resolveWait = null;
      }
    }

    if (error) throw error;
  } finally {
    unsubscribe();
  }
}


export async function chat(
  messages: Array<{ role: string; content: string }>,
  tools?: ToolDefinition[],
): Promise<string> {
  const config = await getAIConfig();
  if (!config) {
    throw new Error('AI not configured. Please set up your API key first.');
  }

  switch (config.provider) {
    case 'openai':
      if (!config.apiKey) throw new Error('OpenAI API key not configured');
      return chatWithOpenAI(
        messages,
        config.apiKey,
        config.model || getDefaultModelId('openai'),
        tools,
      );

    case 'anthropic':
      if (!config.apiKey) throw new Error('Anthropic API key not configured');
      return chatWithClaude(
        messages,
        config.apiKey,
        config.model || getDefaultModelId('anthropic'),
        tools,
      );

    case 'google':
      if (!config.apiKey) throw new Error('Google API key not configured');
      return chatWithGemini(
        messages,
        config.apiKey,
        config.model || getDefaultModelId('google'),
      );

    case 'minimax':
      if (!config.apiKey) throw new Error('MiniMax API key not configured');
      return chatWithMiniMax(
        messages,
        config.apiKey,
        config.model || getDefaultModelId('minimax'),
        tools,
      );

    case 'openrouter':
      if (!config.apiKey) throw new Error('OpenRouter API key not configured');
      return chatWithOpenRouter(
        messages,
        config.apiKey,
        config.model || getDefaultModelId('openrouter'),
        tools,
      );

    case 'dome':
      return chatWithDome(messages, config.model || getDefaultModelId('dome'));

    case 'copilot':
      return chatViaMainProcess(
        'copilot',
        messages,
        config.model || getDefaultModelId('copilot'),
      );

    case 'deepseek':
    case 'moonshot':
    case 'qwen':
    case 'opencode':
    case 'opencode-go':
      if (!config.apiKey) throw new Error(`API key not configured for ${config.provider}`);
      return chatViaMainProcess(
        config.provider,
        messages,
        config.model || getDefaultModelId(config.provider),
      );

    case 'ollama':
      throw new Error('Ollama chat must be handled from the main process via IPC');

    default:
      throw new Error(`Provider ${config.provider} not supported`);
  }
}

/**
 * Plain streaming completion without tools. For tool-calling, use chatWithToolsStream (the agent runtime).
 * The optional `tools` positional arg is kept as `undefined`-only for backward call-site
 * compatibility; it is no longer forwarded to providers.
 */
export async function* chatStream(
  messages: Array<{ role: string; content: string }>,
  _tools?: ToolDefinition[] | undefined,
  signal?: AbortSignal,
): AsyncIterable<ChatStreamChunk> {
  const config = await getAIConfig();
  if (!config) {
    throw new Error('AI not configured. Please set up your API key first.');
  }

  switch (config.provider) {
    case 'openai':
      if (!config.apiKey) throw new Error('OpenAI API key not configured');
      yield* streamOpenAI(
        messages,
        config.apiKey,
        config.model || getDefaultModelId('openai'),
        undefined,
        signal,
      );
      break;

    case 'anthropic':
      if (!config.apiKey) throw new Error('Anthropic API key not configured');
      yield* streamClaude(
        messages,
        config.apiKey,
        config.model || getDefaultModelId('anthropic'),
        undefined,
        signal,
      );
      break;

    case 'google':
      if (!config.apiKey) throw new Error('Google API key not configured');
      yield* streamGemini(
        messages,
        config.apiKey,
        config.model || getDefaultModelId('google'),
        undefined,
        signal,
      );
      break;

    case 'minimax':
      if (!config.apiKey) throw new Error('MiniMax API key not configured');
      yield* streamMiniMax(
        messages,
        config.apiKey,
        config.model || getDefaultModelId('minimax'),
        undefined,
        signal,
      );
      break;

    case 'openrouter':
      if (!config.apiKey) throw new Error('OpenRouter API key not configured');
      yield* streamOpenRouter(
        messages,
        config.apiKey,
        config.model || getDefaultModelId('openrouter'),
        undefined,
        signal,
      );
      break;

    case 'dome':
      yield* streamDome(
        messages,
        config.model || getDefaultModelId('dome'),
        undefined,
      );
      break;

    case 'ollama':
      yield* streamOllama(
        messages,
        config.ollamaModel || config.model || 'llama3.2',
        signal,
        undefined,
      );
      break;

    case 'copilot':
      yield* streamViaMainProcess(
        'copilot',
        messages,
        config.model || getDefaultModelId('copilot'),
        undefined,
        signal,
      );
      break;

    case 'deepseek':
    case 'moonshot':
    case 'qwen':
    case 'opencode':
    case 'opencode-go':
      if (!config.apiKey) throw new Error(`API key not configured for ${config.provider}`);
      yield* streamViaMainProcess(
        config.provider,
        messages,
        config.model || getDefaultModelId(config.provider),
        undefined,
        signal,
      );
      break;

    default:
      throw new Error(`Provider ${config.provider} does not support streaming`);
  }
}

// =============================================================================
// Tool Execution (the agent runtime)
// =============================================================================

type StreamChunkData = {
  streamId: string;
  type?: string;
  text?: string;
  error?: string;
  toolCall?: { id: string; name: string; arguments: string };
  toolCallId?: string;
  result?: string;
  threadId?: string;
  actionRequests?: Array<{ name: string; args: Record<string, unknown>; description?: string }>;
  reviewConfigs?: Array<{ actionName: string; allowedDecisions: string[] }>;
};

/**
 * Stream chat with tools using agent runtime.
 * Yields chunks in real time (text, thinking, tool_call, tool_result, done, error).
 */
export async function* chatWithToolsStream(
  messages: Array<{ role: string; content: string }>,
  tools: AnyAgentTool[],
  options?: {
    signal?: AbortSignal;
    threadId?: string;
    skipHitl?: boolean;
    mcpServerIds?: string[];
    subagentIds?: Array<'research' | 'library' | 'writer' | 'data'>;
  },
): AsyncIterable<import('./types').ChatStreamChunk> {
  if (!isElectron() || !window.electron?.ai?.streamAgent) {
    throw new Error('Chat with tools requires Electron with agent runtime support');
  }

  const config = await getAIConfig();
  if (!config) throw new Error('AI not configured.');

  const provider = config.provider as string;
  if (provider === 'dome') {
    // Architecture-first fallback: Dome proxy streaming without agent runtime.
    // Tool orchestration remains in phase 2.
    const toolDefinitions = toOpenAIToolDefinitions(tools);
    yield* streamDome(messages, config.model || getDefaultModelId('dome'), toolDefinitions);
    return;
  }

  const model = provider === 'ollama'
    ? (config.ollamaModel || getDefaultModelId('ollama' as AIProviderType))
    : (config.model || getDefaultModelId(provider as AIProviderType));
  const toolDefinitions = toOpenAIToolDefinitions(tools);

  const streamId = generateStreamId();
  const chunks: import('./types').ChatStreamChunk[] = [];
  let resolveWait: (() => void) | null = null;
  let done = false;
  let streamError: Error | null = null;

  if (options?.signal && window.electron?.ai?.abortAgent) {
    options.signal.addEventListener('abort', () => {
      window.electron.ai.abortAgent(streamId);
    });
  }

  const unsub = window.electron!.ai.onStreamChunk((data: StreamChunkData) => {
    if (data.streamId !== streamId) return;
    if (data.type === 'thinking' && data.text) {
      chunks.push({ type: 'thinking', text: data.text });
    } else if (data.type === 'text' && data.text) {
      chunks.push({ type: 'text', text: data.text });
    } else if (data.type === 'tool_call' && data.toolCall) {
      chunks.push({ type: 'tool_call', toolCall: data.toolCall });
    } else if (data.type === 'tool_result' && data.toolCallId != null) {
      chunks.push({ type: 'tool_result', toolCallId: data.toolCallId, result: data.result ?? '' });
    } else if (data.type === 'done') {
      chunks.push({ type: 'done' });
      done = true;
      unsub();
    } else if (
      data.type === 'interrupt' &&
      Array.isArray(data.actionRequests) &&
      data.actionRequests.length > 0
    ) {
      const threadId = data.threadId;
      const reviewConfigs = Array.isArray(data.reviewConfigs) ? data.reviewConfigs : [];
      chunks.push({
        type: 'interrupt',
        threadId,
        actionRequests: data.actionRequests,
        reviewConfigs,
        submitResume: (decisions: Array<{ type: 'approve' } | { type: 'edit'; editedAction: { name: string; args: Record<string, unknown> } } | { type: 'reject'; message?: string }>) => {
          if (threadId) {
            void window.electron?.ai?.resumeAgent?.({ threadId, streamId, decisions });
          }
        },
      });
      // Don't set done - resume will send more chunks; keep listener active
    } else if (data.type === 'error') {
      streamError = new Error(data.error || 'Stream error');
      chunks.push({ type: 'error', error: data.error ?? 'Stream error' });
      done = true;
      unsub();
    }
    if (resolveWait) {
      resolveWait();
      resolveWait = null;
    }
  });

  const invokePromise = window.electron.ai.streamAgent(
    provider as AIProviderType,
    messages,
    model,
    streamId,
    toolDefinitions,
    options?.threadId,
    options?.skipHitl,
    options?.mcpServerIds,
    options?.subagentIds,
  );

  invokePromise.catch((err) => {
    streamError = err instanceof Error ? err : new Error(String(err));
    done = true;
    if (resolveWait) {
      resolveWait();
      resolveWait = null;
    }
  });

  try {
    while (!done || chunks.length > 0) {
      if (options?.signal?.aborted) break;
      if (chunks.length > 0) {
        const chunk = chunks.shift()!;
        if (chunk.type === 'error' && streamError) throw streamError;
        yield chunk;
        if (chunk.type === 'done') break;
        if (chunk.type === 'error') break;
      } else if (!done) {
        await new Promise<void>((resolve) => {
          resolveWait = resolve;
        });
      }
    }
    if (streamError && !options?.signal?.aborted) throw streamError;
  } finally {
    unsub();
  }
}

/**
 * Execute a chat with tools using agent runtime (runs in main process).
 * Consumes chatWithToolsStream and returns the final result. Use for non-UI consumers (e.g. run engine).
 */
export async function chatWithTools(
  messages: Array<{ role: string; content: string }>,
  tools: AnyAgentTool[],
  options?: {
    maxIterations?: number; // Deprecated, kept for API compatibility
    signal?: AbortSignal;
    threadId?: string;
    skipHitl?: boolean;
    mcpServerIds?: string[];
    subagentIds?: Array<'research' | 'library' | 'writer' | 'data'>;
  },
): Promise<{ response: string; toolResults: Array<{ tool: string; result: unknown }>; thinking?: string }> {
  let fullResponse = '';
  let fullThinking = '';
  const toolResultsMap = new Map<string, { tool: string; result: unknown }>();

  for await (const chunk of chatWithToolsStream(messages, tools, {
    signal: options?.signal,
    threadId: options?.threadId,
    skipHitl: options?.skipHitl,
    mcpServerIds: options?.mcpServerIds,
    subagentIds: options?.subagentIds,
  })) {
    if (options?.signal?.aborted) break;
    if (chunk.type === 'thinking' && chunk.text) fullThinking += chunk.text;
    if (chunk.type === 'text' && chunk.text) fullResponse += chunk.text;
    if (chunk.type === 'tool_call' && chunk.toolCall) {
      toolResultsMap.set(chunk.toolCall.id, { tool: chunk.toolCall.name, result: { toolCall: chunk.toolCall } });
    }
    if (chunk.type === 'tool_result' && chunk.toolCallId != null) {
      const entry = toolResultsMap.get(chunk.toolCallId);
      if (entry) entry.result = chunk.result ?? '';
    }
  }

  const toolResults = Array.from(toolResultsMap.values());
  return { response: fullResponse, toolResults, thinking: fullThinking || undefined };
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Chunk text using llm-chunk (efficient, handles edge cases)
 */
export function chunkText(text: string, maxChunkSize: number = 512): string[] {
  if (!text?.trim()) return [];
  try {
    const result = llmChunk(text, {
      minLength: 0,
      maxLength: maxChunkSize,
      overlap: 0,
      splitter: 'paragraph',
    });
    return Array.isArray(result) ? result.map(String) : [];
  } catch (err) {
    console.warn('[AI] chunkText error:', err instanceof Error ? err.message : err);
    return [];
  }
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

export { 
  createToolRegistry, 
  createDefaultTools,
  createAllMartinTools,
  createResourceOnlyTools,
  createResourceTools,
  createContextTools,
  createMemoryTools,
  createWebSearchTool,
  createWebFetchTool,
  createResourceSearchTool,
  createResourceGetTool,
  createResourceListTool,
  createResourceSemanticSearchTool,
  createProjectListTool,
  createProjectGetTool,
  createInteractionListTool,
  createGetRecentResourcesTool,
  createGetCurrentProjectTool,
  toOpenAIToolDefinitions,
  toAnthropicToolDefinitions,
} from './tools';

export type { AnyAgentTool } from './tools';
export type { ToolDefinition } from './types';
