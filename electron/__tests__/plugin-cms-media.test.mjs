import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  collectMediaRefs,
  domeMediaId,
  isBannedMediaUrl,
  publicEntryUrl,
  publicRepoPath,
  rewritePublishedMedia,
  safePublicMediaPath,
  safeSitePathPattern,
  safeSiteUrl,
  sanitizeMediaFilename,
  siteImageRecord,
  storedSitePath,
} = require('../plugins/plugin-service.cjs');

test('rejects blob, data and localhost media URLs', () => {
  assert.equal(isBannedMediaUrl('blob:http://localhost:5173/abc'), true);
  assert.equal(isBannedMediaUrl('data:image/png;base64,aaa'), true);
  assert.equal(isBannedMediaUrl('http://localhost:5173/foto.png'), true);
  assert.equal(isBannedMediaUrl('/media/prueba/foto.png'), false);
});

test('rewrites dome-media references to public /media paths', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  assert.equal(domeMediaId(`dome-media:${id}`), id);
  const refs = collectMediaRefs(
    `![foto](dome-media:${id})`,
    { cover: `dome-media:${id}` },
  );
  assert.deepEqual(refs, [id]);
  const rewritten = rewritePublishedMedia(
    `![foto](dome-media:${id})`,
    { cover: `dome-media:${id}`, slug: 'prueba' },
    { [id]: '/media/prueba/foto.png' },
  );
  assert.equal(rewritten.markdown, '![foto](/media/prueba/foto.png)');
  assert.equal(rewritten.fields.cover, '/media/prueba/foto.png');
});

test('refuses to publish a body that still contains a blob image', () => {
  assert.throws(
    () => collectMediaRefs('![1.00](blob:http://localhost:5173/abc)', {}),
    /LOCAL_MEDIA_FORBIDDEN/,
  );
});

test('keeps media files under public/media/<slug>/', () => {
  assert.equal(safePublicMediaPath('prueba', 'foto.png'), 'public/media/prueba/foto.png');
  assert.equal(sanitizeMediaFilename('Foto Final.PNG', 'image/png'), 'foto-final.png');
  assert.throws(() => safePublicMediaPath('prueba', '../secret.png'));
});

test('keeps repository image deletes inside public/', () => {
  assert.equal(publicRepoPath('public/dome-recursos-landing/foto.png'), 'public/dome-recursos-landing/foto.png');
  assert.throws(() => publicRepoPath('../secret.png'));
  assert.throws(() => publicRepoPath('src/content/blog/es/prueba.md'));
});

test('matches synced post images by their original site path', () => {
  const metadata = JSON.stringify({
    plugins: { 'dome-cms': { kind: 'site-asset', sitePath: '/how/how-people.png' } },
  });
  assert.equal(storedSitePath(metadata), '/how/how-people.png');
  assert.equal(siteImageRecord({
    id: 'img-1',
    title: 'how-people.png',
    vault_path: 'public/how/how people.png',
    metadata,
  }).sitePath, '/how/how-people.png');
  assert.equal(publicRepoPath(`public${storedSitePath(metadata)}`), 'public/how/how-people.png');
});

test('builds a public site URL from the configured pattern', () => {
  assert.equal(safeSiteUrl('https://tudominio.com/'), 'https://tudominio.com');
  assert.equal(safeSitePathPattern(''), '/{collection}/{slug}');
  assert.equal(
    publicEntryUrl(
      { siteUrl: 'https://tudominio.com', sitePathPattern: '/{collection}/{slug}' },
      { collection: 'blog', slug: 'prueba' },
    ),
    'https://tudominio.com/blog/prueba',
  );
});
