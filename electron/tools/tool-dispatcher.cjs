/* eslint-disable no-console */
/**
 * Tool Dispatcher - Main Process
 *
 * Canonical registry and dispatcher for Dome tools in the main process.
 * Exposes:
 *   - TOOL_HANDLER_MAP / normalizeToolName: map of tool name → aiToolsHandler method
 *   - executeToolInMain(name, args, ctx): single entry point to run a tool call
 *   - getAllToolDefinitions / getToolDefinitionsByIds / getToolDefsBySubagent:
 *     OpenAI-format definitions consumed by the agent runtime (renderer chat,
 *     workflows, automations) and built into `@dome/tools` registries.
 *
 * There is no chat loop here. The agent loop lives in `@dome/agent-core`,
 * driven by electron/agents/agent-runtime.cjs.
 */

const database = require('../core/database.cjs');
const logger = require('../core/logger.cjs');
const { DOME_LOAD_DOC_DESCRIPTION, DOME_LOAD_DOC_IDS } = require('../prompts/prompt-sections.cjs');

const DEFAULT_TOOL_TIMEOUT_MS = Number(process.env.DOME_TOOL_TIMEOUT_MS) || 120_000;
const TOOL_TIMEOUT_OVERRIDES = {
  transcribe_audio: 600_000,
  notebook_run_cell: 300_000,
  ppt_create: 300_000,
  shell_exec: 120_000,
  web_fetch: 90_000,
  resource_index: 180_000,
  semantic_index_resource: 180_000,
};

function getToolTimeoutMs(toolName) {
  const normalized = String(toolName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  return TOOL_TIMEOUT_OVERRIDES[normalized] ?? DEFAULT_TOOL_TIMEOUT_MS;
}

// Lazy-load ai-tools-handler to break the circular dependency:
// ai-tools-handler → pdf-transcription → cloud-llm.service → llm-service
//   → tool-dispatcher → ai-tools-handler (circular, returns {})
// By deferring the require to call time, the module is fully initialized.
let _aiToolsHandler = null;
function getAiToolsHandler() {
  if (!_aiToolsHandler) _aiToolsHandler = require('./ai-tools-handler.cjs');
  return _aiToolsHandler;
}

/**
 * Tool name (normalized) to aiToolsHandler method mapping
 */
const TOOL_HANDLER_MAP = {
  dome_load_doc: 'domeLoadDoc',
  resource_search: 'resourceSearch',
  resource_get: 'resourceGet',
  resource_get_active: 'resourceGetActive',
  resource_get_pinned: 'resourceGetPinned',
  resource_get_section: 'resourceGetSection',
  resource_list: 'resourceList',
  resource_semantic_search: 'resourceSemanticSearch',
  resource_hybrid_search: 'resourceHybridSearch',
  get_document_structure: 'getDocumentStructure',
  project_list: 'projectList',
  project_get: 'projectGet',
  get_recent_resources: 'getRecentResources',
  get_current_project: 'getCurrentProject',
  get_library_overview: 'getLibraryOverview',
  resource_get_library_overview: 'getLibraryOverview',
  resource_create: 'resourceCreate',
  resource_update: 'resourceUpdate',
  resource_delete: 'resourceDelete',
  resource_move_to_folder: 'resourceMoveToFolder',
  flashcard_create: 'flashcardCreate',
  web_fetch: 'webFetch',
  web_search: 'webSearch',
  deep_research: 'deepResearch',
  excel_get: 'excelGet',
  excel_get_file_path: 'excelGetFilePath',
  excel_set_cell: 'excelSetCell',
  notebook_get: 'notebookGet',
  notebook_add_cell: 'notebookAddCell',
  notebook_update_cell: 'notebookUpdateCell',
  notebook_delete_cell: 'notebookDeleteCell',
  excel_set_range: 'excelSetRange',
  excel_add_row: 'excelAddRow',
  excel_add_sheet: 'excelAddSheet',
  excel_create: 'excelCreate',
  excel_export: 'excelExport',
  docx_get: 'docxGet',
  docx_get_file_path: 'docxGetFilePath',
  docx_create: 'docxCreate',
  docx_update: 'docxUpdate',
  docx_delete: 'docxDelete',
  ppt_create: 'pptCreate',
  ppt_get_file_path: 'pptGetFilePath',
  ppt_get_slides: 'pptGetSlides',
  ppt_get_slide_images: 'pptGetSlideImages',
  ppt_export: 'pptExport',
  remember_fact: 'rememberFact',
  // Graph / linking tools
  link_resources: 'linkResources',
  get_related_resources: 'getRelatedResources',
  interaction_list: 'interactionList',
  generate_knowledge_graph: 'generateKnowledgeGraph',
  generate_mindmap: 'gatherStudioMindmapContext',
  generate_quiz: 'gatherStudioQuizContext',
  generate_guide: 'gatherStudioGuideContext',
  generate_faq: 'gatherStudioFaqContext',
  generate_timeline: 'gatherStudioTimelineContext',
  generate_table: 'gatherStudioTableContext',

  // Calendar tools
  calendar_list_events: 'calendarListEvents',
  calendar_get_upcoming: 'calendarGetUpcoming',
  calendar_create_event: 'calendarCreateEvent',
  calendar_update_event: 'calendarUpdateEvent',
  calendar_delete_event: 'calendarDeleteEvent',
  get_tool_definition: 'getToolDefinition',

  // Email (himalaya IMAP/SMTP)
  email_list_folders: 'emailListFolders',
  email_list: 'emailListEnvelopes',
  email_search: 'emailSearchEnvelopes',
  email_read: 'emailReadMessage',
  email_send: 'emailSendMessage',
  email_reply: 'emailReplyMessage',

  // GitHub project sync tools (Seguimiento)
  github_list_repos: 'githubListRepos',
  github_upcoming_milestones: 'githubUpcomingMilestones',
  github_list_milestones: 'githubListMilestones',
  github_list_issues: 'githubListIssues',
  github_create_issue: 'githubCreateIssue',
  github_update_issue: 'githubUpdateIssue',
  github_sync: 'githubSync',

  // Entity creation
  agent_create: 'agentCreate',
  automation_create: 'automationCreate',
  workflow_create: 'workflowCreate',

  marketplace_search: 'marketplaceSearch',
  marketplace_install: 'marketplaceInstall',
  browser_get_active_tab: 'browserGetActiveTabTool',
  image_crop: 'imageCropTool',
  image_thumbnail: 'imageThumbnailTool',

  pdf_render_page: 'pdfRenderPage',

  image_describe: 'gemmaImageDescribe',
  screen_understand: 'gemmaScreenUnderstand',

  // Native file & shell tools
  file_read: 'fileRead',
  skill_read: 'skillRead',
  file_write: 'fileWrite',
  file_list: 'fileList',
  file_tree: 'fileTree',
  file_search: 'fileSearch',
  shell_exec: 'shellExec',

  // Persisted chat artifacts (iframe mini-apps; same contract as artifact-tools.ts)
  artifact_create: 'artifactCreate',
  artifact_get: 'artifactGet',
  artifact_merge_data: 'artifactMergeData',
  artifact_update_state: 'artifactUpdateState',
  artifact_list: 'artifactList',
  artifact_delete: 'artifactDelete',
  artifact_link_resource: 'artifactLinkResource',
  artifact_design: 'artifactDesign',

  feeder_create: 'feederCreate',
  feeder_list: 'feederList',
  feeder_run: 'feederRun',
  feeder_update_script: 'feederUpdateScript',
  feeder_delete: 'feederDelete',
  feeder_history: 'feederHistory',
  feeder_secret_request: 'feederSecretRequest',

  // UI interaction tools (dispatch to renderer via IPC broadcast)
  ui_point_to: 'uiPointTo',
  ui_click: 'uiClick',
  ui_type: 'uiType',
  ui_scroll: 'uiScroll',
  ui_navigate: 'uiNavigate',
  ui_get_elements: 'uiGetElements',
  ui_hide_cursor: 'uiHideCursor',
};

const TOOL_NAME_ALIASES = {
  read_file: 'file_read',
  write_file: 'file_write',
  list_directory: 'file_list',
  list_dir: 'file_list',
  dome_ui_type: 'ui_type',
  dome_ui_click: 'ui_click',
  dome_ui_point_to: 'ui_point_to',
  dome_ui_scroll: 'ui_scroll',
  dome_ui_navigate: 'ui_navigate',
  dome_ui_get_elements: 'ui_get_elements',
  dome_ui_hide_cursor: 'ui_hide_cursor',
};

function normalizeToolName(name) {
  const normalized = (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return TOOL_NAME_ALIASES[normalized] || normalized;
}

/**
 * Execute a single tool call in main process
 * @param {string} toolName - Normalized tool name
 * @param {object} args - Tool arguments (parsed from JSON)
 * @param {{ automationProjectId?: string | null } | null | undefined} [toolContext] - When set, resource tools are scoped to this project (automation / workflow runs).
 * @returns {Promise<object>} Result suitable for appending to conversation
 */
async function executeToolInMainImpl(toolName, args, toolContext) {
  const automationProjectId = toolContext?.automationProjectId ?? null;

  async function denyUnlessResourceInScope(resourceId) {
    if (!automationProjectId || !resourceId) return null;
    const queries = database.getQueries();
    const row = await queries.getResourceById.get(resourceId);
    if (!row || row.project_id !== automationProjectId) {
      return { success: false, error: 'Resource is outside the automation project scope' };
    }
    return null;
  }

  const normalizedToolName = normalizeToolName(toolName);
  const handlerName = TOOL_HANDLER_MAP[normalizedToolName];
  const aiToolsHandler = getAiToolsHandler();
  if (!handlerName || !aiToolsHandler[handlerName]) {
    return { status: 'error', error: `Tool not supported: ${toolName}` };
  }

  try {
    const fn = aiToolsHandler[handlerName];
    let result;

    switch (handlerName) {
      case 'resourceSearch':
        result = await fn(args.query || '', {
          project_id: automationProjectId || args.project_id,
          type: args.type,
          limit: args.limit,
        });
        break;
      case 'resourceGet': {
        const rid = args.resource_id || args.resourceId || args.id;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) {
          result = denied;
        } else {
          result = await fn(rid, {
            includeContent: args.include_content !== false,
            maxContentLength: args.max_content_length,
          });
        }
        break;
      }
      case 'resourceGetActive': {
        const activeId = toolContext?.runtimeContext?.activeResourceId;
        if (!activeId) {
          result = { success: false, error: 'No active resource in this session. Open a document first.' };
        } else {
          result = await getAiToolsHandler().resourceGet(activeId, { includeContent: true, maxContentLength: 12000 });
        }
        break;
      }
      case 'resourceGetPinned': {
        const pinnedIds = toolContext?.runtimeContext?.pinnedResourceIds || [];
        const rid = args.id || args.resource_id;
        if (!rid) {
          result = { success: false, error: 'id is required. Check the Pinned Context Resources list in the system prompt.' };
        } else if (pinnedIds.length > 0 && !pinnedIds.includes(rid)) {
          result = { success: false, error: `Resource ${rid} is not pinned. Use resource_get for arbitrary resources.` };
        } else {
          result = await getAiToolsHandler().resourceGet(rid, { includeContent: true, maxContentLength: 5000 });
        }
        break;
      }
      case 'resourceGetSection': {
        const rid = args.resource_id || args.resourceId || args.id;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) {
          result = denied;
        } else {
          const chunkId = args.chunk_id || args.chunkId || args.node_id || args.nodeId;
          result = await fn(rid, chunkId);
        }
        break;
      }
      case 'resourceList':
        result = await fn({
          project_id: automationProjectId || args.project_id,
          folder_id: args.folder_id,
          type: args.type,
          limit: args.limit,
          sort: args.sort,
        });
        break;
      case 'resourceSemanticSearch':
        result = await fn(args.query || '', {
          project_id: automationProjectId || args.project_id || args.projectId,
          limit: args.limit || args.count || 10,
        });
        break;
      case 'resourceHybridSearch':
        result = await fn(args.query || '', {
          project_id: automationProjectId || args.project_id || args.projectId,
          type: args.type,
          limit: args.limit || args.count || 10,
          semantic_min_score: args.semantic_min_score,
          include_backlinks: args.include_backlinks,
          candidate_limit: args.candidate_limit,
          rrf_k: args.rrf_k,
        });
        break;
      case 'projectList':
        result = await fn();
        break;
      case 'projectGet': {
        const pid = args.project_id || args.projectId;
        if (automationProjectId && pid && pid !== automationProjectId) {
          result = { success: false, error: 'Project is outside the automation project scope' };
        } else {
          result = await fn(pid);
        }
        break;
      }
      case 'getRecentResources':
        result = await fn(args.limit || 5, automationProjectId);
        break;
      case 'getCurrentProject':
        result = await fn(automationProjectId);
        break;
      case 'getLibraryOverview':
        result = await fn({ project_id: automationProjectId || args.project_id });
        break;
      case 'resourceCreate':
        result = await fn(automationProjectId ? { ...args, project_id: automationProjectId } : args);
        break;
      case 'resourceUpdate': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) {
          result = denied;
        } else {
          // Normalize metadata: some providers pass it as a JSON string
          let metaArg = args.metadata;
          if (typeof metaArg === 'string') {
            try { metaArg = JSON.parse(metaArg); } catch { metaArg = undefined; }
          }
          result = await fn(rid, { title: args.title, content: args.content, metadata: metaArg });
        }
        break;
      }
      case 'resourceDelete': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) {
          result = denied;
        } else {
          result = await fn(rid);
        }
        break;
      }
      case 'resourceMoveToFolder': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) {
          result = denied;
        } else {
          const fid = args.folder_id ?? args.folderId;
          if (fid != null && fid !== '') {
            const fd = await denyUnlessResourceInScope(fid);
            if (fd) {
              result = fd;
              break;
            }
          }
          result = await fn(rid, fid);
        }
        break;
      }
      case 'flashcardCreate':
        result = await fn(automationProjectId ? { ...args, project_id: automationProjectId } : args);
        break;
      case 'webFetch':
        result = await fn(args);
        break;
      case 'webSearch':
        result = await fn(args);
        break;
      case 'deepResearch':
        result = fn(args);
        break;
      case 'excelGet': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, { sheet_name: args.sheet_name, range: args.range });
        break;
      }
      case 'excelGetFilePath': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid);
        break;
      }
      case 'notebookGet': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid);
        break;
      }
      case 'notebookAddCell': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else {
          result = await fn(
            rid,
            args.cell_type || 'code',
            args.source || '',
            args.position
          );
        }
        break;
      }
      case 'notebookUpdateCell': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.cell_index, args.source || '');
        break;
      }
      case 'notebookDeleteCell': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.cell_index);
        break;
      }
      case 'excelSetCell': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.sheet_name, args.cell, args.value);
        break;
      }
      case 'excelSetRange': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.sheet_name, args.range, args.values);
        break;
      }
      case 'excelAddRow': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.sheet_name, args.values, args.after_row);
        break;
      }
      case 'excelAddSheet': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.sheet_name, args.data);
        break;
      }
      case 'excelCreate': {
        if (args.folder_id && automationProjectId) {
          const fd = await denyUnlessResourceInScope(args.folder_id);
          if (fd) {
            result = fd;
            break;
          }
        }
        result = await fn(automationProjectId || args.project_id || args.projectId, args.title, {
          sheet_name: args.sheet_name,
          initial_data: args.initial_data,
          folder_id: args.folder_id,
        });
        break;
      }
      case 'excelExport': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, { format: args.format, sheet_name: args.sheet_name });
        break;
      }
      case 'docxGet': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, { format: args.format, max_chars: args.max_chars });
        break;
      }
      case 'docxGetFilePath': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid);
        break;
      }
      case 'docxCreate': {
        if (args.folder_id && automationProjectId) {
          const fd = await denyUnlessResourceInScope(args.folder_id);
          if (fd) {
            result = fd;
            break;
          }
        }
        result = await fn(automationProjectId || args.project_id || args.projectId, args.title, {
          folder_id: args.folder_id,
          body: args.body,
          blocks: args.blocks,
          markdown: args.markdown,
          html: args.html,
        });
        break;
      }
      case 'docxUpdate': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else {
          result = await fn(rid, {
            title: args.title,
            body: args.body,
            blocks: args.blocks,
            markdown: args.markdown,
            html: args.html,
          });
        }
        break;
      }
      case 'docxDelete': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, { confirm: args.confirm === true || args.confirm === 'true' });
        break;
      }
      case 'pptCreate': {
        const opts = {};
        if (args.folder_id) {
          const fd = await denyUnlessResourceInScope(args.folder_id);
          if (fd) {
            result = fd;
            break;
          }
          opts.folder_id = args.folder_id;
        }
        if (args.script) opts.script = args.script;
        result = await fn(
          automationProjectId || args.project_id || args.projectId,
          args.title,
          args.spec || {},
          opts
        );
        break;
      }
      case 'pptGetFilePath': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid);
        break;
      }
      case 'pptGetSlides': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid);
        break;
      }
      case 'pptGetSlideImages': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid);
        break;
      }
      case 'pptExport': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.options || {});
        break;
      }
      case 'rememberFact':
        result = await fn(args.key || '', args.value || '');
        break;
      case 'getDocumentStructure': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn({ resource_id: rid });
        break;
      }
      case 'linkResources': {
        const a = await denyUnlessResourceInScope(args.source_id);
        if (a) {
          result = a;
        } else {
          const b = await denyUnlessResourceInScope(args.target_id);
          if (b) result = b;
          else {
            result = await fn({
              source_id: args.source_id,
              target_id: args.target_id,
              relation: args.relation,
              description: args.description,
            });
          }
        }
        break;
      }
      case 'getRelatedResources': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn({ resource_id: rid });
        break;
      }
      case 'interactionList': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else {
          result = await fn(rid, { type: args.type, limit: args.limit });
        }
        break;
      }
      case 'generateKnowledgeGraph': {
        let rid = args.focus_resource_id || args.resource_id || args.resourceId;
        const sourceIds = Array.isArray(args.source_ids) ? args.source_ids.filter((x) => typeof x === 'string' && x.trim()) : [];
        if (!rid && sourceIds.length > 0) rid = sourceIds[0];
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else {
          result = await fn({
            focus_resource_id: rid,
            min_weight: args.min_weight,
          });
        }
        break;
      }
      case 'calendarListEvents':
        result = await fn({ start_at: args.start_at, end_at: args.end_at, calendar_ids: args.calendar_ids });
        break;
      case 'calendarGetUpcoming':
        result = await fn({ window_minutes: args.window_minutes, limit: args.limit });
        break;
      case 'calendarCreateEvent':
        result = await fn(args);
        break;
      case 'calendarUpdateEvent':
        result = await fn(args);
        break;
      case 'calendarDeleteEvent':
        result = await fn({ event_id: args.event_id });
        break;
      case 'emailListEnvelopes':
        result = await fn({ folder: args.folder, page: args.page, page_size: args.page_size });
        break;
      case 'emailSearchEnvelopes':
        result = await fn({ query: args.query, folder: args.folder, page_size: args.page_size });
        break;
      case 'emailReadMessage':
        result = await fn({ message_id: args.message_id, folder: args.folder });
        break;
      case 'emailSendMessage':
        result = await fn({ to: args.to, subject: args.subject, body: args.body, cc: args.cc, bcc: args.bcc });
        break;
      case 'emailReplyMessage':
        result = await fn({ message_id: args.message_id, body: args.body, folder: args.folder });
        break;
      case 'domeLoadDoc': {
        const { getSectionBody } = require('../prompts/prompt-sections.cjs');
        const docId = args.id || args.section_id || args.doc_id;
        if (!docId) {
          result = {
            error:
              'id is required. Valid values: entity_rules, artifacts, artifact_persisted, artifact_design, resource_links, feeders',
          };
        } else {
          const body = getSectionBody(docId);
          if (!body) {
            result = {
              error: `Unknown doc id: "${docId}". Valid: ${DOME_LOAD_DOC_IDS.join(', ')}`,
            };
          } else {
            result = { id: docId, content: body };
          }
        }
        break;
      }
      case 'getToolDefinition':
        result = await fn(args.tool_name || args.toolName || '');
        break;
      case 'pdfRenderPage': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else {
          result = await fn({
            resource_id: rid,
            page_number: args.page_number ?? args.pageNumber ?? 1,
            scale: args.scale,
          });
        }
        break;
      }
      case 'gemmaImageDescribe': {
        const rid = args.resource_id || args.resourceId;
        const denied = await denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn({ resource_id: rid });
        break;
      }
      case 'gemmaScreenUnderstand':
        result = await fn({
          image_base64: args.image_base64 || args.imageBase64,
          intent: args.intent,
        });
        break;
      case 'artifactList':
        result = await fn({
          project_id: automationProjectId || args.project_id || args.projectId,
        });
        break;
      case 'artifactCreate':
        result = await fn({
          ...args,
          project_id: automationProjectId || args.project_id || args.projectId,
        });
        break;
      case 'artifactGet': {
        const artRid = args.resource_id || args.resourceId;
        const artDenied = await denyUnlessResourceInScope(artRid);
        if (artDenied) result = artDenied;
        else result = await fn({ resource_id: artRid });
        break;
      }
      case 'artifactMergeData': {
        const mergeRid = args.resource_id || args.resourceId;
        const mergeDenied = await denyUnlessResourceInScope(mergeRid);
        if (mergeDenied) result = mergeDenied;
        else
          result = await fn({
            resource_id: mergeRid,
            data_patch: args.data_patch ?? args.dataPatch ?? {},
          });
        break;
      }
      case 'artifactUpdateState': {
        const artUpdRid = args.resource_id || args.resourceId;
        const artUpdDenied = await denyUnlessResourceInScope(artUpdRid);
        if (artUpdDenied) result = artUpdDenied;
        else result = await fn({ ...args, resource_id: artUpdRid });
        break;
      }
      case 'artifactDelete': {
        const artDelRid = args.resource_id || args.resourceId;
        const artDelDenied = await denyUnlessResourceInScope(artDelRid);
        if (artDelDenied) result = artDelDenied;
        else result = await fn({ resource_id: artDelRid });
        break;
      }
      case 'artifactLinkResource': {
        const artLinkRid = args.artifact_resource_id || args.resource_id;
        const artLinkDenied = await denyUnlessResourceInScope(artLinkRid);
        if (artLinkDenied) result = artLinkDenied;
        else result = await fn({ resource_id: artLinkRid, linked_resource_id: args.linked_resource_id ?? null });
        break;
      }
      case 'artifactDesign':
        result = await fn(args);
        break;
      case 'shellExec':
        result = await fn(args, toolContext);
        break;
      default:
        result = await fn(args);
    }

    return result;
  } catch (error) {
    console.error('[AI Chat Tools] Tool execution error:', toolName, error);
    return { success: false, error: error.message };
  }
}

/**
 * OpenAI-format tool definitions per subagent.
 * Used by the subagents architecture (agent-runtime).
 * @returns {{ research: Array, library: Array, writer: Array, data: Array }}
 */
function getToolDefsBySubagent() {
  const all = getAllToolDefinitions();
  const byName = {};
  for (const def of all) {
    const name = def?.function?.name;
    if (name) byName[name] = def;
  }
  const pick = (...names) => names.map((n) => byName[n]).filter(Boolean);
  return {
    research: pick('web_search', 'web_fetch', 'deep_research'),
    library: pick(
      'resource_hybrid_search',
      'resource_get',
      'resource_get_section',
      'resource_list',
      'get_document_structure',
      'get_related_resources',
      'link_resources',
      'project_list',
      'project_get',
      'get_recent_resources',
      'get_current_project',
      'get_library_overview',
      'resource_move_to_folder',
      'calendar_list_events',
      'calendar_get_upcoming',
      'calendar_create_event',
      'calendar_update_event',
      'calendar_delete_event',
      'pdf_render_page',
    ),
    writer: pick(
      'resource_create',
      'resource_update',
      'resource_delete',
      'docx_create',
      'docx_update',
      'docx_delete',
      'artifact_create',
      'artifact_get',
      'artifact_list',
      'artifact_merge_data',
      'artifact_update_state',
      'artifact_delete',
      'artifact_link_resource',
      'artifact_design',
      'feeder_create',
      'feeder_list',
      'feeder_run',
      'feeder_update_script',
      'feeder_delete',
      'feeder_history',
      'feeder_secret_request',
      'flashcard_create',
      'notebook_get',
      'notebook_add_cell',
      'notebook_update_cell',
      'notebook_delete_cell',
    ),
    data: pick(
      'excel_get',
      'excel_get_file_path',
      'excel_set_cell',
      'excel_set_range',
      'excel_add_row',
      'excel_add_sheet',
      'excel_create',
      'excel_export',
      'docx_get',
      'docx_get_file_path',
      'ppt_create',
      'ppt_get_file_path',
      'ppt_get_slides',
      'ppt_get_slide_images',
      'ppt_export',
      'get_library_overview',
      'resource_list',
      'resource_get',
      'artifact_merge_data',
      'feeder_create',
      'feeder_run',
      'feeder_list',
      'resource_get_section',
      'get_document_structure',
      'get_current_project',
    ),
  };
}

/**
 * All OpenAI-format tool definitions (flat array).
 * Used by getToolDefsBySubagent.
 */
function getAllToolDefinitions() {
  return [
    {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the web for current information. Returns titles, URLs, and snippets from a configurable backend (SearXNG/DDG by default; Tavily/Brave if configured).',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            count: { type: 'number', description: 'Max results (1-10). Default: 5' },
            country: { type: 'string', description: '2-letter country code (e.g. US, DE)' },
            search_lang: { type: 'string', description: 'ISO language code' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'web_fetch',
        description: 'Fetch and extract content from a web page.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to fetch' },
            max_length: { type: 'number', description: 'Max content length. Default: 50000' },
          },
          required: ['url'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'deep_research',
        description:
          'Initiate deep research on a topic. Returns a plan: use web_search and web_fetch to gather info, then synthesize a structured report with sections and citations.',
        parameters: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'Research topic' },
            depth: { type: 'string', description: "Depth: 'quick', 'standard', or 'comprehensive'" },
          },
          required: ['topic'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_search',
        description: 'Search resources in the user\'s knowledge base by title or content. Use to find notes, PDFs, videos, and other resources.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            project_id: { type: 'string', description: 'Filter by project ID' },
            type: { type: 'string', description: 'Filter by type: note, pdf, video, audio, image, url, document, folder' },
            limit: { type: 'number', description: 'Max results (1-50). Default: 10' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_get',
        description: 'Get full details of a specific resource. For PDFs, returns the Gemma transcript in content when available. Use resource_semantic_search for passage-level search and pdf_render_page to view a page as an image. For notes, returns full content. Cite inline as [N] when using in answers.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Resource ID' },
            include_content: { type: 'boolean', description: 'Include full content. Default: true' },
            max_content_length: { type: 'number', description: 'Max content length. Default: 10000' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_list',
        description: 'List resources with optional filters.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'Filter by project' },
            folder_id: { type: 'string', description: 'Filter by folder' },
            type: { type: 'string', description: 'Filter by type' },
            limit: { type: 'number', description: 'Max results (1-100)' },
            sort: { type: 'string', description: "'created_at' or 'updated_at'" },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_hybrid_search',
        description:
          'Hybrid library search: merges full-text (FTS), semantic chunk similarity, and knowledge-graph node matches with RRF. Prefer this over resource_search or resource_semantic_search alone. Results may include chunk_id for resource_get_section.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            project_id: { type: 'string', description: 'Filter by project' },
            type: { type: 'string', description: 'Filter by resource type' },
            limit: { type: 'number', description: 'Max results (1-50). Default: 10' },
            semantic_min_score: { type: 'number', description: 'Min semantic score 0-1. Default: 0.3' },
            include_backlinks: { type: 'boolean', description: 'Include graph neighbors' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_semantic_search',
        description: 'Semantic search over Nomic chunk embeddings. Results include chunk_id (format resourceId#index). Use resource_get_section(resource_id, chunk_id) for full chunk text, or pdf_render_page to see a PDF page as an image.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Natural language query' },
            project_id: { type: 'string', description: 'Filter by project' },
            limit: { type: 'number', description: 'Max results' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_get_section',
        description: 'Get full text of one semantic chunk. Pass chunk_id from resource_semantic_search (e.g. "uuid#3").',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'ID of the resource' },
            chunk_id: { type: 'string', description: 'Chunk id from resource_semantic_search, format resourceId#chunk_index' },
          },
          required: ['resource_id', 'chunk_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_document_structure',
        description: 'Lightweight outline for PDFs with Gemma transcript (page markers). Prefer resource_get for full text.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'ID of the resource to get the structure of' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'link_resources',
        description: 'Create a semantic relationship between two resources in the user\'s library. Use when the user says "link these", "these are related", "this references that", or when you notice a meaningful connection between documents while analyzing them. Always confirm with a brief summary of what was linked.',
        parameters: {
          type: 'object',
          properties: {
            source_id: { type: 'string', description: 'ID of the source resource (the one that references or leads to the other)' },
            target_id: { type: 'string', description: 'ID of the target resource' },
            relation: {
              type: 'string',
              description: 'Relationship label. Common values: "related", "references", "continuation", "contradicts", "supports", "derived_from", "part_of", "see_also". Default: "related"',
            },
            description: { type: 'string', description: 'Optional short note explaining why these are linked (≤120 chars)' },
          },
          required: ['source_id', 'target_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_related_resources',
        description: 'Get all resources linked to or from a given resource. Use when the user asks "what is related to this?", "show me connections", "what links to this document?", or before creating new content to discover existing related material.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'ID of the resource to find neighbors for' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'pdf_render_page',
        description:
          'Render one page of a PDF as a PNG (data URL) for visual inspection—figures, layout, diagrams. Use when the user asks to "see" a page or when text search is not enough.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'PDF resource ID' },
            page_number: { type: 'number', description: '1-based page number' },
            scale: { type: 'number', description: 'Optional render scale (default 1.25)' },
          },
          required: ['resource_id', 'page_number'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'calendar_list_events',
        description:
          "You have direct access to the user's calendar. List events in a date range. Use when the user asks 'what do I have between X and Y?' or for a specific date range. Never say you don't have access.",
        parameters: {
          type: 'object',
          properties: {
            start_at: { type: 'string', description: 'Start of range as ISO 8601 string (e.g. "2026-03-15T00:00:00"). Defaults to now.' },
            end_at: { type: 'string', description: 'End of range as ISO 8601 string. Defaults to 7 days from start.' },
            calendar_ids: { type: 'array', items: { type: 'string' }, description: 'Filter by specific calendar IDs. Omit for all calendars.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'calendar_get_upcoming',
        description:
          "You have direct access to the user's calendar. Use this immediately when they ask about their schedule, upcoming events, or 'what do I have today/week'. Never say you don't have access.",
        parameters: {
          type: 'object',
          properties: {
            window_minutes: {
              type: 'number',
              description:
                'Look-ahead window in minutes. Default ~7 days (10080). Use 180 for a few hours, 1440 for ~1 day.',
            },
            limit: { type: 'number', description: 'Max events to return. Default: 10.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'calendar_create_event',
        description:
          "Create the event directly in the user's calendar. Never generate .ics files or ask the user to import manually. Infer date from 'tomorrow', 'next week'; infer time (use PM for afternoon hours like 5:15 in Spain). Use reminders: [{\"minutes\": 1440}, {\"minutes\": 120}] by default.",
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Event title (required)' },
            description: { type: 'string', description: 'Optional description or notes' },
            location: { type: 'string', description: 'Optional location' },
            start_at: { type: 'string', description: 'Start time as ISO 8601 string, e.g. "2026-03-15T14:00:00" (required)' },
            end_at: { type: 'string', description: 'End time as ISO 8601 string (required)' },
            all_day: { type: 'boolean', description: 'True for all-day events' },
            reminders: {
              type: 'array',
              items: { type: 'object', properties: { minutes: { type: 'number' } }, required: ['minutes'] },
              description: 'Reminder alerts, e.g. [{"minutes": 15}]',
            },
          },
          required: ['title', 'start_at', 'end_at'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'calendar_update_event',
        description: 'Update an existing calendar event. Only include fields that should change. Use calendar_list_events first if you need the event_id.',
        parameters: {
          type: 'object',
          properties: {
            event_id: { type: 'string', description: 'ID of the event to update (required)' },
            title: { type: 'string', description: 'New title' },
            description: { type: 'string', description: 'New description' },
            location: { type: 'string', description: 'New location' },
            start_at: { type: 'string', description: 'New start time as ISO 8601 string' },
            end_at: { type: 'string', description: 'New end time as ISO 8601 string' },
            all_day: { type: 'boolean' },
            reminders: {
              type: 'array',
              items: { type: 'object', properties: { minutes: { type: 'number' } }, required: ['minutes'] },
            },
          },
          required: ['event_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'calendar_delete_event',
        description: 'Permanently delete a calendar event. Ask for confirmation before calling unless the user explicitly said to delete.',
        parameters: {
          type: 'object',
          properties: {
            event_id: { type: 'string', description: 'ID of the event to delete' },
          },
          required: ['event_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'email_list_folders',
        description:
          "List mailbox folders for the user's connected email account (INBOX, Sent, Drafts, etc.). Use before email_list when the user asks about a specific folder.",
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'email_list',
        description:
          "You have direct access to the user's email. List messages in a folder (default INBOX). Returns envelope id, from, subject, date. Use immediately when asked to check email, inbox, or correo — never say the tool is unavailable without calling it.",
        parameters: {
          type: 'object',
          properties: {
            folder: { type: 'string', description: 'Mailbox folder name. Defaults to INBOX.' },
            page: { type: 'number', description: 'Page number (1-based). Default 1.' },
            page_size: { type: 'number', description: 'Messages per page. Default 30.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'email_search',
        description:
          "Search the user's mailbox for messages matching a query (from, subject, date filters, or free text). Requires a connected email account in Settings → Email.",
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (himalaya filter syntax or plain words).',
            },
            folder: { type: 'string', description: 'Folder to search in. Defaults to INBOX.' },
            page_size: { type: 'number', description: 'Max results. Default 30.' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'email_read',
        description:
          'Read the full body of one email by message id (from email_list or email_search). Returns plain-text body for analysis.',
        parameters: {
          type: 'object',
          properties: {
            message_id: { type: 'string', description: 'Envelope/message id from list or search results.' },
            folder: { type: 'string', description: 'Folder the message is in. Defaults to INBOX.' },
          },
          required: ['message_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'email_send',
        description:
          'Compose and send a new email on behalf of the user. Requires user approval before sending. Provide to, subject and body.',
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient address(es), comma-separated.' },
            subject: { type: 'string', description: 'Subject line.' },
            body: { type: 'string', description: 'Plain-text body.' },
            cc: { type: 'string', description: 'Cc address(es), comma-separated.' },
            bcc: { type: 'string', description: 'Bcc address(es), comma-separated.' },
          },
          required: ['to', 'body'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'email_reply',
        description:
          'Reply to an existing email by message id. Requires user approval before sending. Recipient and subject are derived from the original.',
        parameters: {
          type: 'object',
          properties: {
            message_id: { type: 'string', description: 'Id of the message to reply to.' },
            body: { type: 'string', description: 'Plain-text reply body.' },
            folder: { type: 'string', description: 'Folder of the original message. Defaults to INBOX.' },
          },
          required: ['message_id', 'body'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'github_list_repos',
        description: 'List the synced GitHub repositories (the "Seguimiento" feature). Returns repo id, full_name and whether it is selected for sync. Source: GitHub.',
        parameters: { type: 'object', properties: { selected_only: { type: 'boolean', description: 'Only repos selected for sync (default true)' } } },
      },
    },
    {
      type: 'function',
      function: {
        name: 'github_upcoming_milestones',
        description:
          'List milestones across ALL synced GitHub repos sorted by delivery date (due_on). Use for fechas de entrega, próximos hitos, últimas entregas. Source: GitHub.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Max milestones (default 30)' },
            state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Filter state (default all)' },
            include_past_due: { type: 'boolean', description: 'Include past due_on dates (default true)' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'github_list_milestones',
        description: 'List GitHub milestones for a synced repo (title, due date, state, progress). Use github_list_repos first to get the repo_id. Source: GitHub.',
        parameters: {
          type: 'object',
          properties: { repo_id: { type: 'string', description: 'Dome repo id (e.g. ghr-12345) from github_list_repos' } },
          required: ['repo_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'github_list_issues',
        description: 'List GitHub issues for a synced repo (number, title, state, milestone, labels). Source: GitHub.',
        parameters: {
          type: 'object',
          properties: {
            repo_id: { type: 'string', description: 'Dome repo id from github_list_repos' },
            state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Filter by state (default all)' },
          },
          required: ['repo_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'github_create_issue',
        description: 'Create a new GitHub issue in a synced repo. This writes to GitHub. Source: GitHub.',
        parameters: {
          type: 'object',
          properties: {
            repo_id: { type: 'string', description: 'Dome repo id from github_list_repos' },
            title: { type: 'string', description: 'Issue title' },
            body: { type: 'string', description: 'Issue body (Markdown). Add a "due:YYYY-MM-DD" line to project it onto the calendar.' },
            milestone_number: { type: 'number', description: 'Optional milestone number to assign' },
            labels: { type: 'array', items: { type: 'string' }, description: 'Optional labels' },
          },
          required: ['repo_id', 'title'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'github_update_issue',
        description: 'Update a GitHub issue (title, body, state open/closed, milestone). Writes to GitHub. Source: GitHub.',
        parameters: {
          type: 'object',
          properties: {
            issue_id: { type: 'string', description: 'Dome issue id (e.g. ghi-<repo>-<number>) from github_list_issues' },
            title: { type: 'string' },
            body: { type: 'string' },
            state: { type: 'string', enum: ['open', 'closed'] },
            milestone_number: { type: 'number', description: 'Milestone number, or null to clear' },
          },
          required: ['issue_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'github_sync',
        description: 'Trigger a full GitHub ↔ Dome sync now (push local edits, pull latest, refresh calendar). Source: GitHub.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'project_list',
        description: 'List all projects.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'project_get',
        description: 'Get project details by ID.',
        parameters: {
          type: 'object',
          properties: { project_id: { type: 'string', description: 'Project ID' } },
          required: ['project_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_recent_resources',
        description: 'Get recently updated resources.',
        parameters: {
          type: 'object',
          properties: { limit: { type: 'number', description: 'Number of resources (default 5)' } },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_current_project',
        description: 'Get the current/default project.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_library_overview',
        description: 'Get library structure: folders and resources per folder.',
        parameters: {
          type: 'object',
          properties: { project_id: { type: 'string', description: 'Project ID' } },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_get_library_overview',
        description: 'Alias for get_library_overview — library structure for a project.',
        parameters: {
          type: 'object',
          properties: { project_id: { type: 'string', description: 'Project ID' } },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_get_active',
        description: 'Get the resource currently open in the viewer (active tab).',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_get_pinned',
        description: 'Get content of a user-pinned context resource by ID.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Pinned resource ID from context' },
          },
          required: ['id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'interaction_list',
        description: 'List interactions (notes, annotations, chat) for a resource.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Resource ID' },
            type: { type: 'string', description: 'Filter: note, annotation, chat' },
            limit: { type: 'number', description: 'Max results (default 50)' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'remember_fact',
        description: 'Save a user fact to long-term memory (key/value).',
        parameters: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Memory label, e.g. preferred_language' },
            value: { type: 'string', description: 'Fact to remember' },
          },
          required: ['key', 'value'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_create',
        description: 'Create a new persisted resource (note, folder, url, notebook). DO NOT use for visual/interactive outputs like dashboards, diagrams, calculators, timelines, tabs, playgrounds — those are RICH ARTIFACTS rendered inline in the chat (emit an `artifact:TYPE` fenced block instead). Call AT MOST ONCE per user request — never loop creating multiple notes for the same ask. For folders: omit metadata.color to get an auto-assigned color.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Resource title' },
            type: { type: 'string', description: 'note, notebook, document, url, folder' },
            content: { type: 'string', description: 'Content for notes: use Markdown GFM (headings, bold, italic, lists, code blocks). The system converts it to the editor format automatically. Do NOT pass HTML or JSON.' },
            project_id: { type: 'string', description: 'Project ID' },
            folder_id: { type: 'string', description: 'Parent folder ID' },
            metadata: { type: 'object', description: 'Optional metadata. For folders: { color: "#hex" } — auto-assigned if omitted.' },
          },
          required: ['title'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_update',
        description: 'Update an existing resource. IMPORTANT: resource_id must be the exact id field returned by get_library_overview, resource_search, or resource_semantic_search — never invent or construct IDs. For folders: pass metadata.color as a hex string (e.g. "#7b76d0") to change folder color. For DOCX documents: use content as HTML or Markdown GFM; it is persisted to the DOCX file.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Exact resource ID from a prior get_library_overview or search result — never invented' },
            title: { type: 'string', description: 'New title' },
            content: { type: 'string', description: 'New content (for notes/DOCX: HTML or Markdown GFM; DOCX content is written to file)' },
            metadata: { type: 'object', description: 'Metadata fields to merge. For folders: { color: "#hex" }. Available colors: #596037 (olive), #7b76d0 (violet), #22c55e (green), #3b82f6 (blue), #ef4444 (red), #f97316 (orange), #ec4899 (pink), #eab308 (yellow), #06b6d4 (cyan), #6b7280 (gray)' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_delete',
        description: 'Delete a resource.',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'Resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resource_move_to_folder',
        description: 'Move a resource or folder to another folder.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Resource/folder to move' },
            folder_id: { type: 'string', description: 'Target folder ID, or null for root' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'artifact_create',
        description:
          'Create a persisted interactive artifact (mini-app) as a resource. Sandboxed iframe — MUST use window.DOME_DATA + window.__dome_updateState after each user change for SQLite persistence; NEVER localStorage/sessionStorage/IndexedDB for app data. ' +
          'Types: task-tracker, chart, custom. Set html (fragment) and optional data (initial DOME_DATA). ' +
          'CSS variables --bg, --accent, etc. are injected.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Display title. Optional — if omitted, derived from HTML <title> tag, then artifact_type, then "Untitled Artifact".' },
            artifact_type: {
              type: 'string',
              enum: ['task-tracker', 'chart', 'custom'],
              description: 'Semantic type',
            },
            html: { type: 'string', description: 'Self-contained HTML/CSS/JS' },
            data: { type: 'object', description: 'Initial structured data for DOME_DATA' },
            project_id: { type: 'string', description: 'Project ID (default: current)' },
          },
          required: ['artifact_type', 'html'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'artifact_get',
        description: 'Get full artifact state (html, data, metadata) by resource ID.',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'Artifact resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'artifact_merge_data',
        description:
          'Shallow-merge keys into persisted artifact state.data without resending HTML. Use after excel_get / resource_get to push rows, counters, or blobs. Top-level keys replace or add; nested subtrees replace by key. Prefer over pasting huge datasets into HTML.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Artifact resource ID' },
            data_patch: { type: 'object', description: 'Partial state.data (merged shallowly)' },
          },
          required: ['resource_id', 'data_patch'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'artifact_update_state',
        description:
          'Update an artifact: pass html and/or data (merged with existing). In-iframe JS must sync with __dome_updateState; do not use browser storage for durable state. Omit fields you do not change.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Artifact resource ID' },
            html: { type: 'string', description: 'New self-contained HTML if replacing UI' },
            data: {
              description: 'New structured data merged into state (object or JSON string)',
            },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'artifact_list',
        description: 'List persisted artifacts in a project (titles, ids, types).',
        parameters: {
          type: 'object',
          properties: { project_id: { type: 'string', description: 'Project ID (default: current)' } },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'artifact_delete',
        description: 'Delete a persisted artifact resource and remove it from the library.',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'Artifact resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'artifact_link_resource',
        description:
          'Link (or unlink) a persisted artifact to an Excel/spreadsheet resource. ' +
          'Once linked: Dome auto-refreshes the artifact whenever the spreadsheet is edited and exposes all sheet data as window.DOME_DATA.linkedData.sheets[sheetName]. ' +
          'A "Refresh data" button appears in the artifact toolbar. ' +
          'Use this when the user asks to link a dashboard to an Excel, or when an artifact was created without linkedResourceId. ' +
          'Pass linked_resource_id=null to remove the link.',
        parameters: {
          type: 'object',
          properties: {
            artifact_resource_id: { type: 'string', description: 'Resource ID of the artifact to link' },
            linked_resource_id: {
              type: ['string', 'null'],
              description: 'Resource ID of the Excel/spreadsheet to link to, or null to unlink',
            },
          },
          required: ['artifact_resource_id', 'linked_resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'artifact_design',
        description:
          'Build Dome-themed HTML + initial state.data for a persisted library artifact (tabbed dossier: header, tabs, section cards, badges, lists, code blocks). ' +
          'Uses only injected CSS variables; escapes content. Does NOT persist — pass returned html and data to artifact_create (artifact_type: custom). ' +
          'Call dome_load_doc with id artifact_design before first use to read the full JSON spec.',
        parameters: {
          type: 'object',
          properties: {
            spec: {
              type: 'object',
              description:
                'Layout spec: title (required), optional subtitle, title_emoji (single optional emoji), active_tab (optional), tabs[] { id, label }, panels { [tabId]: { sections[] with kicker, optional badge, badge_tone: neutral|info|success|warning|error, blocks[]: type paragraph|numbered|bullets|code } } }',
            },
          },
          required: ['spec'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'feeder_create',
        description:
          'Create a sandbox script that feeds JSON data into a persisted artifact. Call dome_load_doc("feeders") first. ' +
          'Feeder requires user approval before feeder_run. Use feeder_secret_request for credentials.',
        parameters: {
          type: 'object',
          properties: {
            artifact_resource_id: { type: 'string' },
            name: { type: 'string' },
            interpreter: { type: 'string', enum: ['python3', 'node', 'bash', 'sh', 'curl'] },
            script: { type: 'string', description: 'Script source or JSON array of curl args' },
            description: { type: 'string' },
            slot: { type: 'string' },
            env_secret_refs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  env_name: { type: 'string' },
                  secret_name: { type: 'string' },
                },
                required: ['env_name', 'secret_name'],
              },
            },
            env_static: { type: 'object', additionalProperties: { type: 'string' } },
            output_mode: { type: 'string', enum: ['stdout_json', 'output_file'] },
            update_policy: { type: 'string', enum: ['replace', 'merge_shallow', 'merge_deep', 'append_array'] },
            timeout_ms: { type: 'number' },
          },
          required: ['artifact_resource_id', 'name', 'interpreter', 'script'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'feeder_list',
        description: 'List feeders for a persisted artifact.',
        parameters: {
          type: 'object',
          properties: { artifact_resource_id: { type: 'string' } },
          required: ['artifact_resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'feeder_run',
        description: 'Run an approved feeder and merge JSON output into the artifact.',
        parameters: {
          type: 'object',
          properties: { feeder_id: { type: 'string' } },
          required: ['feeder_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'feeder_update_script',
        description: 'Update feeder script (resets approval).',
        parameters: {
          type: 'object',
          properties: { feeder_id: { type: 'string' }, script: { type: 'string' } },
          required: ['feeder_id', 'script'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'feeder_delete',
        description: 'Delete a feeder.',
        parameters: {
          type: 'object',
          properties: { feeder_id: { type: 'string' } },
          required: ['feeder_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'feeder_history',
        description: 'Recent feeder run history.',
        parameters: {
          type: 'object',
          properties: { feeder_id: { type: 'string' }, limit: { type: 'number' } },
          required: ['feeder_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'feeder_secret_request',
        description: 'Prompt user to store a named secret in the encrypted vault.',
        parameters: {
          type: 'object',
          properties: { name: { type: 'string' }, feeder_id: { type: 'string' } },
          required: ['name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'flashcard_create',
        description: 'Create a flashcard deck from Q&A pairs. Each card must have only question (string) and answer (string). Optionally difficulty: "easy"|"medium"|"hard". Do not add tags or other fields.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Deck title' },
            description: { type: 'string', description: 'Deck description' },
            project_id: { type: 'string', description: 'Project ID' },
            resource_id: { type: 'string', description: 'Source resource ID' },
            source_ids: { type: 'array', items: { type: 'string' }, description: 'Resource IDs used as sources' },
            cards: {
              type: 'array',
              description: 'Array of { question: string, answer: string, difficulty?: "easy"|"medium"|"hard" } - no other fields',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  answer: { type: 'string' },
                  difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                },
                required: ['question', 'answer'],
              },
            },
          },
          required: ['title', 'cards'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'notebook_get',
        description: 'Get notebook content (cells, code, outputs). Use resource_id of the current notebook.',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'Notebook resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'notebook_add_cell',
        description: 'Add a code or markdown cell to a notebook. Use for pandas/sklearn analysis. Use position to insert after a cell.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Notebook resource ID' },
            cell_type: { type: 'string', enum: ['code', 'markdown'], description: 'Cell type' },
            source: { type: 'string', description: 'Cell content (Python or Markdown)' },
            position: { type: 'number', description: '0-based index to insert at; omit to append' },
          },
          required: ['resource_id', 'cell_type', 'source'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'notebook_update_cell',
        description: 'Update the source of an existing notebook cell.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Notebook resource ID' },
            cell_index: { type: 'number', description: '0-based cell index' },
            source: { type: 'string', description: 'New cell content' },
          },
          required: ['resource_id', 'cell_index', 'source'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'notebook_delete_cell',
        description: 'Delete a cell from a notebook.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Notebook resource ID' },
            cell_index: { type: 'number', description: '0-based cell index' },
          },
          required: ['resource_id', 'cell_index'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'excel_get',
        description: 'Get cells or range from an Excel spreadsheet resource.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Excel resource ID' },
            sheet_name: { type: 'string', description: 'Sheet name' },
            range: { type: 'string', description: 'Cell range (e.g. A1:B10)' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'excel_get_file_path',
        description: 'Get absolute file path of an Excel. Use when generating notebook code with pd.read_excel(path).',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'Excel resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'excel_set_cell',
        description: 'Set a single cell value in an Excel spreadsheet.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Excel resource ID' },
            sheet_name: { type: 'string', description: 'Sheet name' },
            cell: { type: 'string', description: 'Cell address (e.g. A1)' },
            value: { type: 'string', description: 'Value to set' },
          },
          required: ['resource_id', 'sheet_name', 'cell', 'value'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'excel_set_range',
        description: 'Set a range of cells in an Excel spreadsheet.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Excel resource ID' },
            sheet_name: { type: 'string', description: 'Sheet name' },
            range: { type: 'string', description: 'Range (e.g. A1:B2)' },
            values: { type: 'array', description: '2D array of values' },
          },
          required: ['resource_id', 'sheet_name', 'range', 'values'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'excel_add_row',
        description: 'Add a row to an Excel spreadsheet.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Excel resource ID' },
            sheet_name: { type: 'string', description: 'Sheet name' },
            values: { type: 'array', description: 'Array of cell values' },
            after_row: { type: 'number', description: 'Insert after this row index' },
          },
          required: ['resource_id', 'sheet_name', 'values'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'excel_add_sheet',
        description: 'Add a new sheet to an Excel spreadsheet.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Excel resource ID' },
            sheet_name: { type: 'string', description: 'Sheet name' },
            data: { type: 'array', description: '2D array of initial data' },
          },
          required: ['resource_id', 'sheet_name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'excel_create',
        description: 'Create a new Excel spreadsheet resource.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'Project ID' },
            title: { type: 'string', description: 'Spreadsheet title' },
            sheet_name: { type: 'string', description: 'Initial sheet name' },
            initial_data: { type: 'array', description: '2D array of initial data' },
            folder_id: { type: 'string', description: 'Parent folder ID' },
          },
          required: ['project_id', 'title'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'excel_export',
        description: 'Export Excel spreadsheet to CSV or XLSX.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'Excel resource ID' },
            format: { type: 'string', description: "'csv' or 'xlsx'" },
            sheet_name: { type: 'string', description: 'Sheet to export' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'docx_get',
        description:
          'Read a Word .docx resource from the library: plain text (default) or HTML via mammoth. Use before editing or summarizing a report.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'DOCX resource ID' },
            format: { type: 'string', description: "'text' or 'html'. Default: text" },
            max_chars: { type: 'number', description: 'Max characters for text output' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'docx_get_file_path',
        description: 'Get absolute disk path of a Word .docx in the library (for external tooling).',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'DOCX resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'docx_create',
        description:
          'Create a new Word .docx in the library. Pass markdown or html for rich layout (html-to-docx), or body/blocks for structured docx-js output (US Letter, Arial). Plain text files: use resource_create (note) or import_file_to_library.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'Project ID (default: current)' },
            folder_id: { type: 'string', description: 'Optional folder ID' },
            title: { type: 'string', description: 'Resource title' },
            body: { type: 'string', description: 'Plain text; paragraphs separated by blank line' },
            blocks: {
              type: 'array',
              description: 'Structured blocks: { type: paragraph|heading, text, level? }',
              items: { type: 'object' },
            },
            markdown: { type: 'string', description: 'Full Markdown → DOCX' },
            html: { type: 'string', description: 'Full HTML → DOCX' },
          },
          required: ['title'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'docx_update',
        description:
          'Replace the .docx file and/or rename the resource. Same content options as docx_create (markdown, html, body, blocks).',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'DOCX resource ID' },
            title: { type: 'string', description: 'New visible title' },
            body: { type: 'string', description: 'Plain text body' },
            blocks: { type: 'array', items: { type: 'object' } },
            markdown: { type: 'string' },
            html: { type: 'string' },
          },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'docx_delete',
        description: 'Delete a Word .docx from the library. Requires confirm=true after user consent.',
        parameters: {
          type: 'object',
          properties: {
            resource_id: { type: 'string', description: 'DOCX resource ID' },
            confirm: { type: 'boolean', description: 'Must be true' },
          },
          required: ['resource_id', 'confirm'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ppt_create',
        description:
          'Create a PowerPoint with PptxGenJS only. Use script (JavaScript, CommonJS) for full control, or spec (JSON) for simple themed slides. Python is not supported. Every slide must have real content from source documents.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'Project ID' },
            folder_id: { type: 'string', description: 'Folder ID to place the PPT in' },
            title: { type: 'string', description: 'Resource title' },
            script: {
              type: 'string',
              description:
                'PptxGenJS script executed in a Node sandbox. Use: const pptxgen = require("pptxgenjs"); const pres = new pptxgen(); pres.layout = "LAYOUT_16x9"; build slides; await pres.writeFile({ fileName: process.env.PPTX_OUTPUT_PATH }). Requires system Node (or PPTXGEN_NODE).',
            },
            spec: {
              type: 'object',
              description: 'Presentation spec. Include theme for themed slides.',
              properties: {
                title: { type: 'string' },
                theme: {
                  type: 'string',
                  enum: ['midnight_executive', 'forest_moss', 'ocean_gradient', 'sunset_warm', 'slate_minimal', 'emerald_pro'],
                  description: 'Theme: midnight_executive (business), forest_moss (sustainability), ocean_gradient (tech), sunset_warm (marketing), slate_minimal (academic), emerald_pro (finance)',
                },
                slides: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      layout: { type: 'string', enum: ['title', 'content', 'bullet', 'title_only', 'blank'] },
                      title: { type: 'string' },
                      subtitle: { type: 'string' },
                      bullets: { type: 'array', items: { type: 'string' } },
                      textboxes: { type: 'array' },
                    },
                  },
                },
              },
            },
          },
          required: ['title'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ppt_get_file_path',
        description: 'Get absolute file path of a PowerPoint resource.',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'PPT resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ppt_get_slides',
        description: 'Get slide content (text) from a PowerPoint presentation.',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'PPT resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ppt_get_slide_images',
        description:
          'Get PNG screenshots of each slide for visual QA after ppt_create. Returns base64 images per slide index.',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'PPT resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ppt_export',
        description: 'Export PowerPoint to base64 (pptx).',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'PPT resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'image_describe',
        description:
          'Describe an image resource using on-device Gemma (no cloud vision). Use for image-type resources in the library.',
        parameters: {
          type: 'object',
          properties: { resource_id: { type: 'string', description: 'Image resource ID' } },
          required: ['resource_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'screen_understand',
        description:
          'Analyze a screenshot (base64 PNG) for UI elements and intent. Returns JSON-like analysis from on-device Gemma. Requires Gemma enabled in Settings.',
        parameters: {
          type: 'object',
          properties: {
            image_base64: { type: 'string', description: 'Base64-encoded PNG (with or without data URL prefix)' },
            intent: { type: 'string', description: 'Optional user goal to bias the analysis' },
          },
          required: ['image_base64'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'dome_load_doc',
        description:
          DOME_LOAD_DOC_DESCRIPTION,
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              enum: DOME_LOAD_DOC_IDS,
              description: 'Section identifier',
            },
          },
          required: ['id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_tool_definition',
        description:
          'Get the full schema (name, description, parameters) of any tool (Dome or MCP). Use when you need to see the exact parameters of a tool before calling it. Reduces token usage by loading definitions on demand.',
        parameters: {
          type: 'object',
          properties: {
            tool_name: { type: 'string', description: 'Normalized tool name (e.g. resource_search, stripe_create_payment)' },
          },
          required: ['tool_name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'agent_create',
        description:
          'Create a new specialized agent (hijo de Many) with a custom system prompt and tools. Use when the user asks to create, build, or set up a new AI agent. Do NOT delegate to subagents for this—call agent_create directly.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the agent (e.g. "Research Assistant", "Noticiero")' },
            description: { type: 'string', description: 'Short description of what this agent does' },
            system_instructions: { type: 'string', description: 'System prompt for the agent. Describe WHAT the agent will do when invoked, including step-by-step flow. Be specific.' },
            tool_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'REQUIRED. Tool IDs the agent needs (e.g. ["web_fetch", "resource_create"]). Agent cannot work without tools. Never omit.',
            },
            icon_index: { type: 'number', description: 'Icon index 1-18 for the agent avatar. Default: random' },
          },
          required: ['name', 'tool_ids'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'automation_create',
        description:
          'Create an automation that runs an agent or workflow on a trigger (manual, schedule, or contextual). Dome has native automations—use this, never mention n8n or Make. Use when the user asks to automate, schedule, or set up recurring tasks. After creating an agent that could run recurrently (e.g. Noticiero), offer to create an automation.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Name of the automation (e.g. "Daily briefing")' },
            description: { type: 'string', description: 'What this automation does' },
            target_type: { type: 'string', description: 'Target: "agent" or "workflow"' },
            target_id: { type: 'string', description: 'ID of the target agent or workflow' },
            trigger_type: { type: 'string', description: 'Trigger: "manual" | "schedule" | "contextual". Default: manual' },
            prompt: { type: 'string', description: 'Base prompt/instructions to pass when triggered' },
            schedule: {
              type: 'object',
              description: 'For trigger_type "schedule". cadence: "daily"|"weekly"|"cron-lite", hour: 0-23, weekday: 1-7 (for weekly), intervalMinutes (for cron-lite)',
              properties: {
                cadence: { type: 'string', enum: ['daily', 'weekly', 'cron-lite'] },
                hour: { type: 'number', description: 'Hour of day (0-23)' },
                weekday: { type: 'number', description: 'Day of week 1-7 for weekly' },
                interval_minutes: { type: 'number', description: 'Minutes between runs for cron-lite' },
              },
            },
            output_mode: { type: 'string', description: '"chat_only" | "note" | "studio_output" | "mixed". Use "note" when agent creates a resource' },
            enabled: { type: 'boolean', description: 'Whether active. Default: true' },
          },
          required: ['title', 'target_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'workflow_create',
        description:
          'Create a new visual workflow (canvas) with nodes and edges. Valid node types: text-input, document, image, agent, output.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Workflow name (required)' },
            description: { type: 'string', description: 'Short description' },
            project_id: { type: 'string', description: 'Project ID (default: default)' },
            nodes: {
              type: 'array',
              description: 'Nodes: { id?, type, position?: {x,y}, data?: {} }',
            },
            edges: {
              type: 'array',
              description: 'Edges: { id?, source, target, sourceHandle?, targetHandle? }',
            },
          },
          required: ['name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'marketplace_search',
        description:
          'Search bundled and configured marketplace catalogs for agents and workflows. Use when the user wants to browse or find installable agents/workflows.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query (keywords); omit or empty to list top items' },
            type: { type: 'string', description: 'all | agents | workflows' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'marketplace_install',
        description:
          'Install an agent or workflow from marketplace_search results. Requires marketplaceId from search and type agent or workflow.',
        parameters: {
          type: 'object',
          properties: {
            marketplaceId: { type: 'string', description: 'Template id from marketplace_search' },
            type: { type: 'string', enum: ['agent', 'workflow'], description: 'agent or workflow' },
            project_id: { type: 'string', description: 'Project scope (default: default)' },
          },
          required: ['marketplaceId', 'type'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'browser_get_active_tab',
        description:
          'macOS only. Returns URL and title of the active tab when Safari, Chrome, Chromium, Brave, or Edge is focused. Then use resource_create type url to save.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'image_crop',
        description: 'Crop a region from an image file on disk. Returns cropped image as data URL.',
        parameters: {
          type: 'object',
          properties: {
            imagePath: { type: 'string', description: 'Absolute path to image file' },
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
            format: { type: 'string', description: 'jpeg | png | webp' },
            quality: { type: 'number' },
            maxWidth: { type: 'number' },
            maxHeight: { type: 'number' },
          },
          required: ['imagePath', 'width', 'height'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'image_thumbnail',
        description: 'Generate a thumbnail data URL for an image file on disk.',
        parameters: {
          type: 'object',
          properties: {
            imagePath: { type: 'string', description: 'Absolute path to image file' },
            width: { type: 'number', description: 'Max width (default 256)' },
            height: { type: 'number', description: 'Max height (default 256)' },
            format: { type: 'string' },
            quality: { type: 'number' },
          },
          required: ['imagePath'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'file_read',
        description:
          'Read the text content of a file from the filesystem. Returns the full content as a string. Use to inspect source code, configs, logs, or any text file.',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Absolute path to the file to read.' },
            start_line: { type: 'number', description: 'Line number to start reading from (0-based). Default: 0.' },
            limit: { type: 'number', description: 'Maximum number of lines to read. Default: 200.' },
          },
          required: ['file_path'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'file_write',
        description:
          'Write text content to a file. Creates parent directories if needed. Overwrites existing content. Use to create project files on disk (e.g. Remotion, scripts, configs).',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Absolute path to the file to write.' },
            content: { type: 'string', description: 'Text content to write (UTF-8).' },
          },
          required: ['file_path', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'file_list',
        description:
          'List the contents of a directory (one level, not recursive). Returns file/folder names, paths, and whether each entry is a directory. Capped at 500 entries — use file_search for deep or filtered scans. Prefer this over MCP directory_tree.',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Absolute path to the directory to list.' },
            path: { type: 'string', description: 'Alias for file_path.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'file_tree',
        description:
          'Bounded recursive directory tree (safe alternative to MCP directory_tree). Default max_depth=2 and max_entries=200; skips node_modules, .git, dist, etc. Use for project structure — never scan home or drive roots. Prefer over MCP directory_tree.',
        parameters: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Absolute path to the root directory.' },
            path: { type: 'string', description: 'Alias for file_path.' },
            max_depth: { type: 'number', description: 'Max directory depth (default 2, max 10).' },
            max_entries: { type: 'number', description: 'Max files/folders to include (default 200, max 2000).' },
            exclude: {
              type: 'array',
              items: { type: 'string' },
              description: 'Directory name patterns to skip (default includes node_modules, .git, dist, AppData).',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'file_search',
        description:
          'Recursively search a directory for files matching a name pattern or containing a text string. Returns up to 200 matches. Prefer over MCP directory_tree for large folders (especially on Windows).',
        parameters: {
          type: 'object',
          properties: {
            directory: { type: 'string', description: 'Root directory to search from.' },
            pattern: { type: 'string', description: 'Filename glob (e.g. "*.ts") or text regex for content search.' },
            type: { type: 'string', description: 'Search mode: "name" (default) or "content".' },
          },
          required: ['directory', 'pattern'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'skill_read',
        description:
          'Read a text file from an installed Dome skill (~/.dome/skills/<skill_id>/). Use for auxiliary skill docs referenced in SKILL.md. ' +
          'Do NOT use for artifact_persisted, artifact_design, or artifacts — call dome_load_doc(id) instead.',
        parameters: {
          type: 'object',
          properties: {
            skill_id: { type: 'string', description: 'Skill folder name, e.g. "pptx".' },
            path: { type: 'string', description: 'Relative path within the skill folder, e.g. "editing.md".' },
          },
          required: ['skill_id', 'path'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'shell_exec',
        description:
          'Execute a shell command. A native confirmation dialog appears before running — the user must approve. Returns stdout, stderr, and exit code.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Shell command to execute (e.g. "pnpm run build").' },
            cwd: { type: 'string', description: 'Working directory for the command.' },
          },
          required: ['command'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_knowledge_graph',
        description:
          'Build a semantic similarity graph around a focus resource (from library embeddings). Pass focus_resource_id or source_ids (first id used as focus).',
        parameters: {
          type: 'object',
          properties: {
            focus_resource_id: { type: 'string', description: 'Center resource id' },
            source_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional; first id used as focus if focus_resource_id omitted',
            },
            min_weight: { type: 'number', description: 'Min edge similarity 0-1 (default 0.35)' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_mindmap',
        description:
          'Gather source snippets from library resources to help you produce a mind map or artifact:diagram. Does not build the graph structure itself—call after resolving resource IDs.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'Scope listing when source_ids omitted' },
            source_ids: { type: 'array', items: { type: 'string' }, description: 'Resource IDs to summarize' },
            resource_id: { type: 'string', description: 'Single source resource ID' },
            topic: { type: 'string', description: 'Optional focus topic label' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_quiz',
        description:
          'Gather source content from resources so you can output a structured quiz (type quiz) in the reply. Call only when user asks for quiz/test/questions.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            source_ids: { type: 'array', items: { type: 'string' } },
            resource_id: { type: 'string', description: 'Single source resource ID (shorthand for one-item source_ids)' },
            num_questions: { type: 'number', description: '1-20, default 5' },
            difficulty: { type: 'string', description: 'easy | medium | hard' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_guide',
        description:
          'Gather source content so you can output a structured study guide (type guide) in the reply. Call only when the user asks for a guide or guía de estudio.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            source_ids: { type: 'array', items: { type: 'string' } },
            resource_id: { type: 'string', description: 'Single source resource ID' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_faq',
        description:
          'Gather source content so you can output FAQ Q&A pairs (type faq) in the reply. Call only when the user asks for FAQ or preguntas frecuentes.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            source_ids: { type: 'array', items: { type: 'string' } },
            resource_id: { type: 'string', description: 'Single source resource ID' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_timeline',
        description:
          'Gather source content so you can output a chronological timeline (type timeline) in the reply. Call only when the user asks for timeline or cronología.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            source_ids: { type: 'array', items: { type: 'string' } },
            resource_id: { type: 'string', description: 'Single source resource ID' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_table',
        description:
          'Gather source content so you can output a data table (type table) in the reply. Call only when the user asks for table, tabla, or comparison matrix.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            source_ids: { type: 'array', items: { type: 'string' } },
            resource_id: { type: 'string', description: 'Single source resource ID' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ui_point_to',
        description:
          'Move the Many cursor to a Dome UI element (data-ui-target name or CSS selector). Use for guided tours — one highlight per turn.',
        parameters: {
          type: 'object',
          properties: {
            target: { type: 'string', description: 'e.g. tab-agents, tab-settings' },
            tooltip: { type: 'string', description: 'Short tooltip next to the cursor' },
          },
          required: ['target'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ui_click',
        description: 'Point to a UI element and click it after a brief delay.',
        parameters: {
          type: 'object',
          properties: {
            target: { type: 'string', description: 'data-ui-target name or CSS selector' },
          },
          required: ['target'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ui_type',
        description: 'Focus an input/textarea and type text into it.',
        parameters: {
          type: 'object',
          properties: {
            target: { type: 'string', description: 'Input element target' },
            text: { type: 'string', description: 'Text to type' },
          },
          required: ['target', 'text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ui_scroll',
        description: 'Scroll the page or a scrollable element.',
        parameters: {
          type: 'object',
          properties: {
            direction: { type: 'string', description: 'up | down | left | right' },
            amount: { type: 'number', description: 'Pixels (default 300)' },
            target: { type: 'string', description: 'Optional scrollable element target' },
          },
          required: ['direction'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ui_navigate',
        description:
          'Open or switch to a named Dome tab: home, settings, calendar, agents, learn, flashcards, marketplace, tags, workflows, automations, runs.',
        parameters: {
          type: 'object',
          properties: {
            destination: { type: 'string', description: 'Tab destination name' },
          },
          required: ['destination'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ui_get_elements',
        description: 'List elements with data-ui-target in the current DOM.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ui_hide_cursor',
        description: 'Hide the Many assistant UI cursor overlay.',
        parameters: { type: 'object', properties: {} },
      },
    },
  ];
}

function getToolDefinitionsByIds(toolIds) {
  if (!Array.isArray(toolIds) || toolIds.length === 0) return [];
  const normalizedIds = new Set(
    toolIds.map((toolId) =>
      String(toolId || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
    )
  );
  return getAllToolDefinitions().filter((def) => {
    const name = def?.function?.name;
    if (!name) return false;
    const normalizedName = String(name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');
    return normalizedIds.has(normalizedName);
  });
}

async function executeToolInMain(toolName, args, toolContext) {
  const timeoutMs = getToolTimeoutMs(toolName);
  let timer;
  try {
    return await Promise.race([
      executeToolInMainImpl(toolName, args, toolContext),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Tool "${toolName}" timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } catch (err) {
    if (String(err?.message || '').includes('timed out')) {
      logger.warn('tool-dispatcher', err.message, { tool: toolName, timeoutMs });
      return { status: 'error', error: err.message };
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = {
  executeToolInMain,
  normalizeToolName,
  TOOL_HANDLER_MAP,
  getAllToolDefinitions,
  getToolDefinitionsByIds,
  getToolDefsBySubagent,
};
