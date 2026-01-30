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
import { createSyntheticProvider } from './providers/synthetic';
import {
  createToolRegistry,
  toOpenAIToolDefinitions,
  toAnthropicToolDefinitions,
  executeToolCall,
  type AnyAgentTool,
  type ToolCall,
} from './tools';

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
  _tools?: ToolDefinition[],
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
  const unsubscribe = window.electron.ai.onStreamChunk((data: { streamId: string; type: string; text?: string; error?: string }) => {
    if (data.streamId !== streamId) return;
    
    if (data.type === 'text' && data.text) {
      chunks.push({ type: 'text', text: data.text });
    } else if (data.type === 'done') {
      chunks.push({ type: 'done' });
      done = true;
    } else if (data.type === 'error') {
      error = new Error(data.error || 'Stream error');
      done = true;
    }
    
    if (resolveWait) resolveWait();
  });

  // Start the stream
  window.electron.ai.stream('openai', messages, model, streamId);

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
  _tools?: ToolDefinition[],
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

  const unsubscribe = window.electron.ai.onStreamChunk((data: { streamId: string; type: string; text?: string; error?: string }) => {
    if (data.streamId !== streamId) return;
    
    if (data.type === 'text' && data.text) {
      chunks.push({ type: 'text', text: data.text });
    } else if (data.type === 'done') {
      chunks.push({ type: 'done' });
      done = true;
    } else if (data.type === 'error') {
      error = new Error(data.error || 'Stream error');
      done = true;
    }
    
    if (resolveWait) resolveWait();
  });

  window.electron.ai.stream('anthropic', messages, model, streamId);

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

  const unsubscribe = window.electron.ai.onStreamChunk((data: { streamId: string; type: string; text?: string; error?: string }) => {
    if (data.streamId !== streamId) return;
    
    if (data.type === 'text' && data.text) {
      chunks.push({ type: 'text', text: data.text });
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
    case 'anthropic':
    case 'synthetic':
    case 'venice': {
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

    case 'synthetic': {
      const provider = createSyntheticProvider();
      const response = await provider.chat({
        model: config.model || 'hf:MiniMaxAI/MiniMax-M2.1',
        messages: messages.map(m => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
        tools,
      });
      return typeof response.message.content === 'string'
        ? response.message.content
        : response.message.content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('');
    }

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

    case 'synthetic': {
      const provider = createSyntheticProvider();
      yield* provider.chatStream({
        model: config.model || 'hf:MiniMaxAI/MiniMax-M2.1',
        messages: messages.map(m => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
        tools,
        signal,
      });
      break;
    }

    default:
      throw new Error(`Provider ${config.provider} does not support streaming`);
  }
}

// =============================================================================
// Tool Execution
// =============================================================================

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

  for (let i = 0; i < maxIterations; i++) {
    let fullResponse = '';
    const pendingToolCalls: ToolCall[] = [];

    for await (const chunk of chatStream(conversationMessages, toolDefinitions, options?.signal)) {
      if (chunk.type === 'text' && chunk.text) {
        fullResponse += chunk.text;
      } else if (chunk.type === 'tool_call' && chunk.toolCall) {
        pendingToolCalls.push({
          id: chunk.toolCall.id,
          name: chunk.toolCall.name,
          arguments: JSON.parse(chunk.toolCall.arguments || '{}'),
        });
      }
    }

    // If no tool calls, return the response
    if (pendingToolCalls.length === 0) {
      return { response: fullResponse, toolResults };
    }

    // Execute tool calls
    for (const toolCall of pendingToolCalls) {
      const result = await executeToolCall(tools, toolCall, options?.signal);
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

  // Max iterations reached
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

  let prompt = `You are Many, Dome's AI assistant. You are friendly, conversational, and always try to help clearly. You speak in natural English.

## Your Personality
- Close and professional at the same time
- You use clear and direct language
- You explain complex concepts simply
- You always try to be useful and constructive
- You maintain a positive but not exaggerated tone

## Current Context
- Location: ${location === 'workspace' ? 'Workspace' : location === 'home' ? 'Home' : 'WhatsApp'}
- The user is working on a resource`;

  // Add date/time if enabled
  if (includeDateTime) {
    const now = new Date();
    prompt += `\n- Date: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
    prompt += `\n- Time: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  }

  // Add resource context
  if (resourceContext?.title) {
    prompt += `\n- Active resource: "${resourceContext.title}"`;
  }

  prompt += `

## Capabilities
You can help the user with:
- Answering questions about their resources and notes
- Suggesting ideas and connections between content
- Helping organize information
- Generating summaries and analyses
- Receiving content from WhatsApp
- Any other productivity tasks`;

  // Add tools section if enabled
  if (toolsEnabled) {
    prompt += `

## Available Tools
You have access to tools you can use to better help the user:

### Resource Search and Access
- **resource_search**: Search resources by text (title and content)
- **resource_get**: Get the full content of a specific resource
- **resource_list**: List available resources
- **resource_semantic_search**: Search resources by meaning (semantic search)

### Context Information
- **project_list**: View the user's projects
- **project_get**: Get project details
- **interaction_list**: View notes and annotations of a resource
- **get_recent_resources**: View the most recent resources

### Web (if available)
- **web_search**: Search for information on the internet
- **web_fetch**: Get content from a web page

## When to Use Tools
1. When the user asks about their resources → use resource_search
2. If you need more detail from a resource → use resource_get
3. For updated or external information → use web_search
4. Cite sources when using information from resources or web`;
  }

  prompt += `

## Behavior
- If the user asks something outside your knowledge, be honest
- If you can suggest something useful based on context, do it
- Keep responses concise but complete
- Use emojis in moderation, only when they add value`;

  // Add resource details if provided
  if (resourceContext) {
    prompt += `\n\n## Current Resource`;
    
    if (resourceContext.type) {
      prompt += `\nType: ${resourceContext.type}`;
    }
    
    if (resourceContext.summary) {
      prompt += `\n\nSummary: ${resourceContext.summary}`;
    }
    
    if (resourceContext.content) {
      const maxLen = 2000;
      const truncated = resourceContext.content.length > maxLen;
      prompt += `\n\nContent${truncated ? ' (excerpt)' : ''}:\n${resourceContext.content.substring(0, maxLen)}${truncated ? '...' : ''}`;
    }
    
    if (resourceContext.transcription) {
      const maxLen = 2000;
      const truncated = resourceContext.transcription.length > maxLen;
      prompt += `\n\nTranscription${truncated ? ' (excerpt)' : ''}:\n${resourceContext.transcription.substring(0, maxLen)}${truncated ? '...' : ''}`;
    }
    
    prompt += `\n\nHelp the user understand, analyze, and work with this resource.`;
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
