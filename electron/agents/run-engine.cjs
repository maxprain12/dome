/* eslint-disable no-console */

const crypto = require('crypto');
const { BrowserWindow } = require('electron');
const { setMaxListeners } = require('events');
const approval = require('../ipc/agents/approval.cjs');
// Single agent runtime: every agent turn runs through the Dome-native
// `@dome/agent-core` loop (electron/agents/agent-runtime.cjs).
const agentRuntime = require('./agent-runtime.cjs');
const { getToolDefinitionsByIds, getAllToolDefinitions } = require('../tools/tool-dispatcher.cjs');
const streamingTts = require('../transcription/streaming-tts.cjs');
const { getOpenAIKey } = require('../ai/openai-key.cjs');
const { parseRuntimeContext } = require('./agent-runtime-context.cjs');
const { buildDomeSystemPrompt } = require('../prompts/system-prompt.cjs');
const { readCoreSection } = require('../prompts/tool-prompt-loader.cjs');
const logger = require('../core/logger.cjs');
const { notifyError } = require('../core/error-notify.cjs');
const runLifecycle = require('./run-lifecycle.cjs');
const { activeRunContexts, releaseRunContext, abortRun } = runLifecycle;
const workflowExecutor = require('./workflow-executor.cjs');
const { executeWorkflowRun } = workflowExecutor;
const {
  isRunAbortedError,
  parseToolArguments,
  mergeLlmUsage,
  getToolStepPatch,
} = require('./run-helpers.cjs');
const { capResultText } = require('../tools/tool-result-cap.cjs');
const runStore = require('./run-store.cjs');
const { topologicalLevels, mergePayloads, getInputPayloads } = require('./workflow-dag.cjs');

// Persistence layer (04/T05): run rows/steps/links + renderer events live in
// run-store.cjs; these aliases keep the internal call sites unchanged.
const {
  RUN_EVENT_CHANNEL,
  RUN_STEP_CHANNEL,
  RUN_CHUNK_CHANNEL,
  RUN_TERMINAL_STATUSES,
  parseJsonSafely,
  toJson,
  normalizeRunRow,
  createRun,
  patchRun,
  appendRunStep,
  updateRunStep,
  finalizeRunningRunSteps,
  getRun,
  listRuns,
  getActiveRunBySession,
  createNoteResource,
} = runStore;

function manySubagentIds() {
  const { manySubagentIds: ids } = require('./subagents-native.cjs');
  return ids();
}

function getApprovalSenderId() {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  return win?.webContents?.id ?? null;
}

const OUTPUT_MODES = new Set(['chat_only', 'note', 'studio_output', 'mixed']);
const RUN_RECOVERY_STALE_MS = 120 * 1000;
const RUN_QUEUED_ORPHAN_MS = 5 * 60 * 1000;
const RUN_WAITING_APPROVAL_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const RUN_RESTART_ERROR = 'Interrupted - the app was restarted while this run was active.';
const RUN_QUEUED_ORPHAN_ERROR = 'Orphaned — the app was restarted before this run started.';
const RUN_APPROVAL_STALE_ERROR = 'Cancelled — approval was not completed within 7 days.';

/** Stream/MCP/AbortController cancellations often surface as "terminated", not "abort". */
let _windowManager = null;
let _database = null;
function getQueries() {
  return _database?.getQueries?.();
}

function now() {
  return Date.now();
}

function emit(channel, payload) {
  _windowManager?.broadcast?.(channel, payload);
}

function normalizeAutomationArtifactBindingRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    automationId: row.automation_id,
    artifactResourceId: row.artifact_resource_id,
    slot: row.slot || 'default',
    updatePolicy: row.update_policy,
    transformHint: row.transform_hint ?? null,
    extractMode: row.extract_mode || 'json_fence',
    enabled: !!row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function attachAutomationArtifactBindings(automation) {
  if (!automation) return null;
  const queries = getQueries();
  const rows = queries.listAutomationArtifactBindings.all(automation.id);
  const artifactBindings = rows.map(normalizeAutomationArtifactBindingRow);
  return { ...automation, artifactBindings };
}

function replaceAutomationArtifactBindings(automationId, rawBindings) {
  const queries = getQueries();
  const ts = now();
  queries.deleteAutomationArtifactBindingsByAutomation.run(automationId);
  if (!Array.isArray(rawBindings)) return;
  for (const b of rawBindings) {
    if (!b || !b.artifactResourceId) continue;
    const res = queries.getResourceById.get(String(b.artifactResourceId));
    if (!res || res.type !== 'artifact') continue;
    const policy = ['replace', 'merge_shallow', 'merge_deep', 'append_array'].includes(b.updatePolicy)
      ? b.updatePolicy
      : 'replace';
    const extract = ['json_fence', 'full_output'].includes(b.extractMode) ? b.extractMode : 'json_fence';
    queries.insertAutomationArtifactBinding.run(
      typeof b.id === 'string' && b.id.length >= 32 ? b.id : crypto.randomUUID(),
      automationId,
      String(b.artifactResourceId),
      String(b.slot || 'default'),
      policy,
      b.transformHint != null ? String(b.transformHint) : null,
      extract,
      b.enabled === false ? 0 : 1,
      ts,
      ts,
    );
  }
}

function normalizeAutomationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id ?? 'default',
    title: row.title,
    description: row.description ?? '',
    targetType: row.target_type,
    targetId: row.target_id,
    triggerType: row.trigger_type,
    schedule: parseJsonSafely(row.schedule_json, null),
    inputTemplate: parseJsonSafely(row.input_template_json, null),
    outputMode: row.output_mode,
    enabled: !!row.enabled,
    legacySource: row.legacy_source ?? null,
    lastRunAt: row.last_run_at ?? null,
    lastRunStatus: row.last_run_status ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeAutomationInput(input, existingRow = null) {
  const timestamp = now();
  const projectId =
    input?.projectId ??
    input?.project_id ??
    existingRow?.project_id ??
    'default';
  return {
    id: input.id ?? crypto.randomUUID(),
    projectId: String(projectId || 'default'),
    title: String(input.title || 'Automatización').trim(),
    description: input.description ? String(input.description) : '',
    targetType: ['many', 'agent', 'workflow', 'feeder'].includes(input.targetType) ? input.targetType : 'agent',
    targetId: String(input.targetId || '').trim(),
    triggerType: ['manual', 'schedule', 'contextual'].includes(input.triggerType) ? input.triggerType : 'manual',
    schedule: input.schedule ?? null,
    inputTemplate: input.inputTemplate ?? null,
    outputMode: OUTPUT_MODES.has(input.outputMode) ? input.outputMode : 'chat_only',
    enabled: !!input.enabled,
    legacySource: input.legacySource ? String(input.legacySource) : null,
    lastRunAt: input.lastRunAt ?? null,
    lastRunStatus: input.lastRunStatus ?? null,
    createdAt: input.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

function upsertAutomation(input) {
  const queries = getQueries();
  const id = input?.id ?? crypto.randomUUID();
  const existing = queries.getAutomationDefinitionById.get(id);
  const normalized = normalizeAutomationInput({ ...input, id }, existing);
  if (existing) {
    const previous = normalizeAutomationRow(existing);
    queries.updateAutomationDefinition.run(
      normalized.projectId,
      normalized.title,
      normalized.description,
      normalized.targetType,
      normalized.targetId,
      normalized.triggerType,
      toJson(normalized.schedule),
      toJson(normalized.inputTemplate),
      normalized.outputMode,
      normalized.enabled ? 1 : 0,
      normalized.legacySource,
      normalized.lastRunAt ?? previous.lastRunAt ?? null,
      normalized.lastRunStatus ?? previous.lastRunStatus ?? null,
      normalized.updatedAt,
      normalized.id,
    );
  } else {
    queries.createAutomationDefinition.run(
      normalized.id,
      normalized.projectId,
      normalized.title,
      normalized.description,
      normalized.targetType,
      normalized.targetId,
      normalized.triggerType,
      toJson(normalized.schedule),
      toJson(normalized.inputTemplate),
      normalized.outputMode,
      normalized.enabled ? 1 : 0,
      normalized.legacySource,
      normalized.lastRunAt,
      normalized.lastRunStatus,
      normalized.createdAt,
      normalized.updatedAt,
    );
  }
  if (input.artifactBindings !== undefined) {
    replaceAutomationArtifactBindings(normalized.id, input.artifactBindings);
  }
  return attachAutomationArtifactBindings(normalizeAutomationRow(queries.getAutomationDefinitionById.get(normalized.id)));
}

function listAutomations(filters = {}) {
  const queries = getQueries();
  if (filters.targetType && filters.targetId) {
    const rows = queries.getAutomationDefinitionsByTarget.all(filters.targetType, filters.targetId);
    const mapped = rows.map(normalizeAutomationRow).map(attachAutomationArtifactBindings);
    if (filters.projectId) {
      return mapped.filter((a) => a.projectId === filters.projectId);
    }
    return mapped;
  }
  if (filters.projectId) {
    return queries.getAutomationDefinitionsByProject.all(filters.projectId).map(normalizeAutomationRow).map(attachAutomationArtifactBindings);
  }
  return queries.getAllAutomationDefinitions.all().map(normalizeAutomationRow).map(attachAutomationArtifactBindings);
}

function deleteAutomation(id) {
  const queries = getQueries();
  queries.deleteAutomationDefinition.run(id);
}

function deleteRun(runId) {
  abortRun(runId);
  releaseRunContext(runId, { force: true });
  const queries = getQueries();
  const row = queries.getAutomationRunById.get(runId);
  if (!row) return;
  const snapshot = normalizeRunRow(row);
  queries.deleteAutomationRun.run(runId);
  emit(RUN_EVENT_CHANNEL, { run: snapshot, deleted: true });
  emit('dome:runs-changed');
}

function getAutomation(id) {
  const queries = getQueries();
  const base = normalizeAutomationRow(queries.getAutomationDefinitionById.get(id));
  return attachAutomationArtifactBindings(base);
}

function setAutomationRunStatus(automationId, status) {
  const automation = getAutomation(automationId);
  if (!automation) return null;
  return upsertAutomation({
    ...automation,
    lastRunAt: now(),
    lastRunStatus: status,
  });
}

function ensureSettingsFlag(key) {
  const queries = getQueries();
  return queries?.getSetting?.get(key)?.value === '1';
}

function writeSettingsFlag(key) {
  const queries = getQueries();
  queries?.setSetting?.run(key, '1', now());
}

function loadManyAgents(projectId = 'default') {
  const queries = getQueries();
  const rows = queries?.listManyAgents?.all?.(projectId) ?? [];
  if (Array.isArray(rows) && rows.length > 0) {
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      systemInstructions: row.system_instructions || '',
      toolIds: parseJsonSafely(row.tool_ids, []),
      mcpServerIds: parseJsonSafely(row.mcp_server_ids, []),
      skillIds: parseJsonSafely(row.skill_ids, []),
      iconIndex: row.icon_index,
      marketplaceId: row.marketplace_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
  const raw = queries?.getSetting?.get('many_agents')?.value;
  const parsed = parseJsonSafely(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

function loadWorkflowById(workflowId) {
  const queries = getQueries();
  const row = queries?.getCanvasWorkflowById?.get?.(workflowId);
  if (row) {
    return {
      id: row.id,
      projectId: row.project_id ?? 'default',
      name: row.name,
      description: row.description || '',
      nodes: parseJsonSafely(row.nodes_json, []),
      edges: parseJsonSafely(row.edges_json, []),
      marketplace: row.marketplace_json ? parseJsonSafely(row.marketplace_json, null) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  const raw = queries?.getSetting?.get('canvas_workflows')?.value;
  const parsed = parseJsonSafely(raw, []);
  if (!Array.isArray(parsed)) return null;
  return parsed.find((workflow) => workflow?.id === workflowId) ?? null;
}

async function getProviderConfig(providerArg, modelArg) {
  const { resolveProviderConfig } = require('../ai/resolve-provider-config.cjs');
  return resolveProviderConfig(_database, providerArg, modelArg);
}

function persistAssistantMessage(sessionId, payload) {
  const queries = getQueries();
  const messageId = crypto.randomUUID();
  const timestamp = now();
  queries.createChatMessage.run(
    messageId,
    sessionId,
    'assistant',
    payload.content || '',
    toJson(payload.toolCalls ?? []),
    payload.thinking || null,
    toJson(payload.metadata ?? {}),
    timestamp,
  );
  queries.updateChatSession.run(
    payload.mode ?? 'many',
    payload.contextId ?? null,
    payload.threadId ?? null,
    payload.title ?? null,
    toJson(payload.toolIds ?? []),
    toJson(payload.mcpServerIds ?? []),
    timestamp,
    sessionId,
  );
  if (_windowManager?.broadcast) {
    _windowManager.broadcast('chat:session-updated', { sessionId, at: timestamp });
  }
}

function tryPersistRunAssistantMessage(sessionId, persistOpts, context) {
  if (!sessionId) {
    if (persistOpts.ownerType === 'many') {
      console.warn('[RunEngine] Many run completed without sessionId — assistant reply not saved to chat_messages');
    }
    return;
  }
  try {
    persistAssistantMessage(sessionId, {
      content: context.fullResponse,
      toolCalls: context.toolCalls,
      thinking: context.fullThinking,
      metadata: {
        mode: persistOpts.ownerType,
        runId: persistOpts.runId,
        ...(context.llmUsage ? { usage: context.llmUsage } : {}),
      },
      mode: persistOpts.ownerType === 'agent' ? 'agent' : 'many',
      contextId: persistOpts.contextId ?? null,
      threadId: context.threadId,
      title: persistOpts.sessionTitle ?? null,
      toolIds: persistOpts.toolIds ?? [],
      mcpServerIds: persistOpts.mcpServerIds ?? [],
    });
  } catch (e) {
    console.warn('[RunEngine] Could not persist assistant message to DB:', e?.message);
  }
}

function createRunChunkEmitter(runId, context) {
  return (data) => {
    const heartbeat = now();
    context.lastHeartbeatAt = heartbeat;
    if (data.type === 'thinking' && data.text) {
      context.fullThinking += data.text;
      emit(RUN_CHUNK_CHANNEL, { runId, type: 'thinking', text: data.text });
      patchRun(runId, { lastHeartbeatAt: heartbeat });
      return;
    }
    if (data.type === 'text' && data.text) {
      context.fullResponse += data.text;
      emit(RUN_CHUNK_CHANNEL, { runId, type: 'text', text: data.text });
      // Feed chunk to streaming TTS if this run requested autoSpeak
      if (context.autoSpeak) {
        streamingTts.feedChunk(runId, data.text);
      }
      patchRun(runId, {
        status: 'running',
        outputText: context.fullResponse,
        lastHeartbeatAt: heartbeat,
      });
      return;
    }
    if (data.type === 'tool_call' && data.toolCall) {
      let args = {};
      try {
        args = typeof data.toolCall.arguments === 'string'
          ? JSON.parse(data.toolCall.arguments)
          : (data.toolCall.arguments || {});
      } catch {
        args = {};
      }
      context.toolCalls.push({
        id: data.toolCall.id,
        name: data.toolCall.name,
        arguments: args,
        status: 'running',
        ...(data.agentName ? { agentName: data.agentName } : {}),
      });
      const step = appendRunStep({
        runId,
        stepType: 'tool_call',
        title: data.toolCall.name,
        status: 'running',
        metadata: {
          toolCallId: data.toolCall.id,
          arguments: args,
          ...(data.agentName ? { agentName: data.agentName } : {}),
        },
      });
      if (!step) return;
      context.toolStepIds.set(data.toolCall.id, step.id);
      context.toolSteps.set(data.toolCall.id, step);
      emit(RUN_CHUNK_CHANNEL, {
        runId,
        type: 'tool_call',
        toolCall: data.toolCall,
        ...(data.agentName ? { agentName: data.agentName } : {}),
      });
      patchRun(runId, { lastHeartbeatAt: heartbeat });
      return;
    }
    if (data.type === 'tool_result' && data.toolCallId != null) {
      const stepPatch = getToolStepPatch(data.toolCallId, data.result);
      const entry = context.toolCalls.find((item) => item.id === data.toolCallId);
      if (entry) {
        entry.status = stepPatch.status === 'failed' ? 'error' : 'success';
        // Bound the result we KEEP in context.toolCalls — it is persisted verbatim
        // into automation_runs.metadata (and chat_messages.tool_calls) at run end.
        // An unbounded multi-MB MCP result here is what made JSON.stringify(metadata)
        // OOM the main process (ELECTRON-7) and bloated the DB with free pages.
        entry.result = capResultText(data.result);
      }
      const stepId = context.toolStepIds.get(data.toolCallId);
      if (stepId) {
        const existingStep = context.toolSteps.get(data.toolCallId) ?? null;
        const nextStep = updateRunStep(
          stepId,
          stepPatch,
          existingStep,
        );
        if (nextStep) context.toolSteps.set(data.toolCallId, nextStep);
      }
      emit(RUN_CHUNK_CHANNEL, {
        runId,
        type: 'tool_result',
        toolCallId: data.toolCallId,
        result: data.result,
        ...(data.agentName ? { agentName: data.agentName } : {}),
      });
      patchRun(runId, { lastHeartbeatAt: heartbeat });
      return;
    }
    if (data.type === 'budget' && data.breakdown) {
      emit(RUN_CHUNK_CHANNEL, { runId, type: 'budget', breakdown: data.breakdown });
      return;
    }
    if (data.type === 'compaction') {
      emit(RUN_CHUNK_CHANNEL, {
        runId,
        type: 'compaction',
        tokensBefore: data.tokensBefore ?? 0,
        tokensAfter: data.tokensAfter ?? null,
        summaryPreview: data.summaryPreview ?? '',
        automatic: data.automatic !== false,
      });
      return;
    }
    if (data.type === 'error' && data.error) {
      emit(RUN_CHUNK_CHANNEL, { runId, type: 'error', error: data.error });
      patchRun(runId, {
        status: 'failed',
        error: data.error,
        lastHeartbeatAt: heartbeat,
      });
      return;
    }
    if (data.type === 'done') {
      emit(RUN_CHUNK_CHANNEL, { runId, type: 'done' });
      return;
    }
    if (data.type === 'usage' && data.usage) {
      if (data.cumulative) {
        // Canonical full-thread snapshot: REPLACE (never sum) to avoid double
        // counting against the per-chunk incremental partials.
        context.llmUsage = data.usage;
        context.llmUsageLive = data.usage;
      } else {
        // Incremental per-model-call delta: accumulate a live running total.
        context.llmUsageLive = mergeLlmUsage(context.llmUsageLive, data.usage);
      }
      emit(RUN_CHUNK_CHANNEL, {
        runId,
        type: 'usage',
        usage: context.llmUsageLive ?? data.usage,
        partial: data.partial === true,
      });
      return;
    }
    if (
      data.type === 'interrupt' &&
      Array.isArray(data.actionRequests) &&
      data.actionRequests.length > 0
    ) {
      context.threadId = data.threadId || context.threadId;
      const reviewConfigs = Array.isArray(data.reviewConfigs) ? data.reviewConfigs : [];
      patchRun(runId, {
        status: 'waiting_approval',
        threadId: context.threadId,
        metadata: {
          pendingApproval: {
            actionRequests: data.actionRequests,
            reviewConfigs,
            pendingToolCall: data.pendingToolCall ?? null,
          },
          resumeOpts: context.agentResumeOpts ?? null,
          ...(context.llmUsage ? { usage: context.llmUsage } : {}),
        },
        lastHeartbeatAt: heartbeat,
      });
      emit(RUN_CHUNK_CHANNEL, {
        runId,
        type: 'interrupt',
        actionRequests: data.actionRequests,
        reviewConfigs,
        threadId: data.threadId,
      });
    }
  };
}

async function executeAgentRun(runId, params) {
  const context = activeRunContexts.get(runId);
  if (!context) return;
  patchRun(runId, {
    status: 'running',
    threadId: context.threadId,
    metadata: {
      kind: 'harness',
      provider: context.provider,
      model: context.model,
      mcpServerIds: params.mcpServerIds ?? [],
      subagentIds: params.ownerType === 'many' ? manySubagentIds() : (params.subagentIds ?? []),
      title: params.title ?? '',
      contextId: params.contextId ?? null,
      sessionTitle: params.sessionTitle ?? null,
      toolIds: params.toolIds ?? [],
    },
  });
  appendRunStep({
    runId,
    stepType: 'info',
    title: 'Run iniciado',
    status: 'done',
    content: params.title ?? 'Ejecución de agente',
  });
  const useDirectToolsRun =
    params.ownerType === 'many' ||
    (params.toolDefinitions?.length ?? 0) > 0 ||
    (params.mcpServerIds?.length ?? 0) > 0;
  const automationProjectId = params.automationId ? (params.projectId ?? context.projectId ?? 'default') : undefined;
  const runtimeContext = parseRuntimeContext({
    activeResourceId: params.contextId || null,
    pinnedResourceIds: Array.isArray(params.pinnedResourceIds) ? params.pinnedResourceIds : [],
  });
  context.agentResumeOpts = {
    messages: params.messages ?? [],
    toolDefinitions: params.toolDefinitions ?? [],
    useDirectTools: useDirectToolsRun,
    mcpServerIds: params.mcpServerIds,
    subagentIds: params.ownerType === 'many' ? manySubagentIds() : params.subagentIds,
      skipHitl: !!params.skipHitl,
      automationProjectId,
      automationId: params.automationId ?? null,
      ownerType: params.ownerType,
      runtimeContext,
  };

  // Single-agent surface: Many (ownerType 'many') and agent-chat (ownerType
  // 'agent') share this path. Both run through the Dome-native harness
  // (`@dome/agent-core`) under their own surface name.
  const runSurface = params.ownerType === 'agent' ? 'agent-chat' : 'many';
  try {
    const result = await agentRuntime.runAgent(runSurface, {
      provider: context.provider,
      model: context.model,
      apiKey: context.apiKey,
      baseUrl: context.baseUrl,
      messages: params.messages,
      toolDefinitions: params.toolDefinitions ?? [],
      useDirectTools: useDirectToolsRun,
      mcpServerIds: params.mcpServerIds,
      subagentIds: params.ownerType === 'many' ? manySubagentIds() : params.subagentIds,
      threadId: context.threadId,
      sessionId: params.sessionId ?? null,
      skipHitl: !!params.skipHitl,
      hitlInterrupt: !params.skipHitl,
      requiresApproval: params.skipHitl ? null : agentRuntime.HITL_TOOL_NAMES,
      signal: context.controller.signal,
      onChunk: createRunChunkEmitter(runId, context),
      automationProjectId,
      automationId: params.automationId ?? null,
      ownerType: params.ownerType,
      runtimeContext,
      userMemory: params.userMemory ?? null,
    });
    const current = getRun(runId);
    if (current?.status === 'waiting_approval' || result?.__interrupt__) {
      return getRun(runId);
    }
    if (params.sessionId) {
      tryPersistRunAssistantMessage(
        params.sessionId,
        {
          ownerType: params.ownerType,
          runId,
          contextId: params.contextId ?? null,
          sessionTitle: params.sessionTitle ?? null,
          toolIds: params.toolIds ?? [],
          mcpServerIds: params.mcpServerIds ?? [],
        },
        context,
      );
    }
    appendRunStep({
      runId,
      stepType: 'completion',
      title: 'Run completado',
      status: 'done',
      content: context.fullResponse.slice(0, 8000),
      ...(context.llmUsage ? { metadata: { usage: context.llmUsage } } : {}),
    });
    // Flush streaming TTS (plays any remaining buffered text)
    if (context.autoSpeak) {
      streamingTts.flush(runId);
    }
    finalizeRunningRunSteps(runId, 'completed', context);
    return patchRun(runId, {
      status: 'completed',
      outputText: context.fullResponse,
      summary: context.fullResponse.slice(0, 280) || params.title || 'Run completado',
      finishedAt: now(),
      error: null,
      threadId: context.threadId,
      metadata: {
        kind: 'harness',
        provider: context.provider,
        model: context.model,
        toolCalls: context.toolCalls,
        ...(context.llmUsage ? { usage: context.llmUsage } : {}),
      },
    });
  } catch (error) {
    const aborted = isRunAbortedError(error, context.controller?.signal);
    // Cancel streaming TTS on error/abort
    if (context.autoSpeak) {
      streamingTts.cancel(runId);
    }
    for (const entry of context.toolCalls) {
      if (entry.status === 'running') entry.status = aborted ? 'cancelled' : 'error';
    }
    finalizeRunningRunSteps(runId, aborted ? 'cancelled' : 'failed', context);
    appendRunStep({
      runId,
      stepType: aborted ? 'cancelled' : 'error',
      title: aborted ? 'Run cancelado' : 'Run con error',
      status: aborted ? 'cancelled' : 'failed',
      content: error?.message || String(error),
      ...(context.llmUsage ? { metadata: { usage: context.llmUsage } } : {}),
    });
    if (!aborted) {
      notifyError({
        scope: 'runs',
        message: error?.message || String(error),
        runId,
        title: getRun(runId)?.title || undefined,
      });
    }
    const currentMeta = getRun(runId)?.metadata ?? {};
    const patched = await patchRun(runId, {
      status: aborted ? 'cancelled' : 'failed',
      outputText: context.fullResponse,
      summary: context.fullResponse.slice(0, 280) || null,
      error: aborted ? null : (error?.message || String(error)),
      finishedAt: now(),
      metadata: {
        ...currentMeta,
        kind: currentMeta.kind ?? 'harness',
        provider: context.provider,
        model: context.model,
        toolCalls: context.toolCalls,
        ...(context.llmUsage ? { usage: context.llmUsage } : {}),
      },
    });
    if (
      aborted &&
      params.sessionId &&
      (context.fullResponse.trim().length > 0 || context.toolCalls.length > 0)
    ) {
      try {
        persistAssistantMessage(params.sessionId, {
          content: context.fullResponse.trim(),
          toolCalls: context.toolCalls,
          thinking: context.fullThinking,
          metadata: {
            mode: params.ownerType,
            runId,
            cancelled: true,
            ...(context.llmUsage ? { usage: context.llmUsage } : {}),
          },
          mode: params.ownerType === 'agent' ? 'agent' : 'many',
          contextId: params.contextId ?? null,
          threadId: context.threadId,
          title: params.sessionTitle ?? null,
          toolIds: params.toolIds ?? [],
          mcpServerIds: params.mcpServerIds ?? [],
        });
      } catch (e) {
        console.warn('[RunEngine] Could not persist partial assistant message on cancel:', e?.message);
      }
    }
    return patched;
  } finally {
    const latest = getRun(runId);
    if (!latest || RUN_TERMINAL_STATUSES.has(latest.status)) {
      releaseRunContext(runId, { force: true });
    }
  }
}

async function startAgentRun(params) {
  const providerConfig = await getProviderConfig(params.provider, params.model);
  // Anchor thread_id to session_id when available so checkpoint history and
  // chat messages are correlated. Automations without a session get a unique run ID.
  const threadId = params.threadId
    || (params.sessionId ? `session_${params.sessionId}` : `run_${params.ownerType}_${now()}`);
  const run = createRun({
    automationId: params.automationId ?? null,
    projectId: params.projectId ?? 'default',
    ownerType: params.ownerType,
    ownerId: params.ownerId,
    title: params.title ?? 'Run de agente',
    status: 'queued',
    sessionId: params.sessionId ?? null,
    workflowId: params.workflowId ?? null,
    threadId,
    metadata: {
      kind: 'harness',
      provider: providerConfig.provider,
      model: providerConfig.model,
      contextId: params.contextId ?? null,
    },
  });
  const controller = new AbortController();
  setMaxListeners(64, controller.signal);
  const autoSpeak = Boolean(params.autoSpeak);
  const voiceLanguage = typeof params.voiceLanguage === 'string' ? params.voiceLanguage : 'es';
  activeRunContexts.set(run.id, {
    controller,
    createdAt: Date.now(),
    fullResponse: run.outputText || '',
    fullThinking: '',
    toolCalls: [],
    toolStepIds: new Map(),
    toolSteps: new Map(),
    threadId,
    provider: providerConfig.provider,
    model: providerConfig.model,
    apiKey: providerConfig.apiKey,
    baseUrl: providerConfig.baseUrl,
    autoSpeak,
    voiceLanguage,
    projectId: params.projectId ?? 'default',
  });
  if (autoSpeak) {
    streamingTts.start(run.id, { language: voiceLanguage });
  }
  setImmediate(() => {
    void executeAgentRun(run.id, {
      ...params,
      sessionId: run.sessionId,
      title: run.title,
      threadId,
      provider: providerConfig.provider,
      model: providerConfig.model,
    });
  });
  return getRun(run.id);
}

async function resumeRun(runId, decisions) {
  const run = getRun(runId);
  if (!run?.threadId) {
    throw new Error('El run no tiene threadId para reanudar');
  }
  const metadata = run.metadata ?? {};
  const providerConfig = await getProviderConfig(metadata.provider, metadata.model);
  const existingContext = activeRunContexts.get(runId);
  let controller;
  if (existingContext?.controller) {
    controller = existingContext.controller;
  } else {
    controller = new AbortController();
    setMaxListeners(64, controller.signal);
  }
  // When the process restarted during HITL, the in-memory context is gone.
  // Hydrate the accumulated usage from the persisted run metadata so the merge
  // doesn't lose tokens spent before the interrupt.
  const hydratedUsage =
    metadata.usage && typeof metadata.usage === 'object' ? mergeLlmUsage(null, metadata.usage) : null;
  const context = existingContext ?? {
    controller,
    fullResponse: run.outputText || '',
    fullThinking: '',
    toolCalls: Array.isArray(metadata.toolCalls) ? metadata.toolCalls : [],
    toolStepIds: new Map(),
    toolSteps: new Map(),
    threadId: run.threadId,
    provider: providerConfig.provider,
    model: providerConfig.model,
    apiKey: providerConfig.apiKey,
    baseUrl: providerConfig.baseUrl,
    projectId: run.projectId ?? 'default',
    llmUsage: hydratedUsage,
    llmUsageLive: hydratedUsage,
  };
  if (existingContext && existingContext.projectId == null) {
    existingContext.projectId = run.projectId ?? 'default';
  }
  if (!context.createdAt) context.createdAt = Date.now();
  activeRunContexts.set(runId, context);
  appendRunStep({
    runId,
    stepType: 'decision',
    title: 'Reanudación manual',
    status: 'done',
    content: JSON.stringify(decisions),
  });
  patchRun(runId, {
    status: 'running',
    metadata: {
      pendingApproval: null,
      provider: providerConfig.provider,
      model: providerConfig.model,
    },
  });
  try {
    const pendingApproval = metadata.pendingApproval ?? {};
    const resumeOpts = metadata.resumeOpts ?? {};
    const runSurface = run.ownerType === 'agent' ? 'agent-chat' : 'many';

    const result = await agentRuntime.resumeDomeAgent(runSurface, {
      threadId: run.threadId,
      decisions,
      pendingApproval,
      pendingToolCall: pendingApproval.pendingToolCall ?? null,
      provider: providerConfig.provider,
      model: providerConfig.model,
      apiKey: providerConfig.apiKey,
      baseUrl: providerConfig.baseUrl,
      messages: resumeOpts.messages ?? [{ role: 'user', content: 'Continue after approval.' }],
      toolDefinitions: resumeOpts.toolDefinitions ?? [],
      mcpServerIds: resumeOpts.mcpServerIds,
      runtimeContext: resumeOpts.runtimeContext,
      signal: controller.signal,
      onChunk: createRunChunkEmitter(runId, context),
    });

    if (result && typeof result === 'object' && result.__interrupt__) {
      return getRun(runId);
    }

    if (run.sessionId) {
      tryPersistRunAssistantMessage(
        run.sessionId,
        {
          ownerType: run.ownerType,
          runId,
          contextId: metadata.contextId ?? null,
          sessionTitle: metadata.sessionTitle ?? null,
          toolIds: metadata.toolIds ?? [],
          mcpServerIds: metadata.mcpServerIds ?? [],
        },
        context,
      );
    }
    appendRunStep({
      runId,
      stepType: 'completion',
      title: 'Run completado',
      status: 'done',
      content: context.fullResponse.slice(0, 8000),
      ...(context.llmUsage ? { metadata: { usage: context.llmUsage } } : {}),
    });
    finalizeRunningRunSteps(runId, 'completed', context);
    return patchRun(runId, {
      status: 'completed',
      outputText: context.fullResponse,
      summary: context.fullResponse.slice(0, 280) || 'Run completado',
      finishedAt: now(),
      error: null,
      threadId: context.threadId,
      metadata: {
        kind: metadata.kind ?? 'harness',
        provider: context.provider,
        model: context.model,
        toolCalls: context.toolCalls,
        pendingApproval: null,
        ...(context.llmUsage ? { usage: context.llmUsage } : {}),
      },
    });
  } catch (error) {
    const failMeta = run.metadata ?? {};
    return patchRun(runId, {
      status: 'failed',
      error: error?.message || String(error),
      finishedAt: now(),
      metadata: {
        ...failMeta,
        ...(context.llmUsage ? { usage: context.llmUsage } : {}),
      },
    });
  } finally {
    const latest = getRun(runId);
    if (!latest || RUN_TERMINAL_STATUSES.has(latest.status)) {
      releaseRunContext(runId, { force: true });
    }
  }
}

function startWorkflowRun(params) {
  const workflow = loadWorkflowById(params.workflowId);
  if (!workflow) {
    throw new Error('Workflow no encontrado');
  }
  const run = createRun({
    automationId: params.automationId ?? null,
    projectId: workflow.projectId ?? 'default',
    ownerType: 'workflow',
    ownerId: workflow.id,
    title: params.title ?? workflow.name,
    status: 'queued',
    workflowId: workflow.id,
    metadata: {
      kind: 'workflow',
      workflowName: workflow.name,
      progress: {
        total: Array.isArray(workflow.nodes) ? workflow.nodes.length : 0,
        completed: 0,
        percent: 0,
        completedNodeIds: [],
      },
    },
  });
  const controller = new AbortController();
  setMaxListeners(64, controller.signal);
  activeRunContexts.set(run.id, { controller, createdAt: Date.now() });
  setImmediate(() => {
    void executeWorkflowRun(run.id, params, workflow);
  });
  return getRun(run.id);
}

async function fireContextualAutomations(tag) {
  if (!tag || typeof tag !== 'string') return { fired: 0 };
  const all = listAutomations({});
  let fired = 0;
  for (const a of all) {
    if (!a.enabled || a.triggerType !== 'contextual') continue;
    const tags = Array.isArray(a.schedule?.contextTags) ? a.schedule.contextTags : [];
    if (!tags.includes(tag)) continue;
    try {
      await startAutomationNow(a.id);
      fired += 1;
    } catch (e) {
      console.warn('[RunEngine] contextual automation failed', a.id, e?.message);
    }
  }
  return { fired };
}

function buildAutomationUserContent(automation) {
  const base =
    automation.inputTemplate?.prompt || automation.description || automation.title || 'Automatización';
  let content = String(base);
  const bindings = Array.isArray(automation.artifactBindings) ? automation.artifactBindings : [];
  const enabledBindings = bindings.filter((b) => b && b.enabled !== false && b.artifactResourceId);
  if (enabledBindings.length > 0) {
    const lines = enabledBindings.map(
      (b) =>
        `- resourceId=${b.artifactResourceId} slot=${b.slot || 'default'} policy=${
          b.updatePolicy || 'replace'
        } extract=${b.extractMode || 'json_fence'}`,
    );
    content +=
      `\n\n[Salida requerida: al terminar, incluye exactamente un bloque de código Markdown \`\`\`json ... \`\`\` cuyo contenido sea un ÚNICO objeto JSON (raíz = objeto) con los datos para actualizar el artefacto vinculado. Líneas de destino:]\n${lines.join(
        '\n',
      )}`;
  }
  const it = automation.inputTemplate || {};
  if (it.boundArtifactResourceId && enabledBindings.length === 0) {
    const slot = it.artifactOutputSlot || 'default';
    content += `\n\n[Salida requerida: incluye un bloque \`\`\`json ... \`\`\` con un objeto JSON para el recurso artifact ${it.boundArtifactResourceId} (slot: ${slot}).]`;
  }
  return content;
}

function buildAutomationMessages(automation, title, targetLabel) {
  const userContent = String(targetLabel || title);
  if (automation.targetType === 'agent') {
    const agent = loadManyAgents(automation.projectId ?? 'default').find((item) => item.id === automation.targetId);
    const persona =
      agent?.systemInstructions ||
      agent?.description ||
      (agent ? `You are ${agent.name}.` : '');
    if (persona.trim()) {
      return [
        { role: 'system', content: buildDomeSystemPrompt({ staticPersona: persona.trim() }) },
        { role: 'user', content: userContent },
      ];
    }
  }
  if (automation.targetType === 'many') {
    const contextFiles = require('../personality/context-files.cjs');
    const { soul } = contextFiles.loadContextFiles();
    const manyPersona = soul.trim() || readCoreSection('roleMany') || '';
    return [
      { role: 'system', content: buildDomeSystemPrompt({ staticPersona: manyPersona.trim() }) },
      { role: 'user', content: userContent },
    ];
  }
  return [{ role: 'user', content: userContent }];
}

async function startAutomationNow(automationId) {
  const automation = getAutomation(automationId);
  if (!automation) {
    throw new Error('Automatización no encontrada');
  }
  const title = automation.title || 'Automatización';
  if (automation.targetType === 'feeder') {
    const { runFeeder } = require('../services/feeder-runner.cjs');
    try {
      setAutomationRunStatus(automation.id, 'running');
      const result = await runFeeder(_database, _windowManager, automation.targetId, {
        triggeredBy: 'automation',
        automationId: automation.id,
      });
      setAutomationRunStatus(automation.id, 'completed');
      return result;
    } catch (err) {
      setAutomationRunStatus(automation.id, 'failed');
      throw err;
    }
  }
  if (automation.targetType === 'workflow') {
    const run = startWorkflowRun({
      workflowId: automation.targetId,
      automationId: automation.id,
      title,
      inputTemplate: automation.inputTemplate ?? null,
      outputMode: automation.outputMode,
    });
    setAutomationRunStatus(automation.id, run?.status || 'queued');
    return run;
  }
  const targetOwnerType = automation.targetType === 'many' ? 'many' : 'agent';
  const targetLabel = buildAutomationUserContent(automation);
  const configuredToolIds = automation.inputTemplate?.toolIds || [];
  const toolDefinitions =
    automation.targetType === 'many' || automation.targetType === 'agent'
      ? getAllToolDefinitions()
      : (Array.isArray(configuredToolIds) && configuredToolIds.length > 0
        ? getToolDefinitionsByIds(configuredToolIds)
        : []);
  const activeToolIds = toolDefinitions.map((def) => def.function?.name).filter(Boolean);
  // Persistent thread per automation: schedule-based automations accumulate
  // context across runs. The thread lives in the SqliteSaver checkpointer so
  // the agent remembers previous outputs. Set persistThread: false in
  // inputTemplate to generate a fresh thread per run.
  const persistThread = automation.inputTemplate?.persistThread !== false;
  const automationThreadId = persistThread ? `automation_${automation.id}` : undefined;
  const run = await startAgentRun({
    automationId: automation.id,
    projectId: automation.projectId ?? 'default',
    ownerType: targetOwnerType,
    ownerId: automation.targetId,
    title,
    messages: buildAutomationMessages(automation, title, targetLabel),
    toolDefinitions,
    threadId: automationThreadId,
    mcpServerIds: Array.isArray(automation.inputTemplate?.mcpServerIds) ? automation.inputTemplate.mcpServerIds : [],
    subagentIds: Array.isArray(automation.inputTemplate?.subagentIds) ? automation.inputTemplate.subagentIds : [],
    skipHitl: true,
    toolIds: activeToolIds,
    contextId: automation.inputTemplate?.contextId ?? null,
  });
  setAutomationRunStatus(automation.id, run?.status || 'queued');
  return run;
}

function migrateLegacyAutomations() {
  if (ensureSettingsFlag('automation_definitions_migrated')) return;
  const queries = getQueries();
  const raw = queries?.getSetting?.get('automations_config')?.value;
  const parsed = parseJsonSafely(raw, []);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    writeSettingsFlag('automation_definitions_migrated');
    return;
  }
  for (const item of parsed) {
    const cadence = item?.cadence === 'weekly' ? 'weekly' : 'daily';
    upsertAutomation({
      id: `legacy-${item.id || crypto.randomUUID()}`,
      projectId: item.projectId || 'default',
      title: String(item.id || 'Legacy automation')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase()),
      description: 'Importada desde Calendar; reasigna su destino a un agente o workflow.',
      targetType: 'many',
      targetId: 'legacy-calendar',
      triggerType: 'schedule',
      schedule: {
        cadence,
        hour: Number(item.hour ?? 8),
        weekday: item.weekday ?? null,
      },
      inputTemplate: {
        projectId: item.projectId || 'default',
        prompt: `Ejecuta la automatización heredada "${item.id}" para el proyecto ${item.projectId || 'default'}.`,
      },
      outputMode: 'note',
      enabled: !!item.enabled,
      legacySource: 'automations_config',
      lastRunAt: item.lastRunAt ?? null,
      lastRunStatus: item.lastRunAt ? 'completed' : null,
    });
  }
  writeSettingsFlag('automation_definitions_migrated');
}

function migrateLegacyWorkflowExecutions() {
  if (ensureSettingsFlag('automation_runs_legacy_canvas_migrated')) return;
  const queries = getQueries();
  let parsed = [];
  try {
    const rows = _database?.getDB?.()?.prepare('SELECT * FROM workflow_executions ORDER BY started_at DESC')?.all?.() ?? [];
    if (Array.isArray(rows) && rows.length > 0) {
      parsed = rows.map((row) => ({
        id: row.id,
        workflowId: row.workflow_id,
        workflowName: row.workflow_name,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        status: row.status,
        entries: parseJsonSafely(row.entries_json, []),
        nodeOutputs: row.node_outputs_json ? parseJsonSafely(row.node_outputs_json, {}) : {},
      }));
    } else {
      const raw = queries?.getSetting?.get('canvas_executions')?.value;
      parsed = parseJsonSafely(raw, []);
    }
  } catch {
    const raw = queries?.getSetting?.get('canvas_executions')?.value;
    parsed = parseJsonSafely(raw, []);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    writeSettingsFlag('automation_runs_legacy_canvas_migrated');
    return;
  }
  for (const execution of parsed) {
    const run = createRun({
      id: execution.id,
      projectId: 'default',
      ownerType: 'workflow',
      ownerId: execution.workflowId || 'legacy-workflow',
      title: execution.workflowName || 'Workflow legacy',
      status: execution.status === 'error' ? 'failed' : 'completed',
      workflowId: execution.workflowId || null,
      workflowExecutionId: execution.id,
      outputText: execution.entries?.map((entry) => entry.message).filter(Boolean).join('\n') || '',
      summary: execution.workflowName || 'Workflow legacy',
      metadata: {
        legacySource: 'canvas_executions',
        nodeOutputs: execution.nodeOutputs ?? {},
      },
      startedAt: execution.startedAt || now(),
      updatedAt: execution.finishedAt || execution.startedAt || now(),
      finishedAt: execution.finishedAt || execution.startedAt || now(),
      lastHeartbeatAt: execution.finishedAt || execution.startedAt || now(),
    });
    for (const entry of execution.entries || []) {
      appendRunStep({
        runId: run.id,
        stepType: entry.type || 'info',
        title: entry.nodeLabel || entry.nodeId || 'Paso',
        status: entry.type === 'error' ? 'failed' : 'done',
        content: entry.message || '',
        metadata: {
          nodeId: entry.nodeId,
          timestamp: entry.timestamp,
        },
        createdAt: entry.timestamp || run.startedAt,
        updatedAt: entry.timestamp || run.startedAt,
      });
    }
  }
  writeSettingsFlag('automation_runs_legacy_canvas_migrated');
}

function migrateLegacyData() {
  migrateLegacyAutomations();
  migrateLegacyWorkflowExecutions();
}

function recoverStuckRuns() {
  try {
    const db = _database.getDB();
    const ts = now();
    const runningStaleCutoff = ts - RUN_RECOVERY_STALE_MS;
    const queuedStaleCutoff = ts - RUN_QUEUED_ORPHAN_MS;
    const approvalStaleCutoff = ts - RUN_WAITING_APPROVAL_STALE_MS;

    // Fail runs that were actively executing (running) and missed heartbeat.
    const runningResult = db.prepare(`
      UPDATE automation_runs
      SET status = 'failed',
          error = ?,
          finished_at = ?,
          updated_at = ?
      WHERE status = 'running'
        AND COALESCE(last_heartbeat_at, updated_at, started_at) < ?
    `).run(RUN_RESTART_ERROR, ts, ts, runningStaleCutoff);

    // Queued runs left behind after a crash never start — unblock automations.
    const queuedResult = db.prepare(`
      UPDATE automation_runs
      SET status = 'failed',
          error = ?,
          finished_at = ?,
          updated_at = ?
      WHERE status = 'queued'
        AND COALESCE(started_at, updated_at) < ?
    `).run(RUN_QUEUED_ORPHAN_ERROR, ts, ts, queuedStaleCutoff);

    // Very old approval checkpoints are unlikely to be resumed.
    const approvalResult = db.prepare(`
      UPDATE automation_runs
      SET status = 'cancelled',
          error = ?,
          finished_at = ?,
          updated_at = ?
      WHERE status = 'waiting_approval'
        AND COALESCE(updated_at, started_at) < ?
    `).run(RUN_APPROVAL_STALE_ERROR, ts, ts, approvalStaleCutoff);

    const recovered = (runningResult?.changes ?? 0)
      + (queuedResult?.changes ?? 0)
      + (approvalResult?.changes ?? 0);
    if (recovered > 0) {
      console.log(`[RunEngine] recoverStuckRuns: cleared ${recovered} stale run(s)`);
    }
  } catch (e) {
    console.warn('[RunEngine] recoverStuckRuns failed:', e?.message);
  }
}

function init(windowManager, database, ttsService) {
  _windowManager = windowManager;
  _database = database;
  workflowExecutor.init({ database, loadManyAgents });
  const pipelineRunner = require('./pipeline-runner.cjs');
  const pipelineEventLog = require('./pipeline-event-log.cjs');
  pipelineEventLog.init(database);
  pipelineRunner.init({
    database,
    windowManager,
    runEngine: { startAgentRun, startWorkflowRun },
    logEvent: pipelineEventLog.logEvent,
  });
  require('./pipeline-report.cjs').init({
    database,
    windowManager,
    runEngine: { startAgentRun, startWorkflowRun },
    logEvent: pipelineEventLog.logEvent,
  });
  runStore.init(database, windowManager, {
    onTerminalAutomationStatus: (automationId, status) =>
      setAutomationRunStatus(automationId, status),
    onRunTerminal: (run) => pipelineRunner.onRunTerminal(run),
  });

  // Initialize streaming TTS with dependencies
  if (ttsService) {
    streamingTts.init({
      broadcast: (channel, payload) => _windowManager?.broadcast?.(channel, payload),
      getApiKey: () => _database ? getOpenAIKey(_database) : null,
      generateSpeech: (text, voice, apiKey, opts) =>
        ttsService.generateSpeech(text, voice, apiKey, opts),
    });
  }

  recoverStuckRuns();
  migrateLegacyData();
}

function stop() {
  runLifecycle.abortAllRunContexts();
}

module.exports = {
  RUN_EVENT_CHANNEL,
  RUN_STEP_CHANNEL,
  RUN_CHUNK_CHANNEL,
  init,
  stop,
  getRun,
  listRuns,
  deleteRun,
  getActiveRunBySession,
  upsertAutomation,
  listAutomations,
  getAutomation,
  deleteAutomation,
  startAutomationNow,
  fireContextualAutomations,
  startAgentRun,
  startWorkflowRun,
  resumeRun,
  abortRun,
  createNoteResource,
  recoverStuckRuns,
  RUN_QUEUED_ORPHAN_MS,
  RUN_WAITING_APPROVAL_STALE_MS,
  RUN_QUEUED_ORPHAN_ERROR,
  RUN_APPROVAL_STALE_ERROR,
};
