/**
 * AI Types - Migrated from clawdbot
 * 
 * Core types for AI providers, models, and configuration.
 * Based on clawdbot's src/config/types.models.ts
 */

// =============================================================================
// Model API Types
// =============================================================================

/**
 * Supported model API types for different providers
 */
export type ModelApi =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages'
  | 'google-generative-ai'
  | 'github-copilot'
  | 'bedrock-converse-stream'
  | 'ollama';

// =============================================================================
// Authentication Types
// =============================================================================

/**
 * Authentication modes for model providers
 */
export type ModelProviderAuthMode = 
  | 'api-key'
  | 'aws-sdk'
  | 'oauth'
  | 'token';

/**
 * Authentication profile for storing credentials
 */
export interface AuthProfile {
  id: string;
  providerId: string;
  type: 'api_key' | 'oauth' | 'token';
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Model Compatibility
// =============================================================================

/**
 * Model-specific compatibility configuration
 */
export interface ModelCompatConfig {
  /** Whether the model supports the store parameter */
  supportsStore?: boolean;
  /** Whether the model supports the developer role */
  supportsDeveloperRole?: boolean;
  /** Whether the model supports reasoning effort parameter */
  supportsReasoningEffort?: boolean;
  /** Which field to use for max tokens */
  maxTokensField?: 'max_completion_tokens' | 'max_tokens';
  /** Whether to use streaming */
  supportsStreaming?: boolean;
  /** Whether the model supports tools/function calling */
  supportsTools?: boolean;
  /** Whether the model supports system messages */
  supportsSystemMessage?: boolean;
  /** Whether the model supports vision/images */
  supportsVision?: boolean;
}

// =============================================================================
// Cost Configuration
// =============================================================================

/**
 * Cost structure for model usage (per 1M tokens)
 */
export interface ModelCost {
  /** Cost per 1M input tokens */
  input: number;
  /** Cost per 1M output tokens */
  output: number;
  /** Cost per 1M cached read tokens */
  cacheRead: number;
  /** Cost per 1M cached write tokens */
  cacheWrite: number;
}

/**
 * Default zero cost for free models
 */
export const ZERO_COST: ModelCost = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

// =============================================================================
// Model Definition
// =============================================================================

/**
 * Input modalities supported by a model
 */
export type ModelInputType = 'text' | 'image' | 'audio' | 'video';

/**
 * Complete model definition with all configuration
 */
export interface ModelDefinitionConfig {
  /** Unique model identifier */
  id: string;
  /** Human-readable model name */
  name: string;
  /** API type to use for this model */
  api?: ModelApi;
  /** Whether this is a reasoning/thinking model */
  reasoning: boolean;
  /** Supported input modalities */
  input: ModelInputType[];
  /** Cost per 1M tokens */
  cost: ModelCost;
  /** Maximum context window in tokens */
  contextWindow: number;
  /** Maximum output tokens */
  maxTokens: number;
  /** Custom headers for API requests */
  headers?: Record<string, string>;
  /** Model-specific compatibility settings */
  compat?: ModelCompatConfig;
  /** Whether this is a recommended model */
  recommended?: boolean;
  /** Human-readable description */
  description?: string;
  /** Provider-specific model alias */
  alias?: string;
}

// =============================================================================
// Provider Configuration
// =============================================================================

/**
 * Provider configuration with authentication and models
 */
export interface ModelProviderConfig {
  /** Base URL for the provider API */
  baseUrl: string;
  /** API key for authentication */
  apiKey?: string;
  /** Authentication mode */
  auth?: ModelProviderAuthMode;
  /** Default API type for models in this provider */
  api?: ModelApi;
  /** Custom headers for all requests */
  headers?: Record<string, string>;
  /** Whether to include Authorization header */
  authHeader?: boolean;
  /** List of available models */
  models: ModelDefinitionConfig[];
}

// =============================================================================
// Discovery Configuration
// =============================================================================

/**
 * AWS Bedrock discovery configuration
 */
export interface BedrockDiscoveryConfig {
  /** Enable Bedrock model discovery */
  enabled?: boolean;
  /** AWS region for Bedrock */
  region?: string;
  /** Filter by provider names */
  providerFilter?: string[];
  /** Refresh interval in seconds */
  refreshInterval?: number;
  /** Default context window for discovered models */
  defaultContextWindow?: number;
  /** Default max tokens for discovered models */
  defaultMaxTokens?: number;
}

/**
 * Ollama discovery configuration
 */
export interface OllamaDiscoveryConfig {
  /** Enable Ollama model discovery */
  enabled?: boolean;
  /** Base URL for Ollama API */
  baseUrl?: string;
  /** Refresh interval in seconds */
  refreshInterval?: number;
}

// =============================================================================
// Global Models Configuration
// =============================================================================

/**
 * Global models configuration
 */
export interface ModelsConfig {
  /** How to handle provider merging */
  mode?: 'merge' | 'replace';
  /** Provider configurations by name */
  providers?: Record<string, ModelProviderConfig>;
  /** Bedrock discovery settings */
  bedrockDiscovery?: BedrockDiscoveryConfig;
  /** Ollama discovery settings */
  ollamaDiscovery?: OllamaDiscoveryConfig;
}

// =============================================================================
// Message Types
// =============================================================================

/**
 * Role for chat messages
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Content types for messages
 */
export type MessageContentType = 'text' | 'image' | 'tool_call' | 'tool_result';

/**
 * Text content in a message
 */
export interface TextContent {
  type: 'text';
  text: string;
}

/**
 * Image content in a message
 */
export interface ImageContent {
  type: 'image';
  /** Base64 encoded image data */
  data: string;
  /** MIME type of the image */
  mimeType: string;
  /** Optional alt text */
  alt?: string;
}

/**
 * Tool call content in a message
 */
export interface ToolCallContent {
  type: 'tool_call';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool result content in a message
 */
export interface ToolResultContent {
  type: 'tool_result';
  toolCallId: string;
  result: unknown;
  isError?: boolean;
}

/**
 * Union of all content types
 */
export type MessageContent = TextContent | ImageContent | ToolCallContent | ToolResultContent;

/**
 * Chat message with role and content
 */
export interface ChatMessage {
  role: MessageRole;
  content: string | MessageContent[];
  /** Optional name for the message sender */
  name?: string;
}

// =============================================================================
// Chat Request/Response Types
// =============================================================================

/**
 * Options for chat completion requests
 */
export interface ChatOptions {
  /** Model ID to use */
  model: string;
  /** Messages in the conversation */
  messages: ChatMessage[];
  /** Temperature for sampling (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Stop sequences */
  stop?: string[];
  /** Whether to stream the response */
  stream?: boolean;
  /** Tools available to the model */
  tools?: ToolDefinition[];
  /** Tool choice strategy */
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  /** System message to prepend */
  systemMessage?: string;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Tool definition for function calling
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Streaming chunk from chat completion
 */
export interface ChatStreamChunk {
  type: 'text' | 'tool_call' | 'done' | 'error';
  text?: string;
  toolCall?: {
    id: string;
    name: string;
    arguments: string;
  };
  error?: string;
  /** Usage statistics (only on final chunk) */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Complete chat response
 */
export interface ChatResponse {
  /** Generated message */
  message: ChatMessage;
  /** Finish reason */
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
  /** Usage statistics */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Model used */
  model: string;
}

// =============================================================================
// Embedding Types
// =============================================================================

/**
 * Options for embedding requests
 */
export interface EmbeddingOptions {
  /** Model ID to use */
  model: string;
  /** Input texts to embed */
  input: string | string[];
  /** Dimensions for the embedding (if supported) */
  dimensions?: number;
}

/**
 * Embedding response
 */
export interface EmbeddingResponse {
  /** Embeddings for each input */
  embeddings: number[][];
  /** Model used */
  model: string;
  /** Usage statistics */
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Interface for AI providers
 */
export interface AIProviderInterface {
  /** Provider identifier */
  id: string;
  /** Provider name */
  name: string;
  
  /** Create a chat completion */
  chat(options: ChatOptions): Promise<ChatResponse>;
  
  /** Create a streaming chat completion */
  chatStream(options: ChatOptions): AsyncIterable<ChatStreamChunk>;
  
  /** Create embeddings (if supported) */
  embed?(options: EmbeddingOptions): Promise<EmbeddingResponse>;
  
  /** List available models */
  listModels?(): Promise<ModelDefinitionConfig[]>;
  
  /** Check if the provider is available */
  isAvailable(): Promise<boolean>;
}

// =============================================================================
// Provider Registry Types
// =============================================================================

/**
 * Provider type identifiers
 */
export type ProviderType = 
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'copilot'
  | 'bedrock'
  | 'minimax'
  | 'moonshot'
  | 'qwen'
  | 'deepseek';

/**
 * Provider metadata for UI display
 */
export interface ProviderMeta {
  id: ProviderType;
  name: string;
  description: string;
  icon: string;
  supportsEmbeddings: boolean;
  supportsStreaming: boolean;
  supportsTools: boolean;
  apiKeyPlaceholder?: string;
  docsUrl?: string;
}
