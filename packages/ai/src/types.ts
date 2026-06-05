/**
 * @dome/ai — wire format types.
 *
 * Single source of truth for the message / assistant-response / tool-schema
 * shape used across the LLM layer. `@dome/agent-core` and `@dome/tools`
 * import these types from here so the LLM wire format is owned in one place.
 *
 * Phase 1: this package is types-only. The runtime functions
 * (`stream`, `chat`, `buildImageContent`, `createModelFromConfig`) live in
 * `electron/llm-service.cjs` + `electron/model-factory.cjs` and are
 * imported directly by main-process callers. The delegation from
 * `llm-service.cjs` to this package happens in a follow-up; for now the
 * package is the **type authority** that other packages depend on.
 */

// =============================================================================
// Providers and models
// =============================================================================

/** Provider identifier — single source of truth across the LLM layer. */
export type Provider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'openrouter'
  | 'copilot';

/**
 * Configuration used to construct a chat model. Mirrors the current
 * `createModelFromConfig(provider, model, apiKey, baseUrl)` call shape.
 */
export interface ModelConfig {
  provider: Provider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  /** Free-form provider-specific options (temperature, max_tokens, etc.). */
  options?: Record<string, unknown>;
}

/** Resolved model record (catalog lookup + capabilities). */
export interface Model {
  id: string;
  provider: Provider;
  contextWindow: number;
  maxTokens: number;
  cost: ModelCost;
  input: ModelInputType[];
  reasoning: boolean;
  /** Optional metadata (name, description, recommended flag, etc.). */
  name?: string;
  description?: string;
  recommended?: boolean;
}

export interface ModelCost {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export type ModelInputType = 'text' | 'image' | 'audio' | 'video';

// =============================================================================
// Messages
// =============================================================================

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * A single chat message. `content` is either a plain string or an array of
 * content blocks (text / image / video).
 */
export interface Message {
  role: MessageRole;
  content: string | unknown[];
  /** Optional multimodal attachments (alternative to inline content blocks). */
  attachments?: { images?: unknown[]; videos?: unknown[] };
  /** Optional tool calls emitted by an assistant message. */
  toolCalls?: ToolCall[];
  /** Optional name (e.g. for tool messages). */
  name?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Provider-agnostic tool schema — JSON-schema declaration. */
export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * The completed assistant message returned by `chat()` and accumulated
 * during `stream()`. Mirrors what `llm-service.cjs` already returns, plus
 * the tool-calls field needed for `@dome/agent-core` in later phases.
 */
export interface AssistantMessage {
  text: string;
  usage: Usage | null;
  toolCalls?: ToolCall[];
  /** Raw provider response (debugging / advanced use). */
  raw?: unknown;
  /** Provider error message (if any) — encoded as data, not thrown. */
  error?: string;
}

// =============================================================================
// Stream events (target API for Phase 6)
// =============================================================================

/**
 * Event types emitted by the streaming surface (target API for Phase 6).
 * Phase 1 keeps the existing callback-based API in `llm-service.cjs`; these
 * types are exported for callers that want to migrate early.
 */
export type AssistantMessageEvent =
  | { type: 'start'; messageId?: string }
  | { type: 'text'; text: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'usage'; usage: Usage }
  | { type: 'done'; message: AssistantMessage }
  | { type: 'error'; error: string };

// =============================================================================
// Usage
// =============================================================================

/**
 * Token usage. Field names match what the current `llm-service.cjs` already
 * returns to IPC callers (`{ inputTokens, outputTokens, totalTokens }`).
 */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// =============================================================================
// Options (target API for Phase 6)
// =============================================================================

/**
 * Target option shape for `stream(opts)` and `chat(opts)` (Phase 6 API).
 * Phase 1's runtime functions still accept the *current* call shape from
 * `llm-service.cjs`; this type documents the future shape so callers can
 * migrate incrementally.
 */
export interface StreamOptions {
  model: ModelConfig;
  messages: Message[];
  tools?: ToolSchema[];
  thinkingLevel?: 'off' | 'low' | 'medium' | 'high';
  signal?: AbortSignal;
  /** Per-call options forwarded to the provider (maxTokens, responseFormat, ...). */
  options?: ChatOptions;
  /** Phase-1 callback for streaming chunks. */
  onChunk?: (chunk: { type: 'text'; text: string } | { type: 'usage'; usage: Usage }) => void;
}

export interface ChatOptions {
  maxTokens?: number;
  maxOutputTokens?: number;
  responseFormat?: string;
  responseMimeType?: string;
  temperature?: number;
  topP?: number;
}

export interface ChatResult {
  text: string;
  usage: Usage | null;
}
