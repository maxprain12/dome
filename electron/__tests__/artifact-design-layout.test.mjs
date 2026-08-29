/**
 * Helpers extracted from artifact-design-layout renderPanel (S3776).
 * Run: node --test electron/__tests__/artifact-design-layout.test.mjs
 *   or: pnpm run test:artifact-design-layout
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildArtifactDesignLayout,
  escapeHtml,
  renderPanel,
  renderSectionHeader,
  renderBlock,
  renderParagraphBlock,
  renderNumberedBlock,
  renderBulletsBlock,
  renderCodeBlock,
  renderBulletList,
  MAX_SECTIONS_PER_PANEL,
  MAX_BLOCKS_PER_SECTION,
  MAX_BULLETS,
  MAX_TABS,
} = require('../artifacts/artifact-design-layout.cjs');

function minimalSpec(overrides = {}) {
  return {
    title: 'Dossier',
    tabs: [{ id: 'overview', label: 'Overview' }],
    panels: {
      overview: {
        sections: [
          {
            kicker: 'Context',
            badge: 'Live',
            badge_tone: 'info',
            blocks: [{ type: 'paragraph', text: 'Hello world' }],
          },
        ],
      },
    },
    ...overrides,
  };
}

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    assert.equal(escapeHtml(`<&"' >`), '&lt;&amp;&quot;&#39; &gt;');
  });

  it('returns empty string for nullish', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });
});

describe('buildArtifactDesignLayout validation', () => {
  it('rejects non-object spec', () => {
    const r = buildArtifactDesignLayout(null);
    assert.equal(r.ok, false);
    assert.match(r.error, /JSON object/);
  });

  it('rejects missing title', () => {
    const r = buildArtifactDesignLayout({ title: '  ', tabs: [], panels: {} });
    assert.equal(r.ok, false);
    assert.match(r.error, /title is required/);
  });

  it('rejects empty tabs', () => {
    const r = buildArtifactDesignLayout({ title: 'T', tabs: [], panels: {} });
    assert.equal(r.ok, false);
    assert.match(r.error, /tabs must be a non-empty array/);
  });

  it('rejects too many tabs', () => {
    const tabs = Array.from({ length: MAX_TABS + 1 }, (_, i) => ({
      id: `t${i}`,
      label: `Tab ${i}`,
    }));
    const panels = Object.fromEntries(tabs.map((t) => [t.id, { sections: [] }]));
    const r = buildArtifactDesignLayout({ title: 'T', tabs, panels });
    assert.equal(r.ok, false);
    assert.match(r.error, new RegExp(`at most ${MAX_TABS}`));
  });

  it('rejects tab without id/label', () => {
    const r = buildArtifactDesignLayout({
      title: 'T',
      tabs: [{ id: '', label: 'X' }],
      panels: {},
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /each tab needs id/);
  });

  it('rejects missing panels entry for tab', () => {
    const r = buildArtifactDesignLayout({
      title: 'T',
      tabs: [{ id: 'a', label: 'A' }],
      panels: {},
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /missing panels entry for tab id "a"/);
  });

  it('rejects non-object panels', () => {
    const r = buildArtifactDesignLayout({
      title: 'T',
      tabs: [{ id: 'a', label: 'A' }],
      panels: [],
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /panels must be an object/);
  });
});

describe('buildArtifactDesignLayout happy path', () => {
  it('returns ok html/data with expected markers', () => {
    const r = buildArtifactDesignLayout(
      minimalSpec({
        subtitle: 'Sub',
        title_emoji: '📁',
        active_tab: 'overview',
      }),
    );
    assert.equal(r.ok, true);
    assert.equal(r.data.layoutKind, 'dome-design-v1');
    assert.equal(r.data.activeTab, 'overview');
    assert.equal(r.data.specVersion, 1);
    assert.match(r.html, /id="dome-design-layout-style"/);
    assert.match(r.html, /class="dome-design-root"/);
    assert.match(r.html, /role="tablist"/);
    assert.match(r.html, /data-dome-tab="overview"/);
    assert.match(r.html, /data-dome-panel="overview"/);
    assert.match(r.html, /Hello world/);
    assert.match(r.html, /dome-design-badge--info/);
    assert.match(r.html, /window\.DOME_DATA/);
    assert.match(r.html, /__dome_updateState/);
    assert.match(r.html, /layoutKind: 'dome-design-v1'/);
  });

  it('renders paragraph, numbered, bullets, and code blocks', () => {
    const r = buildArtifactDesignLayout(
      minimalSpec({
        panels: {
          overview: {
            sections: [
              {
                blocks: [
                  { type: 'paragraph', text: 'Para text' },
                  {
                    type: 'numbered',
                    number: 2,
                    title: 'Step',
                    body: 'Body',
                    bullets: ['one', 'two'],
                  },
                  { type: 'bullets', items: ['alpha', 'beta'] },
                  { type: 'code', text: 'const x = 1;' },
                ],
              },
            ],
          },
        },
      }),
    );
    assert.equal(r.ok, true);
    assert.match(r.html, /Para text/);
    assert.match(r.html, />2</);
    assert.match(r.html, /Step/);
    assert.match(r.html, /Body/);
    assert.match(r.html, /<li[^>]*>one<\/li>/);
    assert.match(r.html, /alpha/);
    assert.match(r.html, /<pre[^>]*>const x = 1;<\/pre>/);
  });

  it('applies badge tones and falls back to neutral', () => {
    const tones = ['neutral', 'info', 'success', 'warning', 'error', 'bogus'];
    const sections = tones.map((tone, i) => ({
      badge: `B${i}`,
      badge_tone: tone,
      blocks: [],
    }));
    const r = buildArtifactDesignLayout(
      minimalSpec({
        panels: { overview: { sections } },
      }),
    );
    assert.equal(r.ok, true);
    for (const tone of ['neutral', 'info', 'success', 'warning', 'error']) {
      assert.match(r.html, new RegExp(`dome-design-badge--${tone}`));
    }
    // invalid tone → neutral (badge B5)
    assert.match(r.html, /dome-design-badge--neutral[^>]*>B5</);
  });

  it('caps sections per panel', () => {
    const sections = Array.from({ length: MAX_SECTIONS_PER_PANEL + 5 }, (_, i) => ({
      kicker: `K${i}`,
      blocks: [{ type: 'paragraph', text: `S${i}` }],
    }));
    const r = buildArtifactDesignLayout(
      minimalSpec({ panels: { overview: { sections } } }),
    );
    assert.equal(r.ok, true);
    assert.match(r.html, /S0/);
    assert.match(r.html, new RegExp(`S${MAX_SECTIONS_PER_PANEL - 1}`));
    assert.doesNotMatch(r.html, new RegExp(`S${MAX_SECTIONS_PER_PANEL}`));
  });
});

describe('extracted block helpers', () => {
  it('renderParagraphBlock skips empty text', () => {
    assert.equal(renderParagraphBlock({ text: '' }), '');
    assert.match(renderParagraphBlock({ text: 'Hi' }), /Hi/);
  });

  it('renderNumberedBlock includes nested bullets', () => {
    const html = renderNumberedBlock({
      number: 1,
      title: 'T',
      body: 'B',
      bullets: ['x'],
    });
    assert.match(html, />1</);
    assert.match(html, /T/);
    assert.match(html, /B/);
    assert.match(html, /<li[^>]*>x<\/li>/);
  });

  it('renderBulletsBlock and renderCodeBlock', () => {
    assert.match(renderBulletsBlock({ items: ['a'] }), /<li[^>]*>a<\/li>/);
    assert.equal(renderBulletsBlock({ items: [] }), '');
    assert.match(renderCodeBlock({ text: 'code' }), /<pre[^>]*>code<\/pre>/);
    assert.equal(renderCodeBlock({ text: '' }), '');
  });

  it('renderBlock dispatches by type', () => {
    assert.match(renderBlock({ type: 'paragraph', text: 'p' }), /p/);
    assert.match(renderBlock({ type: 'numbered', number: 3, title: 'n' }), /n/);
    assert.match(renderBlock({ type: 'bullets', items: ['b'] }), /b/);
    assert.match(renderBlock({ type: 'code', text: 'c' }), /c/);
    assert.equal(renderBlock({ type: 'unknown' }), '');
  });

  it('renderSectionHeader respects kicker/badge', () => {
    assert.equal(renderSectionHeader('', '', 'neutral'), '');
    const html = renderSectionHeader('K', 'Ok', 'success');
    assert.match(html, /K/);
    assert.match(html, /dome-design-badge--success/);
    assert.match(html, /Ok/);
  });

  it('renderBulletList respects MAX_BULLETS', () => {
    const items = Array.from({ length: MAX_BULLETS + 3 }, (_, i) => `item-${i}`);
    const html = renderBulletList(items, 'margin:0;');
    assert.match(html, /item-0/);
    assert.match(html, new RegExp(`item-${MAX_BULLETS - 1}`));
    assert.doesNotMatch(html, new RegExp(`item-${MAX_BULLETS}`));
  });

  it('renderPanel returns empty for invalid panel', () => {
    assert.equal(renderPanel(null), '');
    assert.equal(renderPanel({ sections: 'nope' }), '');
  });

  it('renderPanel caps blocks per section', () => {
    const blocks = Array.from({ length: MAX_BLOCKS_PER_SECTION + 2 }, (_, i) => ({
      type: 'paragraph',
      text: `B${i}`,
    }));
    const html = renderPanel({ sections: [{ blocks }] });
    assert.match(html, /B0/);
    assert.match(html, new RegExp(`B${MAX_BLOCKS_PER_SECTION - 1}`));
    assert.doesNotMatch(html, new RegExp(`B${MAX_BLOCKS_PER_SECTION}`));
  });
});
