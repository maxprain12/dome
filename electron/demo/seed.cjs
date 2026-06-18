/* eslint-disable no-console */
/**
 * Seed isolated demo profile for product videos (DOME_PROFILE=video-demo).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const database = require('../core/database.cjs');
const { writeSettingSecret } = require('../core/settings-secrets.cjs');
const fileStorage = require('../storage/file-storage.cjs');

const DEMO_PROJECT_ID = 'demo-dome-project';
const DEMO_FOLDER_ID = 'demo-folder';
const DEMO_PDF_ID = 'demo-pdf-informe-ia';
const DEMO_ARTIFACT_ID = 'demo-artifact-resumen';
const DEMO_SESSION_ID = 'demo-many-session';
const DEMO_USER_MSG_ID = 'demo-user-msg';
const DEMO_ASSISTANT_MSG_ID = 'demo-assistant-msg';
const SEED_FLAG = 'video_demo_seeded_v1';

const PDF_CONTENT_SUMMARY = `Resumen ejecutivo — Inteligencia Artificial en la Investigación Académica

Hallazgos clave:
• El 68% de los equipos de investigación ya usan asistentes de IA para revisión bibliográfica.
• La extracción automática de tablas desde PDFs reduce hasta un 40% el tiempo de análisis.
• Los resúmenes interactivos mejoran la retención de conceptos en un 25%.
• La trazabilidad de fuentes sigue siendo el principal desafío ético y metodológico.

Casos de uso prioritarios:
1. Revisión sistemática de literatura con búsqueda semántica híbrida.
2. Síntesis de papers en mapas conceptuales y flashcards.
3. Extracción estructurada de datos tabulares en documentos escaneados.
4. Preparación de presentaciones a partir de múltiples fuentes indexadas.

Recomendaciones:
- Centralizar PDFs, notas y URLs en un workspace único con estado "Listo para IA".
- Consultar el documento con un asistente contextual (Many) vinculado al recurso activo.
- Transformar la lectura en artefactos accionables: resúmenes, tableros KPI y guías de estudio.
- Mantener enlaces trazables a las páginas originales del PDF para verificación académica.`;

function upsertResource(queries, row) {
  const existing = queries.getResourceById.get(row.id);
  const ts = Date.now();
  const metadata =
    row.metadata == null ? null : typeof row.metadata === 'string' ? row.metadata : JSON.stringify(row.metadata);
  if (existing) {
    queries.updateResource.run(row.title, row.content, metadata, ts, row.id);
    return row.id;
  }
  queries.createResource.run(
    row.id,
    row.project_id,
    row.type,
    row.title,
    row.content,
    row.file_path,
    row.folder_id,
    metadata,
    ts,
    ts,
  );
  return row.id;
}

function upsertArtifact(queries, { artifactRowId, resourceId, artifactType, stateStr, now }) {
  const existing = queries.getArtifactByResourceId.get(resourceId);
  if (existing) {
    queries.updateArtifact.run(artifactType, null, stateStr, null, now, resourceId);
    return existing.id;
  }
  queries.createArtifact.run(artifactRowId, resourceId, artifactType, null, stateStr, null, now, now);
  return artifactRowId;
}

function buildInteractiveHtml() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Resumen interactivo</title></head><body>
<section id="app"></section>
<script>
(function() {
  var data = window.DOME_DATA || {};
  var sections = data.sections || [];
  var active = data.activeSection || 0;
  var expanded = data.expanded || {};

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function render() {
    var root = document.getElementById('app');
    if (!root) return;
    var html = '<div style="font-family:system-ui,sans-serif;padding:16px;max-width:720px">';
    html += '<h2 style="margin:0 0 8px;color:var(--primary-text,#111)">' + esc(data.title || 'Resumen') + '</h2>';
    html += '<p style="margin:0 0 16px;color:var(--secondary-text,#666);font-size:13px">' + esc(data.subtitle || '') + '</p>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">';
    sections.forEach(function(sec, i) {
      var sel = i === active;
      html += '<button data-sec="' + i + '" style="padding:6px 12px;border-radius:8px;border:1px solid var(--border,#ddd);background:' + (sel ? 'var(--accent,#2563eb)' : 'var(--bg,#fff)') + ';color:' + (sel ? '#fff' : 'var(--primary-text,#111)') + ';cursor:pointer;font-size:12px">' + esc(sec.label) + '</button>';
    });
    html += '</div>';
    var sec = sections[active];
    if (sec) {
      html += '<div style="border:1px solid var(--border,#e5e7eb);border-radius:12px;padding:16px;background:var(--bg,#fff)">';
      html += '<h3 style="margin:0 0 12px;font-size:15px">' + esc(sec.label) + '</h3><ul style="margin:0;padding-left:20px;line-height:1.7;font-size:13px">';
      (sec.items || []).forEach(function(item, j) {
        var key = active + '-' + j;
        var open = !!expanded[key];
        html += '<li style="margin-bottom:8px"><button data-exp="' + key + '" style="background:none;border:none;padding:0;cursor:pointer;font-weight:600;color:var(--accent,#2563eb);font-size:13px">' + (open ? '▼' : '▶') + ' ' + esc(item.title) + '</button>';
        if (open) html += '<p style="margin:6px 0 0 16px;color:var(--secondary-text,#555)">' + esc(item.detail) + '</p>';
        html += '</li>';
      });
      html += '</ul></div>';
    }
    html += '<p style="margin-top:16px;font-size:11px;color:var(--secondary-text,#888)">Fuente: Informe IA en Investigación — Demo Dome</p></div>';
    root.innerHTML = html;
    root.querySelectorAll('[data-sec]').forEach(function(btn) {
      btn.onclick = function() {
        var next = Number(btn.getAttribute('data-sec'));
        if (window.__dome_updateState) window.__dome_updateState({ activeSection: next });
        else { active = next; render(); }
      };
    });
    root.querySelectorAll('[data-exp]').forEach(function(btn) {
      btn.onclick = function() {
        var key = btn.getAttribute('data-exp');
        expanded[key] = !expanded[key];
        if (window.__dome_updateState) window.__dome_updateState({ expanded: expanded });
        else render();
      };
    });
  }

  document.addEventListener('DOMContentLoaded', render);
  window.addEventListener('message', function() { render(); });
  render();
})();
</script></body></html>`;
}

function buildArtifactState() {
  const html = buildInteractiveHtml();
  const data = {
    title: 'Resumen interactivo del informe',
    subtitle: 'Explora hallazgos, casos de uso y recomendaciones extraídas del PDF',
    activeSection: 0,
    expanded: {},
    sections: [
      {
        label: 'Hallazgos',
        items: [
          { title: 'Adopción de IA', detail: 'El 68% de equipos usan asistentes para revisión bibliográfica.' },
          { title: 'Extracción de tablas', detail: 'Reduce hasta un 40% el tiempo de análisis de datos en PDFs.' },
          { title: 'Retención', detail: 'Los resúmenes interactivos mejoran retención en un 25%.' },
        ],
      },
      {
        label: 'Casos de uso',
        items: [
          { title: 'Revisión sistemática', detail: 'Búsqueda semántica híbrida sobre la biblioteca del proyecto.' },
          { title: 'Mapas y flashcards', detail: 'Síntesis visual y material de estudio desde papers.' },
          { title: 'Presentaciones', detail: 'Preparación de slides a partir de fuentes indexadas.' },
        ],
      },
      {
        label: 'Recomendaciones',
        items: [
          { title: 'Workspace único', detail: 'Centralizar PDFs, notas y URLs con estado Listo para IA.' },
          { title: 'Asistente contextual', detail: 'Many trabaja sobre el recurso activo, no sobre un chat vacío.' },
          { title: 'Trazabilidad', detail: 'Enlaces a páginas del PDF original para verificación académica.' },
        ],
      },
    ],
  };
  return JSON.stringify({ html, data });
}

function buildAssistantMessage(pdfId) {
  const artifact = {
    type: 'pdf_summary',
    resource_id: pdfId,
    title: 'Informe IA en Investigación Académica',
    text: PDF_CONTENT_SUMMARY,
    metadata: { author: 'Demo Dome', pageCount: 4 },
    total_pages: 4,
    extracted_pages: 4,
    chars_extracted: PDF_CONTENT_SUMMARY.length,
  };
  const fenced = '```artifact:pdf_summary\n' + JSON.stringify(artifact, null, 2) + '\n```';
  return (
    'He analizado el PDF **Informe IA en Investigación Académica** y extraje un resumen estructurado con los hallazgos principales, casos de uso y recomendaciones.\n\n' +
    fenced +
    '\n\n¿Quieres que convierta este resumen en un artefacto interactivo persistido en tu biblioteca?'
  );
}

async function seedVideoDemo({ force = false } = {}) {
  database.initDatabase();
  const queries = database.getQueries();
  const flag = queries.getSetting.get(SEED_FLAG)?.value;
  if (flag === '1' && !force) {
    console.log('[Demo:Seed] Already seeded');
    return;
  }

  const now = Date.now();
  const pdfPath = path.join(__dirname, '../../scripts/demo/assets/informe-ia-investigacion.pdf');
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Missing demo PDF at ${pdfPath}. Run: node scripts/demo/generate-demo-pdf.mjs`);
  }

  // Remove stale demo rows from partial runs
  for (const staleId of ['pdf-ia-research-wt', 'artifact-resumen-wt']) {
    try {
      queries.deleteResource.run(staleId);
    } catch {
      /* ignore */
    }
  }

  const imported = await fileStorage.importFile(pdfPath, 'pdf');

  const apiKey = process.env.MiniMaxToken || process.env.MINIMAX_BENCH_API_KEY || process.env.AI_API_KEY;
  if (apiKey) {
    queries.setSetting.run('ai_provider', 'minimax', now);
    writeSettingSecret(queries, 'ai_api_key', apiKey);
    queries.setSetting.run('ai_model', 'MiniMax-M3', now);
    console.log('[Demo:Seed] Configured MiniMax provider');
  }

  queries.setSetting.run('onboarding_completed', 'true', now);
  queries.setSetting.run('last_project_id', DEMO_PROJECT_ID, now);

  if (!queries.getProjectById.get(DEMO_PROJECT_ID)) {
    queries.createProject.run(
      DEMO_PROJECT_ID,
      'Investigación IA',
      'Proyecto demo para vídeos de producto Dome',
      null,
      now,
      now,
    );
  }

  upsertResource(queries, {
    id: DEMO_FOLDER_ID,
    project_id: DEMO_PROJECT_ID,
    type: 'folder',
    title: 'Fuentes',
    content: null,
    file_path: null,
    folder_id: null,
    metadata: { color: '#3b82f6' },
  });

  upsertResource(queries, {
    id: DEMO_PDF_ID,
    project_id: DEMO_PROJECT_ID,
    type: 'pdf',
    title: 'Informe IA en Investigación Académica',
    content: null,
    file_path: pdfPath,
    folder_id: DEMO_FOLDER_ID,
    metadata: { pages: 4, demo: true, internal_path: imported.internalPath },
  });
  queries.updateResourceFile.run(
    imported.internalPath,
    imported.mimeType,
    imported.size,
    imported.hash,
    null,
    imported.originalName,
    now,
    DEMO_PDF_ID,
  );

  upsertResource(queries, {
    id: DEMO_ARTIFACT_ID,
    project_id: DEMO_PROJECT_ID,
    type: 'artifact',
    title: 'Resumen interactivo — Informe IA',
    content: null,
    file_path: null,
    folder_id: DEMO_FOLDER_ID,
    metadata: { linked_pdf: DEMO_PDF_ID },
  });

  upsertArtifact(queries, {
    artifactRowId: 'demo-artifact-row-1',
    resourceId: DEMO_ARTIFACT_ID,
    artifactType: 'custom',
    stateStr: buildArtifactState(),
    now,
  });

  const existingSession = queries.getChatSession.get(DEMO_SESSION_ID);
  if (!existingSession) {
    queries.createChatSession.run(
      DEMO_SESSION_ID,
      DEMO_PROJECT_ID,
      null,
      DEMO_PDF_ID,
      'many',
      null,
      null,
      'Resumen del informe IA',
      null,
      null,
      now,
      now,
    );
    queries.createChatMessage.run(
      DEMO_USER_MSG_ID,
      DEMO_SESSION_ID,
      'user',
      'Resume este PDF en ideas clave y crea un artefacto interactivo con los hallazgos principales.',
      null,
      null,
      null,
      now,
    );
    queries.createChatMessage.run(
      DEMO_ASSISTANT_MSG_ID,
      DEMO_SESSION_ID,
      'assistant',
      buildAssistantMessage(DEMO_PDF_ID),
      null,
      null,
      JSON.stringify({ demo: true }),
      now + 1,
    );
  }

  queries.setSetting.run(SEED_FLAG, '1', now);
  console.log('[Demo:Seed] Complete — project:', DEMO_PROJECT_ID, 'pdf:', DEMO_PDF_ID);
}

module.exports = { seedVideoDemo, DEMO_PROJECT_ID, DEMO_PDF_ID, DEMO_ARTIFACT_ID };
