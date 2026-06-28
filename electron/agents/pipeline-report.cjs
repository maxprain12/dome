/* eslint-disable no-console */

/**
 * Pipeline report generator — drives Many to produce a personalized, persistent,
 * exportable report for a pipeline card.
 *
 * Flow: build a detailed prompt from the card (fields, todos, last run output,
 * activity) → run Many (`ownerType: 'many'`, so the user's identity skills
 * personalize it) → on the run's terminal hook, take the full output, render it
 * to a self-contained HTML artifact, link it back to the card via a
 * `report_generated` event, and broadcast `pipelines:report:ready` so the UI
 * can surface the backlink / open the run summary.
 *
 * Runs are async (fire-and-forget); `handleTerminal` is invoked from
 * pipeline-runner's onRunTerminal hook and only acts on report runs it started.
 */

const crypto = require('crypto');
const { serializeArtifactRecord } = require('../artifacts/artifact-serialize.cjs');
const { afterArtifactMutation } = require('../artifacts/artifact-index-sync.cjs');
const { buildReportHtml } = require('./report-markdown.cjs');
const { buildCardContextBlock, resolveProviderConfigForStage } = require('./pipeline-card-context.cjs');

let _database = null;
let _windowManager = null;
let _runEngine = null;
let _logEvent = null;

/** runId → { itemId, projectId, title } for in-flight report runs. */
const _reportRuns = new Map();

function init({ database, windowManager, runEngine, logEvent }) {
  _database = database;
  _windowManager = windowManager;
  _runEngine = runEngine;
  _logEvent = logEvent;
}

function queries() {
  return _database?.getQueries?.();
}

/** Assemble the human-readable card context fed to Many. */
async function buildReportContext(item, stage, events, pipeline) {
  return buildCardContextBlock({
    item,
    stage,
    pipeline,
    events,
    providerConfig: await resolveProviderConfigForStage(stage, _database),
  });
}

const REPORT_INSTRUCTIONS = [
  'Eres el asistente de confianza del usuario. Genera un INFORME profesional, claro y accionable',
  'sobre la siguiente tarjeta de un pipeline, dirigido al usuario.',
  '',
  'Requisitos del informe:',
  '- Escribe en el idioma del contenido de la tarjeta.',
  '- Usa Markdown: un título (#), secciones (##), listas y, cuando aporte, tablas GFM.',
  '- Estructura sugerida: Resumen ejecutivo · Estado y contexto · Hallazgos clave ·',
  '  Riesgos/Pendientes · Próximos pasos recomendados.',
  '- Sé específico y apóyate en los datos provistos; no inventes cifras.',
  '- Si dispones de conocimiento sobre la identidad/preferencias del usuario (skills),',
  '  personaliza el tono y las recomendaciones para él.',
  '- Devuelve SOLO el informe en Markdown, sin preámbulos ni explicaciones meta.',
].join('\n');

/** Kick off a Many run that produces the report. Returns { success, runId }. */
async function generateReport(itemId) {
  const q = queries();
  if (!q || !_runEngine) return { success: false, error: 'Report engine not ready' };
  const item = q.getPipelineItemById.get(itemId);
  if (!item) return { success: false, error: 'Item not found' };
  const stage = q.getPipelineStageById.get(item.stage_id);
  const pipeline = q.getPipelineById.get(item.pipeline_id);
  const events = (q.listPipelineItemEvents.all(itemId)) || [];
  const context = await buildReportContext(item, stage, events, pipeline);
  const content = `${REPORT_INSTRUCTIONS}\n\n---\n\n${context}`;

  try {
    const run = await _runEngine.startAgentRun({
      ownerType: 'many',
      ownerId: 'many',
      projectId: item.project_id,
      title: `Informe: ${item.title}`,
      messages: [{ role: 'user', content }],
    });
    if (!run?.id) return { success: false, error: 'Run failed to start' };
    _reportRuns.set(run.id, { itemId, projectId: item.project_id, title: `Informe: ${item.title}` });
    if (_logEvent) {
      _logEvent(itemId, 'report_started', { actor: 'user', summary: 'Generando informe con Many…', runId: run.id });
    }
    return { success: true, runId: run.id };
  } catch (e) {
    console.error('[PipelineReport] generateReport failed:', e?.message);
    return { success: false, error: e?.message || 'Report run failed' };
  }
}

/**
 * Terminal hook for report runs. Returns true if `run` was one of ours (so the
 * caller can stop normal item handling), false otherwise.
 */
function handleTerminal(run) {
  if (!run?.id || !_reportRuns.has(run.id)) return false;
  const meta = _reportRuns.get(run.id);
  _reportRuns.delete(run.id);
  const q = queries();
  if (!q) return true;

  try {
    if (run.status !== 'completed') {
      if (_logEvent) {
        _logEvent(meta.itemId, 'report_failed', { actor: 'system', summary: run.error || 'El informe falló', runId: run.id });
      }
      _windowManager?.broadcast?.('pipelines:report:ready', { itemId: meta.itemId, error: run.error || 'failed' });
      return true;
    }

    const markdown = run.outputText || '';
    const html = buildReportHtml(meta.title, null, markdown);
    const db = _database.getDB();
    const now = Date.now();
    const resourceId = crypto.randomUUID();
    const artifactId = crypto.randomUUID();
    const state = JSON.stringify({
      html,
      data: { markdown, source: 'pipeline-report', itemId: meta.itemId, runId: run.id },
    });

    const tx = db.transaction(() => {
      q.createResource.run(resourceId, meta.projectId || 'default', 'artifact', meta.title, null, null, null, null, now, now);
      q.createArtifact.run(artifactId, resourceId, 'custom', null, state, null, now, now);
    });
    tx();

    const resource = q.getResourceById.get(resourceId);
    const artifact = q.getArtifactByResourceId.get(resourceId);
    const serialized = serializeArtifactRecord(artifact, resource, q);
    _windowManager?.broadcast?.('resource:created', resource);
    _windowManager?.broadcast?.('artifact:created', serialized);
    try { afterArtifactMutation(_database, resourceId); } catch { /* non-fatal index sync */ }

    if (_logEvent) {
      _logEvent(meta.itemId, 'report_generated', {
        actor: 'system',
        summary: 'Informe generado por Many',
        detail: { resourceId, title: meta.title },
        runId: run.id,
      });
    }
    _windowManager?.broadcast?.('pipelines:report:ready', {
      itemId: meta.itemId,
      resourceId,
      title: meta.title,
      runId: run.id,
    });
  } catch (e) {
    console.error('[PipelineReport] handleTerminal failed:', e?.message);
  }
  return true;
}

module.exports = { init, generateReport, handleTerminal };
