'use strict';

/**
 * Shared pipeline card context builder — used by pipeline-runner (agent input)
 * and pipeline-report (Many report context).
 */

const MAX_ACTIVITY_EVENTS = 25;
const MAX_EVENT_OUTPUT = 6000;
const MAX_TOTAL_CONTEXT = 32000;

const DEFAULT_RUN_TEMPLATE =
  'Procesa esta tarjeta del pipeline:\nTítulo: {{title}}\nDatos: {{data}}';

/** Detect artifact deliverable from stage config, title, or run template. */
const ARTIFACT_DELIVERABLE_RE =
  /artefacto\s+persistente|persistent\s+artifact|artifact_create|mini[-\s]?app|biblioteca\s+de\s+dome|\bartefacto\b|\bartifact\b/i;

const TEXT_DELIVERABLE_RE = /solo\s+texto|texto\s+en\s+tarjeta|sin\s+artefacto|no\s+artefacto/i;

const SUMMARIZE_SYSTEM_PROMPT = [
  'You compress pipeline card context for a downstream AI agent.',
  'Preserve every actionable fact: metadata (title, pipeline, stage, status, dates),',
  'all field content (descriptions, notes, todo done/pending states),',
  'the essence of the last agent output, and chronological activity',
  '(what each run produced, stage moves, failures).',
  'Use Markdown. Write in the same language as the source. Do not invent data.',
].join(' ');

const PIPELINE_TEMPLATE_MACROS = [
  'title',
  'data',
  'data.text',
  'data.todos',
  'last_output',
  'stage',
  'stage.title',
  'pipeline',
  'pipeline.name',
  'status',
  'start_at',
  'end_at',
  'activity',
  'context',
];

function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function renderTodos(todos) {
  if (!Array.isArray(todos) || todos.length === 0) return '';
  return todos
    .map((td) => {
      const mark = td && td.done ? '[x]' : '[ ]';
      const text = td && typeof td.text === 'string' ? td.text : '';
      return `${mark} ${text}`;
    })
    .join('\n');
}

function formatDate(ms) {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleDateString();
  } catch {
    return '—';
  }
}

function truncate(text, max) {
  if (!text || text.length <= max) return text || '';
  return `${text.slice(0, max)}\n[… truncado]`;
}

async function resolveProviderConfigForStage(stage, database) {
  if (!database) return null;
  try {
    const { resolveProviderConfig } = require('../ai/resolve-provider-config.cjs');
    return await resolveProviderConfig(database, stage?.provider, stage?.model);
  } catch (err) {
    console.warn('[PipelineCardContext] provider config failed:', err?.message);
    return null;
  }
}

/**
 * LLM summarization when text exceeds `targetChars`. Falls back to hard truncate.
 */
async function summarizeToFit(text, targetChars, providerConfig, purpose = 'section') {
  const source = String(text || '').trim();
  if (!source || source.length <= targetChars) return source;
  if (!providerConfig?.provider) {
    return truncate(source, targetChars);
  }

  const purposeHints = {
    event_output:
      'This is the output of one agent run in a pipeline card activity log. Keep lists, decisions, and conclusions.',
    last_output:
      'This is the most recent agent output on a pipeline card. Keep conclusions, recommendations, and open items.',
    full_context:
      'This is the full pipeline card context block. Keep sections: metadata, Contenido, Último output del agente, Actividad.',
    section: 'Compress while preserving actionable facts for the next pipeline agent step.',
  };

  const llmService = require('../ai/llm-service.cjs');
  const hint = purposeHints[purpose] || purposeHints.section;
  const userPrompt = [
    hint,
    `Target: under ${targetChars} characters.`,
    'Return ONLY the compressed Markdown/text — no meta commentary.',
    '',
    '---',
    '',
    source,
  ].join('\n');

  try {
    const result = await llmService.chat({
      provider: providerConfig.provider,
      model: providerConfig.model,
      apiKey: providerConfig.apiKey,
      baseUrl: providerConfig.baseUrl,
      messages: [
        { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      options: {
        maxTokens: Math.min(8192, Math.max(512, Math.ceil(targetChars / 2.5))),
        temperature: 0.2,
      },
    });
    const summary = (result?.text || '').trim();
    if (!summary) return truncate(source, targetChars);
    const note = '*[Resumido automáticamente para caber en contexto]*\n\n';
    const combined = note + summary;
    if (combined.length > targetChars) {
      return truncate(combined, targetChars);
    }
    return combined;
  } catch (err) {
    console.warn('[PipelineCardContext] summarization failed:', err?.message);
    return truncate(source, targetChars);
  }
}

function fieldLabel(type) {
  switch (type) {
    case 'description': return 'Descripción';
    case 'note': return 'Nota';
    case 'todos': return 'Tareas';
    default: return 'Campo';
  }
}

/**
 * Render all card content: data.fields[] (description, note, todos) or legacy text/todos.
 */
function renderCardFields(data) {
  if (!data || typeof data !== 'object') return '';

  const parts = [];

  if (Array.isArray(data.fields) && data.fields.length > 0) {
    for (const raw of data.fields) {
      if (!raw || typeof raw !== 'object') continue;
      const type = raw.type === 'todos' || raw.type === 'note' ? raw.type : 'description';
      if (type === 'todos') {
        const checklist = renderTodos(raw.todos);
        if (checklist) parts.push(`#### ${fieldLabel(type)}\n${checklist}`);
      } else {
        const text = typeof raw.text === 'string' ? raw.text.trim() : '';
        if (text) parts.push(`#### ${fieldLabel(type)}\n${text}`);
      }
    }
  }

  if (parts.length === 0) {
    if (typeof data.text === 'string' && data.text.trim()) {
      parts.push(`#### Descripción\n${data.text.trim()}`);
    }
    const todos = renderTodos(data.todos);
    if (todos) parts.push(`#### Tareas\n${todos}`);
  }

  if (parts.length === 0 && Object.keys(data).length > 0) {
    const { fields: _fields, ...rest } = data;
    if (Object.keys(rest).length > 0) {
      parts.push(`#### Datos\n${JSON.stringify(rest, null, 2)}`);
    }
  }

  return parts.join('\n\n');
}

function getStageConfig(stage) {
  if (stage?.config && typeof stage.config === 'object') return stage.config;
  return parseJson(stage?.config_json, {}) || {};
}

/**
 * @returns {'artifact' | 'text'}
 */
function getStageDeliverable(stage) {
  const config = getStageConfig(stage);
  const explicit = config.deliverable;
  if (explicit === 'artifact' || explicit === 'text') return explicit;
  const haystack = `${stage?.run_input_template || ''} ${stage?.title || ''}`;
  if (TEXT_DELIVERABLE_RE.test(haystack)) return 'text';
  if (ARTIFACT_DELIVERABLE_RE.test(haystack)) return 'artifact';
  return 'text';
}

function buildDeliverableInstructions(deliverable) {
  if (deliverable === 'artifact') {
    return [
      '## Entregable obligatorio: artefacto persistente (Kind B)',
      '',
      'Un informe en markdown o un bloque ```artifact:...``` inline **no** cumple este entregable.',
      'Debes crear un mini-app persistido en la biblioteca de Dome con herramientas:',
      '',
      '1. `dome_load_doc("artifact_persisted")` — leer la API antes de crear.',
      '2. Dosier / informe multi-sección: `dome_load_doc("artifact_design")` → herramienta `artifact_design` con un `spec` → usar el `html` y `data` devueltos.',
      '3. `artifact_create` con `{ artifact_type: "custom", title, html, data }`.',
      '4. En tu respuesta final indica el título del artefacto creado (resumen breve; el contenido completo vive en el artefacto).',
      '',
      'Prohibido en esta fase:',
      '- NO uses la herramienta `task` ni subagentes; invoca `dome_load_doc`, `artifact_design` y `artifact_create` directamente.',
      '- NO uses `resource_create` para guardar notas sueltas en la biblioteca.',
      '- NO añadas campos tipo "nota" a la tarjeta del pipeline.',
      '- NO sustituyas `artifact_create` por texto largo en la respuesta.',
    ].join('\n');
  }

  return [
    '## Entregable: texto en la tarjeta',
    '',
    'Responde en markdown conciso para `last_output` de la tarjeta.',
    'NO crees artefactos persistidos ni notas en la biblioteca salvo que las instrucciones de fase lo pidan explícitamente.',
    '- NO uses `resource_create`.',
    '- NO añadas campos "nota" a la tarjeta.',
  ].join('\n');
}

function renderLegacyDataSummary(data) {
  if (!data || typeof data !== 'object') return '{}';
  const parts = [];
  if (typeof data.text === 'string' && data.text.trim()) parts.push(data.text.trim());
  const todos = renderTodos(data.todos);
  if (todos) parts.push(todos);
  if (parts.length > 0) return parts.join('\n');
  const fieldsBlock = renderCardFields(data);
  if (fieldsBlock) return fieldsBlock;
  return JSON.stringify(data);
}

function parseEventDetail(event) {
  if (!event?.detail_json) return null;
  return parseJson(event.detail_json, null);
}

async function formatEventLine(event, opts = {}) {
  const maxOutput = opts.maxOutput ?? MAX_EVENT_OUTPUT;
  const providerConfig = opts.providerConfig ?? null;
  const date = formatDate(event.created_at);
  const type = event.event_type || 'event';
  const summary = (event.summary || '').trim();
  const detail = parseEventDetail(event);
  const output =
    detail && typeof detail.output === 'string' ? detail.output.trim() : '';

  const lines = [`**${date}** · ${type}`];
  if (summary) lines.push(summary);

  if (type === 'run_completed' || type === 'run_failed') {
    const body = output || summary;
    if (body) {
      if (body.length > maxOutput) {
        lines.push(await summarizeToFit(body, maxOutput, providerConfig, 'event_output'));
      } else {
        lines.push(body);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Chronological activity log for the agent, with full run outputs when available.
 */
async function renderActivity(events, opts = {}) {
  if (!Array.isArray(events) || events.length === 0) return '';

  const maxEvents = opts.maxEvents ?? MAX_ACTIVITY_EVENTS;
  const slice = events.slice(-maxEvents);
  const lines = await Promise.all(slice.map((e) => formatEventLine(e, opts)));
  return lines.join('\n\n');
}

async function buildInterpolationContext({ item, stage, pipeline, events, providerConfig }) {
  const data = parseJson(item.data_json, {}) || {};
  const activity = await renderActivity(events, { providerConfig });
  const contextBlock = await buildCardContextBlock({
    item,
    stage,
    pipeline,
    events,
    providerConfig,
    activityBlock: activity,
  });

  return {
    item,
    stage,
    pipeline,
    data,
    activity,
    contextBlock,
  };
}

function resolveDataPath(path, data) {
  const keys = path.slice(5).split('.');
  let cur = data;
  for (const k of keys) {
    if (cur && typeof cur === 'object' && k in cur) cur = cur[k];
    else return '';
  }
  if (cur == null) return '';
  return typeof cur === 'object' ? JSON.stringify(cur) : String(cur);
}

function resolveTemplatePath(path, ctx) {
  const { item, stage, pipeline, data, activity, contextBlock } = ctx;
  const lookup = {
    title: () => item.title ?? '',
    'data.todos': () => renderTodos(data.todos),
    'data.text': () => (typeof data.text === 'string' ? data.text : ''),
    last_output: () => item.last_output ?? '',
    stage: () => stage?.title ?? '',
    'stage.title': () => stage?.title ?? '',
    pipeline: () => pipeline?.name ?? '',
    'pipeline.name': () => pipeline?.name ?? '',
    status: () => item.exec_status ?? '',
    start_at: () => formatDate(item.start_at),
    end_at: () => formatDate(item.end_at),
    activity: () => activity,
    context: () => contextBlock,
  };
  const resolver = lookup[path];
  if (resolver) return resolver();
  if (path.startsWith('data.')) return resolveDataPath(path, data);
  return '';
}

/**
 * Resolve {{macro}} placeholders in the stage run_input_template.
 */
function interpolateTemplate(template, ctx) {
  const { data } = ctx;

  const withData = String(template).replace(/\{\{\s*data\s*\}\}/g, () =>
    renderLegacyDataSummary(data),
  );

  return withData.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path) => resolveTemplatePath(path, ctx));
}

async function buildCardContextBlock({
  item,
  stage,
  pipeline,
  events,
  providerConfig,
  activityBlock: prebuiltActivity,
}) {
  const data = parseJson(item.data_json, {}) || {};
  const parts = [];

  parts.push('## Contexto de la tarjeta');

  const meta = [
    pipeline?.name ? `**Pipeline:** ${pipeline.name}` : null,
    stage?.title ? `**Fase:** ${stage.title}` : null,
    item.exec_status ? `**Estado:** ${item.exec_status}` : null,
  ].filter(Boolean);
  if (meta.length > 0) parts.push(meta.join(' · '));

  if (item.start_at || item.end_at) {
    parts.push(`**Fechas:** Inicio ${formatDate(item.start_at)} · Fin ${formatDate(item.end_at)}`);
  }

  parts.push(`**Título:** ${item.title || 'Sin título'}`);

  const fieldsBlock = renderCardFields(data);
  if (fieldsBlock) {
    parts.push('### Contenido', fieldsBlock);
  }

  let lastOutput = item.last_output && item.last_output.trim() ? item.last_output.trim() : '';
  if (lastOutput.length > MAX_EVENT_OUTPUT) {
    lastOutput = await summarizeToFit(lastOutput, MAX_EVENT_OUTPUT, providerConfig, 'last_output');
  }
  if (lastOutput) {
    parts.push('### Último output del agente', lastOutput);
  }

  const activityBlock = prebuiltActivity ?? await renderActivity(events, { providerConfig });
  if (activityBlock) {
    parts.push('### Actividad', activityBlock);
  }

  let result = parts.join('\n\n');
  if (result.length > MAX_TOTAL_CONTEXT) {
    result = await summarizeToFit(result, MAX_TOTAL_CONTEXT, providerConfig, 'full_context');
  }
  return result;
}

/**
 * Build the full user message for a pipeline stage run:
 * stage instructions (interpolated template) + auto-generated card context.
 */
async function buildRunInput(stage, item, q, opts = {}) {
  const template =
    stage.run_input_template && stage.run_input_template.trim()
      ? stage.run_input_template
      : DEFAULT_RUN_TEMPLATE;

  const pipeline = q?.getPipelineById?.get?.(item.pipeline_id) ?? null;
  const events = q?.listPipelineItemEvents?.all?.(item.id) ?? [];
  const providerConfig = opts.providerConfig
    ?? await resolveProviderConfigForStage(stage, opts.database);

  const ctx = await buildInterpolationContext({
    item,
    stage,
    pipeline,
    events,
    providerConfig,
  });
  const instructions = interpolateTemplate(template, ctx).trim();
  const contextBlock = ctx.contextBlock.trim();
  const deliverableBlock = buildDeliverableInstructions(getStageDeliverable(stage));

  const sections = [instructions, deliverableBlock, contextBlock].filter(Boolean);
  return sections.join('\n\n---\n\n');
}

/**
 * Tool catalog for pipeline agent runs. Pipeline runs previously passed an empty
 * `toolDefinitions` array; Many then only exposed the `task` subagent tool, and
 * delegation to `library` (19 read-only tools) hid artifact_create / dome_load_doc.
 * @returns {{ toolDefinitions: object[], toolIds: string[], subagentIds?: string[] }}
 */
function buildPipelineRunToolOptions(stage, queries) {
  const { getAllToolDefinitions, getToolDefinitionsByIds } = require('../tools/tool-definitions.cjs');
  const stageConfig = getStageConfig(stage);
  const useMany = stageConfig.useMany === true;
  const deliverable = getStageDeliverable(stage);

  let toolDefinitions;
  if (stage.assigned_agent_id && !useMany) {
    const agentRow = queries?.getManyAgentById?.get?.(stage.assigned_agent_id);
    const configuredIds = parseJson(agentRow?.tool_ids, []) || [];
    toolDefinitions =
      configuredIds.length > 0 ? getToolDefinitionsByIds(configuredIds) : getAllToolDefinitions();
  } else {
    toolDefinitions = getAllToolDefinitions();
  }

  const toolIds = toolDefinitions.map((def) => def.function?.name).filter(Boolean);
  const result = { toolDefinitions, toolIds };

  // Many + artifact: disable subagent delegation so artifact_* tools stay on the main harness.
  if (deliverable === 'artifact' && useMany) {
    result.subagentIds = [];
  }

  return result;
}

module.exports = {
  PIPELINE_TEMPLATE_MACROS,
  MAX_ACTIVITY_EVENTS,
  MAX_EVENT_OUTPUT,
  MAX_TOTAL_CONTEXT,
  DEFAULT_RUN_TEMPLATE,
  parseJson,
  renderTodos,
  renderCardFields,
  renderActivity,
  interpolateTemplate,
  buildCardContextBlock,
  buildRunInput,
  buildInterpolationContext,
  summarizeToFit,
  resolveProviderConfigForStage,
  getStageDeliverable,
  buildDeliverableInstructions,
  buildPipelineRunToolOptions,
};
