/**
 * AI Client - Unified AI interface for Dome
 * 
 * Provides a unified interface for chat, streaming, embeddings, and tools
 * across multiple providers (OpenAI, Anthropic, Google, Ollama, Synthetic, etc.)
 * 
 * Migrated and enhanced from clawdbot's AI system.
 */

import { db } from '../db/client';
import {
  getDefaultModelId,
  getDefaultEmbeddingModelId,
  type AIProviderType,
  type ModelDefinition,
  PROVIDERS,
  findModelById,
  modelSupportsTools,
} from './models';
import type {
  ChatOptions,
  ChatResponse,
  ChatStreamChunk,
  ChatMessage,
  ToolDefinition,
} from './types';
import {
  createToolRegistry,
  toOpenAIToolDefinitions,
  toAnthropicToolDefinitions,
  type AnyAgentTool,
} from './tools';
import {
  buildMartinBasePrompt,
  buildMartinResourceContext,
  prompts as promptTemplates,
} from '@/lib/prompts/loader';
import { chunk as llmChunk } from 'llm-chunk';

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
}

// =============================================================================
// Configuration Management
// =============================================================================

export async function getAIConfig(): Promise<AIConfig | null> {
  try {
    const providerResult = await db.getSetting('ai_provider');
    const apiKeyResult = await db.getSetting('ai_api_key');
    const modelResult = await db.getSetting('ai_model');
    const embeddingModelResult = await db.getSetting('ai_embedding_model');
    const baseURLResult = await db.getSetting('ai_base_url');
    const ollamaBaseURLResult = await db.getSetting('ollama_base_url');
    const ollamaModelResult = await db.getSetting('ollama_model');
    const ollamaEmbeddingModelResult = await db.getSetting('ollama_embedding_model');

    if (!providerResult.data) return null;

    return {
      provider: providerResult.data as AIProvider,
      apiKey: apiKeyResult.data || undefined,
      model: modelResult.data || undefined,
      embeddingModel: embeddingModelResult.data || undefined,
      baseURL: baseURLResult.data || undefined,
      ollamaBaseURL: ollamaBaseURLResult.data || undefined,
      ollamaModel: ollamaModelResult.data || undefined,
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
    await db.setSetting('ai_api_key', config.apiKey);
  }
  if (config.model) {
    await db.setSetting('ai_model', config.model);
  }
  if (config.embeddingModel) {
    await db.setSetting('ai_embedding_model', config.embeddingModel);
  }
  if (config.baseURL) {
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

  console.log('AI config saved');
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
  const unsubscribe = window.electron.ai.onStreamChunk((data: { streamId: string; type: string; text?: string; error?: string; toolCall?: { id: string; name: string; arguments: string } }) => {
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

  const unsubscribe = window.electron.ai.onStreamChunk((data: { streamId: string; type: string; text?: string; error?: string; toolCall?: { id: string; name: string; arguments: string } }) => {
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

  const unsubscribe = window.electron.ai.onStreamChunk((data: { streamId: string; type: string; text?: string; error?: string; toolCall?: { id: string; name: string; arguments: string } }) => {
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

  const unsubscribe = window.electron.ai.onStreamChunk((data: { streamId: string; type: string; text?: string; error?: string; toolCall?: { id: string; name: string; arguments: string } }) => {
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

// =============================================================================
// Embeddings (via IPC to main process)
// =============================================================================

export async function generateEmbeddingsOpenAI(
  texts: string[],
  _apiKey: string,
  model: string = 'text-embedding-3-small',
): Promise<number[][]> {
  if (!isElectron()) {
    throw new Error('Embeddings require Electron environment');
  }

  const result = await window.electron.ai.embeddings('openai', texts, model);
  if (!result.success || !result.embeddings) {
    throw new Error(result.error || 'OpenAI embeddings failed');
  }
  return result.embeddings;
}

export async function generateEmbeddingsGoogle(
  texts: string[],
  _apiKey: string,
  model: string = 'text-embedding-004',
): Promise<number[][]> {
  if (!isElectron()) {
    throw new Error('Embeddings require Electron environment');
  }

  const result = await window.electron.ai.embeddings('google', texts, model);
  if (!result.success || !result.embeddings) {
    throw new Error(result.error || 'Google embeddings failed');
  }
  return result.embeddings;
}

export async function generateEmbeddingsAnthropic(
  texts: string[],
  _apiKey: string,
  model: string = 'voyage-multimodal-3',
): Promise<number[][]> {
  if (!isElectron()) {
    throw new Error('Embeddings require Electron environment');
  }

  const result = await window.electron.ai.embeddings('anthropic', texts, model);
  if (!result.success || !result.embeddings) {
    throw new Error(result.error || 'Anthropic (Voyage) embeddings failed');
  }
  return result.embeddings;
}

// =============================================================================
// Unified Functions
// =============================================================================

/**
 * Generate embeddings using Ollama (local)
 * Falls back to this when the main provider doesn't support embeddings
 */
async function generateEmbeddingsOllama(texts: string[]): Promise<number[][]> {
  if (!isElectron()) {
    throw new Error('Ollama embeddings require Electron environment');
  }

  const embeddings: number[][] = [];
  
  for (const text of texts) {
    const result = await window.electron.ollama.generateEmbedding(text);
    if (!result.success || !result.embedding) {
      throw new Error(result.error || 'Ollama embedding generation failed');
    }
    embeddings.push(result.embedding);
  }
  
  return embeddings;
}

/**
 * Check if Ollama is available for embeddings fallback
 */
async function checkOllamaAvailable(): Promise<boolean> {
  if (!isElectron()) return false;
  
  try {
    const result = await window.electron.ollama.checkAvailability();
    return result.success && result.available === true;
  } catch {
    return false;
  }
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const config = await getAIConfig();
  if (!config) {
    throw new Error('AI not configured. Please set up your API key first.');
  }

  switch (config.provider) {
    case 'openai':
      if (!config.apiKey) throw new Error('OpenAI API key not configured');
      return generateEmbeddingsOpenAI(
        texts,
        config.apiKey,
        config.embeddingModel || getDefaultEmbeddingModelId('openai'),
      );

    case 'google':
      if (!config.apiKey) throw new Error('Google API key not configured');
      return generateEmbeddingsGoogle(
        texts,
        config.apiKey,
        config.embeddingModel || getDefaultEmbeddingModelId('google'),
      );

    case 'ollama':
      return generateEmbeddingsOllama(texts);

    case 'anthropic':
      if (!config.apiKey) throw new Error('Anthropic API key not configured');
      return generateEmbeddingsAnthropic(
        texts,
        config.apiKey,
        config.embeddingModel || getDefaultEmbeddingModelId('anthropic'),
      );

    default:
      throw new Error(`Provider ${config.provider} not supported for embeddings`);
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

    case 'ollama':
      throw new Error('Ollama chat must be handled from the main process via IPC');

    default:
      throw new Error(`Provider ${config.provider} not supported`);
  }
}

export async function* chatStream(
  messages: Array<{ role: string; content: string }>,
  tools?: ToolDefinition[],
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
        tools,
        signal,
      );
      break;

    case 'anthropic':
      if (!config.apiKey) throw new Error('Anthropic API key not configured');
      yield* streamClaude(
        messages,
        config.apiKey,
        config.model || getDefaultModelId('anthropic'),
        tools,
        signal,
      );
      break;

    case 'google':
      if (!config.apiKey) throw new Error('Google API key not configured');
      yield* streamGemini(
        messages,
        config.apiKey,
        config.model || getDefaultModelId('google'),
        tools,
        signal,
      );
      break;

    case 'ollama':
      yield* streamOllama(
        messages,
        config.ollamaModel || config.model || 'llama3.2',
        signal,
        tools,
      );
      break;

    default:
      throw new Error(`Provider ${config.provider} does not support streaming`);
  }
}

// =============================================================================
// Tool Execution (LangGraph)
// =============================================================================

type StreamChunkData = {
  streamId: string;
  type: string;
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
 * Stream chat with tools using LangGraph agent.
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
  },
): AsyncIterable<import('./types').ChatStreamChunk> {
  if (!isElectron() || !window.electron?.ai?.streamLangGraph) {
    throw new Error('Chat with tools requires Electron with LangGraph support');
  }

  const config = await getAIConfig();
  if (!config) throw new Error('AI not configured.');

  const provider = config.provider as string;
  const model = provider === 'ollama'
    ? (config.ollamaModel || getDefaultModelId('ollama' as AIProviderType))
    : (config.model || getDefaultModelId(provider as AIProviderType));
  const toolDefinitions = toOpenAIToolDefinitions(tools);

  const streamId = generateStreamId();
  const chunks: import('./types').ChatStreamChunk[] = [];
  let resolveWait: (() => void) | null = null;
  let done = false;
  let streamError: Error | null = null;

  if (options?.signal && window.electron?.ai?.abortLangGraph) {
    options.signal.addEventListener('abort', () => {
      window.electron.ai.abortLangGraph(streamId);
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
    } else if (data.type === 'interrupt' && data.actionRequests && data.reviewConfigs) {
      const threadId = data.threadId;
      chunks.push({
        type: 'interrupt',
        threadId,
        actionRequests: data.actionRequests,
        reviewConfigs: data.reviewConfigs,
        submitResume: threadId
          ? (decisions: Array<{ type: 'approve' } | { type: 'edit'; editedAction: { name: string; args: Record<string, unknown> } } | { type: 'reject'; message?: string }>) => {
              void window.electron?.ai?.resumeLangGraph?.({ threadId, streamId, decisions });
            }
          : undefined,
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

  const invokePromise = window.electron.ai.streamLangGraph(
    provider as 'openai' | 'anthropic' | 'google' | 'ollama',
    messages,
    model,
    streamId,
    toolDefinitions,
    options?.threadId,
    options?.skipHitl,
    options?.mcpServerIds,
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
 * Execute a chat with tools using LangGraph agent (runs in main process).
 * Consumes chatWithToolsStream and returns the final result. Use for non-UI consumers (e.g. WhatsApp).
 */
export async function chatWithTools(
  messages: Array<{ role: string; content: string }>,
  tools: AnyAgentTool[],
  options?: {
    maxIterations?: number; // Deprecated, kept for API compatibility
    signal?: AbortSignal;
    threadId?: string;
    skipHitl?: boolean;
  },
): Promise<{ response: string; toolResults: Array<{ tool: string; result: unknown }>; thinking?: string }> {
  let fullResponse = '';
  let fullThinking = '';
  const toolResultsMap = new Map<string, { tool: string; result: unknown }>();

  for await (const chunk of chatWithToolsStream(messages, tools, {
    signal: options?.signal,
    threadId: options?.threadId,
    skipHitl: options?.skipHitl,
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

export interface MartinSystemPromptOptions {
  /** Current resource context */
  resourceContext?: {
    title?: string;
    type?: string;
    content?: string;
    summary?: string;
    transcription?: string;
  };
  /** Whether tools are enabled */
  toolsEnabled?: boolean;
  /** Current location in the app */
  location?: 'workspace' | 'home' | 'whatsapp';
  /** Current date/time to include */
  includeDateTime?: boolean;
  /** AI provider (e.g. google) for provider-specific instructions */
  provider?: string;
}

export function getMartinSystemPrompt(options?: MartinSystemPromptOptions | {
  title?: string;
  type?: string;
  content?: string;
  summary?: string;
  transcription?: string;
}): string {
  // Handle legacy usage (passing resourceContext directly)
  const opts: MartinSystemPromptOptions = options && ('resourceContext' in options || 'toolsEnabled' in options || 'location' in options)
    ? options as MartinSystemPromptOptions
    : { resourceContext: options as MartinSystemPromptOptions['resourceContext'] };

  const { resourceContext, toolsEnabled = false, location = 'workspace', includeDateTime = true, provider } = opts;

  const now = new Date();
  const date = includeDateTime
    ? now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const time = includeDateTime ? now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';

  let prompt = buildMartinBasePrompt({
    location,
    date,
    time,
    resourceTitle: resourceContext?.title,
    includeDateTime,
  });

  if (toolsEnabled) {
    prompt += promptTemplates.martin.tools;
    prompt += '\n\n' + promptTemplates.martin.noteFormat;
  }

  if (resourceContext) {
    const isNotebook = resourceContext.type === 'notebook';
    const isExcel = resourceContext.type === 'excel';
    const isDocument = resourceContext.type === 'document';
    const contentOverride = isNotebook
      ? 'This is a notebook. Use notebook_get to read its structure, cells, and code.'
      : isExcel && toolsEnabled
        ? 'This is an Excel spreadsheet. Use excel_get to read its sheets, cells, and ranges. The preview below is limited; always call excel_get for accurate data.'
        : isDocument && toolsEnabled
          ? 'This is a Word document. Use resource_get to read its content. Edit with resource_update (content as HTML or Markdown).'
          : resourceContext.content;
    prompt += '\n\n' + buildMartinResourceContext({
      type: resourceContext.type,
      summary: resourceContext.summary,
      content: contentOverride,
      transcription: resourceContext.transcription,
    });
    if (isNotebook && toolsEnabled) {
      prompt += '\n\n' + promptTemplates.martin.notebookContext;
    }
    if (isExcel && toolsEnabled) {
      prompt += '\n\n' + promptTemplates.martin.excelContext;
    }
    if (isDocument && toolsEnabled) {
      prompt += '\n\n' + promptTemplates.martin.documentContext;
    }
  }

  return prompt;
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
