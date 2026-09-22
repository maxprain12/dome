'use strict';

/* eslint-disable no-console */

const crypto = require('node:crypto');
const path = require('node:path');
const YAML = require('yaml');
const { dialog } = require('electron');
const { z } = require('zod');
const githubApi = require('../github/github-api.cjs');
const vaultStore = require('../storage/vault-store.cjs');

const idSchema = z.string().min(1).max(128);
const fieldValueSchema = z.union([z.string().max(20_000), z.array(z.string().max(200)).max(100)]);
const fieldValuesSchema = z.record(z.string(), fieldValueSchema);
const configurationSchema = z.object({
  projectId: idSchema,
  permissions: z.array(z.string()).max(12),
  github: z.object({
    repo: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    branch: z.string().min(1).max(200).regex(/^[A-Za-z0-9._/-]+$/),
    pathPrefix: z.string().max(240).optional(),
    contentPaths: z.record(z.string(), z.string().min(1).max(240)).optional(),
  }).optional(),
}).strict();

const METHOD_PERMISSIONS = {
  'host.context': null,
  'notes.list': 'notes.read',
  'notes.get': 'notes.read',
  'notes.create': 'notes.write',
  'notes.update': 'notes.write',
  'notes.open': 'notes.read',
  'publication.prepare': 'content.publish',
  'publication.requestApproval': 'content.publish',
  'publication.get': 'content.publish',
};

const METHOD_SCHEMAS = {
  'host.context': z.object({}).passthrough(),
  'notes.list': z.object({ limit: z.number().int().min(1).max(100).optional() }).passthrough(),
  'notes.get': z.object({ id: idSchema }).strict(),
  'notes.create': z.object({
    title: z.string().min(1).max(240),
    body: z.string().max(2_000_000).optional(),
    fields: fieldValuesSchema.optional(),
  }).strict(),
  'notes.update': z.object({
    id: idSchema,
    expectedUpdatedAt: z.number().int().nonnegative(),
    title: z.string().min(1).max(240).optional(),
    body: z.string().max(2_000_000).optional(),
    fields: fieldValuesSchema.optional(),
  }).strict(),
  'notes.open': z.object({ id: idSchema }).strict(),
  'publication.prepare': z.object({ resourceId: idSchema }).strict(),
  'publication.requestApproval': z.object({ id: idSchema }).strict(),
  'publication.get': z.object({ id: idSchema }).strict(),
};

function parseJson(raw, fallback) {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safePrefix(input) {
  const normalized = String(input || '').trim().replace(/^\/+|\/+$/g, '');
  if (!normalized) return 'src/content/posts';
  if (normalized.includes('..') || normalized.includes('\\') || normalized.startsWith('.github')) {
    throw new Error('Publication path must stay inside a content folder');
  }
  return normalized;
}

function safeContentPath(input) {
  const raw = String(input || '').trim();
  if (!raw || raw.startsWith('/') || raw.includes('\\')) {
    throw new Error('Content folders must be relative paths');
  }
  const normalized = raw.replace(/^\/+|\/+$/g, '');
  if (!normalized.startsWith('src/content/') || normalized.includes('..')) {
    throw new Error('Content folders must stay inside src/content');
  }
  return normalized;
}

function contentPathKey(value) {
  const key = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_-]*$/.test(key)) {
    throw new Error('Content path keys must use collection/language');
  }
  return key;
}

function resolveContentPath(github, fields) {
  if (github.contentPaths) {
    const collection = String(fields.collection || '').trim();
    const language = String(fields.language || '').trim();
    if (!collection || !language) throw new Error('Collection and language are required for publication');
    const key = contentPathKey(`${collection}/${language}`);
    const configured = github.contentPaths[key];
    if (!configured) throw new Error(`No content folder configured for ${key}`);
    return safeContentPath(configured);
  }
  return safePrefix(github.pathPrefix);
}

function slugify(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'untitled';
}

function pluginMetadata(metadata, pluginId) {
  const root = typeof metadata === 'string' ? parseJson(metadata, {}) : (metadata || {});
  const plugins = root && typeof root.plugins === 'object' ? root.plugins : {};
  const value = plugins?.[pluginId];
  return value && typeof value === 'object' ? value : null;
}

function mergePluginMetadata(metadata, pluginId, patch) {
  const root = typeof metadata === 'string' ? parseJson(metadata, {}) : { ...(metadata || {}) };
  const plugins = root.plugins && typeof root.plugins === 'object' ? { ...root.plugins } : {};
  const current = plugins[pluginId] && typeof plugins[pluginId] === 'object'
    ? plugins[pluginId]
    : {};
  plugins[pluginId] = { ...current, ...patch };
  return { ...root, plugins };
}

function normalizeFields(template, input, current = {}) {
  const values = { ...current };
  const incoming = input || {};
  const allowed = new Set(template?.fields?.map((field) => field.id) || []);
  for (const key of Object.keys(incoming)) {
    if (!allowed.has(key)) throw new Error(`Unknown field: ${key}`);
  }
  for (const definition of template?.fields || []) {
    if (!(definition.id in incoming)) continue;
    const value = incoming[definition.id];
    if (definition.type === 'tags') {
      if (!Array.isArray(value)) throw new Error(`${definition.label} must be a list`);
      values[definition.id] = value.map((item) => String(item).trim()).filter(Boolean);
      continue;
    }
    if (typeof value !== 'string') throw new Error(`${definition.label} must be text`);
    const trimmed = value.trim();
    if (definition.type === 'slug' && trimmed && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) {
      throw new Error(`${definition.label} must be a lowercase URL slug`);
    }
    if (definition.type === 'sitePath' && trimmed && (!trimmed.startsWith('/') || trimmed.includes('..'))) {
      throw new Error(`${definition.label} must be a site path starting with /`);
    }
    if (definition.type === 'select' && !definition.options?.includes(trimmed)) {
      throw new Error(`${definition.label} must use one of the declared options`);
    }
    values[definition.id] = trimmed;
  }
  return values;
}

function noteDigest(note, fields) {
  return crypto.createHash('sha256').update(JSON.stringify({
    title: note.title,
    content: note.content || '',
    fields,
  })).digest('hex');
}

function serializeNote(row, pluginId) {
  const metadata = pluginMetadata(row.metadata, pluginId);
  if (!metadata) return null;
  const fields = metadata.fields || {};
  const digest = noteDigest(row, fields);
  const publishedDigest = metadata.publication?.contentDigest;
  return {
    id: row.id,
    title: row.title,
    body: row.content || '',
    fields,
    updatedAt: row.updated_at,
    publication: metadata.publication || null,
    status: !publishedDigest ? 'draft' : publishedDigest === digest ? 'published' : 'changed',
  };
}

function parseGrant(row) {
  if (!row) return null;
  return {
    pluginId: row.plugin_id,
    manifestDigest: row.manifest_digest,
    projectId: row.project_id,
    permissions: parseJson(row.permissions_json, []),
    ...parseJson(row.config_json, {}),
  };
}

function createPluginService({ database, fileStorage, windowManager, pluginLoader }) {
  const queries = () => database.getQueries();

  function getPlugin(pluginId) {
    const plugin = pluginLoader.listPlugins().find((item) => item.id === pluginId);
    if (!plugin) throw new Error('Plugin not installed');
    return plugin;
  }

  function getGrant(plugin, { requireEnabled = true } = {}) {
    if (requireEnabled && !plugin.enabled) throw new Error('Plugin is disabled');
    const grant = parseGrant(queries().getPluginGrant.get(plugin.id));
    if (!grant || grant.manifestDigest !== plugin.manifestDigest) {
      throw new Error('Plugin permissions must be reviewed');
    }
    return grant;
  }

  function configure(pluginId, input) {
    const plugin = getPlugin(pluginId);
    const parsed = configurationSchema.parse(input);
    const project = queries().getProjectById.get(parsed.projectId);
    if (!project) throw new Error('Vault not found');
    const declared = new Set(plugin.permissions || []);
    for (const permission of parsed.permissions) {
      if (!declared.has(permission)) throw new Error(`Plugin did not declare ${permission}`);
    }
    if ((plugin.permissions || []).some((permission) => !parsed.permissions.includes(permission))) {
      throw new Error('All declared permissions must be reviewed before activation');
    }
    const github = parsed.github
      ? {
        ...parsed.github,
        ...(parsed.github.pathPrefix ? { pathPrefix: safePrefix(parsed.github.pathPrefix) } : {}),
        ...(parsed.github.contentPaths
          ? {
            contentPaths: Object.fromEntries(Object.entries(parsed.github.contentPaths).map(([key, value]) => [
              contentPathKey(key),
              safeContentPath(value),
            ])),
          }
          : {}),
      }
      : undefined;
    if (
      parsed.permissions.includes('content.publish')
      && (!github || (!github.pathPrefix && !Object.keys(github.contentPaths || {}).length))
    ) {
      throw new Error('GitHub destination is required for publishing');
    }
    const now = Date.now();
    queries().upsertPluginGrant.run(
      plugin.id,
      plugin.manifestDigest,
      parsed.projectId,
      JSON.stringify(parsed.permissions),
      JSON.stringify({ github }),
      now,
      now,
    );
    pluginLoader.setEnabled(plugin.id, true);
    return getConfiguration(plugin.id);
  }

  function getConfiguration(pluginId) {
    const plugin = getPlugin(pluginId);
    const grant = parseGrant(queries().getPluginGrant.get(pluginId));
    if (!grant || grant.manifestDigest !== plugin.manifestDigest) return null;
    return grant;
  }

  function revoke(pluginId) {
    queries().deletePluginGrant.run(pluginId);
    pluginLoader.setEnabled(pluginId, false);
    return { success: true };
  }

  function listPlugins() {
    return pluginLoader.listPlugins().map((plugin) => {
      const grant = parseGrant(queries().getPluginGrant.get(plugin.id));
      return {
        ...plugin,
        configured: Boolean(grant && grant.manifestDigest === plugin.manifestDigest),
      };
    });
  }

  function noteForGrant(resourceId, grant) {
    const note = queries().getResourceById.get(resourceId);
    if (!note || note.type !== 'note' || note.project_id !== grant.projectId) {
      throw new Error('Note is outside the authorized vault');
    }
    return note;
  }

  function templateFor(plugin) {
    const template = plugin.contributes?.vaultTemplate;
    if (!template) throw new Error('Plugin does not contribute a vault template');
    return template;
  }

  function createNote(plugin, grant, params) {
    const template = templateFor(plugin);
    const now = Date.now();
    const id = crypto.randomUUID();
    const requestedFields = params.fields || {};
    const fields = normalizeFields(template, {
      ...requestedFields,
      ...(template.fields.some((field) => field.id === 'slug') && !requestedFields.slug
        ? { slug: slugify(params.title) }
        : {}),
    });
    const metadata = mergePluginMetadata({}, plugin.id, {
      templateId: template.id,
      schemaVersion: template.schemaVersion,
      fields,
    });
    queries().createResource.run(
      id,
      grant.projectId,
      'note',
      params.title,
      params.body || '',
      null,
      null,
      JSON.stringify(metadata),
      now,
      now,
    );
    const mirror = vaultStore.writeNoteMarkdown(
      { id, markdown: params.body || '' },
      { database, fileStorage },
    );
    if (!mirror.success) {
      queries().deleteResource.run(id);
      throw new Error(mirror.error || 'Could not create note mirror');
    }
    const created = queries().getResourceById.get(id);
    windowManager.broadcast('resource:created', created);
    return serializeNote(created, plugin.id);
  }

  function updateNote(plugin, grant, params) {
    const current = noteForGrant(params.id, grant);
    if (current.updated_at !== params.expectedUpdatedAt) throw new Error('CONFLICT: note changed');
    const metadata = pluginMetadata(current.metadata, plugin.id);
    if (!metadata) throw new Error('Note does not belong to this plugin');
    const fields = normalizeFields(
      templateFor(plugin),
      params.fields,
      metadata.fields || {},
    );
    const mergedMetadata = mergePluginMetadata(current.metadata, plugin.id, { fields });
    const now = Date.now();
    const nextTitle = params.title ?? current.title;
    const nextBody = params.body ?? current.content ?? '';
    const result = queries().updatePluginNoteIfCurrent.run(
      nextTitle,
      nextBody,
      JSON.stringify(mergedMetadata),
      now,
      current.id,
      grant.projectId,
      params.expectedUpdatedAt,
    );
    if (result.changes !== 1) throw new Error('CONFLICT: note changed');
    const mirror = vaultStore.writeNoteMarkdown({ id: current.id, markdown: nextBody }, { database, fileStorage });
    if (!mirror.success) throw new Error(mirror.error || 'Could not update note mirror');
    const updated = queries().getResourceById.get(current.id);
    windowManager.broadcast('resource:updated', { id: current.id, updates: updated });
    return serializeNote(updated, plugin.id);
  }

  function getNoteSchema(resourceId) {
    const note = queries().getResourceById.get(resourceId);
    if (!note || note.type !== 'note') return null;
    for (const plugin of listPlugins()) {
      if (!plugin.enabled) continue;
      const metadata = pluginMetadata(note.metadata, plugin.id);
      if (!metadata) continue;
      const grant = parseGrant(queries().getPluginGrant.get(plugin.id));
      if (!grant || grant.projectId !== note.project_id || grant.manifestDigest !== plugin.manifestDigest) continue;
      const template = plugin.contributes?.vaultTemplate;
      if (!template) continue;
      return {
        pluginId: plugin.id,
        template,
        values: metadata.fields || {},
        updatedAt: note.updated_at,
      };
    }
    return null;
  }

  function updateNoteFields(resourceId, expectedUpdatedAt, values) {
    const schema = getNoteSchema(resourceId);
    if (!schema) throw new Error('No plugin fields for this note');
    const plugin = getPlugin(schema.pluginId);
    const grant = getGrant(plugin);
    if (!grant.permissions.includes('notes.write')) throw new Error('Permission notes.write required');
    const note = noteForGrant(resourceId, grant);
    if (note.updated_at !== expectedUpdatedAt) throw new Error('CONFLICT: note changed');
    const fields = normalizeFields(schema.template, values, schema.values);
    const metadata = mergePluginMetadata(note.metadata, plugin.id, { fields });
    const now = Date.now();
    const result = queries().updatePluginNoteFieldsIfCurrent.run(
      JSON.stringify(metadata), now, resourceId, grant.projectId, expectedUpdatedAt,
    );
    if (result.changes !== 1) throw new Error('CONFLICT: note changed');
    const mirror = vaultStore.writeNoteMarkdown(
      { id: resourceId, markdown: note.content || '' },
      { database, fileStorage },
    );
    if (!mirror.success) throw new Error(mirror.error || 'Could not update note mirror');
    const updated = queries().getResourceById.get(resourceId);
    windowManager.broadcast('resource:updated', { id: resourceId, updates: updated });
    return { updatedAt: now, fields };
  }

  function buildAstroDocument(plugin, note) {
    const metadata = pluginMetadata(note.metadata, plugin.id);
    if (!metadata) throw new Error('Note does not belong to this plugin');
    const fields = normalizeFields(templateFor(plugin), {}, metadata.fields || {});
    for (const definition of templateFor(plugin).fields) {
      const value = fields[definition.id];
      if (definition.required && (value == null || value === '' || (Array.isArray(value) && value.length === 0))) {
        throw new Error(`${definition.label} is required`);
      }
    }
    const slug = String(fields.slug || slugify(note.title));
    const frontmatter = { title: note.title, ...fields };
    const content = `---\n${YAML.stringify(frontmatter).trimEnd()}\n---\n\n${note.content || ''}\n`;
    return { slug, content, fields };
  }

  async function preparePublication(plugin, grant, resourceId) {
    if (!grant.github) throw new Error('GitHub destination is not configured');
    const note = noteForGrant(resourceId, grant);
    const document = buildAstroDocument(plugin, note);
    const duplicate = queries().listPluginNotes.all(grant.projectId).find((candidate) => {
      if (candidate.id === note.id) return false;
      const candidateMetadata = pluginMetadata(candidate.metadata, plugin.id);
      return candidateMetadata?.fields?.slug === document.slug;
    });
    if (duplicate) throw new Error(`Another CMS note already uses the slug ${document.slug}`);
    const [owner, repo] = grant.github.repo.split('/');
    const reference = await githubApi.getReference(owner, repo, grant.github.branch);
    const prefix = resolveContentPath(grant.github, document.fields);
    const filePath = path.posix.join(prefix, `${document.slug}.md`);
    if (!filePath.startsWith(`${prefix}/`)) throw new Error('Publication path escaped its destination');
    const id = crypto.randomUUID();
    const now = Date.now();
    const request = {
      resourceId,
      expectedUpdatedAt: note.updated_at,
      repo: grant.github.repo,
      branch: grant.github.branch,
      path: filePath,
      baseSha: reference.object.sha,
      content: document.content,
      contentDigest: noteDigest(note, document.fields),
    };
    queries().createPluginPublication.run(
      id, plugin.id, grant.projectId, 'prepared', JSON.stringify(request), null, now, now,
    );
    return {
      id,
      status: 'prepared',
      repo: request.repo,
      branch: request.branch,
      path: request.path,
      preview: document.content,
    };
  }

  async function executePublication(plugin, grant, row) {
    const request = parseJson(row.request_json, null);
    if (!request) throw new Error('Invalid publication proposal');
    const note = noteForGrant(request.resourceId, grant);
    if (note.updated_at !== request.expectedUpdatedAt) throw new Error('CONFLICT: note changed after review');
    const [owner, repo] = request.repo.split('/');
    const reference = await githubApi.getReference(owner, repo, request.branch);
    if (reference.object.sha !== request.baseSha) throw new Error('CONFLICT: GitHub branch changed');
    const parent = await githubApi.getCommit(owner, repo, request.baseSha);
    const blob = await githubApi.createBlob(owner, repo, request.content);
    const tree = await githubApi.createTree(owner, repo, parent.tree.sha, [{
      path: request.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    }]);
    const commit = await githubApi.createCommit(
      owner,
      repo,
      `content: publish ${note.title} from Dome`,
      tree.sha,
      request.baseSha,
    );
    await githubApi.updateReference(owner, repo, request.branch, commit.sha);
    const currentMeta = pluginMetadata(note.metadata, plugin.id);
    const metadata = mergePluginMetadata(note.metadata, plugin.id, {
      publication: {
        contentDigest: request.contentDigest,
        commitSha: commit.sha,
        path: request.path,
        publishedAt: Date.now(),
      },
      fields: currentMeta.fields || {},
    });
    const now = Date.now();
    const update = queries().updatePluginNoteFieldsIfCurrent.run(
      JSON.stringify(metadata), now, note.id, grant.projectId, note.updated_at,
    );
    if (update.changes === 1) {
      vaultStore.writeNoteMarkdown({ id: note.id, markdown: note.content || '' }, { database, fileStorage });
      windowManager.broadcast('resource:updated', {
        id: note.id,
        updates: queries().getResourceById.get(note.id),
      });
    }
    return { commitSha: commit.sha, path: request.path, repo: request.repo, branch: request.branch };
  }

  async function requestApproval(plugin, grant, publicationId, parentWindow) {
    const row = queries().getPluginPublication.get(publicationId, plugin.id);
    if (!row) throw new Error('Publication proposal not found');
    if (row.status !== 'prepared') return serializePublication(row);
    const request = parseJson(row.request_json, {});
    const previewLimit = 6_000;
    const preview = String(request.content || '');
    const previewText = preview.length > previewLimit
      ? `${preview.slice(0, previewLimit)}\n\n… preview truncated`
      : preview;
    const result = await dialog.showMessageBox(parentWindow, {
      type: 'question',
      buttons: ['Publish', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      title: 'Publish content',
      message: `Publish ${request.path}?`,
      detail: `${request.repo} · ${request.branch}\n\nDome will create one Git commit with this file:\n\n${previewText}`,
      noLink: true,
    });
    if (result.response !== 0) {
      queries().updatePluginPublication.run('cancelled', null, Date.now(), row.id, plugin.id);
      return { id: row.id, status: 'cancelled' };
    }
    queries().updatePluginPublication.run('publishing', null, Date.now(), row.id, plugin.id);
    try {
      const receipt = await executePublication(plugin, grant, row);
      queries().updatePluginPublication.run(
        'published', JSON.stringify(receipt), Date.now(), row.id, plugin.id,
      );
      return { id: row.id, status: 'published', ...receipt };
    } catch (error) {
      const conflict = String(error.message || '').startsWith('CONFLICT:');
      const status = conflict ? 'conflict' : 'failed';
      queries().updatePluginPublication.run(
        status, JSON.stringify({ error: error.message }), Date.now(), row.id, plugin.id,
      );
      throw error;
    }
  }

  function serializePublication(row) {
    if (!row) return null;
    const request = parseJson(row.request_json, {});
    return {
      id: row.id,
      status: row.status,
      repo: request.repo,
      branch: request.branch,
      path: request.path,
      result: parseJson(row.result_json, null),
      updatedAt: row.updated_at,
    };
  }

  async function request(pluginId, method, input, parentWindow) {
    const plugin = getPlugin(pluginId);
    const grant = getGrant(plugin);
    if (!Object.hasOwn(METHOD_PERMISSIONS, method)) throw new Error('Unsupported plugin method');
    const required = METHOD_PERMISSIONS[method];
    if (required && !grant.permissions.includes(required)) throw new Error(`Permission ${required} required`);
    const params = METHOD_SCHEMAS[method].parse(input || {});
    if (method === 'host.context') {
      const project = queries().getProjectById.get(grant.projectId);
      return {
        apiVersion: 1,
        plugin: { id: plugin.id, version: plugin.version },
        vault: { id: grant.projectId, name: project?.name || '' },
        template: plugin.contributes?.vaultTemplate || null,
        destination: grant.github || null,
      };
    }
    if (method === 'notes.list') {
      return queries().listPluginNotes.all(grant.projectId)
        .map((row) => serializeNote(row, plugin.id))
        .filter(Boolean)
        .slice(0, params.limit || 100);
    }
    if (method === 'notes.get') return serializeNote(noteForGrant(params.id, grant), plugin.id);
    if (method === 'notes.create') return createNote(plugin, grant, params);
    if (method === 'notes.update') return updateNote(plugin, grant, params);
    if (method === 'notes.open') {
      const note = noteForGrant(params.id, grant);
      windowManager.broadcast('plugin:open-note', {
        id: note.id,
        title: note.title,
        projectId: note.project_id,
      });
      return { opened: true };
    }
    if (method === 'publication.prepare') {
      return preparePublication(plugin, grant, params.resourceId);
    }
    if (method === 'publication.requestApproval') {
      return requestApproval(plugin, grant, params.id, parentWindow);
    }
    if (method === 'publication.get') {
      return serializePublication(queries().getPluginPublication.get(params.id, plugin.id));
    }
    throw new Error('Unsupported plugin method');
  }

  return {
    configure,
    getConfiguration,
    getNoteSchema,
    listPlugins,
    request,
    revoke,
    updateNoteFields,
  };
}

module.exports = { createPluginService, resolveContentPath };
