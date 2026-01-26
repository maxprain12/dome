/**
 * Synthetic Provider
 * 
 * Provider for free models via Synthetic API (Anthropic-compatible).
 * Based on clawdbot's synthetic provider implementation.
 */

import type {
  AIProviderInterface,
  ChatOptions,
  ChatResponse,
  ChatStreamChunk,
  ModelDefinitionConfig,
  ChatMessage,
} from '../types';
import {
  SYNTHETIC_BASE_URL,
  SYNTHETIC_DEFAULT_MODEL_ID,
  getSyntheticModels,
} from '../catalogs/synthetic';

// =============================================================================
// Configuration
// =============================================================================

export interface SyntheticProviderConfig {
  /** API key for Synthetic (optional, models are free) */
  apiKey?: string;
  /** Base URL override */
  baseUrl?: string;
  /** Default model ID */
  defaultModel?: string;
}

// =============================================================================
// Message Conversion
// =============================================================================

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string }>;
}

function convertToAnthropicMessages(messages: ChatMessage[]): {
  system?: string;
  messages: AnthropicMessage[];
} {
  let system: string | undefined;
  const anthropicMessages: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Anthropic uses a separate system parameter
      system = typeof msg.content === 'string' 
        ? msg.content 
        : msg.content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('\n');
    } else if (msg.role === 'user' || msg.role === 'assistant') {
      const content = typeof msg.content === 'string'
        ? msg.content
        : msg.content.filter(c => c.type === 'text').map(c => ({ type: 'text' as const, text: (c as { text: string }).text }));
      
      anthropicMessages.push({
        role: msg.role,
        content,
      });
    }
  }

  return { system, messages: anthropicMessages };
}

// =============================================================================
// Provider Implementation
// =============================================================================

export class SyntheticProvider implements AIProviderInterface {
  readonly id = 'synthetic';
  readonly name = 'Synthetic';

  private config: SyntheticProviderConfig;
  private baseUrl: string;

  constructor(config?: SyntheticProviderConfig) {
    this.config = config ?? {};
    this.baseUrl = config?.baseUrl ?? SYNTHETIC_BASE_URL;
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const model = options.model || this.config.defaultModel || SYNTHETIC_DEFAULT_MODEL_ID;
    const { system, messages } = convertToAnthropicMessages(options.messages);

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: options.maxTokens ?? 8192,
    };

    if (system) {
      body.system = system;
    }

    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    if (options.stop) {
      body.stop_sequences = options.stop;
    }

    // Synthetic supports tools via Anthropic format
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
      }));

      if (options.toolChoice) {
        if (options.toolChoice === 'auto') {
          body.tool_choice = { type: 'auto' };
        } else if (options.toolChoice === 'none') {
          body.tool_choice = { type: 'none' };
        } else if (options.toolChoice === 'required') {
          body.tool_choice = { type: 'any' };
        } else if (typeof options.toolChoice === 'object') {
          body.tool_choice = {
            type: 'tool',
            name: options.toolChoice.function.name,
          };
        }
      }
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        ...(this.config.apiKey ? { 'x-api-key': this.config.apiKey } : {}),
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Synthetic API error (${response.status}): ${error}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
      stop_reason: string;
      usage: { input_tokens: number; output_tokens: number };
      model: string;
    };

    // Parse response content
    let text = '';
    const toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];

    for (const block of data.content) {
      if (block.type === 'text' && block.text) {
        text += block.text;
      } else if (block.type === 'tool_use' && block.id && block.name) {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input ?? {},
        });
      }
    }

    const finishReason = data.stop_reason === 'tool_use' 
      ? 'tool_calls' 
      : data.stop_reason === 'max_tokens' 
        ? 'length' 
        : 'stop';

    return {
      message: {
        role: 'assistant',
        content: toolCalls.length > 0 
          ? [
              ...(text ? [{ type: 'text' as const, text }] : []),
              ...toolCalls.map(tc => ({
                type: 'tool_call' as const,
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
              })),
            ]
          : text,
      },
      finishReason,
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
      model: data.model,
    };
  }

  async *chatStream(options: ChatOptions): AsyncIterable<ChatStreamChunk> {
    const model = options.model || this.config.defaultModel || SYNTHETIC_DEFAULT_MODEL_ID;
    const { system, messages } = convertToAnthropicMessages(options.messages);

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: options.maxTokens ?? 8192,
      stream: true,
    };

    if (system) {
      body.system = system;
    }

    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    if (options.stop) {
      body.stop_sequences = options.stop;
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        ...(this.config.apiKey ? { 'x-api-key': this.config.apiKey } : {}),
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Synthetic API error (${response.status}): ${error}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data) as {
              type: string;
              delta?: { type: string; text?: string };
              message?: { usage?: { input_tokens: number; output_tokens: number } };
              usage?: { input_tokens: number; output_tokens: number };
            };

            if (event.type === 'message_start' && event.message?.usage) {
              inputTokens = event.message.usage.input_tokens;
            } else if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
              yield { type: 'text', text: event.delta.text };
            } else if (event.type === 'message_delta' && event.usage) {
              outputTokens = event.usage.output_tokens;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield {
      type: 'done',
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    };
  }

  async listModels(): Promise<ModelDefinitionConfig[]> {
    // Return static catalog since Synthetic doesn't have a models endpoint
    return getSyntheticModels() as ModelDefinitionConfig[];
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'OPTIONS',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok || response.status === 405; // 405 = method not allowed but server is up
    } catch {
      return false;
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a Synthetic provider instance.
 */
export function createSyntheticProvider(config?: SyntheticProviderConfig): SyntheticProvider {
  return new SyntheticProvider(config);
}
