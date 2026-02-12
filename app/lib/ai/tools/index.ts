/**
 * AI Tools Index
 * 
 * Re-exports all tool-related modules.
 */

// Types
export type {
  AgentTool,
  AnyAgentTool,
  AgentToolResult,
  ToolResultContent,
  ToolResultTextContent,
  ToolResultImageContent,
  ToolResultJsonContent,
  ToolUpdate,
  ToolProgressUpdate,
  ToolPartialUpdate,
  ToolUpdateCallback,
  ToolExecuteFunction,
  OpenAIToolDefinition,
  AnthropicToolDefinition,
  GeminiToolDefinition,
  ToolCall,
  ToolCallResult,
  ToolRegistry,
  ToolPolicy,
  ResolvedToolPolicy,
  ToolExecutionContext,
} from './types';

// Schema helpers
export {
  stringEnum,
  optionalStringEnum,
  requiredString,
  optionalString,
  optionalNumber,
  optionalInteger,
  optionalBoolean,
  optionalStringArray,
  normalizeSchema,
  toOpenAISchema,
  toAnthropicSchema,
  toGeminiSchema,
  FilePathSchema,
  UrlSchema,
  QuerySchema,
  CountSchema,
  TimeoutSchema,
  matchesSchema,
  getRequiredProperties,
  getPropertyNames,
  isPropertyRequired,
} from './schema';

// Common utilities
export {
  readStringParam,
  readStringOrNumberParam,
  readNumberParam,
  readBooleanParam,
  readStringArrayParam,
  jsonResult,
  textResult,
  errorResult,
  imageResult,
  successResult,
  createActionGate,
  readCache,
  writeCache,
  normalizeCacheKey,
  withTimeout,
  resolveTimeoutSeconds,
  resolveCacheTtlMs,
  readResponseText,
  type StringParamOptions,
  type CacheEntry,
  type ActionGate,
} from './common';

// Adapter
export {
  normalizeToolName,
  toOpenAIToolDefinition,
  toOpenAIToolDefinitions,
  toAnthropicToolDefinition,
  toAnthropicToolDefinitions,
  toGeminiToolDefinition,
  toGeminiToolDefinitions,
  toGenericToolDefinition,
  toGenericToolDefinitions,
  executeToolCall,
  executeToolCalls,
  filterToolsByAllow,
  filterToolsByDeny,
  filterToolsByPolicy,
  createToolRegistry,
  type GenericToolDefinition,
  type ToolRegistryInstance,
} from './adapter';

// Tools - Web
export { createWebSearchTool, type WebSearchConfig } from './web-search';
export { createWebFetchTool, type WebFetchConfig } from './web-fetch';

// Tools - Memory
export {
  createMemorySearchTool,
  createMemoryGetTool,
  createMemorySearchStub,
  createMemoryGetStub,
  createMemorySearchWithIPC,
  createMemoryGetWithIPC,
  createMemoryTools,
  type MemorySearchConfig,
  type MemorySearchResult,
  type MemoryGetConfig,
  type MemoryDocument,
} from './memory';

// Tools - Resources (Read)
export {
  createResourceSearchTool,
  createResourceGetTool,
  createResourceListTool,
  createResourceSemanticSearchTool,
  createResourceTools,
} from './resources';

// Tools - Resources (Write)
export {
  createResourceCreateTool,
  createResourceUpdateTool,
  createResourceDeleteTool,
  createResourceActionTools,
} from './resource-actions';

// Tools - Flashcards
export {
  createFlashcardCreateTool,
  createFlashcardTools,
} from './flashcards';

// Tools - Context
export {
  createProjectListTool,
  createProjectGetTool,
  createInteractionListTool,
  createGetRecentResourcesTool,
  createGetCurrentProjectTool,
  createContextTools,
} from './context';

// Tools - Studio Outputs
export {
  createGenerateMindmapTool,
  createGenerateQuizTool,
  createStudioTools,
} from './studio-outputs';

// Tools - Audio Overview
export {
  createGenerateAudioScriptTool,
  createAudioOverviewTools,
} from './audio-overview';

// Tools - Deep Research
export {
  createDeepResearchTool,
  createDeepResearchTools,
} from './deep-research';

// Tools - Graph
export {
  createGraphTools,
} from './graph-tools';

// Tools - Notebook
export {
  createNotebookGetTool,
  createNotebookAddCellTool,
  createNotebookUpdateCellTool,
  createNotebookDeleteCellTool,
  createNotebookTools,
} from './notebook-tools';

// =============================================================================
// Default Tools
// =============================================================================

import type { AnyAgentTool } from './types';
import { createWebSearchTool, type WebSearchConfig } from './web-search';
import { createWebFetchTool, type WebFetchConfig } from './web-fetch';
import { createMemoryTools } from './memory';
import { createResourceTools } from './resources';
import { createResourceActionTools } from './resource-actions';
import { createFlashcardTools } from './flashcards';
import { createContextTools } from './context';
import { createStudioTools } from './studio-outputs';
import { createAudioOverviewTools } from './audio-overview';
import { createDeepResearchTools } from './deep-research';
import { createGraphTools } from './graph-tools';
import { createNotebookTools } from './notebook-tools';

/**
 * Configuration for creating default tools
 */
export interface DefaultToolsConfig {
  webSearch?: WebSearchConfig;
  webFetch?: WebFetchConfig;
  /** Whether to include memory tools */
  includeMemory?: boolean;
  /** Whether to include resource tools */
  includeResources?: boolean;
  /** Whether to include context tools */
  includeContext?: boolean;
}

/**
 * Create the default set of tools (web search and fetch only).
 */
export function createDefaultTools(config?: DefaultToolsConfig): AnyAgentTool[] {
  const tools: AnyAgentTool[] = [
    createWebSearchTool(config?.webSearch),
    createWebFetchTool(config?.webFetch),
  ];

  if (config?.includeMemory !== false) {
    tools.push(...createMemoryTools());
  }

  return tools;
}

/**
 * Create all available tools for the Many agent.
 * This includes web, memory, resource, and context tools.
 */
export function createAllMartinTools(config?: DefaultToolsConfig): AnyAgentTool[] {
  const tools: AnyAgentTool[] = [];

  // Web tools
  tools.push(createWebSearchTool(config?.webSearch));
  tools.push(createWebFetchTool(config?.webFetch));

  // Memory tools (use IPC if in Electron)
  if (config?.includeMemory !== false) {
    tools.push(...createMemoryTools());
  }

  // Resource tools (read + write)
  if (config?.includeResources !== false) {
    tools.push(...createResourceTools());
    tools.push(...createResourceActionTools());
    tools.push(...createFlashcardTools());
  }

  // Context tools
  if (config?.includeContext !== false) {
    tools.push(...createContextTools());
  }

  // Studio output tools (mind map, quiz)
  tools.push(...createStudioTools());

  // Audio overview tools (podcast script generation)
  tools.push(...createAudioOverviewTools());

  // Deep research tools
  tools.push(...createDeepResearchTools());

  // Graph tools (knowledge graph, related resources, links)
  tools.push(...createGraphTools());

  // Notebook tools (read/modify notebook cells)
  tools.push(...createNotebookTools());

  return tools;
}

/**
 * Create only resource-related tools.
 * Useful when you only need to search/access resources without web search.
 */
export function createResourceOnlyTools(): AnyAgentTool[] {
  return [
    ...createResourceTools(),
    ...createContextTools(),
    ...createMemoryTools(),
  ];
}
