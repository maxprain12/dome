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
 * @param {unknown} spec
 * @returns {{ ok: true, html: string, data: Record<string, unknown> } | { ok: false, error: string }}
 */
function buildArtifactDesignLayout(spec) {
  if (!isPlainObject(spec)) {
    return { ok: false, error: 'spec must be a JSON object' };
  }
  /** @type {Record<string, unknown>} */
  const o = /** @type {Record<string, unknown>} */ (spec);

  const titleRaw = typeof o.title === 'string' ? o.title.trim() : '';
  if (!titleRaw) {
    return { ok: false, error: 'title is required (non-empty string)' };
  }

  const subtitleRaw = typeof o.subtitle === 'string' ? o.subtitle.trim() : '';
  const titleEmojiRaw =
    o.title_emoji != null && String(o.title_emoji).trim() !== ''
      ? String(o.title_emoji).trim().slice(0, 8)
      : '';

  if (!Array.isArray(o.tabs) || o.tabs.length === 0) {
    return { ok: false, error: 'tabs must be a non-empty array of { id, label }' };
  }
  if (o.tabs.length > MAX_TABS) {
    return { ok: false, error: `at most ${MAX_TABS} tabs allowed` };
  }

  /** @type {Array<{ id: string; label: string }>} */
  const tabs = [];
  for (const row of o.tabs) {
    if (!isPlainObject(row)) continue;
    const id = typeof row.id === 'string' ? row.id.trim().replace(/[^a-zA-Z0-9_-]/g, '') : '';
    const label = typeof row.label === 'string' ? row.label.trim() : '';
    if (!id || !label) {
      return { ok: false, error: 'each tab needs id (letters, digits, _, -) and label' };
    }
    tabs.push({ id, label: clipStr(label, 200) });
  }
  if (tabs.length === 0) {
    return { ok: false, error: 'no valid tabs after validation' };
  }

  const panels = o.panels;
  if (!isPlainObject(panels)) {
    return { ok: false, error: 'panels must be an object keyed by tab id' };
  }

  for (const t of tabs) {
    if (!(t.id in /** @type {Record<string, unknown>} */ (panels))) {
      return { ok: false, error: `missing panels entry for tab id "${t.id}"` };
    }
  }

  const firstTabId = tabs[0].id;
  let activeTab =
    typeof o.active_tab === 'string' && o.active_tab.trim()
      ? o.active_tab.trim().replace(/[^a-zA-Z0-9_-]/g, '')
      : firstTabId;
  if (!tabs.some((x) => x.id === activeTab)) activeTab = firstTabId;

  /** @param {unknown} panelVal
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
      const s = /** @type {Record<string, unknown>} */ (sec);
      const kicker = typeof s.kicker === 'string' ? clipStr(s.kicker, 400) : '';
      const badge = typeof s.badge === 'string' ? clipStr(s.badge, 80) : '';
      const badgeTone =
        typeof s.badge_tone === 'string' && BADGE_TONES.has(s.badge_tone) ? s.badge_tone : 'neutral';

      const badgeClass = `dome-design-badge dome-design-badge--${badgeTone}`;

      html += `<article class="dome-design-card" style="margin-bottom:var(--space-4);padding:var(--space-4);border:1px solid var(--border);border-radius:var(--radius-xl);background:var(--card);">`;
      if (kicker || badge) {
        html += `<header style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);margin-bottom:var(--space-3);flex-wrap:wrap;">`;
        if (kicker) {
          html += `<span style="font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--muted-foreground);">${kicker}</span>`;
        } else {
          html += `<span></span>`;
        }
        if (badge) {
          html += `<span class="${badgeClass}" style="font-size:11px;font-weight:600;padding:2px 10px;border-radius:var(--radius-full);white-space:nowrap;">${badge}</span>`;
        }
        html += `</header>`;
      }

      const blocks = s.blocks;
      if (!Array.isArray(blocks)) {
        html += `</article>`;
        continue;
      }

      let bCount = 0;
      for (const blk of blocks) {
        if (bCount >= MAX_BLOCKS_PER_SECTION) break;
        if (!isPlainObject(blk)) continue;
        bCount += 1;
        const b = /** @type {Record<string, unknown>} */ (blk);
        const type = typeof b.type === 'string' ? b.type : '';

        if (type === 'paragraph') {
          const text = typeof b.text === 'string' ? clipStr(b.text, MAX_STRING_LEN) : '';
          if (text) {
            html += `<p style="margin:0 0 var(--space-3);font-size:14px;line-height:1.6;color:var(--foreground);">${text}</p>`;
          }
        } else if (type === 'numbered') {
          const num = typeof b.number === 'number' && b.number >= 0 ? Math.floor(b.number) : 0;
          const bt = typeof b.title === 'string' ? clipStr(b.title, 500) : '';
          const body = typeof b.body === 'string' ? clipStr(b.body, MAX_STRING_LEN) : '';
          html += `<div style="margin-bottom:var(--space-4);">`;
          html += `<div style="display:flex;gap:var(--space-2);align-items:flex-start;">`;
          html += `<span style="flex-shrink:0;font-size:14px;font-weight:600;color:var(--primary);">${num || ''}</span>`;
          html += `<div style="flex:1;min-width:0;">`;
          if (bt) {
            html += `<div style="font-size:14px;font-weight:600;color:var(--foreground);margin-bottom:var(--space-2);">${bt}</div>`;
          }
          if (body) {
            html += `<p style="margin:0;font-size:14px;line-height:1.6;color:var(--muted-foreground);">${body}</p>`;
          }
          const bullets = b.bullets;
          if (Array.isArray(bullets) && bullets.length > 0) {
            html += `<ul style="margin:var(--space-2) 0 0;padding-left:var(--space-5);color:var(--muted-foreground);font-size:14px;line-height:1.5;">`;
            let bi = 0;
            for (const item of bullets) {
              if (bi >= MAX_BULLETS) break;
              bi += 1;
              if (typeof item !== 'string') continue;
              html += `<li style="margin-bottom:var(--space-1);">${clipStr(item, 2000)}</li>`;
            }
            html += `</ul>`;
          }
          html += `</div></div></div>`;
        } else if (type === 'bullets') {
          const items = b.items;
          if (Array.isArray(items) && items.length > 0) {
            html += `<ul style="margin:0 0 var(--space-3);padding-left:var(--space-5);color:var(--muted-foreground);font-size:14px;line-height:1.5;">`;
            let bi = 0;
            for (const item of items) {
              if (bi >= MAX_BULLETS) break;
              bi += 1;
              if (typeof item !== 'string') continue;
              html += `<li style="margin-bottom:var(--space-1);">${clipStr(item, 2000)}</li>`;
            }
            html += `</ul>`;
          }
        } else if (type === 'code') {
          const text = typeof b.text === 'string' ? clipStr(b.text, 8000) : '';
          if (text) {
            html += `<pre style="margin:0 0 var(--space-3);padding:var(--space-3);border-radius:var(--radius-md);background:var(--muted);border:1px solid var(--border);font-family:var(--font-mono);font-size:13px;line-height:1.5;color:var(--foreground);white-space:pre-wrap;word-break:break-word;">${text}</pre>`;
          }
        }
      }

      html += `</article>`;
    }
    return html;
  }

  let bodyHtml = '';
  bodyHtml += `<div class="dome-design-root" style="padding:var(--space-4);max-width:920px;margin:0 auto;">`;

  bodyHtml += `<header style="text-align:center;margin-bottom:var(--space-6);">`;
  if (titleEmojiRaw) {
    bodyHtml += `<div style="font-size:28px;line-height:1;margin-bottom:var(--space-2);" aria-hidden="true">${escapeHtml(titleEmojiRaw)}</div>`;
  }
  bodyHtml += `<h1 style="margin:0;font-size:22px;font-weight:600;color:var(--foreground);line-height:1.3;">${clipStr(titleRaw, 500)}</h1>`;
  if (subtitleRaw) {
    bodyHtml += `<p style="margin:var(--space-2) 0 0;font-size:14px;color:var(--muted-foreground);line-height:1.5;">${clipStr(subtitleRaw, MAX_STRING_LEN)}</p>`;
  }
  bodyHtml += `</header>`;

  bodyHtml += `<div role="tablist" aria-label="Sections" style="display:flex;flex-wrap:wrap;gap:var(--space-2);margin-bottom:var(--space-5);border-bottom:1px solid var(--border);padding-bottom:var(--space-3);">`;
  for (const t of tabs) {
    const selected = t.id === activeTab;
    bodyHtml += `<button type="button" role="tab" class="dome-design-tab" data-dome-tab="${escapeHtml(t.id)}" aria-selected="${selected ? 'true' : 'false'}" tabindex="${selected ? '0' : '-1'}" style="cursor:pointer;border:none;background:${selected ? 'color-mix(in oklab, var(--primary) 14%, transparent)' : 'transparent'};color:${selected ? 'var(--primary)' : 'var(--muted-foreground)'};font-family:var(--font-sans);font-size:13px;font-weight:500;padding:var(--space-2) var(--space-3);border-radius:var(--radius-lg);transition:background-color 0.16s ease,color 0.16s ease;">${t.label}</button>`;
  }
  bodyHtml += `</div>`;

  for (const t of tabs) {
    const panelObj = /** @type {Record<string, unknown>} */ (panels)[t.id];
    const hidden = t.id !== activeTab ? 'none' : 'block';
    bodyHtml += `<section role="tabpanel" class="dome-design-panel" data-dome-panel="${escapeHtml(t.id)}" aria-hidden="${t.id === activeTab ? 'false' : 'true'}" style="display:${hidden};">`;
    bodyHtml += renderPanel(panelObj);
    bodyHtml += `</section>`;
  }

  bodyHtml += `</div>`;

  const badgeCss = `
.dome-design-badge--neutral { background: var(--muted); color: var(--muted-foreground); }
.dome-design-badge--info { background: var(--info-bg); color: var(--info); }
.dome-design-badge--success { background: var(--success-bg); color: var(--success); }
.dome-design-badge--warning { background: var(--warning-bg); color: var(--warning); }
.dome-design-badge--error { background: var(--error-bg); color: var(--destructive); }
`;

  const script = `
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
      b.style.background = on ? 'color-mix(in oklab, var(--primary) 14%, transparent)' : 'transparent';
      b.style.color = on ? 'var(--primary)' : 'var(--muted-foreground)';
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

  const html =
    `<style id="dome-design-layout-style">${badgeCss}</style>` +
    bodyHtml +
    `<script>${script}</script>`;

  const data = {
    activeTab,
    layoutKind: 'dome-design-v1',
    specVersion: 1,
  };

  return { ok: true, html, data };
}

module.exports = { buildArtifactDesignLayout, escapeHtml };
