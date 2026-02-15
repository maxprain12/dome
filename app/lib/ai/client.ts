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
  executeToolCall,
  type AnyAgentTool,
  type ToolCall,
} from './tools';
import {
  buildMartinBasePrompt,
  buildMartinResourceContext,
  prompts as promptTemplates,
} from '@/lib/prompts/loader';

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
  model: string = 'gpt-4o',
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
  model: string = 'gpt-4o',
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
  model: string = 'claude-3-5-sonnet-20241022',
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
  model: string = 'claude-3-5-sonnet-20241022',
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
  model: string = 'gemini-2.0-flash',
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
  model: string = 'gemini-2.0-flash',
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

  window.electron.ai.stream('google', messages, model, streamId);

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

    // Providers that don't support embeddings - fallback to Ollama
    case 'anthropic': {
      // Try to use Ollama as fallback
      const ollamaAvailable = await checkOllamaAvailable();
      if (ollamaAvailable) {
        console.log(`[AI] ${config.provider} doesn't support embeddings, using Ollama as fallback`);
        return generateEmbeddingsOllama(texts);
      }
      throw new Error(
        `${config.provider} doesn't support embeddings. ` +
        'Options: 1) Install Ollama with an embedding model (mxbai-embed-large), ' +
        '2) Use OpenAI or Google as the main provider.'
      );
    }

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
// Tool Execution
// =============================================================================

const TOOL_TRACE =
  (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') ||
  (typeof process !== 'undefined' && process.env?.DEBUG_AI_TOOLS === '1');

function toolTraceLog(msg: string, data?: Record<string, unknown>) {
  if (TOOL_TRACE) {
    const payload = data ? ` ${JSON.stringify(sanitizeForLog(data))}` : '';
    console.log(`[AI:Tools] ${msg}${payload}`);
  }
}

function sanitizeForLog(obj: unknown, maxLen = 200): unknown {
  if (obj == null) return obj;
  if (typeof obj === 'string') return obj.length > maxLen ? obj.slice(0, maxLen) + '...' : obj;
  if (Array.isArray(obj)) return obj.map((x) => sanitizeForLog(x, 80));
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = sanitizeForLog(v, k === 'content' || k === 'snippet' ? 100 : 80);
    }
    return out;
  }
  return obj;
}

/**
 * Execute a chat with tool support, automatically handling tool calls.
 */
export async function chatWithTools(
  messages: Array<{ role: string; content: string }>,
  tools: AnyAgentTool[],
  options?: {
    maxIterations?: number;
    signal?: AbortSignal;
  },
): Promise<{ response: string; toolResults: Array<{ tool: string; result: unknown }> }> {
  const maxIterations = options?.maxIterations ?? 5;
  const toolResults: Array<{ tool: string; result: unknown }> = [];
  const conversationMessages = [...messages];
  
  const toolDefinitions = toOpenAIToolDefinitions(tools);
  toolTraceLog('chatWithTools start', { toolsCount: tools.length, maxIterations });

  for (let i = 0; i < maxIterations; i++) {
    let fullResponse = '';
    const pendingToolCalls: ToolCall[] = [];

    toolTraceLog(`iteration ${i + 1}/${maxIterations} - streaming from AI`);
    for await (const chunk of chatStream(conversationMessages, toolDefinitions, options?.signal)) {
      if (chunk.type === 'text' && chunk.text) {
        fullResponse += chunk.text;
      } else if (chunk.type === 'tool_call' && chunk.toolCall) {
        pendingToolCalls.push({
          id: chunk.toolCall.id,
          name: chunk.toolCall.name,
          arguments: JSON.parse(chunk.toolCall.arguments || '{}'),
        });
        toolTraceLog('AI emitted tool_call', {
          name: chunk.toolCall.name,
          argsPreview: (chunk.toolCall.arguments || '{}').slice(0, 100),
        });
      }
    }

    toolTraceLog(`iteration ${i + 1} complete`, {
      textLength: fullResponse.length,
      toolCallsCount: pendingToolCalls.length,
      toolNames: pendingToolCalls.map((t) => t.name),
    });

    // If no tool calls, return the response
    if (pendingToolCalls.length === 0) {
      toolTraceLog('chatWithTools end - no more tool calls', { responseLength: fullResponse.length });
      return { response: fullResponse, toolResults };
    }

    // Execute tool calls
    for (const toolCall of pendingToolCalls) {
      toolTraceLog('executing tool', { name: toolCall.name, args: toolCall.arguments });
      const result = await executeToolCall(tools, toolCall, options?.signal);
      const details = result.result.details as Record<string, unknown>;
      toolTraceLog('tool result', {
        name: toolCall.name,
        success: details?.status !== 'error',
        error: details?.error,
      });
      toolResults.push({
        tool: toolCall.name,
        result: result.result.details,
      });

      // Add tool result to conversation
      conversationMessages.push({
        role: 'assistant',
        content: JSON.stringify({
          tool_calls: [{
            id: toolCall.id,
            type: 'function',
            function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments) },
          }],
        }),
      });
      conversationMessages.push({
        role: 'user', // Tool results go as user messages in simplified format
        content: `[Tool result for ${toolCall.name}]: ${JSON.stringify(result.result.details)}`,
      });
    }
  }

  toolTraceLog('chatWithTools end - max iterations reached');
  return {
    response: 'Maximum tool iterations reached.',
    toolResults,
  };
}

// =============================================================================
// Utilities
// =============================================================================

export function chunkText(text: string, maxChunkSize: number = 512): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentSize = 0;

  for (const word of words) {
    if (currentSize + word.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
      currentChunk = [word];
      currentSize = word.length;
    } else {
      currentChunk.push(word);
      currentSize += word.length + 1;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }

  return chunks;
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

  const { resourceContext, toolsEnabled = false, location = 'workspace', includeDateTime = true } = opts;

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
  }

  if (resourceContext) {
    const isNotebook = resourceContext.type === 'notebook';
    prompt += '\n\n' + buildMartinResourceContext({
      type: resourceContext.type,
      summary: resourceContext.summary,
      content: isNotebook
        ? 'This is a notebook. Use notebook_get to read its structure, cells, and code.'
        : resourceContext.content,
      transcription: resourceContext.transcription,
    });
    if (isNotebook && toolsEnabled) {
      prompt += '\n\n' + promptTemplates.martin.notebookContext;
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
