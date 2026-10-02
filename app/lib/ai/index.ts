/**
 * AI Module Index
 *
 * Main entry point for the AI system.
 * Re-exports all public APIs.
 */

// =============================================================================
// Core Types
// =============================================================================

export type {
  // API Types
  ModelApi,
  ModelProviderAuthMode,
  ModelCompatConfig,
  ModelCost,
  ModelInputType,
  ModelDefinitionConfig,
  ModelProviderConfig,
  ModelsConfig,

  // Authentication
  AuthProfile,

  // Discovery
  BedrockDiscoveryConfig,
  OllamaDiscoveryConfig,

  // Messages
  MessageRole,
  MessageContent,
  TextContent,
  ImageContent,
  ToolCallContent,
  ToolResultContent,
  ChatMessage,

  // Chat
  ChatOptions,
  ChatResponse,
  ChatStreamChunk,
  ToolDefinition,

  // Provider Interface
  AIProviderInterface,
  ProviderType,
  ProviderMeta,
} from './types';

export { ZERO_COST } from './types';

// =============================================================================
// Models
// =============================================================================

export type {
  ModelDefinition,
  ProviderDefinition,
  AIProviderType,
} from './models';

export {
  // Model arrays
  OPENAI_MODELS,
  ANTHROPIC_MODELS,
  GOOGLE_MODELS,

  // Provider definitions
  PROVIDERS,
  FREE_COST,

  // Helper functions
  getRecommendedModel,
  getProvidersArray,
  getModelsForProvider,
  providerSupportsStreaming,
  providerSupportsTools,
  getDefaultModelId,
  formatContextWindow,
  findModelById,
  modelSupportsVision,
  modelSupportsVideo,
  modelSupportsTools,
  getModelApiType,
} from './models';

// =============================================================================
// Catalogs
// =============================================================================

export {
  // Copilot
  COPILOT_BASE_URL,
  COPILOT_DEFAULT_MODEL_ID,
  COPILOT_MODEL_CATALOG,
  getCopilotModels,
  findCopilotModel,
  getDefaultCopilotModel,
  getCopilotReasoningModels,
  getCopilotVisionModels,
  getDefaultCopilotModelIds,

  // Aggregate
  getAllCatalogModels,
  getAllFreeModels,
  getAllPrivacyModels,
  findCatalogModel,
} from './catalogs';

// =============================================================================
// Tools
// =============================================================================

export {
  // Tool creation
  createWebFetchTool,
  createDefaultTools,
  createAllMartinTools,
  createCustomAgentTools,
  createManyToolsForContext,
  createToolsForAgent,
  createToolRegistry,

  // Schema helpers
  stringEnum,
  optionalStringEnum,
  requiredString,
  optionalString,
  optionalNumber,
  optionalBoolean,
  optionalStringArray,
  normalizeSchema,
  toOpenAISchema,
  toAnthropicSchema,
  toGeminiSchema,

  // Common utilities
  readStringParam,
  readNumberParam,
  readBooleanParam,
  jsonResult,
  textResult,
  errorResult,
  successResult,

  // Adapter functions
  normalizeToolName,
  toOpenAIToolDefinitions,
  toAnthropicToolDefinitions,
  toGeminiToolDefinitions,
  executeToolCall,
  executeToolCalls,
  filterToolsByPolicy,
} from './tools';

export type {
  // Tool types
  AgentTool,
  AnyAgentTool,
  AgentToolResult,
  ToolUpdate,
  ToolUpdateCallback,
  ToolCall,
  ToolCallResult,
  ToolRegistry,
  ToolPolicy,
  ToolExecutionContext,

  // API-specific definitions
  OpenAIToolDefinition,
  AnthropicToolDefinition,
  GeminiToolDefinition,

  // Config types
  WebFetchConfig,
  DefaultToolsConfig,
  ToolRegistryInstance,
} from './tools';

// =============================================================================
// Discovery
// =============================================================================

export {
  discoverProviders,
  getAvailableProviders,
  isProviderAvailable,
  getBestAvailableProvider,
  buildProviderConfig,
} from './discovery';

export type {
  DiscoveredProvider,
  DiscoveryResult,
} from './discovery';

// =============================================================================
// Client
// =============================================================================

export {
  // Configuration
  getAIConfig,
  saveAIConfig,
  getCustomModelsByProvider,
  saveCustomModelsByProvider,
  appendCustomModelId,
  saveChatModelForProvider,

  // Chat functions
  checkChatProviderReady,
  chat,
  chatStream,
  chatWithTools,
  chatWithToolsStream,
  chatWithOpenAI,
  chatWithClaude,
  chatWithGemini,
  chatWithMiniMax,
  chatWithOpenRouter,
  streamOpenAI,
  streamClaude,
  streamGemini,
  streamMiniMax,
  streamOpenRouter,
  fetchOpenRouterModels,
  fetchProviderModels,

  // Utilities
  chunkText,
} from './client';

export {
  getVisibleModelIds,
  getVisibleModelsByProvider,
  saveVisibleModelsByProvider,
  setVisibleModelIds,
  getDefaultVisibleModelIds,
  filterModelsByVisibleIds,
  isVisibleModelsConfigurable,
  resolveVisibleModelAfterSave,
  addCustomModelToProvider,
  VISIBLE_MODELS_CONFIGURABLE_PROVIDERS,
  DEFAULT_VISIBLE_MODEL_IDS,
} from './visible-models';

export { openAIProviderSettings } from './open-provider-settings';
export type { OpenAIProviderSettingsDetail } from './open-provider-settings';

export type { AIConfig, AIProvider, ChatProviderReadyResult, CustomModelsByProvider } from './client';
export type { VisibleModelsByProvider } from './visible-models';
