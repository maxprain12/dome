/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');

const database = require('../core/database.cjs');
const { app } = require('electron');

const BENCH_PROJECT_ID = 'bench-project';
const SEED_FLAG = 'bench_fixtures_seeded_v2';
const LEGACY_SEED_FLAG = 'bench_fixtures_seeded_v1';

const BENCH_NOTEBOOK_JSON = JSON.stringify({
  nbformat: 4,
  nbformat_minor: 1,
  cells: [{ cell_type: 'markdown', source: '# Bench Notebook\n', metadata: {} }],
  metadata: {},
});

/** 1×1 PNG (valid) for image_thumbnail bench cases */
const MINIMAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const FIXTURE_IDS = {
  project: BENCH_PROJECT_ID,
  folder: 'bench-folder',
  note1: 'bench-note-1',
  note2: 'bench-note-2',
  noteThermo: 'bench-note-thermo',
  pdf: 'bench-pdf-1',
  xlsx: 'bench-xlsx-1',
  docx: 'bench-docx-1',
  ppt: 'bench-ppt-1',
  notebook: 'bench-notebook',
  image: 'bench-image-1',
  artifact: 'bench-artifact-1',
  feeder: 'bench-feeder-1',
  thermoChunkId: 'bench-note-thermo#0',
};

function assetsDir() {
  return path.join(__dirname, '../../scripts/bench/fixtures/assets');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeMinimalPdf(filePath) {
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 24 Tf 100 700 Td (Bench PDF) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
0000000367 00000 n 
trailer<</Size 6/Root 1 0 R>>
startxref
465
%%EOF`;
  fs.writeFileSync(filePath, pdf, 'utf-8');
}

async function writeMinimalXlsx(filePath) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Ventas');
  sheet.addRow(['Producto', 'Q1', 'Q2']);
  sheet.addRow(['Widget', 100, 120]);
  sheet.addRow(['Gadget', 80, 95]);
  await wb.xlsx.writeFile(filePath);
}

function writeMinimalDocxPlaceholder(filePath) {
  fs.writeFileSync(
    filePath,
    'Bench DOCX placeholder — replace with real docx for full docx_get tests.',
    'utf-8',
  );
}

function writeMinimalPptPlaceholder(filePath) {
  fs.writeFileSync(
    filePath,
    'Bench PPT placeholder — replace with real pptx for full ppt_get_slides tests.',
    'utf-8',
  );
}

function writeMinimalPng(filePath) {
  fs.writeFileSync(filePath, Buffer.from(MINIMAL_PNG_BASE64, 'base64'));
}

async function ensureAssetFiles() {
  const dir = assetsDir();
  ensureDir(dir);
  const pdfPath = path.join(dir, 'sample.pdf');
  const xlsxPath = path.join(dir, 'sample.xlsx');
  const docxPath = path.join(dir, 'sample.docx');
  const pptPath = path.join(dir, 'sample.pptx');
  const pngPath = path.join(dir, 'sample.png');

  if (!fs.existsSync(pdfPath)) writeMinimalPdf(pdfPath);
  if (!fs.existsSync(xlsxPath)) await writeMinimalXlsx(xlsxPath);
  if (!fs.existsSync(docxPath)) writeMinimalDocxPlaceholder(docxPath);
  if (!fs.existsSync(pptPath)) writeMinimalPptPlaceholder(pptPath);
  if (!fs.existsSync(pngPath)) writeMinimalPng(pngPath);

  return { pdfPath, xlsxPath, docxPath, pptPath, pngPath };
}

/** Isolated filesystem for file_* bench cases (under ~/.dome-bench, not the Dome repo). */
function ensureBenchSandbox() {
  const sandboxDir = path.join(app.getPath('userData'), 'bench-sandbox');
  ensureDir(sandboxDir);
  const markerPath = path.join(sandboxDir, 'bench-marker.json');
  if (!fs.existsSync(markerPath)) {
    fs.writeFileSync(
      markerPath,
      JSON.stringify({ name: 'dome-bench', purpose: 'agent-benchmark' }, null, 2),
      'utf-8',
    );
  }
  const readmePath = path.join(sandboxDir, 'README-bench.txt');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, 'Bench sandbox — do not use Documents/dome paths in tests.\n', 'utf-8');
  }
  return { sandboxDir, markerPath, readmePath };
}

async function upsertResource(queries, row) {
  const existing = await queries.getResourceById.get(row.id);
  const ts = Date.now();
  if (existing) {
    await queries.updateResource.run(row.title, row.content, row.metadata, ts, row.id);
    return row.id;
  }
  await queries.createResource.run(
    row.id,
    row.project_id,
    row.type,
    row.title,
    row.content,
    row.file_path,
    row.folder_id,
    row.metadata,
    ts,
    ts,
  );
  return row.id;
}

function feederScriptHash(script) {
  return crypto.createHash('sha256').update(String(script || ''), 'utf8').digest('hex');
}

async function upsertArtifact(queries, { artifactRowId, resourceId, artifactType, stateStr, now }) {
  const existing = await queries.getArtifactByResourceId.get(resourceId);
  if (existing) {
    await queries.updateArtifact.run(artifactType, null, stateStr, null, now, resourceId);
    return existing.id;
  }
  await queries.createArtifact.run(artifactRowId, resourceId, artifactType, null, stateStr, null, now, now);
  return artifactRowId;
}

async function upsertFeeder(queries, row) {
  const existing = await queries.getFeederById.get(row.id);
  if (existing) {
    await queries.updateFeederScript.run(
      row.script,
      row.script_hash,
      row.approved,
      row.approved_script_hash,
      row.updated_at,
      row.id,
    );
    return row.id;
  }
  await queries.createFeeder.run(
    row.id,
    row.artifact_resource_id,
    row.slot,
    row.name,
    row.description,
    row.interpreter,
    row.script,
    row.script_hash,
    row.env_secret_refs,
    row.env_static,
    row.output_mode,
    row.update_policy,
    row.timeout_ms,
    row.enabled,
    row.approved,
    row.approved_script_hash,
    row.last_run_at,
    row.last_status,
    row.last_error,
    row.created_at,
    row.updated_at,
  );
  return row.id;
}

async function upsertResourceChunk(queries, row) {
  await queries.deleteChunksByResource.run(row.resource_id);
  await queries.insertResourceChunk.run(
    row.id,
    row.resource_id,
    row.chunk_index,
    row.text,
    row.embedding,
    row.model_version,
    row.char_start,
    row.char_end,
    row.page_number,
    row.updated_at,
  );
}

async function seedFixtures({ force = false } = {}) {
  database.initDatabase();
  const queries = database.getQueries();
  const flagV2 = (await queries.getSetting.get(SEED_FLAG))?.value;
  if (flagV2 === '1' && !force) {
    console.log('[Bench:Fixtures] Already seeded (v2)');
    return FIXTURE_IDS;
  }

  const now = Date.now();
  const existingProject = await queries.getProjectById.get(BENCH_PROJECT_ID);
  if (!existingProject) {
    await queries.createProject.run(
      BENCH_PROJECT_ID,
      'Bench Project',
      'Isolated fixtures for agent benchmark',
      null,
      now,
      now,
    );
  }

  const assets = await ensureAssetFiles();
  const sandbox = ensureBenchSandbox();

  await upsertResource(queries, {
    id: FIXTURE_IDS.folder,
    project_id: BENCH_PROJECT_ID,
    type: 'folder',
    title: 'Bench Folder',
    content: null,
    file_path: null,
    folder_id: null,
    metadata: JSON.stringify({ color: '#4a5568' }),
  });

  await upsertResource(queries, {
    id: FIXTURE_IDS.noteThermo,
    project_id: BENCH_PROJECT_ID,
    type: 'note',
    title: 'Termodinámica — apuntes bench',
    content:
      '# Termodinámica\n\nLa entropía mide el desorden de un sistema. La primera ley conserva la energía.\n\n## Conceptos\n- Entalpía\n- Entropía\n- Energía libre de Gibbs',
    file_path: null,
    folder_id: FIXTURE_IDS.folder,
    metadata: null,
  });

  await upsertResource(queries, {
    id: FIXTURE_IDS.note1,
    project_id: BENCH_PROJECT_ID,
    type: 'note',
    title: 'Bench Note Alpha',
    content: 'Nota de prueba alpha con backpropagation y redes neuronales.',
    file_path: null,
    folder_id: FIXTURE_IDS.folder,
    metadata: null,
  });

  await upsertResource(queries, {
    id: FIXTURE_IDS.note2,
    project_id: BENCH_PROJECT_ID,
    type: 'note',
    title: 'Bench Note Beta',
    content: 'Nota beta sobre algoritmos de ordenamiento: quicksort, mergesort.',
    file_path: null,
    folder_id: FIXTURE_IDS.folder,
    metadata: null,
  });

  await upsertResource(queries, {
    id: FIXTURE_IDS.pdf,
    project_id: BENCH_PROJECT_ID,
    type: 'pdf',
    title: 'Bench Sample PDF',
    content: null,
    file_path: assets.pdfPath,
    folder_id: FIXTURE_IDS.folder,
    metadata: JSON.stringify({ pages: 1 }),
  });

  await upsertResource(queries, {
    id: FIXTURE_IDS.xlsx,
    project_id: BENCH_PROJECT_ID,
    type: 'excel',
    title: 'Bench Sample Excel',
    content: null,
    file_path: assets.xlsxPath,
    folder_id: FIXTURE_IDS.folder,
    metadata: null,
  });

  await upsertResource(queries, {
    id: FIXTURE_IDS.docx,
    project_id: BENCH_PROJECT_ID,
    type: 'document',
    title: 'Bench Sample DOCX',
    content: null,
    file_path: assets.docxPath,
    folder_id: FIXTURE_IDS.folder,
    metadata: JSON.stringify({ original_filename: 'sample.docx' }),
  });

  await upsertResource(queries, {
    id: FIXTURE_IDS.ppt,
    project_id: BENCH_PROJECT_ID,
    type: 'ppt',
    title: 'Bench Sample PPT',
    content: null,
    file_path: assets.pptPath,
    folder_id: FIXTURE_IDS.folder,
    metadata: null,
  });

  await upsertResource(queries, {
    id: FIXTURE_IDS.notebook,
    project_id: BENCH_PROJECT_ID,
    type: 'notebook',
    title: 'Bench Notebook',
    content: BENCH_NOTEBOOK_JSON,
    file_path: null,
    folder_id: FIXTURE_IDS.folder,
    metadata: null,
  });

  await upsertResource(queries, {
    id: FIXTURE_IDS.image,
    project_id: BENCH_PROJECT_ID,
    type: 'image',
    title: 'Bench Sample Image',
    content: null,
    file_path: assets.pngPath,
    folder_id: FIXTURE_IDS.folder,
    metadata: JSON.stringify({ original_filename: 'sample.png' }),
  });

  const artifactHtml = '<!DOCTYPE html><html><head><title>Bench Counter</title></head><body></body></html>';
  const artifactStateStr = JSON.stringify({ html: artifactHtml, data: { count: 0 } });
  await upsertResource(queries, {
    id: FIXTURE_IDS.artifact,
    project_id: BENCH_PROJECT_ID,
    type: 'artifact',
    title: 'Bench Counter',
    content: null,
    file_path: null,
    folder_id: FIXTURE_IDS.folder,
    metadata: null,
  });
  await upsertArtifact(queries, {
    artifactRowId: 'bench-artifact-row-1',
    resourceId: FIXTURE_IDS.artifact,
    artifactType: 'task-tracker',
    stateStr: artifactStateStr,
    now,
  });

  const feederScript = 'import json\nprint(json.dumps({"ok": True}))\n';
  const feederHash = feederScriptHash(feederScript);
  await upsertFeeder(queries, {
    id: FIXTURE_IDS.feeder,
    artifact_resource_id: FIXTURE_IDS.artifact,
    slot: 'default',
    name: 'Bench Feeder',
    description: 'Benchmark feeder fixture',
    interpreter: 'python3',
    script: feederScript,
    script_hash: feederHash,
    env_secret_refs: '[]',
    env_static: '{}',
    output_mode: 'stdout_json',
    update_policy: 'replace',
    timeout_ms: 30000,
    enabled: 1,
    approved: 0,
    approved_script_hash: null,
    last_run_at: null,
    last_status: null,
    last_error: null,
    created_at: now,
    updated_at: now,
  });

  const thermoChunkText =
    'La entropía mide el desorden de un sistema termodinámico. En procesos reversibles, el cambio de entropía está ligado al calor transferido.';
  const dummyEmbedding = Buffer.alloc(768 * 4);
  await upsertResourceChunk(queries, {
    id: FIXTURE_IDS.thermoChunkId,
    resource_id: FIXTURE_IDS.noteThermo,
    chunk_index: 0,
    text: thermoChunkText,
    embedding: dummyEmbedding,
    model_version: 'bench',
    char_start: 0,
    char_end: thermoChunkText.length,
    page_number: null,
    updated_at: now,
  });

  const sandboxPngPath = path.join(sandbox.sandboxDir, 'sample.png');
  if (!fs.existsSync(sandboxPngPath)) {
    fs.copyFileSync(assets.pngPath, sandboxPngPath);
  }

  await queries.setSetting.run('bench_default_project_id', BENCH_PROJECT_ID, now);
  await queries.setSetting.run('current_project_id', BENCH_PROJECT_ID, now);
  await queries.setSetting.run('bench_sandbox_dir', sandbox.sandboxDir, now);
  await queries.setSetting.run('bench_sample_png_path', sandboxPngPath, now);
  await queries.setSetting.run(SEED_FLAG, '1', now);
  if (await queries.getSetting.get(LEGACY_SEED_FLAG)) {
    await queries.setSetting.run(LEGACY_SEED_FLAG, '0', now);
  }

  console.log('[Bench:Fixtures] Seeded project + resources:', FIXTURE_IDS);
  console.log('[Bench:Fixtures] Sandbox:', sandbox.sandboxDir);
  console.log('[Bench:Fixtures] Sample PNG:', sandboxPngPath);
  return {
    ...FIXTURE_IDS,
    sandboxDir: sandbox.sandboxDir,
    markerPath: sandbox.markerPath,
    samplePngPath: sandboxPngPath,
  };
}

module.exports = { seedFixtures, FIXTURE_IDS, BENCH_PROJECT_ID, ensureBenchSandbox };
