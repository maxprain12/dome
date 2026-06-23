/* eslint-disable no-console */

/**
 * Pipeline data-source sync. Turns a configured source into cards in the
 * pipeline's entry stage. Reuses pipeline-service.createCard so calendar mirror
 * + defaults are applied. Connectors:
 *   - manual            : no-op (cards created by hand)
 *   - internal_resources: one card per matching Dome resource
 *   - excel             : one card per row of an Excel resource
 *   - prompt_mcp        : runs Many with a base prompt (+ optional MCP servers),
 *                         instructing it to create the cards via pipeline tools
 *   - external_db       : not enabled in this build (no driver bundled)
 */

const database = require('../core/database.cjs');
const pipelineService = require('./pipeline-service.cjs');

function q() {
  return database.getQueries();
}

function parseJson(v, fb = null) {
  if (v == null || v === '') return fb;
  try {
    return JSON.parse(v);
  } catch {
    return fb;
  }
}

function resolveTargetStageId(source) {
  if (source.target_stage_id) return source.target_stage_id;
  const stages = q().listStagesByPipeline.all(source.pipeline_id);
  return stages[0]?.id ?? null;
}

async function syncInternalResources(source, config, stageId) {
  const queries = q();
  const rows = queries.getResourcesByProject.all(source.project_id);
  const typeFilter = config?.filter?.type;
  let created = 0;
  for (const r of rows) {
    if (typeFilter && r.type !== typeFilter) continue;
    await pipelineService.createCard({
      pipelineId: source.pipeline_id,
      stageId,
      title: r.title || 'Recurso',
      data: { resourceId: r.id, type: r.type },
    });
    created += 1;
  }
  return { created };
}

async function syncExcel(source, config, stageId) {
  if (!config?.resourceId) throw new Error('Excel source needs a resourceId in config');
  const { excelGet } = require('../tools/excel-tools-handler.cjs');
  const res = await excelGet(config.resourceId, { sheet_name: config.sheet });
  if (!res?.success) throw new Error(res?.error || 'Excel read failed');
  const aoa = Array.isArray(res.data) ? res.data : [];
  if (aoa.length === 0) return { created: 0 };
  const headerRow = Number.isInteger(config.headerRow) ? config.headerRow : 0;
  const titleCol = Number.isInteger(config.titleColumn) ? config.titleColumn : 0;
  const headers = aoa[headerRow] || [];
  let created = 0;
  for (let i = headerRow + 1; i < aoa.length; i += 1) {
    const row = aoa[i] || [];
    if (row.every((c) => c == null || String(c).trim() === '')) continue;
    const data = {};
    headers.forEach((h, idx) => {
      const key = String(h ?? `col${idx}`).trim() || `col${idx}`;
      data[key] = row[idx] ?? null;
    });
    await pipelineService.createCard({
      pipelineId: source.pipeline_id,
      stageId,
      title: String(row[titleCol] ?? `Fila ${i}`),
      data,
    });
    created += 1;
  }
  return { created };
}

async function syncPromptMcp(source, config, stageId) {
  if (!config?.basePrompt) throw new Error('prompt_mcp source needs a basePrompt in config');
  const runEngine = require('./run-engine.cjs');
  const stage = q().getPipelineStageById.get(stageId);
  const instruction =
    `${config.basePrompt}\n\n` +
    `Con cada elemento que obtengas, crea una tarjeta en el pipeline usando la herramienta ` +
    `pipeline_create_card con pipeline_id="${source.pipeline_id}"` +
    (stage ? ` y stage_id="${stage.id}"` : '') +
    `. Pon un título claro y los datos relevantes en el campo data.`;
  const run = await runEngine.startAgentRun({
    ownerType: 'agent',
    ownerId: config.agentId || 'many',
    projectId: source.project_id,
    title: `Fuente: ${source.name}`,
    messages: [{ role: 'user', content: instruction }],
    mcpServerIds: Array.isArray(config.mcpServerIds) ? config.mcpServerIds : undefined,
  });
  // The agent creates the cards itself via the pipeline tools (async run).
  return { created: 0, runId: run?.id ?? null, async: true };
}

/**
 * Sync a source by id. Returns { created } (best-effort).
 */
async function syncSource(sourceId) {
  const queries = q();
  const source = queries.getPipelineSourceById.get(sourceId);
  if (!source) throw new Error('Source not found');
  const config = parseJson(source.config_json, {}) || {};
  const stageId = resolveTargetStageId(source);
  if (!stageId && source.source_type !== 'manual') {
    throw new Error('Pipeline has no stage to receive cards');
  }

  let result;
  switch (source.source_type) {
    case 'manual':
      result = { created: 0 };
      break;
    case 'internal_resources':
      result = await syncInternalResources(source, config, stageId);
      break;
    case 'excel':
      result = await syncExcel(source, config, stageId);
      break;
    case 'prompt_mcp':
      result = await syncPromptMcp(source, config, stageId);
      break;
    case 'external_db':
      throw new Error('External DB sources are not enabled in this build yet.');
    default:
      throw new Error(`Unknown source type: ${source.source_type}`);
  }

  queries.updatePipelineSourceSync.run(Date.now(), `ok:${result.created ?? 0}`, Date.now(), sourceId);
  return result;
}

module.exports = { syncSource };
