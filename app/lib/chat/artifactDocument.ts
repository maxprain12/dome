import type { ArtifactRecord } from '@/types';
import { DOME_IFRAME_STORAGE_SHIM_SCRIPT } from './artifactStorageShim';
import { normalizeArtifactBodyHtml } from './artifactFrameUrl';
import { buildArtifactNavigateBootScript } from './artifactIframeNavigate';

export function mergedDomeDataPayload(artifact: ArtifactRecord | null): Record<string, unknown> {
  if (!artifact?.state || typeof artifact.state !== 'object') return {};
  const st = artifact.state as Record<string, unknown>;
  const data = st.data;
  return {
    ...(data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {}),
    ...(st.linkedData !== undefined ? { linkedData: st.linkedData } : {}),
  };
}

/** Target origin for postMessage into the sandboxed artifact frame. */
export function artifactFrameTargetOrigin(frameSrc: string | null): string {
  // Served `app://artifact/…` → real origin; srcdoc fallback → opaque `'null'`.
  const origin = frameSrc ? new URL(frameSrc).origin : 'null';
  return origin === 'null' ? '*' : origin;
}

/** Key-sorted JSON for stable comparison across key order / rebuilds. */
export function canonicalDataJson(obj: Record<string, unknown>): string {
  const sort = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(sort);
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).sort((a, b) => a.localeCompare(b));
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      out[k] = sort(o[k]);
    }
    return out;
  };
  return JSON.stringify(sort(obj));
}

/** Resolve the artifact's body HTML + CSS: state.html → record.template → placeholder. */
export function resolveArtifactHtmlCss(artifact: ArtifactRecord | null): { html: string; css: string } {
  const stateRec =
    artifact?.state && typeof artifact.state === 'object'
      ? (artifact.state as Record<string, unknown>)
      : {};
  let rawHtml = '';
  if (typeof stateRec.html === 'string' && stateRec.html.trim()) {
    rawHtml = stateRec.html;
  } else if (typeof artifact?.template === 'string' && artifact.template.trim()) {
    rawHtml = artifact.template;
  }
  // Legacy artifacts may hold a full document — extract body + hoist head styles.
  const normalized = normalizeArtifactBodyHtml(rawHtml);
  const stateCss = typeof stateRec.css === 'string' ? stateRec.css : '';
  return {
    html: normalized.body,
    css: [stateCss, normalized.css].filter(Boolean).join('\n\n'),
  };
}

/** Build the full srcdoc for the sandboxed iframe: Dome theme + reset (same as chat HTML artifacts), optional artifact CSS, DOME_DATA bridge. */
export function buildSrcdocFromParts(
  bodyHtml: string,
  data: unknown,
  themeCss: string,
  artifactCss: string,
): string {
  const safeData = JSON.stringify(data ?? {}).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const extraStyle = artifactCss.trim()
    ? `\n<style>\n${artifactCss}\n</style>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style id="dome-theme">${themeCss}</style>${extraStyle}
</head>
<body>
<script>
${DOME_IFRAME_STORAGE_SHIM_SCRIPT}
window.DOME_DATA = ${safeData};
(function() {
  function fieldKey(el) {
    var dk = el.getAttribute && el.getAttribute('data-dome-key');
    if (dk) return dk;
    return el.id || el.name || '';
  }
  function anonKey(el, idx) {
    if (fieldKey(el)) return null;
    return '__dome_input_' + idx;
  }
  function domeApplyToDom(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    var els = document.querySelectorAll('input, select, textarea');
    var anonIdx = 0;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var fk = fieldKey(el);
      var key = fk || anonKey(el, anonIdx);
      if (!fk) anonIdx++;
      if (!key || !Object.prototype.hasOwnProperty.call(data, key)) continue;
      var v = data[key];
      var t = (el.type || '').toLowerCase();
      if (t === 'file' || t === 'password') continue;
      if (t === 'checkbox') el.checked = (v === true || v === 'true' || v === 1 || v === '1');
      else if (t === 'radio') { if (String(el.value) === String(v)) el.checked = true; }
      else el.value = v == null ? '' : String(v);
    }
  }
  function domeRefreshFromDom() {
    var out = {};
    if (window.DOME_DATA && typeof window.DOME_DATA === 'object' && !Array.isArray(window.DOME_DATA)) {
      for (var k in window.DOME_DATA) {
        if (Object.prototype.hasOwnProperty.call(window.DOME_DATA, k)) out[k] = window.DOME_DATA[k];
      }
    }
    var els = document.querySelectorAll('input, select, textarea');
    var anonIdx = 0;
    for (var j = 0; j < els.length; j++) {
      var el = els[j];
      var fk = fieldKey(el);
      var key = fk || anonKey(el, anonIdx);
      if (!fk) anonIdx++;
      if (!key) continue;
      var t = (el.type || '').toLowerCase();
      if (t === 'file' || t === 'password') continue;
      if (t === 'checkbox') out[key] = el.checked;
      else if (t === 'radio') { if (el.checked) out[key] = el.value; }
      else out[key] = el.value;
    }
    window.DOME_DATA = out;
  }
  window.__dome_applyToDom = domeApplyToDom;
  window.__dome_refreshFromDom = domeRefreshFromDom;
  window.addEventListener('DOMContentLoaded', function() {
    domeApplyToDom(window.DOME_DATA);
    domeRefreshFromDom();
  });
  function saveForm() { domeRefreshFromDom(); window.__dome_updateState(window.DOME_DATA); }
  document.addEventListener('input', saveForm, true);
  document.addEventListener('change', saveForm, true);
})();
window.addEventListener('message', function(e) {
  if (e.source !== window.parent || !e.data) return;
  if (e.data.type === 'dome:theme:update' && typeof e.data.css === 'string') {
    var domeStyle = document.getElementById('dome-theme');
    if (domeStyle) domeStyle.textContent = e.data.css;
  }
  if (e.data.type === 'dome:data:refresh' && e.data.payload != null) {
    window.DOME_DATA = e.data.payload;
    try { if (typeof window.__dome_applyToDom === 'function') window.__dome_applyToDom(e.data.payload); } catch(e1) {}
    try { if (typeof window.dome_onDataRefresh === 'function') window.dome_onDataRefresh(e.data.payload); } catch(e2) {}
  }
  if (e.data.type === 'dome:request-state') {
    var requestId = e.data.requestId;
    var payload = undefined;
    try {
      if (typeof window.__dome_refreshFromDom === 'function') window.__dome_refreshFromDom();
      if (typeof window.__dome_collectState === 'function') {
        payload = window.__dome_collectState();
      } else if (window.DOME_DATA != null && typeof window.DOME_DATA === 'object') {
        payload = JSON.parse(JSON.stringify(window.DOME_DATA));
      } else {
        payload = window.DOME_DATA;
      }
    } catch (err) {
      payload = window.DOME_DATA;
    }
    try {
      window.parent.postMessage({ type: 'dome:state:snapshot', requestId: requestId, payload: payload }, '*');
    } catch (err2) {}
  }
});
</script>
<script>
  window.__dome_updateState = function(newData) {
  try {
    window.DOME_DATA = newData;
  } catch (e) {}
  try {
    if (typeof window.__dome_applyToDom === 'function') window.__dome_applyToDom(newData);
  } catch (e1) {}
  try {
    window.parent.postMessage({ type: 'dome:state:update', payload: newData }, '*');
  } catch (e3) {}
};
</script>
${bodyHtml}

<script>
${buildArtifactNavigateBootScript()}
</script>
</body>
</html>`;
}
