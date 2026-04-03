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

// LangChain adapter (for LangGraph integration)
export {
  toLangChainTools,
  toLangChainToolsFromOpenAIDefinitions,
  type StructuredToolInterface,
} from './langchain-adapter';

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
export { createBrowserActiveTabTool } from './browser-active-tab';
export { createImageCropTool, type ImageCropConfig } from './image-crop';
export { createImageThumbnailTool, type ImageThumbnailConfig } from './image-thumbnail';

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
  createImportFileToDomeTool,
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

// Tools - Excel
export {
  createExcelGetTool,
  createExcelSetCellTool,
  createExcelSetRangeTool,
  createExcelAddRowTool,
  createExcelAddSheetTool,
  createExcelCreateTool,
  createExcelExportTool,
  createExcelTools,
} from './excel-tools';

// Tools - Memory
export {
  createMemorySearchTool,
  createMemoryGetTool,
  createMemorySearchStub,
  createMemoryGetStub,
  createMemoryTools,
} from './memory';

// Tools - PPT
export {
  createPptCreateTool,
  createPptGetFilePathTool,
  createPptGetSlidesTool,
  createPptExportTool,
  createPptGetSlideImagesTool,
  createPptTools,
} from './ppt-tools';

// Tools - PDF Annotations
export {
  createPdfAnnotationCreateTool,
  createPdfAnnotationTools,
} from './pdf-annotation-tools';

// Tools - PDF Extraction
export {
  createPdfExtractTextTool,
  createPdfGetMetadataTool,
  createPdfGetStructureTool,
  createPdfSummarizeTool,
  createPdfExtractTablesTool,
  createPdfExtractionTools,
} from './pdf-extraction-tools';

// Tools - Calendar
export {
  createCalendarCreateTool,
  createCalendarUpdateTool,
  createCalendarDeleteTool,
  createCalendarListTool,
  createCalendarTools,
} from './calendar-tools';

// Tools - Entity Creation (agents, automations)
export {
  createAgentCreateTool,
  createWorkflowCreateTool,
  createAutomationCreateTool,
  createEntityTools,
} from './entity-tools';

// Tools - Marketplace (search and install)
export {
  createMarketplaceSearchTool,
  createMarketplaceInstallTool,
  createMarketplaceTools,
} from './marketplace-tools';

// Tools - Docling (visual artifacts from converted documents)
export {
  createDoclingListImagesTool,
  createDoclingShowImageTool,
  createDoclingShowPageImagesTool,
  createDoclingTools,
} from './docling-tools';

// =============================================================================
// Default Tools
// =============================================================================

import type { AnyAgentTool } from './types';
import { createWebSearchTool, type WebSearchConfig } from './web-search';
import { createWebFetchTool, type WebFetchConfig } from './web-fetch';
import { createBrowserActiveTabTool } from './browser-active-tab';
import { createImageCropTool, type ImageCropConfig } from './image-crop';
import { createImageThumbnailTool, type ImageThumbnailConfig } from './image-thumbnail';
import { createResourceTools } from './resources';
import { createResourceActionTools } from './resource-actions';
import { createFlashcardTools } from './flashcards';
import { createContextTools } from './context';
import { createStudioTools } from './studio-outputs';
import { createAudioOverviewTools } from './audio-overview';
import { createDeepResearchTools } from './deep-research';
import { createGraphTools } from './graph-tools';
import { createNotebookTools } from './notebook-tools';
import { createExcelTools } from './excel-tools';
import { createPptTools } from './ppt-tools';
import { createPdfAnnotationTools } from './pdf-annotation-tools';
import { createCalendarTools } from './calendar-tools';
import { createEntityTools } from './entity-tools';
import { createMarketplaceTools } from './marketplace-tools';
import { createDoclingTools } from './docling-tools';

/**
 * Configuration for creating default tools
 */
export interface DefaultToolsConfig {
  webSearch?: WebSearchConfig;
  webFetch?: WebFetchConfig;
  imageCrop?: ImageCropConfig;
  imageThumbnail?: ImageThumbnailConfig;
  /** Whether to include web tools */
  includeWeb?: boolean;
  /** Whether to include image processing tools */
  includeImages?: boolean;
  /** Whether to include resource tools */
  includeResources?: boolean;
  /** Whether to include context tools */
  includeContext?: boolean;
}

/**
 * Create the default set of tools (web search and fetch only).
 */
export function createDefaultTools(config?: DefaultToolsConfig): AnyAgentTool[] {
  const tools: AnyAgentTool[] = [];

  if (config?.includeWeb !== false) {
    tools.push(createWebSearchTool(config?.webSearch));
    tools.push(createWebFetchTool(config?.webFetch));
  }

  return tools;
}

/**
 * Create all available tools for the Many agent.
 * This includes web, resource, and context tools.
 */
export function createAllMartinTools(config?: DefaultToolsConfig): AnyAgentTool[] {
  const tools: AnyAgentTool[] = [];

  // Web tools
  if (config?.includeWeb !== false) {
    tools.push(createWebSearchTool(config?.webSearch));
    tools.push(createWebFetchTool(config?.webFetch));
  }

  // Image processing tools
  if (config?.includeImages !== false) {
    tools.push(createImageCropTool(config?.imageCrop));
    tools.push(createImageThumbnailTool(config?.imageThumbnail));
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

  // Excel tools (read/modify Excel resources)
  tools.push(...createExcelTools());

  // PPT tools (create/read PowerPoint presentations)
  tools.push(...createPptTools());

  // PDF annotation tools (create notes in PDFs)
  tools.push(...createPdfAnnotationTools());

  // Calendar tools (create, update, delete, list events)
  tools.push(...createCalendarTools());

  // Entity creation tools (create agents, workflows, automations)
  tools.push(...createEntityTools());

  // Marketplace tools (search and install)
  tools.push(...createMarketplaceTools());

  // Docling tools (visual artifacts from converted documents)
  tools.push(...createDoclingTools());

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
  ];
}

/**
 * Create Many tools filtered by context. Reduces token usage by excluding
 * tools irrelevant to the current screen (e.g. notebook tools when not in a notebook).
 */
export function createManyToolsForContext(
  pathname: string,
  config?: DefaultToolsConfig,
): AnyAgentTool[] {
  const isNotebook = pathname?.includes('/workspace/notebook/');
  const isHome = pathname === '/' || pathname === '/home';

  const tools: AnyAgentTool[] = [];
  if (config?.includeWeb !== false) {
    tools.push(createWebSearchTool(config?.webSearch));
    tools.push(createWebFetchTool(config?.webFetch));
    if (typeof window !== 'undefined' && window.electron?.isMac) {
      tools.push(createBrowserActiveTabTool());
    }
  }
  if (config?.includeImages !== false) {
    tools.push(createImageCropTool(config?.imageCrop));
    tools.push(createImageThumbnailTool(config?.imageThumbnail));
  }
  if (config?.includeResources !== false) {
    tools.push(...createResourceTools());
    tools.push(...createResourceActionTools());
    tools.push(...createFlashcardTools());
  }
  if (config?.includeContext !== false) {
    tools.push(...createContextTools());
  }

  // Notebook tools only when viewing a notebook (saves tokens elsewhere)
  if (isNotebook) {
    tools.push(...createNotebookTools());
  }

  // Excel tools (always include - useful when user has spreadsheets)
  tools.push(...createExcelTools());

  // PPT tools (always include - useful when user has presentations or asks to create them)
  tools.push(...createPptTools());

  // PDF annotation tools: useful in Home or when viewing workspace (PDF)
  const isWorkspace = pathname?.includes('/workspace');
  if (isHome || isWorkspace || isNotebook) {
    tools.push(...createPdfAnnotationTools());
  }

  // Calendar tools: useful in Home or when user asks about schedule
  tools.push(...createCalendarTools());

  // Studio, audio, deep research, graph: useful in Home/library context
  if (isHome || isNotebook) {
    tools.push(...createStudioTools());
    tools.push(...createAudioOverviewTools());
    tools.push(...createDeepResearchTools());
    tools.push(...createGraphTools());
  }

  // Entity creation tools (agents, workflows, automations): useful when user asks to create
  tools.push(...createEntityTools());

  // Marketplace tools: useful when user asks about marketplace agents/workflows
  tools.push(...createMarketplaceTools());

  // Docling tools: available whenever viewing a workspace or home (gracefully handles docs without images)
  if (isWorkspace || isHome) {
    tools.push(...createDoclingTools());
  }

  return tools;
}


/**
 * Create tools filtered by a list of tool IDs (for specialized Many agents).
 * Uses createAllMartinTools and filters by normalized name.
 */
export function createToolsForAgent(
  toolIds: string[],
  config?: DefaultToolsConfig,
): AnyAgentTool[] {
  if (toolIds.length === 0) return [];
  const idSet = new Set(toolIds.map((id) => id.toLowerCase().replace(/[^a-z0-9_]/g, '_')));
  const all = createAllMartinTools(config);
  return all.filter((t) => idSet.has((t.name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_')));
}
