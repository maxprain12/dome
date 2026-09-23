'use strict';

/* eslint-disable no-console */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
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
    siteUrl: z.string().max(500).optional(),
    sitePathPattern: z.string().max(240).optional(),
  }).optional(),
}).strict();

const METHOD_PERMISSIONS = {
  'host.context': null,
  'notes.list': 'notes.read',
  'notes.get': 'notes.read',
  'notes.create': 'notes.write',
  'notes.update': 'notes.write',
  'notes.open': 'notes.read',
  'notes.delete': 'notes.write',
  'notes.pull': 'notes.write',
  'notes.sync': 'notes.write',
  'notes.applyTranslations': 'notes.write',
  'media.attach': 'notes.write',
  'media.list': 'notes.read',
  'media.delete': 'notes.write',
  'publication.prepare': 'content.publish',
  'publication.prepareMany': 'content.publish',
  'publication.requestApproval': 'content.publish',
  'publication.cancel': 'content.publish',
  'publication.get': 'content.publish',
};

const METHOD_SCHEMAS = {
  'host.context': z.object({}).passthrough(),
  'notes.list': z.object({ limit: z.number().int().min(1).max(300).optional() }).passthrough(),
  'notes.get': z.object({ id: idSchema }).strict(),
  'notes.create': z.object({
    title: z.string().min(1).max(240),
    body: z.string().max(2_000_000).optional(),
    fields: fieldValuesSchema.optional(),
    familyId: idSchema.optional(),
  }).strict(),
  'notes.update': z.object({
    id: idSchema,
    expectedUpdatedAt: z.number().int().nonnegative(),
    expectedContentDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    title: z.string().min(1).max(240).optional(),
    body: z.string().max(2_000_000).optional(),
    fields: fieldValuesSchema.optional(),
    familyId: idSchema.optional(),
  }).strict(),
  'notes.open': z.object({ id: idSchema }).strict(),
  'notes.delete': z.object({ id: idSchema, remote: z.boolean().optional() }).strict(),
  'notes.pull': z.object({ id: idSchema }).strict(),
  'notes.sync': z.object({}).strict(),
  'notes.applyTranslations': z.object({
    sourceId: idSchema,
    expectedUpdatedAt: z.number().int().nonnegative(),
    expectedContentDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    familyId: idSchema,
    title: z.string().min(1).max(240),
    body: z.string().max(2_000_000),
    fields: fieldValuesSchema.optional(),
    expectedSiblings: z.array(z.object({
      language: z.string().min(1).max(32),
      id: idSchema.nullable(),
      updatedAt: z.number().int().nonnegative().nullable(),
      contentDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    })).min(1).max(12),
    translations: z.array(z.object({
      language: z.string().min(1).max(32),
      title: z.string().min(1).max(240),
      description: z.string().max(20_000),
      slug: z.string().min(1).max(240),
      body: z.string().max(2_000_000),
    })).min(1).max(12),
  }).strict(),
  'media.attach': z.object({
    resourceId: idSchema,
    filename: z.string().min(1).max(200),
    mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
    content: z.string().min(1).max(12_000_000),
  }).strict(),
  'media.list': z.object({}).strict(),
  'media.delete': z.object({ id: idSchema }).strict(),
  'publication.prepare': z.object({ resourceId: idSchema }).strict(),
  'publication.prepareMany': z.object({
    resourceIds: z.array(idSchema).min(1).max(20),
  }).strict(),
  'publication.requestApproval': z.object({ id: idSchema }).strict(),
  'publication.cancel': z.object({ id: idSchema }).strict(),
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

function publicationFilePaths(files) {
  return (Array.isArray(files) ? files : []).map((file) => file?.path).filter(Boolean);
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

function parseCmsDocument(markdown) {
  const raw = String(markdown || '').replace(/^\uFEFF/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { title: '', fields: {}, body: raw };
  const data = YAML.parse(match[1]);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Remote file has invalid frontmatter');
  }
  const fields = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'title' || value == null) continue;
    if (Array.isArray(value)) fields[key] = value.map((item) => String(item));
    else if (value instanceof Date) {
      const month = String(value.getUTCMonth() + 1).padStart(2, '0');
      const day = String(value.getUTCDate()).padStart(2, '0');
      fields[key] = `${value.getUTCFullYear()}-${month}-${day}`;
    } else fields[key] = String(value);
  }
  return {
    title: typeof data.title === 'string' ? data.title : '',
    fields,
    body: match[2] || '',
  };
}

function safeEntryPath(filePath) {
  const normalized = path.posix.normalize(String(filePath || '')).replace(/^\/+/, '');
  if (!normalized.startsWith('src/content/') || normalized.includes('..')) {
    throw new Error('Publication path escaped its destination');
  }
  return normalized;
}

const MEDIA_EXTENSIONS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const DOME_MEDIA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeSiteUrl(input) {
  const trimmed = String(input || '').trim().replace(/\/+$/, '');
  if (!trimmed) return undefined;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Site URL must be an http(s) address');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Site URL must be an http(s) address');
  }
  if (parsed.username || parsed.password) throw new Error('Site URL must not include credentials');
  return trimmed;
}

function safeSitePathPattern(input) {
  const trimmed = String(input || '').trim() || '/{collection}/{slug}';
  if (!trimmed.startsWith('/') || trimmed.includes('..') || trimmed.includes('\\')) {
    throw new Error('Site path pattern must start with /');
  }
  return trimmed;
}

function isBannedMediaUrl(value) {
  const raw = String(value || '').trim();
  return /^(blob:|data:)/i.test(raw)
    || /^https?:\/\/localhost(?::\d+)?(?:\/|$)/i.test(raw)
    || /^https?:\/\/127\.0\.0\.1(?::\d+)?(?:\/|$)/i.test(raw)
    || /^https?:\/\/\[::1\](?::\d+)?(?:\/|$)/i.test(raw);
}

function domeMediaId(value) {
  const match = /^dome-media:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
    .exec(String(value || '').trim());
  return match && DOME_MEDIA_ID.test(match[1]) ? match[1].toLowerCase() : null;
}

function sanitizeMediaFilename(filename, mime) {
  const ext = MEDIA_EXTENSIONS[mime] || '.png';
  const base = String(filename || 'image')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'image';
  return `${base}${ext}`;
}

function uniqueMediaFilename(filename, used) {
  if (!used.has(filename)) return filename;
  const ext = path.posix.extname(filename);
  const base = path.posix.basename(filename, ext);
  for (let suffix = 2; suffix < 1000; suffix++) {
    const candidate = `${base}-${suffix}${ext}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}${ext}`;
}

function safePublicMediaPath(slug, filename) {
  const safeSlug = String(slug || '');
  const safeName = String(filename || '');
  if (!safeSlug || !safeName || safeSlug.includes('..') || safeName.includes('..') || /[\\/]/.test(safeName)) {
    throw new Error('Media path escaped its destination');
  }
  const file = path.posix.join('public/media', safeSlug, safeName);
  if (!file.startsWith(`public/media/${safeSlug}/`)) {
    throw new Error('Media path escaped its destination');
  }
  return file;
}

function publicRepoPath(vaultPath) {
  const normalized = String(vaultPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized.startsWith('public/') || normalized.includes('..')) {
    throw new Error('Image path must stay inside public/');
  }
  return normalized;
}

function storedSitePath(metadata) {
  const parsed = parseJson(typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {}), {});
  const plugins = parsed && typeof parsed.plugins === 'object' && parsed.plugins ? parsed.plugins : {};
  for (const entry of Object.values(plugins)) {
    if (!entry || entry.kind !== 'site-asset' || typeof entry.sitePath !== 'string') continue;
    const sitePath = entry.sitePath.trim();
    if (!sitePath.startsWith('/') || sitePath.startsWith('//') || sitePath.includes('..') || sitePath.includes('\\')) continue;
    return sitePath;
  }
  return '';
}

function siteImageRecord(row) {
  if (!row || typeof row.vault_path !== 'string' || !row.vault_path.startsWith('public/')) return null;
  const sitePath = storedSitePath(row.metadata) || `/${row.vault_path.slice('public/'.length)}`;
  const copy = / \(\d+\)\.[^.]+$/.test(row.vault_path) ? 1 : 0;
  const exact = row.vault_path === `public${sitePath}` ? 0 : 2;
  return {
    id: row.id,
    name: row.title || path.posix.basename(sitePath),
    sitePath,
    rank: exact + copy,
  };
}

function collectMediaRefs(markdown, fields) {
  const refs = [];
  const seen = new Set();
  const addUrl = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return;
    if (isBannedMediaUrl(trimmed)) throw new Error('LOCAL_MEDIA_FORBIDDEN');
    const id = domeMediaId(trimmed);
    if (!id || seen.has(id)) return;
    seen.add(id);
    refs.push(id);
  };
  const re = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match = re.exec(markdown);
  while (match) {
    addUrl(match[1]);
    match = re.exec(markdown);
  }
  for (const value of Object.values(fields || {})) {
    if (typeof value === 'string') addUrl(value);
  }
  return refs;
}

function rewritePublishedMedia(markdown, fields, publicPaths) {
  const nextFields = { ...fields };
  for (const [key, value] of Object.entries(nextFields)) {
    if (typeof value !== 'string') continue;
    const id = domeMediaId(value);
    if (id && publicPaths[id]) nextFields[key] = publicPaths[id];
  }
  const nextMarkdown = markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt, url) => {
    const id = domeMediaId(url.trim());
    if (!id || !publicPaths[id]) return full;
    return `![${alt}](${publicPaths[id]})`;
  });
  return { markdown: nextMarkdown, fields: nextFields };
}

function publicEntryUrl(github, fields) {
  const siteUrl = safeSiteUrl(github?.siteUrl);
  if (!siteUrl) return null;
  const slug = String(fields?.slug || '').trim();
  if (!slug) return null;
  const pattern = safeSitePathPattern(github?.sitePathPattern);
  const resolved = pattern
    .replace(/\{collection\}/g, String(fields?.collection || '').trim())
    .replace(/\{language\}/g, String(fields?.language || '').trim())
    .replace(/\{slug\}/g, slug);
  if (!resolved.startsWith('/') || resolved.includes('..')) return null;
  return `${siteUrl}${resolved}`;
}

function remoteMarkdownEntries(tree, github) {
  const folders = [];
  const contentPaths = github?.contentPaths || {};
  if (Object.keys(contentPaths).length > 0) {
    for (const [key, folder] of Object.entries(contentPaths)) {
      const [collection = '', language = ''] = String(key).split('/');
      folders.push({
        folder: String(folder || '').replace(/\/+$/, ''),
        collection,
        language,
      });
    }
  } else if (github?.pathPrefix) {
    folders.push({
      folder: String(github.pathPrefix).replace(/\/+$/, ''),
      collection: '',
      language: '',
    });
  }
  const entries = [];
  for (const item of tree || []) {
    if (!item || item.type !== 'blob' || typeof item.path !== 'string') continue;
    if (!item.path.toLowerCase().endsWith('.md')) continue;
    const folder = folders
      .filter((entry) => entry.folder && item.path.startsWith(`${entry.folder}/`))
      .sort((left, right) => right.folder.length - left.folder.length)[0];
    if (!folder) continue;
    const relative = item.path.slice(folder.folder.length + 1);
    if (!relative || relative.includes('/')) continue;
    const rawSlug = relative.slice(0, -3);
    const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawSlug) ? rawSlug : slugify(rawSlug);
    if (!slug) continue;
    entries.push({
      path: item.path,
      collection: folder.collection,
      language: folder.language,
      slug,
    });
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return entries;
}

const PUBLIC_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

function remotePublicImages(tree) {
  const images = [];
  for (const item of tree || []) {
    if (!item || item.type !== 'blob' || typeof item.path !== 'string' || typeof item.sha !== 'string') continue;
    if (!item.path.startsWith('public/') || item.path.includes('..')) continue;
    const extension = path.posix.extname(item.path).toLowerCase();
    if (!PUBLIC_IMAGE_EXTENSIONS.has(extension)) continue;
    images.push({
      path: item.path,
      sha: item.sha,
      sitePath: `/${item.path.slice('public/'.length)}`,
    });
  }
  images.sort((left, right) => left.path.localeCompare(right.path));
  return images;
}

function publicationFrontmatter(title, fields, template) {
  const data = { title };
  for (const definition of template?.fields || []) {
    const value = fields?.[definition.id];
    if (Array.isArray(value)) {
      if (value.length > 0) data[definition.id] = value;
      continue;
    }
    if (typeof value === 'string' && value.trim()) data[definition.id] = value.trim();
  }
  return data;
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
    if (definition.type === 'sitePath' && trimmed) {
      const mediaId = domeMediaId(trimmed);
      if (!mediaId && (!trimmed.startsWith('/') || trimmed.includes('..'))) {
        throw new Error(`${definition.label} must be a site path starting with /`);
      }
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
    contentDigest: digest,
    publication: metadata.publication || null,
    familyId: typeof metadata.familyId === 'string' ? metadata.familyId : null,
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
    let github;
    if (parsed.github) {
      const siteUrl = safeSiteUrl(parsed.github.siteUrl);
      github = {
        repo: parsed.github.repo,
        branch: parsed.github.branch,
        ...(parsed.github.pathPrefix && !parsed.github.contentPaths
          ? { pathPrefix: safePrefix(parsed.github.pathPrefix) }
          : {}),
        ...(parsed.github.contentPaths
          ? {
            contentPaths: Object.fromEntries(Object.entries(parsed.github.contentPaths).map(([key, value]) => [
              contentPathKey(key),
              safeContentPath(value),
            ])),
          }
          : {}),
        ...(siteUrl ? { siteUrl } : {}),
        sitePathPattern: safeSitePathPattern(parsed.github.sitePathPattern),
      };
    }
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

  function assertNoteRevision(note, pluginId, params) {
    const unchanged = params.expectedContentDigest
      ? noteDigest(note, pluginMetadata(note.metadata, pluginId)?.fields || {}) === params.expectedContentDigest
      : note.updated_at === params.expectedUpdatedAt;
    if (!unchanged) throw new Error('CONFLICT: note changed');
  }

  function placeDraft(plugin, grant, resourceId) {
    if (!grant.github) return;
    const note = queries().getResourceById.get(resourceId);
    placeCmsNote(grant, resourceId, entryFilePath(plugin, grant, note));
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
      ...(params.familyId ? { familyId: params.familyId } : {}),
    });
    const created = database.getDB().transaction(() => {
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
      placeDraft(plugin, grant, id);
      const mirror = vaultStore.writeNoteMarkdown(
        { id, markdown: params.body || '' },
        { database, fileStorage },
      );
      if (!mirror.success) {
        throw new Error(mirror.error || 'Could not create note mirror');
      }
      return queries().getResourceById.get(id);
    })();
    windowManager.broadcast('resource:created', created);
    return serializeNote(created, plugin.id);
  }

  function updateNote(plugin, grant, params) {
    const current = noteForGrant(params.id, grant);
    assertNoteRevision(current, plugin.id, params);
    const metadata = pluginMetadata(current.metadata, plugin.id);
    if (!metadata) throw new Error('Note does not belong to this plugin');
    const fields = normalizeFields(
      templateFor(plugin),
      params.fields,
      metadata.fields || {},
    );
    const mergedMetadata = mergePluginMetadata(current.metadata, plugin.id, {
      fields,
      ...(params.familyId ? { familyId: params.familyId } : {}),
    });
    const now = Math.max(Date.now(), current.updated_at + 1);
    const nextTitle = params.title ?? current.title;
    const nextBody = params.body ?? current.content ?? '';
    const updated = database.getDB().transaction(() => {
      const result = queries().updatePluginNoteIfCurrent.run(
        nextTitle,
        nextBody,
        JSON.stringify(mergedMetadata),
        now,
        current.id,
        grant.projectId,
        current.updated_at,
      );
      if (result.changes !== 1) throw new Error('CONFLICT: note changed');
      placeDraft(plugin, grant, current.id);
      const mirror = vaultStore.writeNoteMarkdown({ id: current.id, markdown: nextBody }, { database, fileStorage });
      if (!mirror.success) throw new Error(mirror.error || 'Could not update note mirror');
      return queries().getResourceById.get(current.id);
    })();
    windowManager.broadcast('resource:updated', { id: current.id, updates: updated });
    return serializeNote(updated, plugin.id);
  }

  function fieldText(fields, id) {
    const value = fields?.[id];
    return Array.isArray(value) ? String(value[0] || '') : String(value || '');
  }

  function applyTranslations(plugin, grant, params) {
    const template = templateFor(plugin);
    const source = noteForGrant(params.sourceId, grant);
    assertNoteRevision(source, plugin.id, params);
    const sourceMeta = pluginMetadata(source.metadata, plugin.id);
    if (!sourceMeta) throw new Error('Note does not belong to this plugin');
    const sourceFields = normalizeFields(template, params.fields, sourceMeta.fields || {});
    const collection = fieldText(sourceFields, 'collection');
    const sourceLanguage = fieldText(sourceFields, 'language');
    const seen = new Set();
    for (const translation of params.translations) {
      if (translation.language === sourceLanguage) throw new Error('Translation language matches the source');
      if (seen.has(translation.language)) throw new Error('Duplicate translation language');
      seen.add(translation.language);
    }
    const rows = queries().listPluginNotes.all(grant.projectId);
    const siblings = new Map();
    for (const row of rows) {
      if (row.id === source.id) continue;
      const meta = pluginMetadata(row.metadata, plugin.id);
      if (!meta || meta.familyId !== params.familyId) continue;
      if (fieldText(meta.fields, 'collection') !== collection) continue;
      const language = fieldText(meta.fields, 'language');
      if (seen.has(language)) siblings.set(language, row);
    }
    for (const translation of params.translations) {
      const expected = params.expectedSiblings.find((entry) => entry.language === translation.language);
      const sibling = siblings.get(translation.language);
      if (!expected || (sibling?.id || null) !== expected.id) throw new Error('CONFLICT: translation changed');
      if (!sibling) continue;
      const fields = pluginMetadata(sibling.metadata, plugin.id)?.fields || {};
      const unchanged = expected.contentDigest
        ? noteDigest(sibling, fields) === expected.contentDigest
        : sibling.updated_at === expected.updatedAt;
      if (!unchanged) throw new Error('CONFLICT: translation changed');
    }
    const now = Date.now();
    const planned = [{
      id: source.id,
      create: false,
      expectedUpdatedAt: source.updated_at,
      title: params.title,
      body: params.body,
      metadata: mergePluginMetadata(source.metadata, plugin.id, {
        fields: sourceFields,
        familyId: params.familyId,
      }),
    }];
    for (const translation of params.translations) {
      const sibling = siblings.get(translation.language);
      const currentFields = sibling
        ? (pluginMetadata(sibling.metadata, plugin.id)?.fields || {})
        : sourceFields;
      const fields = normalizeFields(template, {
        ...currentFields,
        ...sourceFields,
        language: translation.language,
        description: translation.description,
        slug: translation.slug,
      }, currentFields);
      const metadata = sibling
        ? mergePluginMetadata(sibling.metadata, plugin.id, { fields, familyId: params.familyId })
        : mergePluginMetadata({}, plugin.id, {
          templateId: template.id,
          schemaVersion: template.schemaVersion,
          fields,
          familyId: params.familyId,
        });
      planned.push({
        id: sibling?.id || crypto.randomUUID(),
        create: !sibling,
        expectedUpdatedAt: sibling?.updated_at,
        title: translation.title,
        body: translation.body,
        metadata,
      });
    }
    const occupied = new Map();
    for (const row of rows) {
      const meta = pluginMetadata(row.metadata, plugin.id);
      if (!meta) continue;
      occupied.set(
        `${fieldText(meta.fields, 'collection')}/${fieldText(meta.fields, 'language')}/${fieldText(meta.fields, 'slug')}`,
        row.id,
      );
    }
    for (const item of planned) {
      const fields = item.metadata.plugins?.[plugin.id]?.fields || {};
      const key = `${fieldText(fields, 'collection')}/${fieldText(fields, 'language')}/${fieldText(fields, 'slug')}`;
      const owner = occupied.get(key);
      if (owner && owner !== item.id) throw new Error(`Another CMS note already uses the slug ${fieldText(fields, 'slug')}`);
      occupied.set(key, item.id);
    }
    database.getDB().transaction(() => {
      for (const item of planned) {
        const metadataJson = JSON.stringify(item.metadata);
        if (item.create) {
          queries().createResource.run(
            item.id, grant.projectId, 'note', item.title, item.body, null, null, metadataJson, now, now,
          );
          continue;
        }
        const result = queries().updatePluginNoteIfCurrent.run(
          item.title, item.body, metadataJson, now, item.id, grant.projectId, item.expectedUpdatedAt,
        );
        if (result.changes !== 1) throw new Error('CONFLICT: note changed');
      }
    })();
    const notes = [];
    for (const item of planned) {
      placeDraft(plugin, grant, item.id);
      const mirror = vaultStore.writeNoteMarkdown({ id: item.id, markdown: item.body }, { database, fileStorage });
      if (!mirror.success) throw new Error(mirror.error || 'Could not update note mirror');
      const row = queries().getResourceById.get(item.id);
      if (item.create) windowManager.broadcast('resource:created', row);
      else windowManager.broadcast('resource:updated', { id: item.id, updates: row });
      const serialized = serializeNote(row, plugin.id);
      if (serialized) notes.push(serialized);
    }
    return { notes };
  }

  function entryFilePath(plugin, grant, note) {
    const metadata = pluginMetadata(note.metadata, plugin.id);
    if (!metadata) throw new Error('Note does not belong to this plugin');
    const published = metadata.publication?.path;
    if (typeof published === 'string' && published.trim()) return safeEntryPath(published);
    const fields = metadata.fields || {};
    const slug = String(fields.slug || slugify(note.title));
    const prefix = resolveContentPath(grant.github, fields);
    return safeEntryPath(path.posix.join(prefix, `${slug}.md`));
  }

  async function commitRepositoryFile(owner, repo, branch, baseSha, filePath, content, message) {
    const parent = await githubApi.getCommit(owner, repo, baseSha);
    const entry = content == null
      ? { path: filePath, mode: '100644', type: 'blob', sha: null }
      : {
        path: filePath,
        mode: '100644',
        type: 'blob',
        sha: (await githubApi.createBlob(owner, repo, content)).sha,
      };
    const tree = await githubApi.createTree(owner, repo, parent.tree.sha, [entry]);
    const commit = await githubApi.createCommit(owner, repo, message, tree.sha, baseSha);
    await githubApi.updateReference(owner, repo, branch, commit.sha);
    return commit.sha;
  }

  async function deleteRemoteFile(grant, filePath, title) {
    const [owner, repo] = grant.github.repo.split('/');
    const exists = await githubApi.repositoryFileExists(owner, repo, filePath, grant.github.branch);
    if (!exists) return { removed: false };
    const reference = await githubApi.getReference(owner, repo, grant.github.branch);
    await commitRepositoryFile(
      owner,
      repo,
      grant.github.branch,
      reference.object.sha,
      filePath,
      null,
      `content: delete ${title} from Dome`,
    );
    return { removed: true };
  }

  async function deleteNote(plugin, grant, params) {
    const note = noteForGrant(params.id, grant);
    if (!pluginMetadata(note.metadata, plugin.id)) throw new Error('Note does not belong to this plugin');
    let removedRemote = false;
    if (params.remote) {
      if (!grant.permissions.includes('content.publish')) throw new Error('Permission content.publish required');
      if (!grant.github) throw new Error('GitHub destination is not configured');
      const result = await deleteRemoteFile(grant, entryFilePath(plugin, grant, note), note.title);
      removedRemote = result.removed;
    }
    const { deleteResourcesCascade } = require('../storage/resource-delete.cjs');
    deleteResourcesCascade([note.id], { database, fileStorage, windowManager });
    return { deleted: true, remote: removedRemote };
  }

  async function deleteMedia(plugin, grant, params) {
    const image = queries().getResourceById.get(params.id);
    if (!image || image.project_id !== grant.projectId || image.type !== 'image') {
      throw new Error('Image is not in this vault');
    }
    const vaultPath = typeof image.vault_path === 'string' ? image.vault_path : '';
    const sitePath = storedSitePath(image.metadata);
    const repoPath = sitePath
      ? publicRepoPath(`public${sitePath}`)
      : (vaultPath.startsWith('public/') ? publicRepoPath(vaultPath) : '');
    let removedRemote = false;
    if (repoPath && grant.github) {
      if (!grant.permissions.includes('content.publish')) throw new Error('Permission content.publish required');
      const result = await deleteRemoteFile(
        grant,
        repoPath,
        image.title || path.posix.basename(repoPath),
      );
      removedRemote = result.removed;
    }
    const { deleteResourcesCascade } = require('../storage/resource-delete.cjs');
    deleteResourcesCascade([image.id], { database, fileStorage, windowManager });
    return { deleted: true, remote: removedRemote };
  }

  async function pullNote(plugin, grant, params) {
    if (!grant.permissions.includes('content.publish')) throw new Error('Permission content.publish required');
    if (!grant.github) throw new Error('GitHub destination is not configured');
    const note = noteForGrant(params.id, grant);
    const metadata = pluginMetadata(note.metadata, plugin.id);
    if (!metadata) throw new Error('Note does not belong to this plugin');
    const filePath = entryFilePath(plugin, grant, note);
    const [owner, repo] = grant.github.repo.split('/');
    const markdown = await githubApi.getRepositoryFile(owner, repo, filePath, grant.github.branch);
    const parsed = parseCmsDocument(markdown);
    const template = templateFor(plugin);
    const incoming = {};
    for (const definition of template.fields) {
      if (!Object.hasOwn(parsed.fields, definition.id)) continue;
      const value = parsed.fields[definition.id];
      incoming[definition.id] = definition.type === 'tags' && typeof value === 'string'
        ? value.split(',').map((item) => item.trim()).filter(Boolean)
        : value;
    }
    const fields = normalizeFields(template, incoming, metadata.fields || {});
    const title = parsed.title.trim() || note.title;
    const body = parsed.body;
    const reference = await githubApi.getReference(owner, repo, grant.github.branch);
    const nextMetadata = mergePluginMetadata(note.metadata, plugin.id, {
      fields,
      publication: {
        contentDigest: noteDigest({ title, content: body }, fields),
        commitSha: reference.object.sha,
        path: filePath,
        publishedAt: Date.now(),
      },
    });
    const now = Date.now();
    const result = queries().updatePluginNoteIfCurrent.run(
      title,
      body,
      JSON.stringify(nextMetadata),
      now,
      note.id,
      grant.projectId,
      note.updated_at,
    );
    if (result.changes !== 1) throw new Error('CONFLICT: note changed');
    const mirror = vaultStore.writeNoteMarkdown({ id: note.id, markdown: body }, { database, fileStorage });
    if (!mirror.success) throw new Error(mirror.error || 'Could not update note mirror');
    const updated = queries().getResourceById.get(note.id);
    windowManager.broadcast('resource:updated', { id: note.id, updates: updated });
    return serializeNote(updated, plugin.id);
  }

  function fieldsFromRemoteDocument(template, parsed, overrides) {
    const incoming = { ...overrides };
    for (const definition of template.fields) {
      if (definition.id in overrides) continue;
      if (!Object.hasOwn(parsed.fields, definition.id)) continue;
      const value = parsed.fields[definition.id];
      incoming[definition.id] = definition.type === 'tags' && typeof value === 'string'
        ? value.split(',').map((item) => item.trim()).filter(Boolean)
        : value;
    }
    return normalizeFields(template, incoming, {});
  }

  async function syncRemoteNotes(plugin, grant) {
    if (!grant.permissions.includes('content.publish')) throw new Error('Permission content.publish required');
    if (!grant.github) throw new Error('GitHub destination is not configured');
    const [owner, repo] = grant.github.repo.split('/');
    const reference = await githubApi.getReference(owner, repo, grant.github.branch);
    const commit = await githubApi.getCommit(owner, repo, reference.object.sha);
    const tree = await githubApi.getRepositoryTree(owner, repo, commit.tree.sha);
    const remote = remoteMarkdownEntries(tree.tree, grant.github);
    const local = queries().listPluginNotes.all(grant.projectId);
    const known = new Set();
    const families = new Map();
    for (const row of local) {
      const meta = pluginMetadata(row.metadata, plugin.id);
      if (!meta) continue;
      const fields = meta.fields || {};
      if (typeof meta.publication?.path === 'string') known.add(meta.publication.path);
      known.add(`${fields.collection || ''}/${fields.language || ''}/${fields.slug || ''}`);
      if (meta.familyId && fields.collection && fields.slug) {
        families.set(`${fields.collection}/${fields.slug}`, meta.familyId);
      }
    }
    const template = templateFor(plugin);
    const notes = [];
    let imported = 0;
    let skipped = 0;
    let truncatedPosts = false;
    const limit = 40;
    for (const file of remote) {
      const identity = `${file.collection}/${file.language}/${file.slug}`;
      if (known.has(file.path) || known.has(identity)) {
        skipped += 1;
        continue;
      }
      if (imported >= limit) {
        truncatedPosts = true;
        break;
      }
      let markdown;
      try {
        markdown = await githubApi.getRepositoryFile(owner, repo, file.path, grant.github.branch);
      } catch (error) {
        if (String(error.message || '') === 'REMOTE_NOT_FOUND') {
          skipped += 1;
          continue;
        }
        throw error;
      }
      const parsed = parseCmsDocument(markdown);
      const overrides = { slug: file.slug };
      if (file.collection) overrides.collection = file.collection;
      if (file.language) overrides.language = file.language;
      if (template.fields.some((field) => field.id === 'date') && !parsed.fields.date) {
        overrides.date = new Date().toISOString().slice(0, 10);
      }
      if (template.fields.some((field) => field.id === 'description') && !parsed.fields.description) {
        overrides.description = parsed.title.trim() || file.slug;
      }
      let fields;
      try {
        fields = fieldsFromRemoteDocument(template, parsed, overrides);
      } catch {
        skipped += 1;
        continue;
      }
      const title = parsed.title.trim() || file.slug;
      const body = parsed.body;
      const familyKey = file.collection && file.slug ? `${file.collection}/${file.slug}` : '';
      let familyId = familyKey ? families.get(familyKey) : '';
      if (familyKey && !familyId) {
        familyId = crypto.randomUUID();
        families.set(familyKey, familyId);
      }
      const now = Date.now();
      const id = crypto.randomUUID();
      const metadata = mergePluginMetadata({}, plugin.id, {
        templateId: template.id,
        schemaVersion: template.schemaVersion,
        fields,
        ...(familyId ? { familyId } : {}),
        publication: {
          contentDigest: noteDigest({ title, content: body }, fields),
          commitSha: reference.object.sha,
          path: file.path,
          publishedAt: now,
        },
      });
      queries().createResource.run(
        id, grant.projectId, 'note', title, body, null, null, JSON.stringify(metadata), now, now,
      );
      placeCmsNote(grant, id, file.path);
      const mirror = vaultStore.writeNoteMarkdown({ id, markdown: body }, { database, fileStorage });
      if (!mirror.success) {
        queries().deleteResource.run(id);
        throw new Error(mirror.error || 'Could not create note mirror');
      }
      const created = queries().getResourceById.get(id);
      windowManager.broadcast('resource:created', created);
      const serialized = serializeNote(created, plugin.id);
      if (serialized) notes.push(serialized);
      known.add(file.path);
      known.add(identity);
      imported += 1;
    }
    organizeCmsNotes(plugin, grant);
    const images = await importPublicImages(plugin, grant, owner, repo, tree.tree);
    return {
      imported,
      images: images.imported,
      skipped,
      truncated: Boolean(tree.truncated) || truncatedPosts || images.truncated,
      notes,
    };
  }

  function placeCmsNote(grant, resourceId, filePath) {
    const segments = String(filePath || '').split('/').slice(0, -1).filter((part) => part && part !== '.' && part !== '..');
    if (!segments.length) return;
    const folderId = vaultStore.ensureFolderChain(grant.projectId, segments, { database, fileStorage, windowManager });
    if (!folderId) return;
    const current = queries().getResourceById.get(resourceId);
    if (!current || current.folder_id === folderId) return;
    database.getDB().prepare('UPDATE resources SET folder_id = ? WHERE id = ?').run(folderId, resourceId);
  }

  function organizeCmsNotes(plugin, grant) {
    for (const row of queries().listPluginNotes.all(grant.projectId)) {
      const meta = pluginMetadata(row.metadata, plugin.id);
      if (!meta || !grant.github) continue;
      let filePath;
      try { filePath = entryFilePath(plugin, grant, row); } catch { continue; }
      const moved = database.getDB().transaction(() => {
        const before = queries().getResourceById.get(row.id);
        placeCmsNote(grant, row.id, filePath);
        const after = queries().getResourceById.get(row.id);
        if (!after || before?.folder_id === after.folder_id) return null;
        const mirror = vaultStore.writeNoteMarkdown({ id: row.id, markdown: after.content || '' }, { database, fileStorage });
        if (!mirror.success) throw new Error(mirror.error || 'Could not organize note mirror');
        return queries().getResourceById.get(row.id);
      })();
      if (moved) windowManager.broadcast('resource:updated', { id: row.id, updates: moved });
    }
  }

  async function importPublicImages(plugin, grant, owner, repo, tree) {
    let imported = 0;
    let truncated = false;
    const knownRows = database.getDB().prepare(
      "SELECT vault_path, metadata FROM resources WHERE project_id = ? AND type = 'image'",
    ).all(grant.projectId);
    const known = new Set();
    for (const row of knownRows) {
      if (typeof row.vault_path === 'string') known.add(row.vault_path);
      const sitePath = storedSitePath(row.metadata);
      if (sitePath) known.add(`public${sitePath}`);
    }
    for (const image of remotePublicImages(tree)) {
      if (known.has(image.path)) continue;
      if (imported >= 60) {
        truncated = true;
        break;
      }
      const buffer = await githubApi.getRepositoryBlob(owner, repo, image.sha);
      if (!buffer.length || buffer.length > MAX_MEDIA_BYTES) continue;
      const segments = image.path.split('/').slice(0, -1);
      const folderId = vaultStore.ensureFolderChain(grant.projectId, segments, { database, fileStorage, windowManager });
      const filename = path.posix.basename(image.path);
      const id = crypto.randomUUID();
      const now = Date.now();
      queries().createResource.run(
        id,
        grant.projectId,
        'image',
        filename,
        '',
        null,
        folderId,
        JSON.stringify({ plugins: { [plugin.id]: { kind: 'site-asset', sitePath: image.sitePath } } }),
        now,
        now,
      );
      const created = queries().getResourceById.get(id);
      try {
        vaultStore.writeResourceFile(created, buffer, { database, fileStorage, filename });
      } catch (error) {
        queries().deleteResource.run(id);
        throw error;
      }
      windowManager.broadcast('resource:created', queries().getResourceById.get(id));
      imported += 1;
    }
    return { imported, truncated };
  }

  function listSiteImages(grant) {
    const rows = database.getDB().prepare(
      "SELECT id, title, vault_path, metadata FROM resources WHERE project_id = ? AND type = 'image' AND vault_path LIKE 'public/%'",
    ).all(grant.projectId);
    const byPath = new Map();
    for (const row of rows) {
      const image = siteImageRecord(row);
      if (!image) continue;
      const current = byPath.get(image.sitePath);
      if (!current || image.rank < current.rank) byPath.set(image.sitePath, image);
    }
    return [...byPath.values()]
      .map(({ id, name, sitePath }) => ({ id, name, sitePath }))
      .sort((left, right) => left.sitePath.localeCompare(right.sitePath));
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

  function attachMedia(plugin, grant, params) {
    const note = noteForGrant(params.resourceId, grant);
    if (!pluginMetadata(note.metadata, plugin.id)) throw new Error('Note does not belong to this plugin');
    const mime = params.mime;
    const buffer = Buffer.from(params.content, 'base64');
    if (!buffer.length) throw new Error('Image is empty');
    if (buffer.length > MAX_MEDIA_BYTES) throw new Error('Image is larger than 8 MB');
    const filename = sanitizeMediaFilename(params.filename, mime);
    const id = crypto.randomUUID();
    const now = Date.now();
    const metadata = JSON.stringify({
      plugins: { [plugin.id]: { kind: 'cms-media', noteId: note.id } },
    });
    queries().createResource.run(
      id, grant.projectId, 'image', filename, '', null, null, metadata, now, now,
    );
    const created = queries().getResourceById.get(id);
    try {
      vaultStore.writeResourceFile(created, buffer, { database, fileStorage, filename });
    } catch (error) {
      queries().deleteResource.run(id);
      throw error;
    }
    const stored = queries().getResourceById.get(id);
    windowManager.broadcast('resource:created', stored);
    const alt = filename.replace(/\.[^.]+$/, '');
    return { id, filename, markdown: `![${alt}](dome-media:${id})` };
  }

  function loadPluginMedia(plugin, grant, mediaId) {
    const resource = queries().getResourceById.get(mediaId);
    if (!resource || resource.project_id !== grant.projectId) {
      throw new Error('Media is outside the authorized vault');
    }
    const metadata = pluginMetadata(resource.metadata, plugin.id);
    if (!metadata || metadata.kind !== 'cms-media') throw new Error('Unknown CMS media');
    const fullPath = vaultStore.getResourceFilePath(resource, queries(), fileStorage);
    if (!fullPath || !fs.existsSync(fullPath)) throw new Error('CMS media file is missing');
    return {
      filename: path.posix.basename(resource.vault_path || resource.original_filename || 'image.png'),
      mime: resource.file_mime_type,
      buffer: fs.readFileSync(fullPath),
    };
  }

  function buildAstroDocument(plugin, note) {
    const metadata = pluginMetadata(note.metadata, plugin.id);
    if (!metadata) throw new Error('Note does not belong to this plugin');
    const template = templateFor(plugin);
    const fields = normalizeFields(template, {}, metadata.fields || {});
    for (const definition of template.fields) {
      const value = fields[definition.id];
      if (definition.required && (value == null || value === '' || (Array.isArray(value) && value.length === 0))) {
        throw new Error(`${definition.label} is required`);
      }
    }
    const slug = String(fields.slug || slugify(note.title));
    const frontmatter = publicationFrontmatter(note.title, fields, template);
    const content = `---\n${YAML.stringify(frontmatter).trimEnd()}\n---\n\n${String(note.content || '')}\n`;
    return { slug, content, fields };
  }

  function materializePublication(plugin, grant, note, document, filePath) {
    const body = String(note.content || '');
    const mediaIds = collectMediaRefs(body, document.fields);
    const used = new Set();
    const publicPaths = {};
    const files = [];
    for (const mediaId of mediaIds) {
      const media = loadPluginMedia(plugin, grant, mediaId);
      const filename = uniqueMediaFilename(media.filename, used);
      used.add(filename);
      const repoPath = safePublicMediaPath(document.slug, filename);
      publicPaths[mediaId] = `/${repoPath.replace(/^public\//, '')}`;
      files.push({
        path: repoPath,
        content: media.buffer.toString('base64'),
        encoding: 'base64',
      });
    }
    const rewritten = rewritePublishedMedia(body, document.fields, publicPaths);
    const frontmatter = publicationFrontmatter(note.title, rewritten.fields, templateFor(plugin));
    const content = `---\n${YAML.stringify(frontmatter).trimEnd()}\n---\n\n${rewritten.markdown}\n`;
    return {
      content,
      files: [{ path: filePath, content, encoding: 'utf-8' }, ...files],
      fields: rewritten.fields,
    };
  }

  async function preparePublication(plugin, grant, resourceId) {
    if (!grant.github) throw new Error('GitHub destination is not configured');
    const note = noteForGrant(resourceId, grant);
    const document = buildAstroDocument(plugin, note);
    const duplicate = queries().listPluginNotes.all(grant.projectId).find((candidate) => {
      if (candidate.id === note.id) return false;
      const candidateMetadata = pluginMetadata(candidate.metadata, plugin.id);
      const candidateFields = candidateMetadata?.fields || {};
      return candidateFields.slug === document.slug
        && String(candidateFields.collection || '') === String(document.fields.collection || '')
        && String(candidateFields.language || '') === String(document.fields.language || '');
    });
    if (duplicate) throw new Error(`Another CMS note already uses the slug ${document.slug}`);
    const [owner, repo] = grant.github.repo.split('/');
    const reference = await githubApi.getReference(owner, repo, grant.github.branch);
    const prefix = resolveContentPath(grant.github, document.fields);
    const filePath = path.posix.join(prefix, `${document.slug}.md`);
    if (!filePath.startsWith(`${prefix}/`)) throw new Error('Publication path escaped its destination');
    const published = materializePublication(plugin, grant, note, document, filePath);
    const id = crypto.randomUUID();
    const now = Date.now();
    const request = {
      resourceId,
      expectedUpdatedAt: note.updated_at,
      repo: grant.github.repo,
      branch: grant.github.branch,
      path: filePath,
      baseSha: reference.object.sha,
      content: published.content,
      files: published.files,
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
      files: publicationFilePaths(published.files),
    };
  }

  async function preparePublicationMany(plugin, grant, resourceIds) {
    if (!grant.github) throw new Error('GitHub destination is not configured');
    const unique = [];
    for (const resourceId of resourceIds) {
      if (!unique.includes(resourceId)) unique.push(resourceId);
    }
    const rows = queries().listPluginNotes.all(grant.projectId);
    const built = [];
    const markdownPaths = new Set();
    for (const resourceId of unique) {
      const note = noteForGrant(resourceId, grant);
      const document = buildAstroDocument(plugin, note);
      const duplicate = rows.find((candidate) => {
        if (candidate.id === note.id || unique.includes(candidate.id)) return false;
        const candidateMetadata = pluginMetadata(candidate.metadata, plugin.id);
        const candidateFields = candidateMetadata?.fields || {};
        return candidateFields.slug === document.slug
          && String(candidateFields.collection || '') === String(document.fields.collection || '')
          && String(candidateFields.language || '') === String(document.fields.language || '');
      });
      if (duplicate) throw new Error(`Another CMS note already uses the slug ${document.slug}`);
      const prefix = resolveContentPath(grant.github, document.fields);
      const filePath = path.posix.join(prefix, `${document.slug}.md`);
      if (!filePath.startsWith(`${prefix}/`)) throw new Error('Publication path escaped its destination');
      if (markdownPaths.has(filePath)) throw new Error('Two selected entries publish to the same file');
      markdownPaths.add(filePath);
      built.push({
        note,
        document,
        filePath,
        published: materializePublication(plugin, grant, note, document, filePath),
      });
    }
    const files = [];
    const filePaths = new Set();
    for (const item of built) {
      for (const file of item.published.files) {
        if (filePaths.has(file.path)) throw new Error('Two selected entries publish the same file');
        filePaths.add(file.path);
        files.push(file);
      }
    }
    const [owner, repo] = grant.github.repo.split('/');
    const reference = await githubApi.getReference(owner, repo, grant.github.branch);
    const entries = built.map((item) => ({
      resourceId: item.note.id,
      expectedUpdatedAt: item.note.updated_at,
      path: item.filePath,
      content: item.published.content,
      files: item.published.files,
      contentDigest: noteDigest(item.note, item.document.fields),
    }));
    const id = crypto.randomUUID();
    const now = Date.now();
    const request = {
      resourceIds: unique,
      entries,
      repo: grant.github.repo,
      branch: grant.github.branch,
      path: entries.map((entry) => entry.path).join('\n'),
      baseSha: reference.object.sha,
      content: entries.map((entry) => entry.content).join('\n\n'),
      files,
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
      count: entries.length,
      files: publicationFilePaths(files),
    };
  }

  function publicationTargets(request) {
    if (Array.isArray(request.entries) && request.entries.length > 0) return request.entries;
    return [{
      resourceId: request.resourceId,
      path: request.path,
      content: request.content,
      files: request.files,
      contentDigest: request.contentDigest,
    }];
  }

  async function executePublication(plugin, grant, row) {
    const request = parseJson(row.request_json, null);
    if (!request) throw new Error('Invalid publication proposal');
    const targets = publicationTargets(request);
    const rebuiltFiles = [];
    const notes = [];
    for (const target of targets) {
      const note = noteForGrant(target.resourceId, grant);
      const document = buildAstroDocument(plugin, note);
      const rebuilt = materializePublication(plugin, grant, note, document, target.path);
      if (rebuilt.content !== target.content || JSON.stringify(rebuilt.files) !== JSON.stringify(target.files)) {
        throw new Error('CONFLICT: note changed after review');
      }
      rebuiltFiles.push(...rebuilt.files);
      notes.push(note);
    }
    if (JSON.stringify(rebuiltFiles) !== JSON.stringify(request.files)) {
      throw new Error('CONFLICT: note changed after review');
    }
    const [owner, repo] = request.repo.split('/');
    const reference = await githubApi.getReference(owner, repo, request.branch);
    if (reference.object.sha !== request.baseSha) throw new Error('CONFLICT: GitHub branch changed');
    const parent = await githubApi.getCommit(owner, repo, request.baseSha);
    const files = Array.isArray(request.files) && request.files.length > 0
      ? request.files
      : [{ path: request.path, content: request.content, encoding: 'utf-8' }];
    const treeEntries = [];
    for (const file of files) {
      const blob = await githubApi.createBlob(owner, repo, file.content, file.encoding || 'utf-8');
      treeEntries.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      });
    }
    const label = notes.length === 1 ? notes[0].title : `${notes.length} entries`;
    const tree = await githubApi.createTree(owner, repo, parent.tree.sha, treeEntries);
    const commit = await githubApi.createCommit(
      owner,
      repo,
      `content: publish ${label} from Dome`,
      tree.sha,
      request.baseSha,
    );
    await githubApi.updateReference(owner, repo, request.branch, commit.sha);
    const paths = [];
    targets.forEach((target, index) => {
      const note = notes[index];
      const currentMeta = pluginMetadata(note.metadata, plugin.id);
      const metadata = mergePluginMetadata(note.metadata, plugin.id, {
        publication: {
          contentDigest: target.contentDigest,
          commitSha: commit.sha,
          path: target.path,
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
      paths.push(target.path);
    });
    return {
      commitSha: commit.sha,
      path: paths[0],
      paths,
      repo: request.repo,
      branch: request.branch,
    };
  }

  async function requestApproval(plugin, grant, publicationId) {
    const row = queries().getPluginPublication.get(publicationId, plugin.id);
    if (!row) throw new Error('Publication proposal not found');
    if (row.status !== 'prepared') return serializePublication(row);
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

  function cancelPublication(plugin, publicationId) {
    const row = queries().getPluginPublication.get(publicationId, plugin.id);
    if (!row) throw new Error('Publication proposal not found');
    if (row.status !== 'prepared') return { id: row.id, status: row.status };
    queries().updatePluginPublication.run('cancelled', null, Date.now(), row.id, plugin.id);
    return { id: row.id, status: 'cancelled' };
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
      if (grant.permissions.includes('notes.write')) organizeCmsNotes(plugin, grant);
      return queries().listPluginNotes.all(grant.projectId)
        .map((row) => serializeNote(row, plugin.id))
        .filter(Boolean)
        .slice(0, params.limit || 100);
    }
    if (method === 'notes.get') return serializeNote(noteForGrant(params.id, grant), plugin.id);
    if (method === 'notes.create') return createNote(plugin, grant, params);
    if (method === 'notes.update') return updateNote(plugin, grant, params);
    if (method === 'notes.applyTranslations') return applyTranslations(plugin, grant, params);
    if (method === 'notes.delete') return deleteNote(plugin, grant, params);
    if (method === 'notes.pull') return pullNote(plugin, grant, params);
    if (method === 'notes.sync') return syncRemoteNotes(plugin, grant);
    if (method === 'media.attach') return attachMedia(plugin, grant, params);
    if (method === 'media.list') return listSiteImages(grant);
    if (method === 'media.delete') return deleteMedia(plugin, grant, params);
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
    if (method === 'publication.prepareMany') {
      return preparePublicationMany(plugin, grant, params.resourceIds);
    }
    if (method === 'publication.requestApproval') {
      return requestApproval(plugin, grant, params.id);
    }
    if (method === 'publication.cancel') {
      return cancelPublication(plugin, params.id);
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

module.exports = {
  createPluginService,
  collectMediaRefs,
  domeMediaId,
  isBannedMediaUrl,
  parseCmsDocument,
  publicEntryUrl,
  publicRepoPath,
  publicationFrontmatter,
  resolveContentPath,
  remoteMarkdownEntries,
  remotePublicImages,
  rewritePublishedMedia,
  safeEntryPath,
  safePublicMediaPath,
  safeSitePathPattern,
  safeSiteUrl,
  sanitizeMediaFilename,
  siteImageRecord,
  storedSitePath,
};
