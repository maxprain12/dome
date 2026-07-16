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

const {
  normalizeToolName,
  TOOL_HANDLER_MAP,
  getAllToolDefinitions,
  getToolDefinitionsByIds,
  getToolDefsBySubagent,
} = require('./tool-definitions.cjs');

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
async function executeToolInMainImpl(toolName, args, toolContext) {
  const automationProjectId = toolContext?.automationProjectId ?? null;

  function denyUnlessResourceInScope(resourceId) {
    if (!automationProjectId || !resourceId) return null;
    const queries = database.getQueries();
    const row = queries.getResourceById.get(resourceId);
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
        const denied = denyUnlessResourceInScope(rid);
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
        const denied = denyUnlessResourceInScope(rid);
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
        const denied = denyUnlessResourceInScope(rid);
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
        const denied = denyUnlessResourceInScope(rid);
        if (denied) {
          result = denied;
        } else {
          result = await fn(rid);
        }
        break;
      }
      case 'resourceMoveToFolder': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) {
          result = denied;
        } else {
          const fid = args.folder_id ?? args.folderId;
          if (fid != null && fid !== '') {
            const fd = denyUnlessResourceInScope(fid);
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
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, { sheet_name: args.sheet_name, range: args.range });
        break;
      }
      case 'excelGetFilePath': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid);
        break;
      }
      case 'notebookGet': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid);
        break;
      }
      case 'notebookAddCell': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
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
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.cell_index, args.source || '');
        break;
      }
      case 'notebookDeleteCell': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.cell_index);
        break;
      }
      case 'excelSetCell': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.sheet_name, args.cell, args.value);
        break;
      }
      case 'excelSetRange': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.sheet_name, args.range, args.values);
        break;
      }
      case 'excelAddRow': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.sheet_name, args.values, args.after_row);
        break;
      }
      case 'excelAddSheet': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.sheet_name, args.data);
        break;
      }
      case 'excelCreate': {
        if (args.folder_id && automationProjectId) {
          const fd = denyUnlessResourceInScope(args.folder_id);
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
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, { format: args.format, sheet_name: args.sheet_name });
        break;
      }
      case 'docxGet': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, { format: args.format, max_chars: args.max_chars });
        break;
      }
      case 'docxGetFilePath': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid);
        break;
      }
      case 'docxCreate': {
        if (args.folder_id && automationProjectId) {
          const fd = denyUnlessResourceInScope(args.folder_id);
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
        const denied = denyUnlessResourceInScope(rid);
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
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, { confirm: args.confirm === true || args.confirm === 'true' });
        break;
      }
      case 'pptCreate': {
        const opts = {};
        if (args.folder_id) {
          const fd = denyUnlessResourceInScope(args.folder_id);
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
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid);
        break;
      }
      case 'pptGetSlides': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid);
        break;
      }
      case 'pptGetSlideImages': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid);
        break;
      }
      case 'pptExport': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn(rid, args.options || {});
        break;
      }
      case 'rememberFact':
        result = await fn(args.key || '', args.value || '', args.domain || 'general');
        break;
      case 'getDocumentStructure': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn({ resource_id: rid });
        break;
      }
      case 'linkResources': {
        const a = denyUnlessResourceInScope(args.source_id);
        if (a) {
          result = a;
        } else {
          const b = denyUnlessResourceInScope(args.target_id);
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
        const denied = denyUnlessResourceInScope(rid);
        if (denied) result = denied;
        else result = await fn({ resource_id: rid });
        break;
      }
      case 'interactionList': {
        const rid = args.resource_id || args.resourceId;
        const denied = denyUnlessResourceInScope(rid);
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
        const denied = denyUnlessResourceInScope(rid);
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
      case 'pipelineList':
        result = await fn({ project_id: automationProjectId || args.project_id });
        break;
      case 'pipelineGet':
        result = await fn({ pipeline_id: args.pipeline_id });
        break;
      case 'pipelineCreateCard':
        result = await fn({
          pipeline_id: args.pipeline_id,
          stage_id: args.stage_id,
          title: args.title,
          data: args.data,
          start_at: args.start_at,
          end_at: args.end_at,
        });
        break;
      case 'pipelineMoveCard':
        result = await fn({ item_id: args.item_id, to_stage_id: args.to_stage_id });
        break;
      case 'pipelineRunCard':
        result = await fn({ item_id: args.item_id });
        break;
      case 'pipelineAddStage':
        result = await fn({
          pipeline_id: args.pipeline_id,
          title: args.title,
          execution_policy: args.execution_policy,
          assigned_agent_id: args.assigned_agent_id,
        });
        break;
      case 'emailListFolders':
        result = await fn(toolContext);
        break;
      case 'emailListEnvelopes':
        result = await fn({ folder: args.folder, page: args.page, page_size: args.page_size }, toolContext);
        break;
      case 'emailSearchEnvelopes':
        result = await fn({ query: args.query, folder: args.folder, page_size: args.page_size }, toolContext);
        break;
      case 'emailReadMessage':
        result = await fn({ message_id: args.message_id, folder: args.folder }, toolContext);
        break;
      case 'emailSendMessage':
        result = await fn({ to: args.to, subject: args.subject, body: args.body, cc: args.cc, bcc: args.bcc }, toolContext);
        break;
      case 'emailReplyMessage':
        result = await fn({ message_id: args.message_id, body: args.body, folder: args.folder }, toolContext);
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
        const denied = denyUnlessResourceInScope(rid);
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
        const denied = denyUnlessResourceInScope(rid);
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
        const artDenied = denyUnlessResourceInScope(artRid);
        if (artDenied) result = artDenied;
        else result = await fn({ resource_id: artRid });
        break;
      }
      case 'artifactMergeData': {
        const mergeRid = args.resource_id || args.resourceId;
        const mergeDenied = denyUnlessResourceInScope(mergeRid);
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
        const artUpdDenied = denyUnlessResourceInScope(artUpdRid);
        if (artUpdDenied) result = artUpdDenied;
        else result = await fn({ ...args, resource_id: artUpdRid });
        break;
      }
      case 'artifactDelete': {
        const artDelRid = args.resource_id || args.resourceId;
        const artDelDenied = denyUnlessResourceInScope(artDelRid);
        if (artDelDenied) result = artDelDenied;
        else result = await fn({ resource_id: artDelRid });
        break;
      }
      case 'artifactLinkResource': {
        const artLinkRid = args.artifact_resource_id || args.resource_id;
        const artLinkDenied = denyUnlessResourceInScope(artLinkRid);
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
