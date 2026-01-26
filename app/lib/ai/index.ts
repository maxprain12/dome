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
  EmbeddingOptions,
  EmbeddingResponse,
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
  EmbeddingModelDefinition,
  ProviderDefinition,
  AIProviderType,
} from './models';

export {
  // Model arrays
  OPENAI_MODELS,
  OPENAI_EMBEDDING_MODELS,
  ANTHROPIC_MODELS,
  GOOGLE_MODELS,
  GOOGLE_EMBEDDING_MODELS,
  
  // Provider definitions
  PROVIDERS,
  FREE_COST,
  
  // Helper functions
  getRecommendedModel,
  getRecommendedEmbeddingModel,
  getProvidersArray,
  getModelsForProvider,
  getEmbeddingModelsForProvider,
  providerSupportsEmbeddings,
  providerSupportsStreaming,
  providerSupportsTools,
  getDefaultModelId,
  getDefaultEmbeddingModelId,
  formatContextWindow,
  findModelById,
  modelSupportsVision,
  modelSupportsTools,
  getModelApiType,
} from './models';

// =============================================================================
// Catalogs
// =============================================================================

export {
  // Synthetic
  SYNTHETIC_BASE_URL,
  SYNTHETIC_DEFAULT_MODEL_ID,
  SYNTHETIC_MODEL_CATALOG,
  getSyntheticModels,
  findSyntheticModel,
  getDefaultSyntheticModel,
  getSyntheticReasoningModels,
  getSyntheticVisionModels,
  
  // Venice
  VENICE_BASE_URL,
  VENICE_DEFAULT_MODEL_ID,
  VENICE_MODEL_CATALOG,
  getVeniceModels,
  findVeniceModel,
  getDefaultVeniceModel,
  getVenicePrivateModels,
  getVeniceAnonymizedModels,
  getVeniceReasoningModels,
  getVeniceVisionModels,
  discoverVeniceModels,
  
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

export type { VenicePrivacyMode } from './catalogs';

// =============================================================================
// Providers
// =============================================================================

export {
  SyntheticProvider,
  createSyntheticProvider,
  createProvider,
  hasNativeProvider,
} from './providers';

export type {
  SyntheticProviderConfig,
  ProviderFactoryConfig,
} from './providers';

// =============================================================================
// Tools
// =============================================================================

export {
  // Tool creation
  createWebSearchTool,
  createWebFetchTool,
  createMemorySearchTool,
  createMemoryGetTool,
  createMemorySearchStub,
  createMemoryGetStub,
  createDefaultTools,
  createAllMartinTools,
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
  WebSearchConfig,
  WebFetchConfig,
  MemorySearchConfig,
  MemorySearchResult,
  MemoryGetConfig,
  MemoryDocument,
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
  
  // Chat functions
  chat,
  chatStream,
  chatWithTools,
  chatWithOpenAI,
  chatWithClaude,
  chatWithGemini,
  streamOpenAI,
  streamClaude,
  streamGemini,
  
  // Embeddings
  generateEmbeddings,
  generateEmbeddingsOpenAI,
  generateEmbeddingsGoogle,
  
  // Utilities
  chunkText,
  getMartinSystemPrompt,
} from './client';

export type { AIConfig, AIProvider } from './client';
