#!/usr/bin/env node
/**
 * Smoke test for pipeline-card-context.cjs
 * Run: node scripts/test-pipeline-card-context.mjs
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildRunInput,
  renderCardFields,
  renderActivity,
  buildCardContextBlock,
  summarizeToFit,
  getStageDeliverable,
  buildPipelineRunToolOptions,
  MAX_EVENT_OUTPUT,
  MAX_TOTAL_CONTEXT,
} = require('../electron/agents/pipeline-card-context.cjs');

const item = {
  id: 'item-1',
  pipeline_id: 'pipe-1',
  title: 'Viaje a China',
  data_json: JSON.stringify({
    fields: [
      { id: 'f1', type: 'description', text: 'Planificar viaje de 14 días' },
      { id: 'f2', type: 'note', text: 'Preferencia: vuelos directos' },
      { id: 'f3', type: 'todos', todos: [{ text: 'Reservar vuelo', done: true }] },
    ],
    text: 'Planificar viaje de 14 días',
  }),
  exec_status: 'ready',
  last_output: 'Lista de 8 temas de investigación generada.',
  start_at: Date.parse('2026-07-01'),
  end_at: Date.parse('2026-07-15'),
};

const stage = {
  title: 'Validación',
  run_input_template: 'Valida el trabajo previo sobre {{title}}.',
};

const pipeline = { name: 'Pipeline QA' };

const events = [
  {
    event_type: 'run_completed',
    created_at: Date.now() - 60000,
    summary: 'Lista de temas',
    detail_json: JSON.stringify({
      output: '- Logística y Vuelos\n- Clima y Mejor Época\n- Documentación y Visados',
    }),
  },
];

const fieldsBlock = renderCardFields(JSON.parse(item.data_json));
assert.match(fieldsBlock, /Planificar viaje de 14 días/);
assert.match(fieldsBlock, /Preferencia: vuelos directos/);
assert.match(fieldsBlock, /\[x\] Reservar vuelo/);

const activity = await renderActivity(events);
assert.match(activity, /Logística y Vuelos/);
assert.match(activity, /Clima y Mejor Época/);

const contextBlock = await buildCardContextBlock({ item, stage, pipeline, events });
assert.match(contextBlock, /## Contexto de la tarjeta/);
assert.match(contextBlock, /Lista de 8 temas/);
assert.match(contextBlock, /Pipeline QA/);
assert.match(contextBlock, /Validación/);

const mockQueries = {
  getPipelineById: { get: () => pipeline },
  listPipelineItemEvents: { all: () => events },
};

const runInput = await buildRunInput(stage, item, mockQueries);
assert.match(runInput, /Valida el trabajo previo sobre Viaje a China/);
assert.match(runInput, /---/);
assert.match(runInput, /### Contenido/);
assert.match(runInput, /### Último output del agente/);
assert.match(runInput, /### Actividad/);
assert.match(runInput, /Logística y Vuelos/);

const artifactStage = {
  title: 'Informe Artifact',
  run_input_template: 'Crea un artefacto persistente con todo lo encontrado {{context}}',
};
assert.equal(getStageDeliverable(artifactStage), 'artifact');
const artifactInput = await buildRunInput(artifactStage, item, mockQueries);
assert.match(artifactInput, /Entregable obligatorio: artefacto persistente/);
assert.match(artifactInput, /artifact_create/);
assert.match(artifactInput, /NO uses `resource_create`/);

const textStage = {
  title: 'Validación',
  config_json: JSON.stringify({ deliverable: 'text' }),
  run_input_template: 'Resume brevemente.',
};
assert.equal(getStageDeliverable(textStage), 'text');
const textInput = await buildRunInput(textStage, item, mockQueries);
assert.match(textInput, /Entregable: texto en la tarjeta/);
assert.doesNotMatch(textInput, /artifact_create/);

const artifactToolStage = {
  title: 'Informe Artifact',
  config_json: JSON.stringify({ deliverable: 'artifact', useMany: true }),
};
const artifactTools = buildPipelineRunToolOptions(artifactToolStage, {});
assert.ok(artifactTools.toolDefinitions.length > 20, 'artifact stage should get full tool catalog');
assert.ok(artifactTools.toolIds.includes('artifact_create'), 'artifact_create must be registered');
assert.ok(artifactTools.toolIds.includes('dome_load_doc'), 'dome_load_doc must be registered');
assert.deepEqual(artifactTools.subagentIds, [], 'artifact + Many disables subagent delegation');

const manyTextStage = {
  title: 'Resumen',
  config_json: JSON.stringify({ deliverable: 'text', useMany: true }),
};
const manyTextTools = buildPipelineRunToolOptions(manyTextStage, {});
assert.ok(manyTextTools.toolDefinitions.length > 20);
assert.equal(manyTextTools.subagentIds, undefined, 'text stages keep default subagent routing');

// Oversized text falls back to truncate when no provider is configured.
const huge = 'x'.repeat(MAX_EVENT_OUTPUT + 500);
const truncated = await summarizeToFit(huge, MAX_EVENT_OUTPUT, null, 'event_output');
assert.ok(truncated.length <= MAX_EVENT_OUTPUT + 32);
assert.match(truncated, /\[… truncado\]/);

const hugeContext = 'y'.repeat(MAX_TOTAL_CONTEXT + 1000);
const truncatedContext = await summarizeToFit(hugeContext, MAX_TOTAL_CONTEXT, null, 'full_context');
assert.ok(truncatedContext.length <= MAX_TOTAL_CONTEXT + 32);

console.log('pipeline-card-context smoke test: OK');
