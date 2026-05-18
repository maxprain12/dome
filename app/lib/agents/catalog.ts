/**
 * Tool catalog for Many Agents - maps tool IDs to metadata for UI selection
 */

export interface ToolCatalogEntry {
  id: string;
  label: string;
  description: string;
  group:
    | 'web'
    | 'resources'
    | 'context'
    | 'flashcards'
    | 'studio'
    | 'audio'
    | 'research'
    | 'graph'
    | 'notebook'
    | 'excel'
    | 'documents'
    | 'ppt'
    | 'calendar'
    | 'marketplace'
    | 'entity'
    | 'media'
    | 'system';
}

export const MANY_TOOL_CATALOG: ToolCatalogEntry[] = [
  // Web
  {
    id: 'web_search',
    label: 'Web Search',
    description: 'Search the web using the integrated Playwright browser. Returns titles, URLs, and relevant excerpts in real time.',
    group: 'web',
  },
  {
    id: 'web_fetch',
    label: 'Web Fetch',
    description: 'Download and extract the full content of a specific URL using Playwright. Use to read articles, documentation, product pages, and any web resource in depth.',
    group: 'web',
  },

  {
    id: 'resource_search',
    label: 'Resource Search',
    description: 'Search library resources by keyword using full-text search (FTS5). Supports type filters (note, PDF, video, audio, URL) and returns metadata with content excerpts.',
    group: 'resources',
  },
  {
    id: 'resource_get',
    label: 'Resource Get',
    description: 'Get resource details. For indexed PDFs returns the structure (TOC with node_ids); for notes and other types returns full content. Use resource_get_section for specific sections.',
    group: 'resources',
  },
  {
    id: 'resource_get_section',
    label: 'Resource Get Section',
    description: 'Get the content of a specific section of a PDF or indexed note by node_id. Use after get_document_structure, resource_hybrid_search, or resource_semantic_search.',
    group: 'resources',
  },
  {
    id: 'resource_list',
    label: 'Resource List',
    description: 'List project resources with optional filters by type, folder, and pagination. Returns name, type, size, and dates. Use to browse available materials.',
    group: 'resources',
  },
  {
    id: 'resource_hybrid_search',
    label: 'Hybrid Search',
    description:
      'Unified library search: fuses full-text (FTS), chunk embeddings, and knowledge-graph matches via RRF. Preferred over keyword-only or semantic-only search.',
    group: 'resources',
  },
  {
    id: 'resource_semantic_search',
    label: 'Semantic Search',
    description: 'Search resources by semantic meaning using vector embeddings. Finds conceptually related documents even when exact words differ. Optional if you already use resource_hybrid_search.',
    group: 'resources',
  },
  {
    id: 'resource_create',
    label: 'Resource Create',
    description: 'Create a new library resource: note, notebook, Word document, URL, or folder. Use to save agent output directly to the user\'s library as persistent content.',
    group: 'resources',
  },
  {
    id: 'resource_update',
    label: 'Resource Update',
    description: 'Update the title or content of an existing resource. For notes and Word documents updates the text; for Word also regenerates the .docx binary. Use to enrich or correct existing materials.',
    group: 'resources',
  },
  {
    id: 'resource_delete',
    label: 'Resource Delete',
    description: 'Permanently delete a resource from the library including its file on disk. Use with caution; this action is not reversible from the agent.',
    group: 'resources',
  },
  {
    id: 'resource_move_to_folder',
    label: 'Resource Move',
    description: 'Move a resource to a target folder within the project. Validates that the destination exists and prevents hierarchy cycles. Use to automatically organize generated materials.',
    group: 'resources',
  },

  // Context
  {
    id: 'project_list',
    label: 'Project List',
    description: 'List all user projects with name, description, and dates. Lets the agent understand the available project structure to contextualize work or suggest where to save resources.',
    group: 'context',
  },
  {
    id: 'project_get',
    label: 'Project Get',
    description: 'Get full details of a specific project: name, description, metadata, and configuration. Use to understand the context and purpose of the resource collection the agent is working with.',
    group: 'context',
  },
  {
    id: 'interaction_list',
    label: 'Interaction List',
    description: 'List the annotations, comments, and highlights made by the user on a specific resource. Lets the agent access the user\'s marginal notes and reflections on a document.',
    group: 'context',
  },
  {
    id: 'get_recent_resources',
    label: 'Recent Resources',
    description: 'Return the most recently opened or modified resources in the project. Lets the agent identify what materials the user is currently working with for relevant context.',
    group: 'context',
  },
  {
    id: 'get_current_project',
    label: 'Current Project',
    description: 'Get the currently active project with its ID, name, and description. Recommended first step for any agent that needs to operate within the user\'s project context.',
    group: 'context',
  },
  {
    id: 'resource_get_library_overview',
    label: 'Library Overview',
    description: 'Return the full folder and resource tree of the active project. Shows the complete hierarchical library structure so the agent can navigate and understand knowledge organization.',
    group: 'context',
  },

  // Flashcards
  {
    id: 'flashcard_create',
    label: 'Flashcard Create',
    description: 'Create a flashcard deck with question-answer cards from content. Cards are saved in the library and can be reviewed with Dome\'s spaced-repetition system.',
    group: 'flashcards',
  },

  // Studio
  {
    id: 'generate_mindmap',
    label: 'Generate Mindmap',
    description:
      'Gather resource chunks for the model to build a mind map (e.g. artifact:diagram or nodes/edges). For the embedding-based semantic graph, use generate_knowledge_graph.',
    group: 'studio',
  },
  {
    id: 'generate_quiz',
    label: 'Generate Quiz',
    description: 'Create an interactive quiz with multiple-choice, true/false, or short-answer questions from content. The quiz is saved in the library and can be used for self-assessment or exam prep.',
    group: 'studio',
  },

  // Audio
  {
    id: 'generate_audio_script',
    label: 'Audio Script',
    description: 'Generate a structured script for a podcast or audio overview from a topic or document. The script is optimized for natural narration with intro, body, and conclusion, and is saved as a library resource.',
    group: 'audio',
  },

  // Research
  {
    id: 'deep_research',
    label: 'Deep Research',
    description: 'Launch a multi-step deep investigation on a topic using iterative web search. Performs multiple queries, cross-verifies sources, and produces a comprehensive report with citations. Takes longer but generates high-quality analysis.',
    group: 'research',
  },

  // Graph
  {
    id: 'generate_knowledge_graph',
    label: 'Knowledge Graph',
    description: 'Generate a visual knowledge graph centered on a resource, showing semantic relationships to related documents. Use to map and explore concept networks in the library.',
    group: 'graph',
  },
  {
    id: 'get_related_resources',
    label: 'Related Resources',
    description: 'Return resources related to a given resource based on knowledge graph links. Lets the agent discover thematic connections between documents the user has explicitly or implicitly linked.',
    group: 'graph',
  },
  {
    id: 'link_resources',
    label: 'Link Resources',
    description: 'Create a semantic link between two library resources with a label describing the relationship (e.g. "contradicts", "extends", "cites"). Links enrich the knowledge graph and enable conceptual navigation.',
    group: 'graph',
  },

  // Notebook
  {
    id: 'notebook_get',
    label: 'Notebook Get',
    description: 'Get the full content of a notebook with all cells (code, markdown, output). Lets the agent read and understand the analysis flow documented in a Dome notebook.',
    group: 'notebook',
  },
  {
    id: 'notebook_add_cell',
    label: 'Notebook Add Cell',
    description: 'Add a new cell (code or markdown) to a notebook at a specific position. Lets the agent extend existing analyses, add explanatory notes, or insert new documented code blocks.',
    group: 'notebook',
  },
  {
    id: 'notebook_update_cell',
    label: 'Notebook Update Cell',
    description: 'Update the content of an existing notebook cell. Use to fix code, improve explanations, or update previously saved analysis outputs.',
    group: 'notebook',
  },
  {
    id: 'notebook_delete_cell',
    label: 'Notebook Delete Cell',
    description: 'Delete a notebook cell by its index. Use to clean up notebooks, remove redundant cells, or reorganize the analysis flow.',
    group: 'notebook',
  },

  // Excel
  {
    id: 'excel_get',
    label: 'Excel Get',
    description: 'Read the full content of an Excel file: sheets, ranges, values, and formulas. Returns structured data for the agent to analyze, compute statistics, and identify patterns.',
    group: 'excel',
  },
  {
    id: 'excel_get_file_path',
    label: 'Excel File Path',
    description: 'Get the absolute disk path of an Excel file from the library. Needed when external tools or scripts need to access the file directly.',
    group: 'excel',
  },
  {
    id: 'excel_set_cell',
    label: 'Excel Set Cell',
    description: 'Set the value of a specific Excel cell (e.g. A1, B3). Use to write calculation results, labels, or point updates to existing spreadsheets.',
    group: 'excel',
  },
  {
    id: 'excel_set_range',
    label: 'Excel Set Range',
    description: 'Write a range of values to multiple Excel cells in a single operation. Use to populate full tables, update data series, or efficiently insert analysis results.',
    group: 'excel',
  },
  {
    id: 'excel_add_row',
    label: 'Excel Add Row',
    description: 'Append a new row to the end of an Excel sheet with specified values. Use to log new data entries, activity records, or incremental results in tracking sheets.',
    group: 'excel',
  },
  {
    id: 'excel_add_sheet',
    label: 'Excel Add Sheet',
    description: 'Add a new sheet (tab) to an existing Excel file with the specified name. Use to organize complex analyses across separate sheets within the same file.',
    group: 'excel',
  },
  {
    id: 'excel_create',
    label: 'Excel Create',
    description: 'Create a new Excel file in the library with a defined initial structure: headers, sample data, and basic formatting. The file is saved as a resource available for further editing.',
    group: 'excel',
  },
  {
    id: 'excel_export',
    label: 'Excel Export',
    description: 'Export an Excel file to CSV format or open it in the native system application. Use to share or process data with tools outside Dome.',
    group: 'excel',
  },

  // Word (DOCX)
  {
    id: 'docx_get',
    label: 'DOCX Get',
    description:
      'Read the content of a Word .docx from the library as plain text or HTML (mammoth). Use to summarize, cite, or prepare edits.',
    group: 'documents',
  },
  {
    id: 'docx_get_file_path',
    label: 'DOCX File Path',
    description: 'Return the absolute path of the .docx in Dome\'s internal storage for use by external scripts or tools.',
    group: 'documents',
  },
  {
    id: 'docx_create',
    label: 'DOCX Create',
    description:
      'Create a Word (.docx) document in the library from Markdown/HTML or structured blocks (paragraphs and headings). Use for reports, letters, and memos.',
    group: 'documents',
  },
  {
    id: 'docx_update',
    label: 'DOCX Update',
    description: 'Reemplaza por completo el archivo .docx o renombra el recurso; mismas opciones de contenido que docx_create.',
    group: 'documents',
  },
  {
    id: 'docx_delete',
    label: 'DOCX Delete',
    description: 'Delete a .docx from the library after explicit user confirmation (confirm=true).',
    group: 'documents',
  },

  // PPT
  {
    id: 'ppt_create',
    label: 'PPT Create',
    description: 'Create a PowerPoint (.pptx) presentation with structured slides from a content outline. Supports multiple layouts, images, charts, and visual themes. Saves the file in the library.',
    group: 'ppt',
  },
  {
    id: 'ppt_get_file_path',
    label: 'PPT File Path',
    description: 'Get the absolute disk path of a PowerPoint file from the library. Needed to open the file in the native application or for external processing.',
    group: 'ppt',
  },
  {
    id: 'ppt_get_slides',
    label: 'PPT Get Slides',
    description: 'Read the slide content of an existing presentation: titles, text, presenter notes, and structure. Lets the agent analyze or continue a previously created presentation.',
    group: 'ppt',
  },
  {
    id: 'ppt_export',
    label: 'PPT Export',
    description: 'Export a PowerPoint presentation to PDF or open the file in the native app (Keynote, PowerPoint). Use to share the generated presentation in universal formats.',
    group: 'ppt',
  },

  // Calendar
  {
    id: 'calendar_list',
    label: 'Calendar List',
    description: 'List all available user calendars. Lets the agent know which calendars exist (personal, work, projects) before creating or querying events in the correct calendar.',
    group: 'calendar',
  },
  {
    id: 'calendar_get_upcoming',
    label: 'Calendar Upcoming',
    description: 'Get upcoming calendar events in a date range. Lets the agent check the user\'s schedule to plan tasks, avoid conflicts, and suggest available dates.',
    group: 'calendar',
  },
  {
    id: 'calendar_create_event',
    label: 'Calendar Create Event',
    description: 'Create a new calendar event with title, date, time, duration, description, and reminders. Use to automatically register tasks, deadlines, meetings, and project milestones.',
    group: 'calendar',
  },
  {
    id: 'calendar_update_event',
    label: 'Calendar Update Event',
    description: 'Update an existing calendar event: change title, date, time, or description. Use to adjust scheduling when deadlines or task details change.',
    group: 'calendar',
  },
  {
    id: 'calendar_delete_event',
    label: 'Calendar Delete Event',
    description: 'Delete a calendar event by its ID. Use to clear the schedule when a task is completed, cancelled, or permanently rescheduled.',
    group: 'calendar',
  },

  {
    id: 'marketplace_search',
    label: 'Marketplace Search',
    description:
      'Search for agents and workflows in the bundled catalog and configured GitHub sources. Returns ids for installation via marketplace_install.',
    group: 'marketplace',
  },
  {
    id: 'marketplace_install',
    label: 'Marketplace Install',
    description: 'Install an agent or workflow from the marketplace using the id returned by marketplace_search.',
    group: 'marketplace',
  },
  {
    id: 'browser_get_active_tab',
    label: 'Active browser tab (macOS)',
    description:
      'macOS only: get URL and title of the frontmost browser (Safari, Chrome, Edge…). Use before creating a url resource with resource_create.',
    group: 'media',
  },
  {
    id: 'workflow_create',
    label: 'Create Workflow',
    description: 'Create a workflow on the canvas with valid nodes and edges (text-input, document, image, agent, output).',
    group: 'entity',
  },
  {
    id: 'agent_create',
    label: 'Create Agent',
    description: 'Create a Many agent with instructions and tool_ids. Sub-agents can specialize recurring tasks.',
    group: 'entity',
  },
  {
    id: 'automation_create',
    label: 'Create Automation',
    description: 'Create a native automation (manual, scheduled, or contextual) that runs an agent or workflow.',
    group: 'entity',
  },
  {
    id: 'image_crop',
    label: 'Crop image',
    description: 'Crop an image file on disk and return a data URL to display in chat.',
    group: 'media',
  },
  {
    id: 'image_thumbnail',
    label: 'Image thumbnail',
    description: 'Generate a thumbnail data URL from a local image path.',
    group: 'media',
  },

  // System & Native
  {
    id: 'shell_exec',
    label: 'Shell Exec',
    description: 'Execute a shell command (requires user approval in a Dome modal). Useful for scripts, git, compilation, and CLI tools.',
    group: 'system',
  },
  {
    id: 'file_read',
    label: 'File Read',
    description: 'Read the content of a local file from the filesystem.',
    group: 'system',
  },
  {
    id: 'file_write',
    label: 'File Write',
    description: 'Write or create a file in the local filesystem.',
    group: 'system',
  },
  {
    id: 'file_list',
    label: 'File List',
    description: 'List the contents of a local filesystem directory.',
    group: 'system',
  },
  {
    id: 'file_search',
    label: 'File Search',
    description: 'Search for files by name or content in the local filesystem.',
    group: 'system',
  },
  {
    id: 'excel_get_file_path',
    label: 'Excel File Path',
    description: 'Get the absolute disk path of an Excel file from the library. Needed when external tools or scripts need to access the file directly.',
    group: 'system',
  },
  {
    id: 'docx_get_file_path',
    label: 'DOCX File Path',
    description: 'Return the absolute path of the .docx in Dome\'s internal storage for use by external scripts or tools.',
    group: 'system',
  },
  {
    id: 'ppt_get_file_path',
    label: 'PPT File Path',
    description: 'Get the absolute disk path of a PowerPoint file from the library. Needed to open the file in the native application or for external processing.',
    group: 'system',
  },
  {
    id: 'ui_point_to',
    label: 'UI Point To',
    description: 'Move the UI cursor to an element by CSS selector.',
    group: 'system',
  },
  {
    id: 'ui_click',
    label: 'UI Click',
    description: 'Click a UI element by CSS selector.',
    group: 'system',
  },
  {
    id: 'ui_type',
    label: 'UI Type',
    description: 'Type text into a UI element by CSS selector.',
    group: 'system',
  },
  {
    id: 'ui_scroll',
    label: 'UI Scroll',
    description: 'Scroll the UI in the specified direction.',
    group: 'system',
  },
  {
    id: 'ui_navigate',
    label: 'UI Navigate',
    description: 'Navigate to an app route.',
    group: 'system',
  },
  {
    id: 'ui_get_elements',
    label: 'UI Get Elements',
    description: 'Get UI elements matching a CSS selector.',
    group: 'system',
  },
  {
    id: 'ui_hide_cursor',
    label: 'UI Hide Cursor',
    description: 'Hide the UI cursor.',
    group: 'system',
  },
];

const GROUP_LABELS: Record<ToolCatalogEntry['group'], string> = {
  web: 'Web',
  resources: 'Recursos',
  context: 'Contexto',
  flashcards: 'Flashcards',
  studio: 'Studio',
  audio: 'Audio',
  research: 'Investigación',
  graph: 'Grafo',
  notebook: 'Notebook',
  excel: 'Excel',
  documents: 'Word (DOCX)',
  ppt: 'Slides',
  calendar: 'Calendario',
  marketplace: 'Marketplace',
  entity: 'Entidades',
  media: 'Medios',
  system: 'Sistema & Nativo',
};

/** Order of tool groups in agent + menu (drill-down root). */
export const TOOL_GROUP_ORDER: readonly ToolCatalogEntry['group'][] = [
  'web',
  'resources',
  'context',
  'marketplace',
  'entity',
  'media',
  'flashcards',
  'studio',
  'audio',
  'research',
  'graph',
  'notebook',
  'excel',
  'documents',
  'ppt',
  'calendar',
  'system',
] as const;

export type ToolGroupId = ToolCatalogEntry['group'] | 'other';

/**
 * Partitions enabled agent tool ids by catalog group, in a stable order.
 * Unknown tool ids are grouped under `other` (last).
 */
export function getToolGroupsForAgentMenu(toolIds: string[]): { group: ToolGroupId; ids: string[] }[] {
  const by = new Map<ToolGroupId, string[]>();
  for (const id of toolIds) {
    const entry = getToolById(id);
    const g: ToolGroupId = entry?.group ?? 'other';
    const list = by.get(g) ?? [];
    list.push(id);
    by.set(g, list);
  }
  const out: { group: ToolGroupId; ids: string[] }[] = [];
  for (const g of TOOL_GROUP_ORDER) {
    const ids = by.get(g);
    if (ids && ids.length > 0) {
      out.push({ group: g, ids });
    }
  }
  const other = by.get('other');
  if (other && other.length > 0) {
    out.push({ group: 'other', ids: other });
  }
  return out;
}

export function getToolCatalog() {
  return MANY_TOOL_CATALOG;
}

export function getToolsByGroup() {
  const byGroup = new Map<ToolCatalogEntry['group'], ToolCatalogEntry[]>();
  for (const entry of MANY_TOOL_CATALOG) {
    const list = byGroup.get(entry.group) ?? [];
    list.push(entry);
    byGroup.set(entry.group, list);
  }
  return byGroup;
}

export function getGroupLabel(group: ToolCatalogEntry['group']) {
  return GROUP_LABELS[group];
}

export function getToolById(id: string): ToolCatalogEntry | undefined {
  return MANY_TOOL_CATALOG.find((t) => t.id === id);
}
