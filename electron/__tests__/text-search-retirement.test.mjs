import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const require = createRequire(import.meta.url);
const { createBaseSchema } = require('../core/db/schema.cjs');
const { applyMigrations, SCHEMA_HEAD } = require('../core/db/migrations.cjs');
const { buildQueries } = require('../core/db/queries.cjs');
const { searchResources } = require('../search/resource-search.cjs');
function database() {
  const db = new DatabaseSync(':memory:');
  db.pragma = (sql, options = {}) => {
    const rows = db.prepare(`PRAGMA ${sql}`).all();
    return options.simple ? Object.values(rows[0] || {})[0] : rows;
  };
  createBaseSchema(db);
  return db;
}
function resource(db, id, project, content) {
  db.prepare("INSERT INTO resources(id,project_id,type,title,content,created_at,updated_at) VALUES(?,?,'note',?,?,1,1)")
    .run(id, project, `Note ${id}`, content);
}
test('fresh installations use FTS without vector or relation tables and preserve project scope before LIMIT', () => {
  const db = database();
  try {
    applyMigrations(db, 0);
    assert.equal(db.prepare("SELECT value FROM settings WHERE key='schema_version'").get().value, String(SCHEMA_HEAD));
    for (const name of ['resource_chunks','semantic_relations','graph_nodes','graph_edges']) {
      assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name), undefined);
    }
    buildQueries(db); // Prepared statements must not refer to removed tables.
    db.exec("INSERT INTO projects(id,name,created_at,updated_at) VALUES('a','A',1,1),('b','B',1,1)");
    for (let i = 0; i < 30; i++) resource(db, `b${i}`, 'b', 'needle needle needle');
    resource(db, 'a1', 'a', 'needle at end');
    const hits = searchResources(db, 'needle', { projectId: 'a', limit: 1 });
    assert.equal(hits.length, 1); assert.equal(hits[0].id, 'a1');
    for (const query of ['needle OR other', '"', '(needle)', 'needle:*', '']) assert.doesNotThrow(() => searchResources(db, query));
    db.prepare('UPDATE resources SET content_text=? WHERE id=?').run('new extracted OCR words', 'a1');
    assert.equal(searchResources(db, 'extracted', { projectId: 'a' })[0].id, 'a1');
    db.prepare('DELETE FROM resources WHERE id=?').run('a1');
    assert.equal(searchResources(db, 'extracted', { projectId: 'a' }).length, 0);
  } finally { db.close(); }
});
test('upgrade retains note mentions and historical relations, disables their triggers and retires legacy operations', () => {
  const db = database();
  try {
    db.exec("INSERT INTO projects(id,name,created_at,updated_at) VALUES('a','A',1,1)");
    const content = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'legacy searchable text' }, { type: 'mention', attrs: { id: 'target', label: 'Target' } }] }] });
    resource(db, 'source', 'a', content);
    resource(db, 'target', 'a', 'Target');
    db.exec(`CREATE TABLE semantic_relations(id TEXT PRIMARY KEY, source_id TEXT, target_id TEXT);
      INSERT INTO semantic_relations VALUES('historical','source','target');
      CREATE TRIGGER legacy_note_link AFTER UPDATE ON resources BEGIN INSERT OR REPLACE INTO semantic_relations VALUES('automatic',new.id,'target'); END;`);
    db.prepare("INSERT INTO many_agents(id,name,tool_ids,created_at,updated_at,project_id) VALUES('agent','Old agent',?,1,1,'a')").run(JSON.stringify(['resource_search','link_resources']));
    db.exec("INSERT INTO automation_definitions(id,title,target_type,target_id,trigger_type,enabled,created_at,updated_at) VALUES('schedule','Old schedule','agent','agent','schedule',1,1,1)");
    applyMigrations(db, 78);
    assert.equal(db.prepare('SELECT content FROM resources WHERE id=?').get('source').content, content);
    assert.equal(searchResources(db, 'searchable', { projectId: 'a' })[0].id, 'source');
    db.prepare('UPDATE resources SET content=? WHERE id=?').run('@[Target](target)', 'source');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM semantic_relations').get().count, 1);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='legacy_note_link'").get(), undefined);
    assert.equal(db.prepare("SELECT id FROM many_agents WHERE id='agent'").get(), undefined);
    assert.equal(db.prepare("SELECT id FROM automation_definitions WHERE id='schedule'").get(), undefined);
  } finally { db.close(); }
});

test('text indexing persists PDF OCR and image extraction without altering original content', async () => {
  const { loadCjsModule } = await import('./helpers/load-cjs.mjs');
  const db = database();
  try {
    db.exec("INSERT INTO projects(id,name,created_at,updated_at) VALUES('a','A',1,1)");
    resource(db, 'pdf', 'a', 'original PDF body');
    resource(db, 'image', 'a', 'original image body');
    db.exec("UPDATE resources SET type='pdf',vault_path='scan.pdf' WHERE id='pdf'; UPDATE resources SET type='image',vault_path='scan.png' WHERE id='image'");
    const queries = buildQueries(db);
    const extraction = loadCjsModule(require.resolve('../services/text-indexing.cjs'), {
      'node:fs': { existsSync: () => true, readFileSync: () => Buffer.from('image bytes') },
      '../storage/file-storage.cjs': {},
      '../storage/vault-store.cjs': { getResourceFilePath: () => 'scan.png' },
      './pdf-transcription.cjs': { extractPdfTextWithCloud: async () => ({ text: 'scanned OCR words', source: 'cloud_pdf' }) },
      './cloud-llm.service.cjs': { isCloudLlmAvailable: () => true },
      './cloud-llm-tasks.cjs': { runCaptionOnImageDataUrl: async () => 'image caption', runOcrOnImageDataUrl: async () => 'picture OCR words' },
    });
    const indexer = extraction.createIndexer({ getQueries: () => queries, getDB: () => db });
    const first = indexer.indexResource('pdf');
    assert.equal(indexer.indexResource('pdf'), first);
    await Promise.all([first, indexer.indexResource('image')]);
    await indexer.waitForIndexerIdle();
    assert.equal(searchResources(db, 'scanned', { projectId: 'a', type: 'pdf' })[0].id, 'pdf');
    assert.equal(searchResources(db, 'picture', { projectId: 'a', type: 'image' })[0].id, 'image');
    assert.equal(queries.getResourceById.get('pdf').content, 'original PDF body');
    assert.equal(queries.getResourceById.get('image').content, 'original image body');
  } finally { db.close(); }
});

test('retirement removes KB and user automations while retaining historical media text', () => {
  const db = database();
  try {
    db.exec("INSERT INTO projects(id,name,created_at,updated_at) VALUES('a','A',1,1)");
    resource(db, 'audio', 'a', 'Original media');
    db.prepare("UPDATE resources SET type='audio', metadata=? WHERE id='audio'").run(JSON.stringify({ transcription: 'Historical transcript', transcription_structured: { version: 1, segments: [] } }));
    db.prepare("INSERT INTO many_agents(id,name,tool_ids,created_at,updated_at,project_id) VALUES('agent','Search agent',?,1,1,'a')").run(JSON.stringify(['web_search','web_fetch','research_read']));
    db.exec("INSERT INTO automation_definitions(id,title,target_type,target_id,trigger_type,enabled,legacy_source,created_at,updated_at) VALUES('search','User search','agent','agent','schedule',1,NULL,1,1),('kbllm-a-compile','KB','agent','kb','schedule',1,'kb_llm',1,1),('keep','Keep','agent','other','schedule',1,NULL,1,1)");
    applyMigrations(db, 79);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM automation_definitions').get().count, 0);
    assert.equal(db.prepare("SELECT id FROM many_agents WHERE id='agent'").get(), undefined);
    assert.equal(JSON.parse(db.prepare("SELECT metadata FROM resources WHERE id='audio'").get().metadata).transcription, 'Historical transcript');
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='transcription_sessions'").get(), undefined);
  } finally { db.close(); }
});


test('main tool module loads with the retired implementations removed', async () => {
  const { loadCjsModule } = await import('./helpers/load-cjs.mjs');
  const boundary = new Proxy({}, { get: () => () => {} });
  const replacements = Object.fromEntries([
    '../core/database.cjs', '../storage/file-storage.cjs', '../documents/document-extractor.cjs',
    '../documents/docx-converter.cjs', '../feeders/web-scraper.cjs', './excel-tools-handler.cjs',
    './docx-tools-handler.cjs', './ppt-tools-handler.cjs', '../calendar/calendar-service.cjs',
    '../storage/text-index-scheduler.cjs', '../artifacts/artifact-serialize.cjs',
    '../artifacts/artifact-index-sync.cjs', '../artifacts/artifact-html-normalize.cjs',
    '../storage/vault-store.cjs', '../services/note-markdown.cjs', '../services/pdf-transcription.cjs',
    '../services/studio-progress.cjs', '../core/secure-id.cjs', './ai-tools-extra.cjs',
    'electron', '../coding/bash-executor.cjs', '../core/shell-policy.cjs', '../coding/git-tools.cjs',
    './file-tree.cjs', './file-disk-tools.cjs', '../agents/hitl-allowlist.cjs',
  ].map((name) => [name, boundary]));
  const handlers = loadCjsModule(require.resolve('../tools/ai-tools-handler.cjs'), replacements);
  for (const name of ['resourceSearch', 'resourceGet', 'webFetch', 'rememberFact']) assert.equal(typeof handlers[name], 'function', name);
  for (const name of ['webSearch', 'deepResearch', 'testWebSearchConnection', 'generateAudioOverview', 'linkResources', 'getRelatedResources']) assert.equal(handlers[name], undefined, name);
});


test('Ollama chat context discovery uses reported metadata after embedding removal', async () => {
  const { mock } = await import('node:test');
  const { fetchOllamaChatContextWindow } = require('../ai/context-window.cjs');
  const fetchMock = mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ model_info: { 'llama.context_length': 131072 } }) }));
  try {
    assert.equal(await fetchOllamaChatContextWindow('http://localhost:11434', 'custom-vision-model'), 131072);
    assert.equal(fetchMock.mock.calls.length, 1);
  } finally { fetchMock.mock.restore(); }
});
