/* eslint-disable no-console */
/**
 * Per-handler invokers for executeToolInMainImpl (Sonar S3776).
 * Behavior must stay aligned with the historical switch in tool-dispatcher.cjs.
 */

'use strict';

/**
 * Deny tool access when automation scope is set and the resource is outside it.
 * @param {string|null|undefined} automationProjectId
 * @param {string|null|undefined} resourceId
 * @returns {{ success: false, error: string } | null}
 */
function denyUnlessResourceInScope(automationProjectId, resourceId) {
  if (!automationProjectId || !resourceId) return null;
  const database = require('../core/database.cjs');
  const queries = database.getQueries();
  const row = queries.getResourceById.get(resourceId);
  if (!row || row.project_id !== automationProjectId) {
    return { success: false, error: 'Resource is outside the automation project scope' };
  }
  return null;
}

/** @internal Prefer resource_id, then resourceId, then id. */
function resolveResourceId(args) {
  return args?.resource_id || args?.resourceId || args?.id;
}

/** @internal Parse metadata when providers pass a JSON string. */
function normalizeMetadataArg(metaArg) {
  if (typeof metaArg !== 'string') return metaArg;
  try {
    return JSON.parse(metaArg);
  } catch {
    return undefined;
  }
}

async function invokeResourceSearch(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  result = await fn(args.query || '', {
            project_id: automationProjectId || args.project_id,
            type: args.type,
            limit: args.limit,
          });
  return result;
}
async function invokeResourceGet(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId || args.id;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) {
    result = denied;
  } else {
    result = await fn(rid, {
      includeContent: args.include_content !== false,
      maxContentLength: args.max_content_length,
    });
  }
  return result;
}
async function invokeResourceGetActive(ctx) {
  const { toolContext, getAiToolsHandler } = ctx;
  let result;
  const activeId = toolContext?.runtimeContext?.activeResourceId;
  if (!activeId) {
    result = { success: false, error: 'No active resource in this session. Open a document first.' };
  } else {
    result = await getAiToolsHandler().resourceGet(activeId, { includeContent: true, maxContentLength: 12000 });
  }
  return result;
}
/**
 * Social pins use sp-* ids and are never in pinnedResourceIds (library-only).
 * @returns {object|null} success payload or null when not resolved
 */
function tryResolveSocialPinnedPost(rid) {
  if (!String(rid).startsWith('sp-')) return null;
  try {
    const database = require('../core/database.cjs');
    const windowManager = require('../core/window-manager.cjs');
    const { getSocialService } = require('../social/social-service.cjs');
    const post = getSocialService(database, windowManager).store.getPost(rid);
    if (!post) return null;
    return {
      success: true,
      id: post.id,
      type: 'social_post',
      title: [post.provider, post.status].filter(Boolean).join(' · ') || post.id,
      content: post.body || '',
      meta: {
        provider: post.provider,
        status: post.status,
        campaign: post.campaign,
      },
    };
  } catch (err) {
    console.warn('[tool-dispatcher] social getPost for pinned id failed:', err?.message || err);
    return null;
  }
}

async function invokeResourceGetPinned(ctx) {
  const { args, toolContext, getAiToolsHandler } = ctx;
  const pinnedIds = toolContext?.runtimeContext?.pinnedResourceIds || [];
  const rid = args.id || args.resource_id;
  if (!rid) {
    return {
      success: false,
      error: 'id is required. Check the Pinned Context Resources list in the system prompt.',
    };
  }
  if (pinnedIds.length > 0 && !pinnedIds.includes(rid)) {
    const social = tryResolveSocialPinnedPost(rid);
    if (social) return social;
    return {
      success: false,
      error: `Resource ${rid} is not pinned. Use resource_get for arbitrary resources.`,
    };
  }
  return getAiToolsHandler().resourceGet(rid, { includeContent: true, maxContentLength: 5000 });
}
async function invokeResourceGetSection(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId || args.id;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) {
    result = denied;
  } else {
    const chunkId = args.chunk_id || args.chunkId || args.node_id || args.nodeId;
    result = await fn(rid, chunkId);
  }
  return result;
}
async function invokeResourceList(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  result = await fn({
            project_id: automationProjectId || args.project_id,
            folder_id: args.folder_id,
            type: args.type,
            limit: args.limit,
            sort: args.sort,
          });
  return result;
}
async function invokeResourceSemanticSearch(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  result = await fn(args.query || '', {
            project_id: automationProjectId || args.project_id || args.projectId,
            limit: args.limit || args.count || 10,
          });
  return result;
}
async function invokeResourceHybridSearch(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  result = await fn(args.query || '', {
            project_id: automationProjectId || args.project_id || args.projectId,
            type: args.type,
            limit: args.limit || args.count || 10,
            semantic_min_score: args.semantic_min_score,
            include_backlinks: args.include_backlinks,
            candidate_limit: args.candidate_limit,
            rrf_k: args.rrf_k,
          });
  return result;
}
async function invokeProjectList(ctx) {
  const { fn } = ctx;
  let result;
  result = await fn();
  return result;
}
async function invokeProjectGet(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const pid = args.project_id || args.projectId;
  if (automationProjectId && pid && pid !== automationProjectId) {
    result = { success: false, error: 'Project is outside the automation project scope' };
  } else {
    result = await fn(pid);
  }
  return result;
}
async function invokeGetRecentResources(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  result = await fn(args.limit || 5, automationProjectId);
  return result;
}
async function invokeGetCurrentProject(ctx) {
  const { fn, automationProjectId } = ctx;
  let result;
  result = await fn(automationProjectId);
  return result;
}
async function invokeGetLibraryOverview(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  result = await fn({ project_id: automationProjectId || args.project_id });
  return result;
}
async function invokeResourceCreate(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  result = await fn(automationProjectId ? { ...args, project_id: automationProjectId } : args);
  return result;
}
async function invokeResourceUpdate(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) {
    result = denied;
  } else {
    const metaArg = normalizeMetadataArg(args.metadata);
    result = await fn(rid, { title: args.title, content: args.content, metadata: metaArg });
  }
  return result;
}
async function invokeResourceDelete(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) {
    result = denied;
  } else {
    result = await fn(rid);
  }
  return result;
}
async function invokeResourceMoveToFolder(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) {
    result = denied;
  } else {
    const fid = args.folder_id ?? args.folderId;
    if (fid != null && fid !== '') {
      const fd = denyUnlessResourceInScope(automationProjectId, fid);
      if (fd) {
        result = fd;
        return result;
      }
    }
    result = await fn(rid, fid);
  }
  return result;
}
async function invokeFlashcardCreate(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  result = await fn(automationProjectId ? { ...args, project_id: automationProjectId } : args);
  return result;
}
async function invokeWebFetch(ctx) {
  const { fn, args } = ctx;
  let result;
  result = await fn(args);
  return result;
}
async function invokeWebSearch(ctx) {
  const { fn, args } = ctx;
  let result;
  result = await fn(args);
  return result;
}
/** Intentionally not async — mirrors historical `result = fn(args)` (no await). */
function invokeDeepResearch(ctx) {
  return ctx.fn(ctx.args);
}
async function invokeExcelGet(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn(rid, { sheet_name: args.sheet_name, range: args.range });
  return result;
}
async function invokeExcelGetFilePath(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn(rid);
  return result;
}
async function invokeNotebookGet(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn(rid);
  return result;
}
async function invokeNotebookAddCell(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else {
    result = await fn(
      rid,
      args.cell_type || 'code',
      args.source || '',
      args.position
    );
  }
  return result;
}
async function invokeNotebookUpdateCell(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn(rid, args.cell_index, args.source || '');
  return result;
}
async function invokeNotebookDeleteCell(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn(rid, args.cell_index);
  return result;
}
async function invokeExcelSetCell(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn(rid, args.sheet_name, args.cell, args.value);
  return result;
}
async function invokeExcelSetRange(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn(rid, args.sheet_name, args.range, args.values);
  return result;
}
async function invokeExcelAddRow(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn(rid, args.sheet_name, args.values, args.after_row);
  return result;
}
async function invokeExcelAddSheet(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn(rid, args.sheet_name, args.data);
  return result;
}
async function invokeExcelCreate(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  if (args.folder_id && automationProjectId) {
    const fd = denyUnlessResourceInScope(automationProjectId, args.folder_id);
    if (fd) {
      result = fd;
      return result;
    }
  }
  result = await fn(automationProjectId || args.project_id || args.projectId, args.title, {
    sheet_name: args.sheet_name,
    initial_data: args.initial_data,
    folder_id: args.folder_id,
  });
  return result;
}
async function invokeExcelExport(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn(rid, { format: args.format, sheet_name: args.sheet_name });
  return result;
}
async function invokeDocxGet(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn(rid, { format: args.format, max_chars: args.max_chars });
  return result;
}
async function invokeDocxGetFilePath(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn(rid);
  return result;
}
async function invokeDocxCreate(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  if (args.folder_id && automationProjectId) {
    const fd = denyUnlessResourceInScope(automationProjectId, args.folder_id);
    if (fd) {
      result = fd;
      return result;
    }
  }
  result = await fn(automationProjectId || args.project_id || args.projectId, args.title, {
    folder_id: args.folder_id,
    body: args.body,
    blocks: args.blocks,
    markdown: args.markdown,
    html: args.html,
  });
  return result;
}
async function invokeDocxUpdate(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
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
  return result;
}
async function invokeDocxDelete(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn(rid, { confirm: args.confirm === true || args.confirm === 'true' });
  return result;
}
async function invokePptCreate(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const opts = {};
  if (args.folder_id) {
    const fd = denyUnlessResourceInScope(automationProjectId, args.folder_id);
    if (fd) {
      result = fd;
      return result;
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
  return result;
}
async function invokePptGetFilePath(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn(rid);
  return result;
}
async function invokePptGetSlides(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn(rid);
  return result;
}
async function invokePptGetSlideImages(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn(rid);
  return result;
}
async function invokePptExport(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn(rid, args.options || {});
  return result;
}
async function invokeRememberFact(ctx) {
  const { fn, args } = ctx;
  let result;
  result = await fn(args.key || '', args.value || '', args.domain || 'general');
  return result;
}
async function invokeGetDocumentStructure(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn({ resource_id: rid });
  return result;
}
async function invokeLinkResources(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const a = denyUnlessResourceInScope(automationProjectId, args.source_id);
  if (a) {
    result = a;
  } else {
    const b = denyUnlessResourceInScope(automationProjectId, args.target_id);
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
  return result;
}
async function invokeGetRelatedResources(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn({ resource_id: rid });
  return result;
}
async function invokeInteractionList(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else {
    result = await fn(rid, { type: args.type, limit: args.limit });
  }
  return result;
}
async function invokeGenerateKnowledgeGraph(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  let rid = args.focus_resource_id || args.resource_id || args.resourceId;
  const sourceIds = Array.isArray(args.source_ids) ? args.source_ids.filter((x) => typeof x === 'string' && x.trim()) : [];
  if (!rid && sourceIds.length > 0) rid = sourceIds[0];
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else {
    result = await fn({
      focus_resource_id: rid,
      min_weight: args.min_weight,
    });
  }
  return result;
}
async function invokeCalendarListEvents(ctx) {
  const { fn, args } = ctx;
  let result;
  result = await fn({ start_at: args.start_at, end_at: args.end_at, calendar_ids: args.calendar_ids });
  return result;
}
async function invokeCalendarGetUpcoming(ctx) {
  const { fn, args } = ctx;
  let result;
  result = await fn({ window_minutes: args.window_minutes, limit: args.limit });
  return result;
}
async function invokeCalendarCreateEvent(ctx) {
  const { fn, args } = ctx;
  let result;
  result = await fn(args);
  return result;
}
async function invokeCalendarUpdateEvent(ctx) {
  const { fn, args } = ctx;
  let result;
  result = await fn(args);
  return result;
}
async function invokeCalendarDeleteEvent(ctx) {
  const { fn, args } = ctx;
  let result;
  result = await fn({ event_id: args.event_id });
  return result;
}
async function invokePipelineList(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  result = await fn({ project_id: automationProjectId || args.project_id });
  return result;
}
async function invokePipelineGet(ctx) {
  const { fn, args } = ctx;
  let result;
  result = await fn({ pipeline_id: args.pipeline_id });
  return result;
}
async function invokePipelineCreateCard(ctx) {
  const { fn, args } = ctx;
  let result;
  result = await fn({
            pipeline_id: args.pipeline_id,
            stage_id: args.stage_id,
            title: args.title,
            data: args.data,
            start_at: args.start_at,
            end_at: args.end_at,
          });
  return result;
}
async function invokePipelineMoveCard(ctx) {
  const { fn, args } = ctx;
  let result;
  result = await fn({ item_id: args.item_id, to_stage_id: args.to_stage_id });
  return result;
}
async function invokePipelineRunCard(ctx) {
  const { fn, args } = ctx;
  let result;
  result = await fn({ item_id: args.item_id });
  return result;
}
async function invokePipelineAddStage(ctx) {
  const { fn, args } = ctx;
  let result;
  result = await fn({
            pipeline_id: args.pipeline_id,
            title: args.title,
            execution_policy: args.execution_policy,
            assigned_agent_id: args.assigned_agent_id,
          });
  return result;
}
async function invokeEmailListFolders(ctx) {
  const { fn, toolContext } = ctx;
  let result;
  result = await fn(toolContext);
  return result;
}
async function invokeEmailListEnvelopes(ctx) {
  const { fn, args, toolContext } = ctx;
  let result;
  result = await fn({ folder: args.folder, page: args.page, page_size: args.page_size }, toolContext);
  return result;
}
async function invokeEmailSearchEnvelopes(ctx) {
  const { fn, args, toolContext } = ctx;
  let result;
  result = await fn({ query: args.query, folder: args.folder, page_size: args.page_size }, toolContext);
  return result;
}
async function invokeEmailReadMessage(ctx) {
  const { fn, args, toolContext } = ctx;
  let result;
  result = await fn({ message_id: args.message_id, folder: args.folder }, toolContext);
  return result;
}
async function invokeEmailSendMessage(ctx) {
  const { fn, args, toolContext } = ctx;
  let result;
  result = await fn({ to: args.to, subject: args.subject, body: args.body, cc: args.cc, bcc: args.bcc }, toolContext);
  return result;
}
async function invokeEmailReplyMessage(ctx) {
  const { fn, args, toolContext } = ctx;
  let result;
  result = await fn({ message_id: args.message_id, body: args.body, folder: args.folder }, toolContext);
  return result;
}
async function invokeDomeLoadDoc(ctx) {
  const { args } = ctx;
  let result;
  const { getSectionBody, DOME_LOAD_DOC_IDS } = require('../prompts/prompt-sections.cjs');
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
  return result;
}
async function invokeGetToolDefinition(ctx) {
  const { fn, args } = ctx;
  let result;
  result = await fn(args.tool_name || args.toolName || '');
  return result;
}
async function invokePdfRenderPage(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else {
    result = await fn({
      resource_id: rid,
      page_number: args.page_number ?? args.pageNumber ?? 1,
      scale: args.scale,
    });
  }
  return result;
}
async function invokeGemmaImageDescribe(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const rid = args.resource_id || args.resourceId;
  const denied = denyUnlessResourceInScope(automationProjectId, rid);
  if (denied) result = denied;
  else result = await fn({ resource_id: rid });
  return result;
}
async function invokeGemmaScreenUnderstand(ctx) {
  const { fn, args } = ctx;
  let result;
  result = await fn({
            image_base64: args.image_base64 || args.imageBase64,
            intent: args.intent,
          });
  return result;
}
async function invokeArtifactList(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  result = await fn({
            project_id: automationProjectId || args.project_id || args.projectId,
          });
  return result;
}
async function invokeArtifactCreate(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  result = await fn({
            ...args,
            project_id: automationProjectId || args.project_id || args.projectId,
          });
  return result;
}
async function invokeArtifactGet(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const artRid = args.resource_id || args.resourceId;
  const artDenied = denyUnlessResourceInScope(automationProjectId, artRid);
  if (artDenied) result = artDenied;
  else result = await fn({ resource_id: artRid });
  return result;
}
async function invokeArtifactMergeData(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const mergeRid = args.resource_id || args.resourceId;
  const mergeDenied = denyUnlessResourceInScope(automationProjectId, mergeRid);
  if (mergeDenied) result = mergeDenied;
  else
    result = await fn({
      resource_id: mergeRid,
      data_patch: args.data_patch ?? args.dataPatch ?? {},
    });
  return result;
}
async function invokeArtifactUpdateState(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const artUpdRid = args.resource_id || args.resourceId;
  const artUpdDenied = denyUnlessResourceInScope(automationProjectId, artUpdRid);
  if (artUpdDenied) result = artUpdDenied;
  else result = await fn({ ...args, resource_id: artUpdRid });
  return result;
}
async function invokeArtifactDelete(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const artDelRid = args.resource_id || args.resourceId;
  const artDelDenied = denyUnlessResourceInScope(automationProjectId, artDelRid);
  if (artDelDenied) result = artDelDenied;
  else result = await fn({ resource_id: artDelRid });
  return result;
}
async function invokeArtifactLinkResource(ctx) {
  const { fn, args, automationProjectId } = ctx;
  let result;
  const artLinkRid = args.artifact_resource_id || args.resource_id;
  const artLinkDenied = denyUnlessResourceInScope(automationProjectId, artLinkRid);
  if (artLinkDenied) result = artLinkDenied;
  else result = await fn({ resource_id: artLinkRid, linked_resource_id: args.linked_resource_id ?? null });
  return result;
}
async function invokeArtifactDesign(ctx) {
  const { fn, args } = ctx;
  let result;
  result = await fn(args);
  return result;
}
async function invokeShellExec(ctx) {
  const { fn, args, toolContext } = ctx;
  let result;
  result = await fn(args, toolContext);
  return result;
}

const HANDLER_INVOKERS = {
  resourceSearch: invokeResourceSearch,
  resourceGet: invokeResourceGet,
  resourceGetActive: invokeResourceGetActive,
  resourceGetPinned: invokeResourceGetPinned,
  resourceGetSection: invokeResourceGetSection,
  resourceList: invokeResourceList,
  resourceSemanticSearch: invokeResourceSemanticSearch,
  resourceHybridSearch: invokeResourceHybridSearch,
  projectList: invokeProjectList,
  projectGet: invokeProjectGet,
  getRecentResources: invokeGetRecentResources,
  getCurrentProject: invokeGetCurrentProject,
  getLibraryOverview: invokeGetLibraryOverview,
  resourceCreate: invokeResourceCreate,
  resourceUpdate: invokeResourceUpdate,
  resourceDelete: invokeResourceDelete,
  resourceMoveToFolder: invokeResourceMoveToFolder,
  flashcardCreate: invokeFlashcardCreate,
  webFetch: invokeWebFetch,
  webSearch: invokeWebSearch,
  deepResearch: invokeDeepResearch,
  excelGet: invokeExcelGet,
  excelGetFilePath: invokeExcelGetFilePath,
  notebookGet: invokeNotebookGet,
  notebookAddCell: invokeNotebookAddCell,
  notebookUpdateCell: invokeNotebookUpdateCell,
  notebookDeleteCell: invokeNotebookDeleteCell,
  excelSetCell: invokeExcelSetCell,
  excelSetRange: invokeExcelSetRange,
  excelAddRow: invokeExcelAddRow,
  excelAddSheet: invokeExcelAddSheet,
  excelCreate: invokeExcelCreate,
  excelExport: invokeExcelExport,
  docxGet: invokeDocxGet,
  docxGetFilePath: invokeDocxGetFilePath,
  docxCreate: invokeDocxCreate,
  docxUpdate: invokeDocxUpdate,
  docxDelete: invokeDocxDelete,
  pptCreate: invokePptCreate,
  pptGetFilePath: invokePptGetFilePath,
  pptGetSlides: invokePptGetSlides,
  pptGetSlideImages: invokePptGetSlideImages,
  pptExport: invokePptExport,
  rememberFact: invokeRememberFact,
  getDocumentStructure: invokeGetDocumentStructure,
  linkResources: invokeLinkResources,
  getRelatedResources: invokeGetRelatedResources,
  interactionList: invokeInteractionList,
  generateKnowledgeGraph: invokeGenerateKnowledgeGraph,
  calendarListEvents: invokeCalendarListEvents,
  calendarGetUpcoming: invokeCalendarGetUpcoming,
  calendarCreateEvent: invokeCalendarCreateEvent,
  calendarUpdateEvent: invokeCalendarUpdateEvent,
  calendarDeleteEvent: invokeCalendarDeleteEvent,
  pipelineList: invokePipelineList,
  pipelineGet: invokePipelineGet,
  pipelineCreateCard: invokePipelineCreateCard,
  pipelineMoveCard: invokePipelineMoveCard,
  pipelineRunCard: invokePipelineRunCard,
  pipelineAddStage: invokePipelineAddStage,
  emailListFolders: invokeEmailListFolders,
  emailListEnvelopes: invokeEmailListEnvelopes,
  emailSearchEnvelopes: invokeEmailSearchEnvelopes,
  emailReadMessage: invokeEmailReadMessage,
  emailSendMessage: invokeEmailSendMessage,
  emailReplyMessage: invokeEmailReplyMessage,
  domeLoadDoc: invokeDomeLoadDoc,
  getToolDefinition: invokeGetToolDefinition,
  pdfRenderPage: invokePdfRenderPage,
  gemmaImageDescribe: invokeGemmaImageDescribe,
  gemmaScreenUnderstand: invokeGemmaScreenUnderstand,
  artifactList: invokeArtifactList,
  artifactCreate: invokeArtifactCreate,
  artifactGet: invokeArtifactGet,
  artifactMergeData: invokeArtifactMergeData,
  artifactUpdateState: invokeArtifactUpdateState,
  artifactDelete: invokeArtifactDelete,
  artifactLinkResource: invokeArtifactLinkResource,
  artifactDesign: invokeArtifactDesign,
  shellExec: invokeShellExec,
  gitStatus: invokeShellExec,
  gitDiff: invokeShellExec,
  gitLog: invokeShellExec,
  gitBranchCreate: invokeShellExec,
  gitAdd: invokeShellExec,
  gitCommit: invokeShellExec,
};

/**
 * Dispatch to a per-handler invoker (or default fn(args)).
 * @param {string} handlerName
 * @param {{ fn: Function, args: object, toolContext?: object, automationProjectId?: string|null, getAiToolsHandler: Function }} ctx
 */
async function invokeToolHandler(handlerName, ctx) {
  const invoker = HANDLER_INVOKERS[handlerName];
  if (invoker) return invoker(ctx);
  return ctx.fn(ctx.args);
}

module.exports = {
  denyUnlessResourceInScope,
  resolveResourceId,
  normalizeMetadataArg,
  tryResolveSocialPinnedPost,
  invokeToolHandler,
  HANDLER_INVOKERS,
};
