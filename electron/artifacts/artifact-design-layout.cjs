'use strict';

/**
 * Deterministic HTML generator for Dome-style persisted artifacts (tabbed dossier layout).
 * Uses only theme CSS variables; escapes all text. No external assets.
 */

const MAX_TABS = 12;
const MAX_SECTIONS_PER_PANEL = 32;
const MAX_BLOCKS_PER_SECTION = 48;
const MAX_STRING_LEN = 12000;
const MAX_BULLETS = 40;
const MAX_LABEL_LEN = 200;
const MAX_KICKER_LEN = 400;
const MAX_BADGE_LEN = 80;
const MAX_TITLE_LEN = 500;
const MAX_NUMBERED_TITLE_LEN = 500;
const MAX_BULLET_LEN = 2000;
const MAX_CODE_LEN = 8000;
const MAX_EMOJI_LEN = 8;
const VALID_ID_RE = /[^a-zA-Z0-9_-]/g;

/** @type {Set<string>} */
const BADGE_TONES = new Set(['neutral', 'info', 'success', 'warning', 'error']);

/**
 * @param {unknown} s
 * @returns {string}
 */
function escapeHtml(s) {
  if (s == null) return '';
  const t = String(s);
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {unknown} s
 * @param {number} max
 * @returns {string}
 */
function clipStr(s, max) {
  const e = escapeHtml(s);
  return e.length > max ? `${e.slice(0, max)}…` : e;
}

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function readTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {string} raw
 * @returns {string}
 */
function sanitizeTabId(raw) {
  return raw.trim().replace(VALID_ID_RE, '');
}

/**
 * @param {Record<string, unknown>} o
 * @returns {{ title: string, subtitle: string, titleEmoji: string, error: string | null }}
 */
function parseHeader(o) {
  const title = readTrimmedString(o.title);
  if (!title) {
    return { title: '', subtitle: '', titleEmoji: '', error: 'title is required (non-empty string)' };
  }
  const subtitle = readTrimmedString(o.subtitle);
  const emojiInput = o.title_emoji != null ? String(o.title_emoji).trim() : '';
  const titleEmoji = emojiInput !== '' ? emojiInput.slice(0, MAX_EMOJI_LEN) : '';
  return { title, subtitle, titleEmoji, error: null };
}

/**
 * @param {Record<string, unknown>} o
 * @returns {{ tabs: Array<{ id: string, label: string }>, error: string | null }}
 */
function parseTabs(o) {
  if (!Array.isArray(o.tabs) || o.tabs.length === 0) {
    return { tabs: [], error: 'tabs must be a non-empty array of { id, label }' };
  }
  if (o.tabs.length > MAX_TABS) {
    return { tabs: [], error: `at most ${MAX_TABS} tabs allowed` };
  }

  /** @type {Array<{ id: string, label: string }>} */
  const tabs = [];
  for (const row of o.tabs) {
    if (!isPlainObject(row)) continue;
    const r = /** @type {Record<string, unknown>} */ (row);
    const id = typeof r.id === 'string' ? sanitizeTabId(r.id) : '';
    const label = readTrimmedString(r.label);
    if (!id || !label) {
      return { tabs: [], error: 'each tab needs id (letters, digits, _, -) and label' };
    }
    tabs.push({ id, label: clipStr(label, MAX_LABEL_LEN) });
  }
  if (tabs.length === 0) {
    return { tabs: [], error: 'no valid tabs after validation' };
  }
  return { tabs, error: null };
}

/**
 * @param {unknown} panels
 * @param {Array<{ id: string }>} tabs
 * @returns {{ error: string | null }}
 */
function validatePanels(panels, tabs) {
  if (!isPlainObject(panels)) {
    return { error: 'panels must be an object keyed by tab id' };
  }
  const p = /** @type {Record<string, unknown>} */ (panels);
  for (const t of tabs) {
    if (!(t.id in p)) {
      return { error: `missing panels entry for tab id "${t.id}"` };
    }
  }
  return { error: null };
}

/**
 * @param {Record<string, unknown>} o
 * @param {Array<{ id: string }>} tabs
 * @returns {string}
 */
function resolveActiveTab(o, tabs) {
  const firstTabId = tabs[0].id;
  if (typeof o.active_tab === 'string' && o.active_tab.trim()) {
    const candidate = sanitizeTabId(o.active_tab);
    if (tabs.some((x) => x.id === candidate)) return candidate;
  }
  return firstTabId;
}

/**
 * @param {unknown} items
 * @param {string} ulMargin
 * @returns {string}
 */
function renderBulletList(items, ulMargin) {
  if (!Array.isArray(items) || items.length === 0) return '';
  let html = `<ul style="margin:${ulMargin};padding-left:var(--space-5);color:var(--secondary-text);font-size:14px;line-height:1.5;">`;
  let count = 0;
  for (const item of items) {
    if (count >= MAX_BULLETS) break;
    count += 1;
    if (typeof item !== 'string') continue;
    html += `<li style="margin-bottom:var(--space-1);">${clipStr(item, MAX_BULLET_LEN)}</li>`;
  }
  html += `</ul>`;
  return html;
}

/**
 * @param {Record<string, unknown>} b
 * @returns {string}
 */
function renderParagraphBlock(b) {
  const text = typeof b.text === 'string' ? clipStr(b.text, MAX_STRING_LEN) : '';
  if (!text) return '';
  return `<p style="margin:0 0 var(--space-3);font-size:14px;line-height:1.6;color:var(--primary-text);">${text}</p>`;
}

/**
 * @param {Record<string, unknown>} b
 * @returns {string}
 */
function renderNumberedBlock(b) {
  const num = typeof b.number === 'number' && b.number >= 0 ? Math.floor(b.number) : 0;
  const bt = typeof b.title === 'string' ? clipStr(b.title, MAX_NUMBERED_TITLE_LEN) : '';
  const body = typeof b.body === 'string' ? clipStr(b.body, MAX_STRING_LEN) : '';
  let html = `<div style="margin-bottom:var(--space-4);">`;
  html += `<div style="display:flex;gap:var(--space-2);align-items:flex-start;">`;
  html += `<span style="flex-shrink:0;font-size:14px;font-weight:600;color:var(--accent);">${num || ''}</span>`;
  html += `<div style="flex:1;min-width:0;">`;
  if (bt) {
    html += `<div style="font-size:14px;font-weight:600;color:var(--primary-text);margin-bottom:var(--space-2);">${bt}</div>`;
  }
  if (body) {
    html += `<p style="margin:0;font-size:14px;line-height:1.6;color:var(--secondary-text);">${body}</p>`;
  }
  const bulletsHtml = renderBulletList(b.bullets, 'var(--space-2) 0 0');
  if (bulletsHtml) html += bulletsHtml;
  html += `</div></div></div>`;
  return html;
}

/**
 * @param {Record<string, unknown>} b
 * @returns {string}
 */
function renderBulletsBlock(b) {
  return renderBulletList(b.items, '0 0 var(--space-3)');
}

/**
 * @param {Record<string, unknown>} b
 * @returns {string}
 */
function renderCodeBlock(b) {
  const text = typeof b.text === 'string' ? clipStr(b.text, MAX_CODE_LEN) : '';
  if (!text) return '';
  return `<pre style="margin:0 0 var(--space-3);padding:var(--space-3);border-radius:var(--radius-md);background:var(--bg-tertiary);border:1px solid var(--border);font-family:var(--font-mono);font-size:13px;line-height:1.5;color:var(--primary-text);white-space:pre-wrap;word-break:break-word;">${text}</pre>`;
}

/**
 * @param {Record<string, unknown>} b
 * @returns {string}
 */
function renderBlock(b) {
  const type = typeof b.type === 'string' ? b.type : '';
  switch (type) {
    case 'paragraph': return renderParagraphBlock(b);
    case 'numbered': return renderNumberedBlock(b);
    case 'bullets': return renderBulletsBlock(b);
    case 'code': return renderCodeBlock(b);
    default: return '';
  }
}

/**
 * @param {string} kicker
 * @param {string} badge
 * @param {string} badgeClass
 * @returns {string}
 */
function renderSectionHeader(kicker, badge, badgeClass) {
  if (!kicker && !badge) return '';
  let html = `<header style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);margin-bottom:var(--space-3);flex-wrap:wrap;">`;
  html += kicker
    ? `<span style="font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--secondary-text);">${kicker}</span>`
    : `<span></span>`;
  if (badge) {
    html += `<span class="${badgeClass}" style="font-size:11px;font-weight:600;padding:2px 10px;border-radius:var(--radius-full);white-space:nowrap;">${badge}</span>`;
  }
  html += `</header>`;
  return html;
}

/**
 * @param {Record<string, unknown>} s
 * @returns {string}
 */
function renderSection(s) {
  const kicker = typeof s.kicker === 'string' ? clipStr(s.kicker, MAX_KICKER_LEN) : '';
  const badge = typeof s.badge === 'string' ? clipStr(s.badge, MAX_BADGE_LEN) : '';
  const badgeToneRaw = typeof s.badge_tone === 'string' ? s.badge_tone : '';
  const badgeTone = BADGE_TONES.has(badgeToneRaw) ? badgeToneRaw : 'neutral';
  const badgeClass = `dome-design-badge dome-design-badge--${badgeTone}`;

  let html = `<article class="dome-design-card" style="margin-bottom:var(--space-4);padding:var(--space-4);border:1px solid var(--border);border-radius:var(--radius-xl);background:var(--bg-secondary);">`;
  html += renderSectionHeader(kicker, badge, badgeClass);

  const blocks = s.blocks;
  if (!Array.isArray(blocks)) {
    html += `</article>`;
    return html;
  }

  let bCount = 0;
  for (const blk of blocks) {
    if (bCount >= MAX_BLOCKS_PER_SECTION) break;
    if (!isPlainObject(blk)) continue;
    bCount += 1;
    html += renderBlock(/** @type {Record<string, unknown>} */ (blk));
  }

  html += `</article>`;
  return html;
}

/**
 * @param {unknown} panelVal
 * @returns {string}
 */
function renderPanel(panelVal) {
  if (!isPlainObject(panelVal)) return '';
  const p = /** @type {Record<string, unknown>} */ (panelVal);
  const sections = p.sections;
  if (!Array.isArray(sections)) return '';

  let html = '';
  let secCount = 0;
  for (const sec of sections) {
    if (secCount >= MAX_SECTIONS_PER_PANEL) break;
    if (!isPlainObject(sec)) continue;
    secCount += 1;
    html += renderSection(/** @type {Record<string, unknown>} */ (sec));
  }
  return html;
}

/**
 * @param {string} title
 * @param {string} subtitle
 * @param {string} titleEmoji
 * @returns {string}
 */
function renderHeader(title, subtitle, titleEmoji) {
  let html = `<header style="text-align:center;margin-bottom:var(--space-6);">`;
  if (titleEmoji) {
    html += `<div style="font-size:28px;line-height:1;margin-bottom:var(--space-2);" aria-hidden="true">${escapeHtml(titleEmoji)}</div>`;
  }
  html += `<h1 style="margin:0;font-size:22px;font-weight:600;color:var(--primary-text);line-height:1.3;">${clipStr(title, MAX_TITLE_LEN)}</h1>`;
  if (subtitle) {
    html += `<p style="margin:var(--space-2) 0 0;font-size:14px;color:var(--secondary-text);line-height:1.5;">${clipStr(subtitle, MAX_STRING_LEN)}</p>`;
  }
  html += `</header>`;
  return html;
}

/**
 * @param {Array<{ id: string, label: string }>} tabs
 * @param {string} activeTab
 * @returns {string}
 */
function renderTabList(tabs, activeTab) {
  let html = `<div role="tablist" aria-label="Sections" style="display:flex;flex-wrap:wrap;gap:var(--space-2);margin-bottom:var(--space-5);border-bottom:1px solid var(--border);padding-bottom:var(--space-3);">`;
  for (const t of tabs) {
    const selected = t.id === activeTab;
    const bg = selected ? 'color-mix(in oklab, var(--accent) 14%, transparent)' : 'transparent';
    const color = selected ? 'var(--accent)' : 'var(--secondary-text)';
    html += `<button type="button" role="tab" class="dome-design-tab" data-dome-tab="${escapeHtml(t.id)}" aria-selected="${selected ? 'true' : 'false'}" tabindex="${selected ? '0' : '-1'}" style="cursor:pointer;border:none;background:${bg};color:${color};font-family:var(--font-sans);font-size:13px;font-weight:500;padding:var(--space-2) var(--space-3);border-radius:var(--radius-lg);transition:background-color 0.16s ease,color 0.16s ease;">${t.label}</button>`;
  }
  html += `</div>`;
  return html;
}

/**
 * @param {Array<{ id: string }>} tabs
 * @param {Record<string, unknown>} panels
 * @param {string} activeTab
 * @returns {string}
 */
function renderPanelSections(tabs, panels, activeTab) {
  let html = '';
  for (const t of tabs) {
    const panelObj = panels[t.id];
    const isActive = t.id === activeTab;
    const display = isActive ? 'block' : 'none';
    html += `<section role="tabpanel" class="dome-design-panel" data-dome-panel="${escapeHtml(t.id)}" aria-hidden="${isActive ? 'false' : 'true'}" style="display:${display};">`;
    html += renderPanel(panelObj);
    html += `</section>`;
  }
  return html;
}

/**
 * @returns {string}
 */
function renderBadgeCss() {
  return `
.dome-design-badge--neutral { background: var(--bg-tertiary); color: var(--secondary-text); }
.dome-design-badge--info { background: var(--info-bg); color: var(--info); }
.dome-design-badge--success { background: var(--success-bg); color: var(--success); }
.dome-design-badge--warning { background: var(--warning-bg); color: var(--warning); }
.dome-design-badge--error { background: var(--error-bg); color: var(--error); }
`;
}

/**
 * @returns {string}
 */
function renderClientScript() {
  return `
(function(){
  function readData(){
    return (typeof window.DOME_DATA === 'object' && window.DOME_DATA !== null) ? window.DOME_DATA : {};
  }
  function applyTab(tabId){
    var tabs = document.querySelectorAll('[role="tab"][data-dome-tab]');
    var panels = document.querySelectorAll('.dome-design-panel[data-dome-panel]');
    for (var i = 0; i < tabs.length; i++) {
      var b = tabs[i];
      var id = b.getAttribute('data-dome-tab');
      var on = id === tabId;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.setAttribute('tabindex', on ? '0' : '-1');
      b.style.background = on ? 'color-mix(in oklab, var(--accent) 14%, transparent)' : 'transparent';
      b.style.color = on ? 'var(--accent)' : 'var(--secondary-text)';
    }
    for (var j = 0; j < panels.length; j++) {
      var p = panels[j];
      var pid = p.getAttribute('data-dome-panel');
      var show = pid === tabId;
      p.style.display = show ? 'block' : 'none';
      p.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
  }
  function persist(tabId){
    var base = readData();
    var next = Object.assign({}, base, { activeTab: tabId, layoutKind: 'dome-design-v1' });
    if (typeof window.__dome_updateState === 'function') {
      window.__dome_updateState(next);
    }
  }
  document.querySelectorAll('[role="tab"][data-dome-tab]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = btn.getAttribute('data-dome-tab');
      if (!id) return;
      applyTab(id);
      persist(id);
    });
  });
  var initial = readData().activeTab;
  if (typeof initial === 'string' && initial.length) {
    applyTab(initial);
  }
})();
`;
}

/**
 * @param {unknown} spec
 * @returns {{ ok: true, html: string, data: Record<string, unknown> } | { ok: false, error: string }}
 */
function buildArtifactDesignLayout(spec) {
  if (!isPlainObject(spec)) {
    return { ok: false, error: 'spec must be a JSON object' };
  }
  const o = /** @type {Record<string, unknown>} */ (spec);

  const header = parseHeader(o);
  if (header.error) return { ok: false, error: header.error };

  const tabsResult = parseTabs(o);
  if (tabsResult.error) return { ok: false, error: tabsResult.error };
  const tabs = tabsResult.tabs;

  const panelsResult = validatePanels(o.panels, tabs);
  if (panelsResult.error) return { ok: false, error: panelsResult.error };
  const panels = /** @type {Record<string, unknown>} */ (o.panels);

  const activeTab = resolveActiveTab(o, tabs);

  const bodyHtml =
    `<div class="dome-design-root" style="padding:var(--space-4);max-width:920px;margin:0 auto;">` +
    renderHeader(header.title, header.subtitle, header.titleEmoji) +
    renderTabList(tabs, activeTab) +
    renderPanelSections(tabs, panels, activeTab) +
    `</div>`;

  const html =
    `<style id="dome-design-layout-style">${renderBadgeCss()}</style>` +
    bodyHtml +
    `<script>${renderClientScript()}</script>`;

  const data = {
    activeTab,
    layoutKind: 'dome-design-v1',
    specVersion: 1,
  };

  return { ok: true, html, data };
}

module.exports = { buildArtifactDesignLayout, escapeHtml };
