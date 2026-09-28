import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const { createPluginService } = require('../plugins/plugin-service.cjs');
const { applyContentPathOptions, pruneCmsGrantForVault } = require('../plugins/cms-sites.cjs');
const { assertIconDataUrl, detectSiteFavicon, iconTargetsFromHtml } = require('../plugins/site-favicon.cjs');
const githubApi = require('../github/github-api.cjs');

const template = {
  id: 'astro-post',
  title: 'Astro',
  schemaVersion: 1,
  fields: [
    { id: 'collection', type: 'select', label: 'Collection', options: ['blog'], required: true },
    { id: 'language', type: 'select', label: 'Language', options: ['es'], required: true },
    { id: 'slug', type: 'slug', label: 'Slug', required: true },
  ],
};

const permissions = ['notes.read', 'notes.write', 'content.publish'];

function github(repo) {
  return {
    repo,
    branch: 'main',
    contentPaths: { 'blog/es': 'src/content/blog/es' },
    siteUrl: `https://${repo.split('/')[1]}.example`,
    sitePathPattern: '/{collection}/{slug}',
  };
}

function plugin(extra = {}) {
  return {
    id: 'dome-cms',
    enabled: true,
    version: '1.2.0',
    manifestDigest: 'digest',
    permissions,
    contributes: { vaultTemplate: template, tools: ['list_entries'] },
    ...extra,
  };
}

test('content folders define the collection and language choices', () => {
  const template = applyContentPathOptions({
    fields: [
      { id: 'collection', type: 'select', options: ['blog', 'manual'] },
      { id: 'language', type: 'select', options: ['es', 'en'] },
      { id: 'slug', type: 'slug' },
    ],
  }, {
    contentPaths: {
      'entries/es': 'src/content/entries/es',
      'entries/en': 'src/content/entries/en',
    },
  });
  assert.deepEqual(template.fields[0].options, ['entries']);
  assert.deepEqual(template.fields[1].options, ['en', 'es']);
});

test('favicon lookup prefers a same-origin icon and falls back to /favicon.ico', () => {
  const html = `
    <link rel="apple-touch-icon" href="/apple.png">
    <link rel="icon" href="/favicon.png">
    <link rel="icon" href="https://cdn.example/evil.png">
  `;
  assert.deepEqual(iconTargetsFromHtml(html, 'https://example.com/'), [
    'https://example.com/favicon.png',
    'https://example.com/apple.png',
    'https://example.com/favicon.ico',
  ]);
  assert.deepEqual(iconTargetsFromHtml('', 'https://example.com/docs'), [
    'https://example.com/favicon.ico',
  ]);
});

test('favicon detection reads the icon link without calling the network helper of the host', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const seen = [];
  const fetchPublic = async (url) => {
    seen.push(String(url));
    if (String(url).endsWith('/favicon.png')) {
      return {
        ok: true,
        headers: { get: () => 'image/png' },
        arrayBuffer: async () => png,
        text: async () => '',
      };
    }
    return {
      ok: true,
      headers: { get: () => 'text/html; charset=utf-8' },
      text: async () => '<link rel="icon" href="/favicon.png">',
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  };
  const icon = await detectSiteFavicon('https://example.com', fetchPublic);
  assert.equal(icon.source, 'favicon');
  assert.match(icon.dataUrl, /^data:image\/png;base64,/);
  assert.equal(assertIconDataUrl(icon.dataUrl), icon.dataUrl);
  assert.throws(() => assertIconDataUrl('data:image/svg+xml;base64,PHN2Zy8+'), /PNG, JPEG/);
  assert.ok(seen.some((url) => url.endsWith('/favicon.png')));
});

test('deleting one vault removes only that website', () => {
  const row = {
    plugin_id: 'dome-cms',
    project_id: 'vault-a',
    config_json: JSON.stringify({
      github: github('owner/alpha'),
      sites: [
        { id: 'site-a', name: 'Alpha', projectId: 'vault-a', github: github('owner/alpha') },
        { id: 'site-b', name: 'Beta', projectId: 'vault-b', github: github('owner/beta') },
      ],
    }),
  };
  const next = pruneCmsGrantForVault(row, 'vault-a');
  assert.equal(next.action, 'update');
  assert.equal(next.projectId, 'vault-b');
  const config = JSON.parse(next.configJson);
  assert.deepEqual(config.sites.map((site) => site.id), ['site-b']);
  assert.equal(config.github.repo, 'owner/beta');
  assert.equal(pruneCmsGrantForVault({
    plugin_id: 'dome-cms',
    project_id: 'vault-b',
    config_json: next.configJson,
  }, 'vault-b').action, 'delete');
  assert.equal(pruneCmsGrantForVault({
    plugin_id: 'dome-cms',
    project_id: 'vault-a',
    config_json: JSON.stringify({ github: github('owner/alpha') }),
  }, 'vault-a'), null);
});

test('legacy CMS configuration is one website and a vault cannot be reused', async () => {
  const stored = { row: null };
  const projects = new Map([['vault-a', 'Alpha'], ['vault-b', 'Beta']]);
  const service = createPluginService({
    database: { getQueries: () => ({
      getProjectById: { get: (id) => (projects.has(id) ? { id, name: projects.get(id) } : undefined) },
      getPluginGrant: { get: () => stored.row },
      upsertPluginGrant: { run: (...args) => {
        stored.row = {
          plugin_id: args[0],
          manifest_digest: args[1],
          project_id: args[2],
          permissions_json: args[3],
          config_json: args[4],
        };
      } },
    }) },
    fileStorage: {},
    windowManager: { broadcast() {} },
    pluginLoader: { listPlugins: () => [plugin()], setEnabled() {} },
  });
  stored.row = {
    plugin_id: 'dome-cms',
    manifest_digest: 'digest',
    project_id: 'vault-a',
    permissions_json: JSON.stringify(permissions),
    config_json: JSON.stringify({ github: github('owner/alpha') }),
  };
  const legacy = service.getConfiguration('dome-cms');
  assert.equal(legacy.sites.length, 1);
  assert.equal(legacy.sites[0].id, 'legacy');
  assert.equal(legacy.sites[0].projectId, 'vault-a');
  assert.equal(legacy.github.repo, 'owner/alpha');

  const site = (id, name, projectId, repo) => ({
    id,
    name,
    projectId,
    github: github(repo),
  });
  assert.throws(
    () => service.configure('dome-cms', {
      projectId: 'vault-a',
      permissions,
      sites: [
        site('site-a', 'Alpha', 'vault-a', 'owner/alpha'),
        site('site-b', 'Beta', 'vault-a', 'owner/beta'),
      ],
    }),
    /own vault/,
  );
  const saved = service.configure('dome-cms', {
    projectId: 'vault-a',
    permissions,
    sites: [
      site('site-a', 'Alpha', 'vault-a', 'owner/alpha'),
      site('site-b', 'Beta', 'vault-b', 'owner/beta'),
    ],
  });
  assert.equal(saved.projectId, 'vault-a');
  assert.deepEqual(saved.sites.map((item) => item.projectId), ['vault-a', 'vault-b']);
  assert.equal(saved.sites[1].github.repo, 'owner/beta');
});

test('listing and publishing follow the website that owns the note', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE resources (
    id TEXT PRIMARY KEY, project_id TEXT, type TEXT, title TEXT, content TEXT, metadata TEXT, updated_at INTEGER
  )`);
  const note = (id, projectId, slug) => ({
    plugins: { 'dome-cms': { fields: { collection: 'blog', language: 'es', slug } } },
  });
  const insert = db.prepare('INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?, ?)');
  insert.run('note-a', 'vault-a', 'note', 'Alpha', 'A', JSON.stringify(note('note-a', 'vault-a', 'alpha')), 1);
  insert.run('note-b', 'vault-b', 'note', 'Beta', 'B', JSON.stringify(note('note-b', 'vault-b', 'beta')), 1);
  const sites = [
    { id: 'site-a', name: 'Alpha', projectId: 'vault-a', github: github('owner/alpha') },
    { id: 'site-b', name: 'Beta', projectId: 'vault-b', github: github('owner/beta') },
  ];
  const queries = {
    getPluginGrant: { get: () => ({
      plugin_id: 'dome-cms',
      manifest_digest: 'digest',
      project_id: 'vault-a',
      permissions_json: JSON.stringify(['notes.read', 'content.publish']),
      config_json: JSON.stringify({ github: sites[0].github, sites }),
    }) },
    getProjectById: { get: (id) => ({ id, name: id }) },
    getResourceById: db.prepare('SELECT * FROM resources WHERE id = ?'),
    listPluginNotes: { all: (projectId) => db.prepare("SELECT * FROM resources WHERE project_id = ? AND type = 'note'").all(projectId) },
    createPluginPublication: { run() {} },
  };
  const service = createPluginService({
    database: { getQueries: () => queries, getDB: () => db },
    fileStorage: {},
    windowManager: { broadcast() {} },
    pluginLoader: { listPlugins: () => [plugin()], setEnabled() {} },
  });
  const listed = await service.request('dome-cms', 'notes.list', { siteId: 'site-b', limit: 20 });
  assert.deepEqual(listed.map((item) => item.id), ['note-b']);
  await assert.rejects(
    () => service.request('dome-cms', 'notes.list', { limit: 20 }),
    /Choose a website: Alpha, Beta/,
  );

  const calls = [];
  const original = githubApi.getReference;
  githubApi.getReference = async (owner, repo) => {
    calls.push(`${owner}/${repo}`);
    return { object: { sha: 'abc123' } };
  };
  t.after(() => { githubApi.getReference = original; });
  const prepared = await service.request('dome-cms', 'publication.prepare', { resourceId: 'note-b' });
  assert.equal(prepared.repo, 'owner/beta');
  assert.deepEqual(calls, ['owner/beta']);
  await assert.rejects(
    () => service.request('dome-cms', 'publication.prepareMany', { resourceIds: ['note-a', 'note-b'] }),
    /same website/,
  );
});
