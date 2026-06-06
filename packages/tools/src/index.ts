// @dome/tools public API
// Agent tool registry: definitions (schema) are renderer-safe; execution is
// main-process only (bridged via the injected dispatcher). The registry path
// is Node-only — the renderer may import the pure definition factories + the
// family taxonomy (no Node deps), never `execute`.
//
// Phase 3: the registry (`createToolRegistry`) is the canonical home for the
// definitions → AgentTool bridge the runtime selector consumes. Tool
// DEFINITIONS move here family-by-family (`families/*`), starting with
// `resources`.

export type {
  AgentTool,
  AgentToolResult,
  AgentToolUpdateCallback,
  ToolContext,
  ToolDefinition,
  ToolOps,
  ToolSchema,
} from './types.js';

export { createToolRegistry, createToolFromDefinition, toolDefName } from './registry.js';

export { TOOL_FAMILIES, TOOL_COUNT, familyOf, toolsInFamily } from './families.js';
export type { ToolFamily } from './families.js';

export { RESOURCE_TOOL_NAMES, resourceToolDefinitions } from './families/resources.js';
export type { ResourceToolName } from './families/resources.js';

export { WEB_TOOL_NAMES, webToolDefinitions } from './families/web.js';
export type { WebToolName } from './families/web.js';

export { PROJECTS_TOOL_NAMES, projectsToolDefinitions } from './families/projects.js';
export type { ProjectsToolName } from './families/projects.js';

export { MEMORY_TOOL_NAMES, memoryToolDefinitions } from './families/memory.js';
export type { MemoryToolName } from './families/memory.js';

export { CALENDAR_TOOL_NAMES, calendarToolDefinitions } from './families/calendar.js';
export type { CalendarToolName } from './families/calendar.js';

export { ARTIFACTS_TOOL_NAMES, artifactsToolDefinitions } from './families/artifacts.js';
export type { ArtifactsToolName } from './families/artifacts.js';

export { FEEDERS_TOOL_NAMES, feedersToolDefinitions } from './families/feeders.js';
export type { FeedersToolName } from './families/feeders.js';

export { FLASHCARDS_TOOL_NAMES, flashcardsToolDefinitions } from './families/flashcards.js';
export type { FlashcardsToolName } from './families/flashcards.js';

export { NOTEBOOK_TOOL_NAMES, notebookToolDefinitions } from './families/notebook.js';
export type { NotebookToolName } from './families/notebook.js';

export {
  OFFICE_TOOL_NAMES,
  officeToolDefinitions,
  EXCEL_TOOL_NAMES,
  excelToolDefinitions,
  DOCX_TOOL_NAMES,
  docxToolDefinitions,
  PPT_TOOL_NAMES,
  pptToolDefinitions,
} from './families/office.js';
export type { OfficeToolName, ExcelToolName, DocxToolName, PptToolName } from './families/office.js';

export { VISION_TOOL_NAMES, visionToolDefinitions } from './families/vision.js';
export type { VisionToolName } from './families/vision.js';

export { DOCS_TOOL_NAMES, docsToolDefinitions } from './families/docs.js';
export type { DocsToolName } from './families/docs.js';

export { ENTITIES_TOOL_NAMES, entitiesToolDefinitions } from './families/entities.js';
export type { EntitiesToolName } from './families/entities.js';

export { MARKETPLACE_TOOL_NAMES, marketplaceToolDefinitions } from './families/marketplace.js';
export type { MarketplaceToolName } from './families/marketplace.js';

export { BROWSER_TOOL_NAMES, browserToolDefinitions } from './families/browser.js';
export type { BrowserToolName } from './families/browser.js';

export { IMAGE_TOOL_NAMES, imageToolDefinitions } from './families/image.js';
export type { ImageToolName } from './families/image.js';

export { FILE_TOOL_NAMES, fileToolDefinitions } from './families/file.js';
export type { FileToolName } from './families/file.js';

export { SHELL_TOOL_NAMES, shellToolDefinitions } from './families/shell.js';
export type { ShellToolName } from './families/shell.js';

export { STUDIO_TOOL_NAMES, studioToolDefinitions } from './families/studio.js';
export type { StudioToolName } from './families/studio.js';

export { UI_TOOL_NAMES, uiToolDefinitions } from './families/ui.js';
export type { UiToolName } from './families/ui.js';
