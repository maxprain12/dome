/* eslint-disable no-console */

const crypto = require('crypto');
const { setMaxListeners } = require('events');
const langgraphAgent = require('./langgraph-agent.cjs');
const { getToolDefinitionsByIds } = require('./ai-chat-with-tools.cjs');
const streamingTts = require('./streaming-tts.cjs');
const { getOpenAIKey } = require('./openai-key.cjs');
const { appendSkillsToPrompt } = require('./skill-prompt.cjs');

const RUN_EVENT_CHANNEL = 'runs:updated';
const RUN_STEP_CHANNEL = 'runs:step';
const RUN_CHUNK_CHANNEL = 'runs:chunk';

const OUTPUT_MODES = new Set(['chat_only', 'note', 'studio_output', 'mixed']);
const RUN_TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const RUN_RECOVERY_STALE_MS = 120 * 1000;
const RUN_RESTART_ERROR = 'Interrupted - the app was restarted while this run was active.';

const SYSTEM_AGENTS = {
  research: {
    name: 'Research Agent',
    toolIds: ['web_search', 'web_fetch', 'deep_research'],
    systemPrompt: `Eres un agente investigador experto. Tu misión es buscar, analizar y sintetizar información de calidad.
- Utiliza búsqueda web para encontrar fuentes actualizadas y relevantes
- Verifica los datos con múltiples fuentes cuando sea posible
- Estructura la información de forma clara con secciones, puntos clave y fuentes
- Sé exhaustivo pero conciso: prioriza calidad sobre cantidad
- Indica siempre las fuentes utilizadas al final de tu respuesta`,
  },
  library: {
    name: 'Library Agent',
    toolIds: ['resource_search', 'resource_get', 'resource_get_section', 'resource_list', 'resource_semantic_search'],
    systemPrompt: `Eres un agente de biblioteca experto en gestión del conocimiento personal.
- Busca y recupera información relevante de los documentos del usuario
- Analiza y conecta conceptos entre diferentes recursos de la biblioteca
- Extrae ideas clave, citas importantes y patrones de los documentos
- Sugiere conexiones entre materiales relacionados
- Presenta la información de forma estructurada citando los recursos específicos usados`,
  },
  writer: {
    name: 'Writer Agent',
    toolIds: ['resource_create', 'resource_update'],
    systemPrompt: `Eres un agente escritor experto en creación de contenido estructurado y de alta calidad.
- Redacta textos claros, coherentes y bien estructurados
- Adapta el tono y estilo según el contexto
- Usa markdown para formatear el texto con encabezados, listas y énfasis
- Produce contenido listo para publicar o usar directamente`,
  },
  data: {
    name: 'Data Agent',
    toolIds: ['excel_get', 'excel_set_cell', 'excel_set_range', 'excel_add_row', 'resource_get', 'resource_list'],
    systemPrompt: `Eres un agente de análisis de datos experto en procesamiento y visualización de información estructurada.
- Analiza datos numéricos, tablas y registros con precisión
- Identifica tendencias, patrones y anomalías en los datos
- Presenta los resultados con tablas markdown bien formateadas
- Sugiere insights accionables basados en los datos analizados`,
  },
  presenter: {
    name: 'Presenter Agent',
    toolIds: ['ppt_create', 'ppt_get_slides', 'resource_create'],
    systemPrompt: `Eres un agente especializado en transformar información en materiales visuales de alta calidad.
- Crea presentaciones claras y estructuradas
- Adapta el tono visual y narrativo al tipo de audiencia
- Guarda los artefactos generados como recursos cuando sea útil`,
  },
  curator: {
    name: 'Curator Agent',
    toolIds: ['get_related_resources', 'resource_semantic_search', 'resource_list', 'flashcard_create', 'resource_create'],
    systemPrompt: `Eres un agente curador experto en organización del conocimiento.
- Identifica relaciones entre recursos y conceptos
- Sugiere conexiones relevantes
- Genera resúmenes claros y accionables`,
  },
};

let _windowManager = null;
let _database = null;
const activeRunContexts = new Map();

function getQueries() {
  return _database?.getQueries?.();
}

function now() {
  return Date.now();
}

function parseJsonSafely(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toJson(value) {
  return value == null ? null : JSON.stringify(value);
}

function parseToolArguments(rawArguments) {
  if (typeof rawArguments === 'string') {
    try {
      return JSON.parse(rawArguments);
    } catch {
      return {};
    }
  }
  return rawArguments && typeof rawArguments === 'object' ? rawArguments : {};
}

/** Merge LLM token usage chunks (e.g. multiple LangGraph invokes / resume). */
function mergeLlmUsage(current, delta) {
  if (!delta || typeof delta !== 'object') return current || null;
  const dIn = Math.max(0, Math.floor(Number(delta.inputTokens ?? delta.input_tokens ?? 0) || 0));
  const dOut = Math.max(0, Math.floor(Number(delta.outputTokens ?? delta.output_tokens ?? 0) || 0));
  const dTotRaw = delta.totalTokens ?? delta.total_tokens;
  const dTot =
    dTotRaw != null && dTotRaw !== ''
      ? Math.max(0, Math.floor(Number(dTotRaw) || 0))
      : dIn + dOut;
  if (!current) {
    return { inputTokens: dIn, outputTokens: dOut, totalTokens: dTot };
  }
  return {
    inputTokens: (current.inputTokens ?? 0) + dIn,
    outputTokens: (current.outputTokens ?? 0) + dOut,
    totalTokens: (current.totalTokens ?? 0) + dTot,
  };
}

function serializeToolResult(result) {
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result ?? null);
  } catch {
    return String(result);
  }
}

function getToolStepPatch(toolCallId, result, extraMetadata = {}) {
  const serializedResult = serializeToolResult(result);
  let parsedResult = result;
  if (typeof serializedResult === 'string') {
    try {
      parsedResult = JSON.parse(serializedResult);
    } catch {
      parsedResult = result;
    }
  }

  const isErrorResult =
    parsedResult &&
    typeof parsedResult === 'object' &&
    !Array.isArray(parsedResult) &&
    parsedResult.status === 'error';

  const errorMessage = isErrorResult
    ? (typeof parsedResult.error === 'string' ? parsedResult.error : serializedResult)
    : null;

  return {
    status: isErrorResult ? 'failed' : 'done',
    content: errorMessage || serializedResult,
    metadata: {
      toolCallId,
      ...extraMetadata,
      ...(isErrorResult ? { error: errorMessage } : {}),
    },
  };
}

function emit(channel, payload) {
  _windowManager?.broadcast?.(channel, payload);
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

function normalizeRunRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id ?? 'default',
    automationId: row.automation_id ?? null,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    title: row.title ?? '',
    status: row.status,
    sessionId: row.session_id ?? null,
    workflowId: row.workflow_id ?? null,
    workflowExecutionId: row.workflow_execution_id ?? null,
    threadId: row.thread_id ?? null,
    outputText: row.output_text ?? '',
    summary: row.summary ?? null,
    error: row.error ?? null,
    metadata: parseJsonSafely(row.metadata, {}),
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at ?? null,
    lastHeartbeatAt: row.last_heartbeat_at ?? null,
  };
}

function normalizeStepRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id,
    parentStepId: row.parent_step_id ?? null,
    stepType: row.step_type,
    title: row.title,
    status: row.status,
    content: row.content ?? null,
    metadata: parseJsonSafely(row.metadata, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function updateStoredRun(run) {
  const queries = getQueries();
  if (!queries?.updateAutomationRun) {
    throw new Error('Database queries unavailable');
  }
  queries.updateAutomationRun.run(
    run.projectId ?? 'default',
    run.automationId ?? null,
    run.ownerType,
    run.ownerId,
    run.title ?? null,
    run.status,
    run.sessionId ?? null,
    run.workflowId ?? null,
    run.workflowExecutionId ?? null,
    run.threadId ?? null,
    run.outputText ?? '',
    run.summary ?? null,
    run.error ?? null,
    toJson(run.metadata ?? {}),
    run.updatedAt,
    run.finishedAt ?? null,
    run.lastHeartbeatAt ?? null,
    run.id,
  );
}

function createRun(params) {
  const queries = getQueries();
  const timestamp = now();
  const run = {
    id: params.id ?? crypto.randomUUID(),
    projectId: params.projectId ?? 'default',
    automationId: params.automationId ?? null,
    ownerType: params.ownerType,
    ownerId: params.ownerId,
    title: params.title ?? '',
    status: params.status ?? 'queued',
    sessionId: params.sessionId ?? null,
    workflowId: params.workflowId ?? null,
    workflowExecutionId: params.workflowExecutionId ?? null,
    threadId: params.threadId ?? null,
    outputText: params.outputText ?? '',
    summary: params.summary ?? null,
    error: params.error ?? null,
    metadata: params.metadata ?? {},
    startedAt: params.startedAt ?? timestamp,
    updatedAt: params.updatedAt ?? timestamp,
    finishedAt: params.finishedAt ?? null,
    lastHeartbeatAt: params.lastHeartbeatAt ?? timestamp,
  };
  queries.createAutomationRun.run(
    run.id,
    run.projectId,
    run.automationId,
    run.ownerType,
    run.ownerId,
    run.title,
    run.status,
    run.sessionId,
    run.workflowId,
    run.workflowExecutionId,
    run.threadId,
    run.outputText,
    run.summary,
    run.error,
    toJson(run.metadata),
    run.startedAt,
    run.updatedAt,
    run.finishedAt,
    run.lastHeartbeatAt,
  );
  emit(RUN_EVENT_CHANNEL, { run: run });
  return run;
}

function patchRun(runId, patch) {
  const queries = getQueries();
  const current = normalizeRunRow(queries.getAutomationRunById.get(runId));
  if (!current) {
    throw new Error(`Run not found: ${runId}`);
  }
  const next = {
    ...current,
    ...patch,
    metadata: { ...(current.metadata ?? {}), ...(patch.metadata ?? {}) },
    updatedAt: patch.updatedAt ?? now(),
    lastHeartbeatAt:
      Object.prototype.hasOwnProperty.call(patch, 'lastHeartbeatAt')
        ? patch.lastHeartbeatAt
        : (patch.status === 'running' ? now() : current.lastHeartbeatAt),
  };
  updateStoredRun(next);
  emit(RUN_EVENT_CHANNEL, { run: next });
  if (next.automationId && RUN_TERMINAL_STATUSES.has(next.status)) {
    try {
      setAutomationRunStatus(next.automationId, next.status);
    } catch (e) {
      console.warn('[RunEngine] setAutomationRunStatus failed:', e?.message);
    }
  }
  return next;
}

function appendRunStep(params) {
  const queries = getQueries();
  const timestamp = now();
  const step = {
    id: params.id ?? crypto.randomUUID(),
    runId: params.runId,
    parentStepId: params.parentStepId ?? null,
    stepType: params.stepType ?? 'info',
    title: params.title ?? 'Paso',
    status: params.status ?? 'done',
    content: params.content ?? null,
    metadata: params.metadata ?? {},
    createdAt: params.createdAt ?? timestamp,
    updatedAt: params.updatedAt ?? timestamp,
  };
  queries.createAutomationRunStep.run(
    step.id,
    step.runId,
    step.parentStepId,
    step.stepType,
    step.title,
    step.status,
    step.content,
    toJson(step.metadata),
    step.createdAt,
    step.updatedAt,
  );
  emit(RUN_STEP_CHANNEL, { step });
  return step;
}

function updateRunStep(stepId, patch, existingStep = null) {
  const queries = getQueries();
  const mergedMetadata = existingStep
    ? { ...(existingStep.metadata ?? {}), ...(patch.metadata ?? {}) }
    : (patch.metadata ?? {});
  const nextStep = existingStep
    ? {
      ...existingStep,
      ...patch,
      metadata: mergedMetadata,
      updatedAt: patch.updatedAt ?? now(),
    }
    : null;
  queries.updateAutomationRunStep.run(
    patch.status ?? 'done',
    patch.content ?? null,
    toJson(mergedMetadata),
    nextStep?.updatedAt ?? patch.updatedAt ?? now(),
    stepId,
  );
  if (nextStep) emit(RUN_STEP_CHANNEL, { step: nextStep });
  return nextStep;
}

function getRun(runId) {
  const queries = getQueries();
  const run = normalizeRunRow(queries.getAutomationRunById.get(runId));
  if (!run) return null;
  const steps = queries.getAutomationRunSteps.all(runId).map(normalizeStepRow);
  const links = queries.getAutomationRunLinks.all(runId).map((row) => ({
    id: row.id,
    runId: row.run_id,
    linkType: row.link_type,
    linkId: row.link_id,
    createdAt: row.created_at,
  }));
  return { ...run, steps, links };
}

function listRuns(filters = {}) {
  const queries = getQueries();
  const limit = Math.max(1, Math.min(Number(filters.limit ?? 20), 100));
  if (filters.sessionId) {
    const row = queries.getActiveRunBySession.get(filters.sessionId);
    return row ? [normalizeRunRow(row)] : [];
  }
  if (filters.automationId) {
    return queries.getAutomationRunsByAutomation.all(filters.automationId, limit).map(normalizeRunRow);
  }
  if (filters.ownerType && filters.ownerId) {
    return queries.getAutomationRunsByOwner.all(filters.ownerType, filters.ownerId, limit).map(normalizeRunRow);
  }
  if (filters.projectId) {
    return queries.getLatestAutomationRunsByProject.all(filters.projectId, limit).map(normalizeRunRow);
  }
  return queries.getLatestAutomationRuns.all(limit).map(normalizeRunRow);
}

function getActiveRunBySession(sessionId) {
  const queries = getQueries();
  return normalizeRunRow(queries.getActiveRunBySession.get(sessionId));
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
    targetType: ['many', 'agent', 'workflow'].includes(input.targetType) ? input.targetType : 'agent',
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
  return normalizeAutomationRow(queries.getAutomationDefinitionById.get(normalized.id));
}

function listAutomations(filters = {}) {
  const queries = getQueries();
  if (filters.targetType && filters.targetId) {
    const rows = queries.getAutomationDefinitionsByTarget.all(filters.targetType, filters.targetId);
    const mapped = rows.map(normalizeAutomationRow);
    if (filters.projectId) {
      return mapped.filter((a) => a.projectId === filters.projectId);
    }
    return mapped;
  }
  if (filters.projectId) {
    return queries.getAutomationDefinitionsByProject.all(filters.projectId).map(normalizeAutomationRow);
  }
  return queries.getAllAutomationDefinitions.all().map(normalizeAutomationRow);
}

function deleteAutomation(id) {
  const queries = getQueries();
  queries.deleteAutomationDefinition.run(id);
}

function deleteRun(runId) {
  const queries = getQueries();
  queries.deleteAutomationRun.run(runId);
}

function getAutomation(id) {
  const queries = getQueries();
  return normalizeAutomationRow(queries.getAutomationDefinitionById.get(id));
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

function createNoteResource(projectId, title, content, metadata = {}) {
  const queries = getQueries();
  const timestamp = now();
  const id = crypto.randomUUID();
  queries.createResource.run(
    id,
    projectId || 'default',
    'note',
    title,
    content,
    null,
    null,
    JSON.stringify(metadata),
    timestamp,
    timestamp,
  );
  const resource = {
    id,
    project_id: projectId || 'default',
    type: 'note',
    title,
    content,
    metadata,
    created_at: timestamp,
    updated_at: timestamp,
  };
  emit('resource:created', resource);
  return resource;
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

function topologicalLevels(nodes, edges) {
  const inDegree = {};
  const adjacency = {};
  for (const node of nodes) {
    inDegree[node.id] = 0;
    adjacency[node.id] = [];
  }
  for (const edge of edges) {
    adjacency[edge.source]?.push(edge.target);
    inDegree[edge.target] = (inDegree[edge.target] ?? 0) + 1;
  }
  const levels = [];
  let currentLevel = nodes.filter((node) => inDegree[node.id] === 0);
  while (currentLevel.length > 0) {
    levels.push(currentLevel);
    const nextLevel = [];
    for (const node of currentLevel) {
      for (const neighborId of adjacency[node.id] ?? []) {
        inDegree[neighborId] = (inDegree[neighborId] ?? 1) - 1;
        if (inDegree[neighborId] === 0) {
          const neighbor = nodes.find((candidate) => candidate.id === neighborId);
          if (neighbor) nextLevel.push(neighbor);
        }
      }
    }
    currentLevel = nextLevel;
  }
  const processedCount = levels.reduce((count, level) => count + level.length, 0);
  if (processedCount !== nodes.length) {
    throw new Error('El workflow contiene ciclos o dependencias inválidas');
  }
  return levels;
}

function mergePayloads(payloads) {
  const resources = payloads.flatMap((payload) => payload.resources ?? []);
  const uniqueResources = resources.filter(
    (resource, index) =>
      resources.findIndex(
        (candidate) =>
          candidate.resourceId === resource.resourceId &&
          candidate.resourceType === resource.resourceType,
      ) === index,
  );
  return {
    kind: payloads.length > 1 ? 'bundle' : payloads[0]?.kind ?? 'text',
    text: payloads.map((payload) => payload.text).filter(Boolean).join('\n\n---\n\n'),
    resources: uniqueResources.length > 0 ? uniqueResources : undefined,
  };
}

function getInputPayloads(targetNodeId, edges, resolvedPayloads) {
  return edges
    .filter((edge) => edge.target === targetNodeId)
    .map((edge) => resolvedPayloads[edge.source])
    .filter(Boolean);
}

function resourceReferenceToPromptBlock(resource) {
  const parts = [
    `- Resource ID: ${resource.resourceId}`,
    `- Title: ${resource.resourceTitle}`,
    `- Type: ${resource.resourceType}`,
  ];
  if (resource.resourceContent) {
    parts.push(`- Content:\n${resource.resourceContent}`);
  }
  if (resource.resourceUrl) {
    parts.push(`- URL: ${resource.resourceUrl}`);
  }
  return parts.join('\n');
}

function resolveStaticNodeOutput(node) {
  const data = node.data ?? {};
  if (data.type === 'text-input') {
    return {
      kind: 'text',
      text: String(data.value || ''),
    };
  }
  if (data.type === 'document') {
    if (!data.resourceId) {
      return { kind: 'text', text: '' };
    }
    return {
      kind: 'resource',
      text: resourceReferenceToPromptBlock({
        resourceId: data.resourceId,
        resourceType: data.resourceType || 'document',
        resourceTitle: data.resourceTitle || 'Documento',
        resourceContent: data.resourceContent,
        metadata: data.resourceMetadata ?? null,
      }),
      resources: [{
        resourceId: data.resourceId,
        resourceType: data.resourceType || 'document',
        resourceTitle: data.resourceTitle || 'Documento',
        resourceContent: data.resourceContent,
        metadata: data.resourceMetadata ?? null,
      }],
    };
  }
  if (data.type === 'image') {
    if (!data.resourceId) {
      return { kind: 'text', text: '' };
    }
    return {
      kind: 'resource',
      text: `- Resource ID: ${data.resourceId}\n- Title: ${data.resourceTitle || 'Imagen'}\n- Type: ${data.resourceType || 'image'}\n- URL: ${data.resourceUrl || ''}`,
      resources: [{
        resourceId: data.resourceId,
        resourceType: data.resourceType || 'image',
        resourceTitle: data.resourceTitle || 'Imagen',
        resourceUrl: data.resourceUrl,
        metadata: data.resourceMetadata ?? null,
      }],
    };
  }
  return { kind: 'text', text: '' };
}

async function getProviderConfig(providerArg, modelArg) {
  const queries = getQueries();
  if (!queries) {
    throw new Error('Database not initialized. Please restart the app.');
  }
  const provider = providerArg || queries.getSetting.get('ai_provider')?.value || 'ollama';
  let apiKey;
  let baseUrl;
  let model;
  if (provider === 'ollama') {
    baseUrl = queries.getSetting.get('ollama_base_url')?.value || 'http://127.0.0.1:11434';
    apiKey = queries.getSetting.get('ollama_api_key')?.value || undefined;
    model = modelArg || queries.getSetting.get('ollama_model')?.value || 'llama3.2';
  } else if (provider === 'dome') {
    const domeOauth = require('./dome-oauth.cjs');
    const session = await domeOauth.getOrRefreshSession(_database);
    if (!session?.connected || !session?.accessToken) {
      throw new Error('Dome provider is not connected. Open Settings > AI > Dome and connect your account.');
    }
    const DOME_PROVIDER_URL = process.env.DOME_PROVIDER_URL || 'http://localhost:3000';
    apiKey = session.accessToken;
    baseUrl = `${DOME_PROVIDER_URL}/api/v1`;
    model = modelArg || queries.getSetting.get('ai_model')?.value || 'dome/auto';
  } else {
    apiKey = queries.getSetting.get('ai_api_key')?.value;
    if (!apiKey) throw new Error(`API key not configured for ${provider}`);
    model = modelArg || queries.getSetting.get('ai_model')?.value;
  }
  return { provider, apiKey, baseUrl, model };
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
      });
      const step = appendRunStep({
        runId,
        stepType: 'tool_call',
        title: data.toolCall.name,
        status: 'running',
        metadata: { toolCallId: data.toolCall.id, arguments: args },
      });
      context.toolStepIds.set(data.toolCall.id, step.id);
      context.toolSteps.set(data.toolCall.id, step);
      emit(RUN_CHUNK_CHANNEL, { runId, type: 'tool_call', toolCall: data.toolCall });
      patchRun(runId, { lastHeartbeatAt: heartbeat });
      return;
    }
    if (data.type === 'tool_result' && data.toolCallId != null) {
      const stepPatch = getToolStepPatch(data.toolCallId, data.result);
      const entry = context.toolCalls.find((item) => item.id === data.toolCallId);
      if (entry) {
        entry.status = stepPatch.status === 'failed' ? 'error' : 'success';
        entry.result = data.result;
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
      emit(RUN_CHUNK_CHANNEL, { runId, type: 'tool_result', toolCallId: data.toolCallId, result: data.result });
      patchRun(runId, { lastHeartbeatAt: heartbeat });
      return;
    }
    if (data.type === 'usage' && data.usage) {
      context.llmUsage = mergeLlmUsage(context.llmUsage, data.usage);
      return;
    }
    if (data.type === 'interrupt' && data.actionRequests && data.reviewConfigs) {
      context.threadId = data.threadId || context.threadId;
      patchRun(runId, {
        status: 'waiting_approval',
        threadId: context.threadId,
        metadata: {
          pendingApproval: {
            actionRequests: data.actionRequests,
            reviewConfigs: data.reviewConfigs,
          },
        },
        lastHeartbeatAt: heartbeat,
      });
      emit(RUN_CHUNK_CHANNEL, {
        runId,
        type: 'interrupt',
        actionRequests: data.actionRequests,
        reviewConfigs: data.reviewConfigs,
        threadId: data.threadId,
      });
    }
  };
}

async function executeLangGraphRun(runId, params) {
  const context = activeRunContexts.get(runId);
  if (!context) return;
  patchRun(runId, {
    status: 'running',
    threadId: context.threadId,
    metadata: {
      kind: 'langgraph',
      provider: context.provider,
      model: context.model,
      mcpServerIds: params.mcpServerIds ?? [],
      subagentIds: params.ownerType === 'many' ? [] : (params.subagentIds ?? []),
      title: params.title ?? '',
    },
  });
  appendRunStep({
    runId,
    stepType: 'info',
    title: 'Run iniciado',
    status: 'done',
    content: params.title ?? 'Ejecución LangGraph',
  });
  const useDirectToolsRun =
    params.ownerType === 'many' ||
    (params.toolDefinitions?.length ?? 0) > 0 ||
    (params.mcpServerIds?.length ?? 0) > 0;
  const automationProjectId = params.automationId ? (params.projectId ?? context.projectId ?? 'default') : undefined;
  context.langGraphResumeOpts = {
    toolDefinitions: params.toolDefinitions ?? [],
    useDirectTools: useDirectToolsRun,
    mcpServerIds: params.mcpServerIds,
    subagentIds: params.ownerType === 'many' ? [] : params.subagentIds,
    skipHitl: !!params.skipHitl,
    automationProjectId,
  };
  try {
    const result = await langgraphAgent.invokeLangGraphAgent({
      provider: context.provider,
      model: context.model,
      apiKey: context.apiKey,
      baseUrl: context.baseUrl,
      messages: params.messages,
      toolDefinitions: params.toolDefinitions ?? [],
      useDirectTools: useDirectToolsRun,
      mcpServerIds: params.mcpServerIds,
      subagentIds: params.ownerType === 'many' ? [] : params.subagentIds,
      threadId: context.threadId,
      skipHitl: !!params.skipHitl,
      signal: context.controller.signal,
      onChunk: createRunChunkEmitter(runId, context),
      automationProjectId,
    });
    const current = getRun(runId);
    if (current?.status === 'waiting_approval' || result?.__interrupt__) {
      return getRun(runId);
    }
    if (params.sessionId) {
      try {
        persistAssistantMessage(params.sessionId, {
          content: context.fullResponse,
          toolCalls: context.toolCalls,
          thinking: context.fullThinking,
          metadata: {
            mode: params.ownerType,
            runId,
          },
          mode: params.ownerType === 'agent' ? 'agent' : 'many',
          contextId: params.contextId ?? null,
          threadId: context.threadId,
          title: params.sessionTitle ?? null,
          toolIds: params.toolIds ?? [],
          mcpServerIds: params.mcpServerIds ?? [],
        });
      } catch (e) {
        console.warn('[RunEngine] Could not persist assistant message to DB:', e?.message);
      }
    }
    appendRunStep({
      runId,
      stepType: 'completion',
      title: 'Run completado',
      status: 'done',
      content: context.fullResponse.slice(0, 8000),
    });
    // Flush streaming TTS (plays any remaining buffered text)
    if (context.autoSpeak) {
      streamingTts.flush(runId);
    }
    return patchRun(runId, {
      status: 'completed',
      outputText: context.fullResponse,
      summary: context.fullResponse.slice(0, 280) || params.title || 'Run completado',
      finishedAt: now(),
      error: null,
      threadId: context.threadId,
      metadata: {
        kind: 'langgraph',
        provider: context.provider,
        model: context.model,
        toolCalls: context.toolCalls,
        ...(context.llmUsage ? { usage: context.llmUsage } : {}),
      },
    });
  } catch (error) {
    const aborted = error?.name === 'AbortError' || `${error?.message || ''}`.toLowerCase().includes('abort');
    // Cancel streaming TTS on error/abort
    if (context.autoSpeak) {
      streamingTts.cancel(runId);
    }
    appendRunStep({
      runId,
      stepType: aborted ? 'cancelled' : 'error',
      title: aborted ? 'Run cancelado' : 'Run con error',
      status: aborted ? 'cancelled' : 'failed',
      content: error?.message || String(error),
    });
    return patchRun(runId, {
      status: aborted ? 'cancelled' : 'failed',
      outputText: context.fullResponse,
      summary: context.fullResponse.slice(0, 280) || null,
      error: aborted ? null : (error?.message || String(error)),
      finishedAt: now(),
    });
  } finally {
    const latest = getRun(runId);
    if (!latest || RUN_TERMINAL_STATUSES.has(latest.status)) {
      activeRunContexts.delete(runId);
    }
  }
}

async function startLangGraphRun(params) {
  const providerConfig = await getProviderConfig(params.provider, params.model);
  const threadId = params.threadId || `run_${params.ownerType}_${now()}`;
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
      kind: 'langgraph',
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
    void executeLangGraphRun(run.id, {
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
  };
  if (existingContext && existingContext.projectId == null) {
    existingContext.projectId = run.projectId ?? 'default';
  }
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
    const lgOpts = context.langGraphResumeOpts ?? {
      toolDefinitions: [],
      useDirectTools: false,
      mcpServerIds: undefined,
      subagentIds: undefined,
      skipHitl: false,
    };
    await langgraphAgent.resumeLangGraphAgent({
      provider: providerConfig.provider,
      model: providerConfig.model,
      apiKey: providerConfig.apiKey,
      baseUrl: providerConfig.baseUrl,
      messages: [],
      threadId: run.threadId,
      decisions,
      signal: context.controller.signal,
      onChunk: createRunChunkEmitter(runId, context),
      toolDefinitions: lgOpts.toolDefinitions,
      useDirectTools: lgOpts.useDirectTools,
      mcpServerIds: lgOpts.mcpServerIds,
      subagentIds: lgOpts.subagentIds,
      skipHitl: lgOpts.skipHitl,
      automationProjectId:
        run.automationId ? (run.projectId ?? 'default') : lgOpts.automationProjectId,
    });
    const latest = getRun(runId);
    if (latest?.status === 'waiting_approval') {
      return latest;
    }
    return patchRun(runId, {
      status: 'completed',
      outputText: context.fullResponse,
      summary: context.fullResponse.slice(0, 280) || run.title || 'Run completado',
      error: null,
      finishedAt: now(),
      metadata: {
        provider: providerConfig.provider,
        model: providerConfig.model,
        toolCalls: context.toolCalls,
        pendingApproval: null,
        ...(context.llmUsage ? { usage: context.llmUsage } : {}),
      },
    });
  } catch (error) {
    return patchRun(runId, {
      status: 'failed',
      error: error?.message || String(error),
      finishedAt: now(),
    });
  } finally {
    const latest = getRun(runId);
    if (!latest || RUN_TERMINAL_STATUSES.has(latest.status)) {
      activeRunContexts.delete(runId);
    }
  }
}

function abortRun(runId) {
  const context = activeRunContexts.get(runId);
  if (context?.controller) {
    context.controller.abort();
  }
}

function resolveWorkflowAgent(nodeData, projectId = 'default') {
  if (nodeData.agentId) {
    const agent = loadManyAgents(projectId).find((item) => item.id === nodeData.agentId);
    if (agent) {
      return {
        name: agent.name,
        toolIds: Array.isArray(agent.toolIds) ? agent.toolIds : [],
        mcpServerIds: Array.isArray(agent.mcpServerIds) ? agent.mcpServerIds : [],
        skillIds: Array.isArray(agent.skillIds) ? agent.skillIds : [],
        systemPrompt: agent.systemInstructions || agent.description || `You are ${agent.name}.`,
      };
    }
  }
  if (nodeData.systemAgentRole && SYSTEM_AGENTS[nodeData.systemAgentRole]) {
    const def = SYSTEM_AGENTS[nodeData.systemAgentRole];
    return {
      name: def.name,
      toolIds: def.toolIds,
      mcpServerIds: [],
      skillIds: [],
      systemPrompt: def.systemPrompt,
    };
  }
  return null;
}

function getWorkflowProgressMetadata(workflow, completedNodeIds) {
  const total = Array.isArray(workflow?.nodes) ? workflow.nodes.length : 0;
  const completed = completedNodeIds.size;
  return {
    total,
    completed,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

async function executeWorkflowRun(runId, params, workflow) {
  const context = activeRunContexts.get(runId);
  if (!context) return;
  const run = getRun(runId);
  const nodeOutputs = {};
  const resolvedPayloads = {};
  const completedNodeIds = new Set(
    Array.isArray(run?.metadata?.progress?.completedNodeIds) ? run.metadata.progress.completedNodeIds : [],
  );
  const syncWorkflowProgress = (nodeId) => {
    if (!nodeId || completedNodeIds.has(nodeId)) return;
    completedNodeIds.add(nodeId);
    patchRun(runId, {
      metadata: {
        progress: {
          ...getWorkflowProgressMetadata(workflow, completedNodeIds),
          completedNodeIds: [...completedNodeIds],
        },
      },
    });
  };
  let finalOutput = '';
  const workflowProviderConfig = await getProviderConfig(params.provider, params.model);
  let workflowLlmUsage = null;
  patchRun(runId, {
    status: 'running',
    metadata: {
      kind: 'workflow',
      workflowName: workflow.name,
      provider: workflowProviderConfig.provider,
      model: workflowProviderConfig.model,
      inputTemplate: params.inputTemplate ?? null,
    },
  });
  try {
    const levels = topologicalLevels(workflow.nodes || [], workflow.edges || []);
    for (const level of levels) {
      await Promise.all(level.map(async (node) => {
        const data = node.data ?? {};
        if (data.type === 'text-input' || data.type === 'document' || data.type === 'image') {
          resolvedPayloads[node.id] = resolveStaticNodeOutput(node);
          appendRunStep({
            runId,
            stepType: 'workflow_node',
            title: data.label || node.id,
            status: 'done',
            content: resolvedPayloads[node.id].text.slice(0, 4000),
            metadata: { nodeId: node.id, nodeType: data.type },
          });
          syncWorkflowProgress(node.id);
          return;
        }
        if (data.type === 'output') {
          const payload = mergePayloads(getInputPayloads(node.id, workflow.edges || [], resolvedPayloads));
          resolvedPayloads[node.id] = payload;
          nodeOutputs[node.id] = payload;
          finalOutput = payload.text || finalOutput;
          patchRun(runId, { outputText: finalOutput });
          appendRunStep({
            runId,
            stepType: 'workflow_output',
            title: data.label || 'Output',
            status: 'done',
            content: payload.text.slice(0, 4000),
            metadata: { nodeId: node.id },
          });
          syncWorkflowProgress(node.id);
          return;
        }
        if (data.type === 'agent') {
          const agentDef = resolveWorkflowAgent(data, workflow.projectId ?? 'default');
          if (!agentDef) {
            appendRunStep({
              runId,
              stepType: 'workflow_node',
              title: data.label || 'Agente',
              status: 'failed',
              content: 'Agente no configurado',
              metadata: { nodeId: node.id },
            });
            resolvedPayloads[node.id] = { kind: 'text', text: '' };
            syncWorkflowProgress(node.id);
            return;
          }
          const inputPayload = mergePayloads(getInputPayloads(node.id, workflow.edges || [], resolvedPayloads));
          const userPrompt = [
            params.inputTemplate?.prompt ? String(params.inputTemplate.prompt) : null,
            inputPayload.text || '',
          ].filter(Boolean).join('\n\n');
          const toolDefinitions = getToolDefinitionsByIds(agentDef.toolIds || []);
          const mcpServerIds = Array.isArray(agentDef.mcpServerIds)
            ? agentDef.mcpServerIds
            : (Array.isArray(params.inputTemplate?.mcpServerIds) ? params.inputTemplate.mcpServerIds : []);
          const providerConfig = workflowProviderConfig;
          const nodeContext = {
            fullResponse: '',
            fullThinking: '',
            toolCalls: [],
            toolStepIds: new Map(),
            toolSteps: new Map(),
            threadId: `${runId}_${node.id}`,
          };
          const nodeStep = appendRunStep({
            runId,
            stepType: 'workflow_agent',
            title: data.label || agentDef.name || 'Agente',
            status: 'running',
            metadata: { nodeId: node.id, agentId: data.agentId ?? null, systemAgentRole: data.systemAgentRole ?? null },
          });
          const systemWithSkills = appendSkillsToPrompt(
            agentDef.systemPrompt || '',
            agentDef.skillIds,
            getQueries(),
          );
          await langgraphAgent.invokeLangGraphAgent({
            provider: providerConfig.provider,
            model: providerConfig.model,
            apiKey: providerConfig.apiKey,
            baseUrl: providerConfig.baseUrl,
            messages: [
              { role: 'system', content: systemWithSkills },
              { role: 'user', content: userPrompt },
            ],
            toolDefinitions,
            useDirectTools: toolDefinitions.length > 0 || mcpServerIds.length > 0,
            mcpServerIds,
            signal: context.controller.signal,
            threadId: nodeContext.threadId,
            skipHitl: true,
            automationProjectId: workflow.projectId ?? 'default',
            onChunk: (chunk) => {
              if (chunk.type === 'text' && chunk.text) {
                nodeContext.fullResponse += chunk.text;
                patchRun(runId, { lastHeartbeatAt: now() });
              } else if (chunk.type === 'thinking' && chunk.text) {
                nodeContext.fullThinking += chunk.text;
              } else if (chunk.type === 'usage' && chunk.usage) {
                workflowLlmUsage = mergeLlmUsage(workflowLlmUsage, chunk.usage);
              } else if (chunk.type === 'tool_call' && chunk.toolCall) {
                const step = appendRunStep({
                  runId,
                  parentStepId: nodeStep.id,
                  stepType: 'tool_call',
                  title: `${data.label || agentDef.name}: ${chunk.toolCall.name}`,
                  status: 'running',
                  metadata: {
                    nodeId: node.id,
                    toolCallId: chunk.toolCall.id,
                    arguments: parseToolArguments(chunk.toolCall.arguments),
                  },
                });
                nodeContext.toolStepIds.set(chunk.toolCall.id, step.id);
                nodeContext.toolSteps.set(chunk.toolCall.id, step);
                patchRun(runId, { lastHeartbeatAt: now() });
              } else if (chunk.type === 'tool_result' && chunk.toolCallId != null) {
                const stepId = nodeContext.toolStepIds.get(chunk.toolCallId);
                if (stepId) {
                  const existingStep = nodeContext.toolSteps.get(chunk.toolCallId) ?? null;
                  const nextStep = updateRunStep(
                    stepId,
                    getToolStepPatch(chunk.toolCallId, chunk.result, { nodeId: node.id }),
                    existingStep,
                  );
                  if (nextStep) nodeContext.toolSteps.set(chunk.toolCallId, nextStep);
                }
                patchRun(runId, { lastHeartbeatAt: now() });
              }
            },
          });
          updateRunStep(nodeStep.id, {
            status: 'done',
            content: nodeContext.fullResponse.slice(0, 8000),
            metadata: { nodeId: node.id, thinking: nodeContext.fullThinking },
          }, nodeStep);
          syncWorkflowProgress(node.id);
          const outputPayload = {
            kind: inputPayload.resources?.length ? 'bundle' : 'text',
            text: nodeContext.fullResponse,
            resources: inputPayload.resources,
          };
          resolvedPayloads[node.id] = outputPayload;
          nodeOutputs[node.id] = outputPayload;
        }
      }));
    }
    let createdNote = null;
    const outputMode = params.outputMode || 'chat_only';
    if ((outputMode === 'note' || outputMode === 'mixed') && finalOutput.trim()) {
      const projectId = params.inputTemplate?.projectId || 'default';
      createdNote = createNoteResource(projectId, `${workflow.name} · ${new Date().toLocaleDateString('es-ES')}`, finalOutput, {
        workflowId: workflow.id,
        automationRunId: runId,
      });
    }
    if (createdNote) {
      const queries = getQueries();
      queries.createAutomationRunLink.run(
        crypto.randomUUID(),
        runId,
        'resource',
        createdNote.id,
        now(),
      );
    }
    appendRunStep({
      runId,
      stepType: 'completion',
      title: 'Workflow completado',
      status: 'done',
      content: finalOutput.slice(0, 8000),
      metadata: { workflowId: workflow.id, createdNoteId: createdNote?.id ?? null },
    });
    return patchRun(runId, {
      status: 'completed',
      outputText: finalOutput,
      summary: finalOutput.slice(0, 280) || `${workflow.name} completado`,
      finishedAt: now(),
      workflowExecutionId: runId,
      metadata: {
        kind: 'workflow',
        workflowName: workflow.name,
        provider: workflowProviderConfig.provider,
        model: workflowProviderConfig.model,
        progress: {
          ...getWorkflowProgressMetadata(workflow, completedNodeIds),
          completedNodeIds: [...completedNodeIds],
        },
        nodeOutputs,
        createdNoteId: createdNote?.id ?? null,
        ...(workflowLlmUsage ? { usage: workflowLlmUsage } : {}),
      },
    });
  } catch (error) {
    appendRunStep({
      runId,
      stepType: 'error',
      title: 'Workflow con error',
      status: 'failed',
      content: error?.message || String(error),
      metadata: { workflowId: workflow.id },
    });
    return patchRun(runId, {
      status: 'failed',
      error: error?.message || String(error),
      finishedAt: now(),
      metadata: {
        provider: workflowProviderConfig.provider,
        model: workflowProviderConfig.model,
        progress: {
          ...getWorkflowProgressMetadata(workflow, completedNodeIds),
          completedNodeIds: [...completedNodeIds],
        },
        ...(workflowLlmUsage ? { usage: workflowLlmUsage } : {}),
      },
    });
  } finally {
    activeRunContexts.delete(runId);
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
  activeRunContexts.set(run.id, { controller });
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

async function startAutomationNow(automationId) {
  const automation = getAutomation(automationId);
  if (!automation) {
    throw new Error('Automatización no encontrada');
  }
  const title = automation.title || 'Automatización';
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
  const targetLabel = automation.inputTemplate?.prompt || automation.description || automation.title;
  const toolIds = automation.inputTemplate?.toolIds || [];
  const toolDefinitions = Array.isArray(toolIds) && toolIds.length > 0
    ? getToolDefinitionsByIds(toolIds)
    : [];
  const run = await startLangGraphRun({
    automationId: automation.id,
    projectId: automation.projectId ?? 'default',
    ownerType: targetOwnerType,
    ownerId: automation.targetId,
    title,
    messages: [{ role: 'user', content: String(targetLabel || title) }],
    toolDefinitions,
    mcpServerIds: Array.isArray(automation.inputTemplate?.mcpServerIds) ? automation.inputTemplate.mcpServerIds : [],
    subagentIds: Array.isArray(automation.inputTemplate?.subagentIds) ? automation.inputTemplate.subagentIds : [],
    skipHitl: true,
    toolIds,
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
    const staleCutoff = ts - RUN_RECOVERY_STALE_MS;
    db.prepare(`
      UPDATE automation_runs
      SET status = 'failed',
          error = ?,
          finished_at = ?,
          updated_at = ?
      WHERE status = 'running'
        AND COALESCE(last_heartbeat_at, updated_at, started_at) < ?
    `).run(RUN_RESTART_ERROR, ts, ts, staleCutoff);
  } catch (e) {
    console.warn('[RunEngine] recoverStuckRuns failed:', e?.message);
  }
}

function init(windowManager, database, ttsService) {
  _windowManager = windowManager;
  _database = database;

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
  for (const context of activeRunContexts.values()) {
    context.controller?.abort?.();
  }
  activeRunContexts.clear();
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
  startLangGraphRun,
  startWorkflowRun,
  resumeRun,
  abortRun,
  createNoteResource,
};
