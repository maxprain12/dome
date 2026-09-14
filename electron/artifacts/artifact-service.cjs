'use strict';

const { randomUUID } = require('node:crypto');
const { z } = require('zod');
const { normalizeArtifactState } = require('./artifact-html-normalize.cjs');
const { serializeArtifactRecord, parseJsonState } = require('./artifact-serialize.cjs');
const { afterArtifactMutation } = require('./artifact-index-sync.cjs');
const vaultStore = require('../storage/vault-store.cjs');

const id = z.string().min(1).max(200);
const record = z.record(z.string(), z.unknown());
const artifactType = z.enum(['document', 'task-tracker', 'chart', 'custom']);
const stateSchema = z.object({ html: z.string().max(2_000_000).optional(), css: z.string().max(200_000).optional(), markdown: z.string().max(500_000).optional(), data: record.optional() }).passthrough();
const createSchema = z.object({ title: z.string().max(300).optional(), artifactType: artifactType.default('custom'), state: stateSchema.default({}), template: z.string().nullable().optional(), content: z.string().max(500_000).optional(), projectId: id.optional(), folderId: id.nullable().optional(), linkedResourceId: id.nullable().optional() });
const updateSchema = z.object({ resourceId: id, state: stateSchema.optional(), data: record.optional(), dataPatch: record.optional(), html: z.string().max(2_000_000).optional(), css: z.string().max(200_000).optional(), content: z.string().max(500_000).optional(), expectedVersion: z.number().int().nonnegative().optional(), artifactType: artifactType.optional(), linkedResourceId: id.nullable().optional() });

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function inlineJson(value) { return JSON.stringify(value ?? {}).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }

const { documentState } = require('./artifact-document.cjs');

function resolvedState(type, state, content) {
  const next = normalizeArtifactState(state);
  if (type === 'document') {
    const markdown = content ?? next.markdown;
    if (typeof markdown !== 'string' || !markdown.trim()) throw new Error('Document content is required. Pass content as a Markdown string.');
    return { ...next, ...documentState(markdown), data: next.data || {} };
  }
  if (typeof next.html !== 'string' || !next.html.trim()) throw new Error('Miniapps require complete working html. Include the requested controls and interactions.');
  if (content !== undefined) throw new Error('content is for document artifacts. Use html for interactive artifacts.');
  if (next.format === 'document') { delete next.format; delete next.markdown; }
  return { ...next, data: next.data || {} };
}

function createArtifactService({ database, fileStorage, windowManager }) {
  const deps = { database, fileStorage };
  const queries = () => database.getQueries();
  const get = (resourceId) => {
    id.parse(resourceId);
    const q = queries();
    const row = q.getArtifactByResourceId.get(resourceId);
    const resource = q.getResourceById.get(resourceId);
    if (!row || resource?.type !== 'artifact') throw new Error('Artifact not found');
    return serializeArtifactRecord(row, resource, q);
  };
  const publish = (resourceId, created) => {
    const mirror = vaultStore.writeArtifactHtmlMirror({ id: resourceId }, deps);
    const data = get(resourceId);
    if (created) windowManager?.broadcast('resource:created', queries().getResourceById.get(resourceId));
    windowManager?.broadcast(created ? 'artifact:created' : 'artifact:updated', data);
    afterArtifactMutation(database, resourceId);
    return { success: true, data, ...(!mirror.success ? { warnings: [mirror.error || 'Vault mirror could not be written. Database changes were saved.'] } : {}) };
  };
  function create(input) {
    const args = createSchema.parse(input);
    const type = args.state.format === 'document' ? 'document' : args.artifactType;
    const state = resolvedState(type, { ...args.state, ...(args.template && !args.state.html ? { html: args.template } : {}) }, args.content);
    const q = queries();
    const resourceId = randomUUID();
    const now = Date.now();
    const title = args.title?.trim() || state.markdown?.match(/^#\s+(.+)/m)?.[1] || state.html?.match(/<h1[^>]*>([^<]+)/i)?.[1] || 'Untitled Artifact';
    database.getDB().transaction(() => {
      q.createResource.run(resourceId, args.projectId || 'default', 'artifact', title, null, null, args.folderId ?? null, null, now, now);
      q.createArtifact.run(randomUUID(), resourceId, type === 'document' ? 'custom' : type, null, JSON.stringify(state), args.linkedResourceId ?? null, now, now);
    })();
    return publish(resourceId, true);
  }
  function update(input) {
    const args = updateSchema.parse(input);
    const q = queries();
    database.getDB().transaction(() => {
      const current = q.getArtifactByResourceId.get(args.resourceId);
      if (!current) throw new Error('Artifact not found');
      if (args.expectedVersion !== undefined && args.expectedVersion !== current.version) throw new Error('Artifact changed. Reload the latest version before saving your changes.');
      const previous = parseJsonState(current.state);
      const next = { ...previous, ...args.state };
      if (args.html !== undefined) next.html = args.html;
      if (args.css !== undefined) next.css = args.css;
      if (args.data !== undefined) next.data = args.data;
      if (args.dataPatch !== undefined) next.data = { ...(next.data || {}), ...args.dataPatch };
      const type = args.artifactType || (previous.format === 'document' ? 'document' : current.artifact_type);
      if (type === 'document' && (args.html !== undefined || args.state?.html !== undefined) && args.content === undefined && args.state?.markdown === undefined) throw new Error('Use content (Markdown) to update this document.');
      const state = resolvedState(type, next, args.content);
      const now = Date.now();
      q.updateArtifact.run(type === 'document' ? 'custom' : type, null, JSON.stringify(state), args.linkedResourceId !== undefined ? args.linkedResourceId : current.linked_resource_id, now, args.resourceId);
    })();
    return publish(args.resourceId, false);
  }
  function remove(resourceId) {
    const previous = get(resourceId);
    vaultStore.removeMirrorForResource(resourceId, deps);
    queries().deleteResource.run(resourceId);
    windowManager?.broadcast('artifact:deleted', { resourceId });
    windowManager?.broadcast('resource:deleted', { id: resourceId });
    return { success: true, deleted: { id: resourceId, title: previous.title, type: 'artifact' } };
  }
  return { create, update, remove, get };
}

module.exports = { createArtifactService, documentState, inlineJson, escapeHtml, createSchema, updateSchema };
