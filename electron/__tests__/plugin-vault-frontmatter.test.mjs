import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const vaultStore = require('../storage/vault-store.cjs');

test('round-trips namespaced plugin metadata through Markdown frontmatter', () => {
  const resource = {
    id: 'note-1',
    title: 'Astro: a practical guide',
    created_at: 1,
    updated_at: 2,
    metadata: JSON.stringify({
      plugins: {
        'dome-cms': {
          templateId: 'astro-post',
          fields: { slug: 'astro-guide', tags: ['astro', 'cms'] },
        },
      },
    }),
  };
  const frontmatter = vaultStore.buildFrontmatter(resource);
  assert.equal(vaultStore.parseFrontmatterId(frontmatter), resource.id);
  assert.equal(vaultStore.parseFrontmatterTitle(frontmatter), resource.title);
  assert.deepEqual(vaultStore.parsePluginMetadata(frontmatter), {
    plugins: resource.metadata ? JSON.parse(resource.metadata).plugins : {},
  });
});

