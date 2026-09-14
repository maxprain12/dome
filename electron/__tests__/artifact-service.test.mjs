import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { documentState } from '../artifacts/artifact-document.cjs';
import { serializeArtifactRecord } from '../artifacts/artifact-serialize.cjs';

const file = new URL('../artifacts/artifact-service.cjs', import.meta.url);
const localRequire = createRequire(file);
function fixture() {
  const resources = new Map();
  const rows = new Map();
  const events = [];
  let mirrorSuccess = true;
  const q = {
    createResource: { run: (id, project_id, type, title) => resources.set(id, { id, project_id, type, title }) },
    createArtifact: { run: (id, resource_id, artifact_type, template, state, linked_resource_id, created_at, updated_at) => rows.set(resource_id, { id, resource_id, artifact_type, template, state, linked_resource_id, created_at, updated_at, version: 1 }) },
    getArtifactByResourceId: { get: (id) => rows.get(id) },
    getResourceById: { get: (id) => resources.get(id) },
    updateArtifact: { run: (artifact_type, template, state, linked_resource_id, updated_at, id) => { const old = rows.get(id); rows.set(id, { ...old, artifact_type, template, state, linked_resource_id, updated_at, version: old.version + 1 }); } },
    deleteResource: { run: (id) => { rows.delete(id); resources.delete(id); } },
  };
  const module = { exports: {} };
  const context = {
    module, exports: module.exports,
    require: (name) => name.includes('artifact-index-sync') ? { afterArtifactMutation() {} }
      : name.includes('vault-store') ? { writeArtifactHtmlMirror: () => ({ success: mirrorSuccess }), removeMirrorForResource() {} } : localRequire(name),
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file.pathname });
  const database = { getQueries: () => q, getDB: () => ({ transaction: (fn) => fn }) };
  return { service: module.exports.createArtifactService({ database, windowManager: { broadcast: (...args) => events.push(args) } }), rows, events, failMirror: () => { mirrorSuccess = false; } };
}

test('creates a report directly from Markdown and exposes its document format', () => {
  const { service, rows, events } = fixture();
  const result = service.create({ artifactType: 'document', content: '# Findings\n\nVerified evidence.' });
  assert.equal(result.success, true);
  assert.equal(result.data.artifactType, 'document');
  assert.equal(result.data.title, 'Findings');
  assert.match(result.data.state.html, /Verified evidence/);
  assert.equal(rows.get(result.data.resourceId).artifact_type, 'custom');
  assert.equal(events[1][0], 'artifact:created');
});

test('updates only supplied fields and rejects stale versions', () => {
  const { service } = fixture();
  const first = service.create({ state: { html: '<main>App</main>', css: 'main{}', data: { a: 1, b: 2 } } }).data;
  const second = service.update({ resourceId: first.resourceId, data: { a: 3 }, expectedVersion: 1 }).data;
  assert.equal(second.state.html, first.state.html);
  assert.equal(second.state.css, 'main{}');
  assert.deepEqual(Object.keys(second.state.data), ['a']);
  assert.throws(() => service.update({ resourceId: first.resourceId, html: 'stale', expectedVersion: 1 }), /changed/);
  assert.equal(service.get(first.resourceId).version, 2);
});

test('merges data against current state without reviving replaced keys', () => {
  const { service } = fixture();
  const first = service.create({ state: { html: '<main/>', data: { a: 1 } } }).data;
  service.update({ resourceId: first.resourceId, dataPatch: { b: 2 } });
  const result = service.update({ resourceId: first.resourceId, dataPatch: { c: 3 } });
  assert.equal(JSON.stringify(result.data.state.data), '{"a":1,"b":2,"c":3}');
  const serialized = serializeArtifactRecord({ state: '{"data":{}}', id: 'a' }, { id: 'r' }, { getArtifactRuntimeDataByArtifactSlot: { get: () => ({ data_json: '{"obsolete":true}' }) } });
  assert.deepEqual(serialized.state.data, {});
});

test('rejects missing content, string data and nonexistent artifacts', () => {
  const { service } = fixture();
  assert.throws(() => service.create({ artifactType: 'document' }), /content is required/);
  assert.throws(() => service.create({ state: { html: 'x', data: '{}' } }));
  assert.throws(() => service.update({ resourceId: 'missing', content: 'x' }), /not found/);
});

test('reports mirror failures without falsely claiming the database write failed', () => {
  const { service, failMirror } = fixture();
  failMirror();
  const result = service.create({ state: { html: '<main/>' } });
  assert.equal(result.success, true);
  assert.equal(result.warnings.length, 1);
  assert.ok(service.get(result.data.resourceId));
});

test('deletes the artifact and broadcasts removal', () => {
  const { service, events } = fixture();
  const first = service.create({ state: { html: '<main/>' } }).data;
  assert.equal(service.remove(first.resourceId).success, true);
  assert.throws(() => service.get(first.resourceId), /not found/);
  assert.equal(events.at(-1)[0], 'resource:deleted');
});

test('document rendering escapes HTML and rejects active links', () => {
  const { html } = documentState('# Test\n<script>alert(1)</script>\n\n[bad](javascript:alert) [encoded](&#x6a;avascript:alert) [source](https://example.test)');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('href="javascript'));
  assert.ok(!html.includes('href="&#x6a;'));
  assert.ok(html.includes('href="https://example.test"'));
});
