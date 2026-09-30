import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const { detectRepositoryStructure, inferContentStructure, planEntryNormalization } = require('../plugins/cms-structure.cjs');
const { createPluginService } = require('../plugins/plugin-service.cjs');
const vaultStore = require('../storage/vault-store.cjs');

const landingPaths = [
  'src/content/blog/es/post.md',
  'src/content/blog/en/post.md',
  'src/content/manual/es/guide.md',
  'src/content/manual/en/guide.md',
  'src/pages/blog/[slug].astro',
  'src/pages/en/blog/[slug].astro',
  'src/pages/manual/[slug].astro',
  'src/pages/en/manual/[slug].astro',
  'src/i18n/index.ts',
];

test('landing pages keep Spanish unprefixed and prefix the other languages', () => {
  const detected = inferContentStructure(landingPaths, 'export const defaultLocale: Locale = "es";');
  assert.equal(detected.sitePathPattern, '{/language}/{collection}/{slug}');
  assert.deepEqual(Object.keys(detected.contentPaths), ['blog/es', 'manual/es', 'blog/en', 'manual/en']);
  assert.equal(detected.contentPaths['blog/es'], 'src/content/blog/es');
  assert.equal(detected.contentPaths['manual/en'], 'src/content/manual/en');
});

test('a locale folder for every language always includes the language in the URL', () => {
  const detected = inferContentStructure([
    'src/content/blog/es/post.md',
    'src/content/blog/en/post.md',
    'src/pages/es/blog/[slug].astro',
    'src/pages/en/blog/[slug].astro',
  ], 'defaultLocale: "es"');
  assert.equal(detected.sitePathPattern, '/{language}/{collection}/{slug}');
});

test('one language keeps a single public path', () => {
  const detected = inferContentStructure(['src/content/blog/es/post.md'], '');
  assert.equal(detected.sitePathPattern, '/{collection}/{slug}');
  assert.deepEqual(detected.contentPaths, { 'blog/es': 'src/content/blog/es' });
});

test('repository detection reads the tree and the locale file', async () => {
  const api = {
    async getReference() { return { object: { sha: 'commit' } }; },
    async getCommit() { return { tree: { sha: 'tree' } }; },
    async getRepositoryTree() {
      return { truncated: false, tree: landingPaths.map((path) => ({ path, type: 'blob' })) };
    },
    async getRepositoryFile(_owner, _repo, file) {
      assert.equal(file, 'src/i18n/index.ts');
      return 'export const defaultLocale: Locale = "es";';
    },
  };
  const detected = await detectRepositoryStructure('maxprain12/landing-page-dome', 'main', api);
  assert.equal(detected.sitePathPattern, '{/language}/{collection}/{slug}');
  assert.equal(detected.contentPaths['blog/en'], 'src/content/blog/en');
});

test('normalization retargets the stored path and a unique slug', () => {
  const remote = [
    { path: 'src/content/blog/en/hello.md', collection: 'blog', language: 'en', slug: 'hello' },
    { path: 'src/content/entries/es/only.md', collection: 'entries', language: 'es', slug: 'only' },
    { path: 'src/content/blog/es/shared.md', collection: 'blog', language: 'es', slug: 'shared' },
    { path: 'src/content/blog/en/shared.md', collection: 'blog', language: 'en', slug: 'shared' },
  ];
  const plan = planEntryNormalization([
    { id: 'stale', fields: { collection: 'blog', language: 'en', slug: 'hello' }, publication: { path: 'src/content/blog/en/hello.mdx' } },
    { id: 'moved', fields: { collection: 'blog', language: 'en', slug: 'only' }, publication: { path: 'src/content/blog/en/only.md' } },
    { id: 'same', fields: { collection: 'blog', language: 'en', slug: 'hello' }, publication: { path: 'src/content/blog/en/hello.md' } },
    { id: 'ambiguous', fields: { collection: 'manual', language: 'fr', slug: 'shared' }, publication: null },
    { id: 'missing', fields: { collection: 'blog', language: 'es', slug: 'gone' }, publication: null },
  ], remote);
  assert.deepEqual(plan.updates.map((item) => item.id), ['stale', 'moved']);
  assert.equal(plan.updates[1].collection, 'entries');
  assert.equal(plan.updates[1].language, 'es');
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.unmatched, 2);
});

test('notes.normalize stores the path of the file that exists in the repository', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec('CREATE TABLE resources (id TEXT PRIMARY KEY, project_id TEXT, type TEXT, title TEXT, content TEXT, metadata TEXT, updated_at INTEGER, folder_id TEXT)');
  const metadata = {
    plugins: {
      'dome-cms': {
        fields: { collection: 'blog', language: 'en', slug: 'hello' },
        publication: { path: 'src/content/blog/en/hello.mdx', contentDigest: 'abc' },
      },
    },
  };
  db.prepare('INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    'note', 'vault', 'note', 'Hello', 'Body', JSON.stringify(metadata), 1, null,
  );
  const github = {
    repo: 'owner/site',
    branch: 'main',
    contentPaths: { 'blog/en': 'src/content/blog/en' },
    sitePathPattern: '{/language}/{collection}/{slug}',
  };
  const queries = {
    getPluginGrant: { get: () => ({
      plugin_id: 'dome-cms',
      manifest_digest: 'digest',
      project_id: 'vault',
      permissions_json: JSON.stringify(['notes.write', 'content.publish']),
      config_json: JSON.stringify({ github }),
    }) },
    getResourceById: db.prepare('SELECT * FROM resources WHERE id = ?'),
    listPluginNotes: { all: (projectId) => db.prepare("SELECT * FROM resources WHERE project_id = ? AND type = 'note'").all(projectId) },
    updatePluginNoteIfCurrent: db.prepare('UPDATE resources SET title = ?, content = ?, metadata = ?, updated_at = ? WHERE id = ? AND project_id = ? AND updated_at = ?'),
  };
  const githubApi = require('../github/github-api.cjs');
  const original = {
    getReference: githubApi.getReference,
    getCommit: githubApi.getCommit,
    getRepositoryTree: githubApi.getRepositoryTree,
  };
  githubApi.getReference = async () => ({ object: { sha: 'commit' } });
  githubApi.getCommit = async () => ({ tree: { sha: 'tree' } });
  githubApi.getRepositoryTree = async () => ({
    truncated: false,
    tree: [{ path: 'src/content/blog/en/hello.md', type: 'blob' }],
  });
  const originalWrite = vaultStore.writeNoteMarkdown;
  const originalFolders = vaultStore.ensureFolderChain;
  vaultStore.writeNoteMarkdown = () => ({ success: true });
  vaultStore.ensureFolderChain = () => null;
  t.after(() => {
    githubApi.getReference = original.getReference;
    githubApi.getCommit = original.getCommit;
    githubApi.getRepositoryTree = original.getRepositoryTree;
    vaultStore.writeNoteMarkdown = originalWrite;
    vaultStore.ensureFolderChain = originalFolders;
  });
  const service = createPluginService({
    database: { getQueries: () => queries, getDB: () => db },
    fileStorage: {},
    windowManager: { broadcast() {} },
    pluginLoader: { listPlugins: () => [{
      id: 'dome-cms',
      enabled: true,
      manifestDigest: 'digest',
      permissions: ['notes.write', 'content.publish'],
      contributes: {
        vaultTemplate: {
          id: 'astro-post',
          schemaVersion: 1,
          fields: [
            { id: 'collection', type: 'select', label: 'Collection', options: ['blog'] },
            { id: 'language', type: 'select', label: 'Language', options: ['en'] },
            { id: 'slug', type: 'slug', label: 'Slug' },
          ],
        },
      },
    }] },
  });
  const result = await service.request('dome-cms', 'notes.normalize', {});
  assert.equal(result.updated, 1);
  assert.equal(result.notes[0].publication.path, 'src/content/blog/en/hello.md');
});
