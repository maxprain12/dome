import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Download, FileDown, Save, RefreshCw, Database, LayoutDashboard } from 'lucide-react';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import HubListState from '@/components/ui/HubListState';
import IndexStatusBadge from '@/components/viewers/shared/IndexStatusBadge';
import type { ArtifactRecord } from '@/types';
import { useDomeThemeSnapshot, buildDomeThemeStyleContent } from '@/lib/chat/useDomeThemeSnapshot';
import { DOME_IFRAME_STORAGE_SHIM_SCRIPT } from '@/lib/chat/artifactStorageShim';
import { normalizeArtifactBodyHtml, useArtifactFrameSrc } from '@/lib/chat/artifactFrameUrl';
import {
  buildArtifactNavigateBootScript,
  handleArtifactNavigateMessage,
  openArtifactExternalUrl,
} from '@/lib/chat/artifactIframeNavigate';
import { notifications } from '@mantine/notifications';
import FeedersPanel from '@/components/feeders/FeedersPanel';

interface Props {
  resourceId: string;
}

function mergedDomeDataPayload(artifact: ArtifactRecord | null): Record<string, unknown> {
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

/** Key-sorted JSON for stable comparison across key order / rebuilds. */
function canonicalDataJson(obj: Record<string, unknown>): string {
  const sort = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(sort);
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      out[k] = sort(o[k]);
    }
    return out;
  };
  return JSON.stringify(sort(obj));
}

/** Build the full srcdoc for the sandboxed iframe: Dome theme + reset (same as chat HTML artifacts), optional artifact CSS, DOME_DATA bridge. */
function buildSrcdocFromParts(
  bodyHtml: string,
  data: unknown,
  themeCss: string,
  artifactCss: string,
): string {
  const safeData = JSON.stringify(data ?? {});
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
  document.addEventListener('input', domeRefreshFromDom, true);
  document.addEventListener('change', domeRefreshFromDom, true);
})();
window.addEventListener('message', function(e) {
  if (!e.data) return;
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
${bodyHtml}
<script>
  window.__dome_updateState = function(newData) {
  try {
    window.DOME_DATA = newData;
  } catch (e) {}
  try {
    if (typeof window.__dome_applyToDom === 'function') window.__dome_applyToDom(newData);
  } catch (e1) {}
  try {
    if (typeof window.__dome_refreshFromDom === 'function') window.__dome_refreshFromDom();
  } catch (e2) {}
  try {
    window.parent.postMessage({ type: 'dome:state:update', payload: newData }, '*');
  } catch (e3) {}
};
</script>
<script>
${buildArtifactNavigateBootScript()}
</script>
</body>
</html>`;
}

export default function ArtifactWorkspaceClient({ resourceId }: Props) {
  const { t } = useTranslation();
  const themeSnapshot = useDomeThemeSnapshot();
  const [artifact, setArtifact] = useState<ArtifactRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const artifactRef = useRef<ArtifactRecord | null>(null);
  artifactRef.current = artifact;
  const saveRequestIdRef = useRef(0);
  /** Last `dome:state:update` payload from our iframe (canonical JSON) for echo suppression. */
  const lastLocalDomePushRef = useRef<{ json: string; at: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<'dashboard' | 'feeders'>('dashboard');

  const stateRec =
    artifact?.state && typeof artifact.state === 'object'
      ? (artifact.state as Record<string, unknown>)
      : {};
  // Fallback chain (issue 465): state.html → record.template → placeholder.
  const rawHtml =
    typeof stateRec.html === 'string' && stateRec.html.trim()
      ? stateRec.html
      : typeof artifact?.template === 'string' && artifact.template.trim()
        ? artifact.template
        : '';
  // Legacy artifacts may hold a full document — extract body + hoist head styles.
  const normalized = normalizeArtifactBodyHtml(rawHtml);
  const stHtml = normalized.body;
  const stCss = [typeof stateRec.css === 'string' ? stateRec.css : '', normalized.css]
    .filter(Boolean)
    .join('\n\n');
  const hasArtifact = artifact !== null;

  // Theme at first build only: later theme changes are pushed via postMessage
  // (`dome:theme:update`), so they must NOT rebuild the srcdoc / reload the iframe.
  const initialThemeCssRef = useRef<string | null>(null);
  if (initialThemeCssRef.current === null) {
    initialThemeCssRef.current = buildDomeThemeStyleContent(themeSnapshot.vars);
  }

  // Rebuild the iframe only when the artifact's HTML/CSS actually change.
  // Data-only saves (`dome:state:update`) and external data refreshes flow via
  // postMessage; rebuilding here would reload the iframe and drop focus/scroll.
  const iframeSrcdoc = useMemo(() => {
    if (!hasArtifact) return '';
    const bodyHtml =
      stHtml.trim().length > 0
        ? stHtml
        : '<p style="color:var(--secondary-text);padding:1rem">Empty artifact — ask Many to generate content.</p>';
    const domePayload = mergedDomeDataPayload(artifactRef.current);
    return buildSrcdocFromParts(bodyHtml, domePayload, initialThemeCssRef.current ?? '', stCss);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- data reads artifactRef on purpose
  }, [hasArtifact, resourceId, stHtml, stCss]);

  // Served frame URL with its own CSP (falls back to srcdoc outside Electron).
  const frameSource = useArtifactFrameSrc(iframeSrcdoc || null);

  const prevResourceIdRef = useRef(resourceId);
  if (resourceId !== prevResourceIdRef.current) {
    prevResourceIdRef.current = resourceId;
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;

    window.electron.artifacts.get(resourceId).then((result) => {
      if (cancelled) return;
      if (result.success && result.data) {
        setArtifact(result.data);
      } else {
        setError(result.error ?? t('common.unknown_error'));
      }
      setLoading(false);
    }).catch((err: unknown) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : t('common.unknown_error'));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [resourceId, t]);

  // When opening an artifact linked to a spreadsheet, auto-sync so DOME_DATA.linkedData
  // is populated immediately — the artifact:updated broadcast will refresh the iframe.
  useEffect(() => {
    if (!artifact?.linkedResourceId) return;
    void window.electron.artifacts.refreshLinked(resourceId).catch(() => {});
  }, [resourceId, artifact?.linkedResourceId]);

  // Listen to artifact update broadcasts (e.g. from Many or Excel sync).
  // When only state.data changed (HTML is unchanged), push data into the live iframe
  // via postMessage instead of rebuilding the whole srcdoc (avoids iframe reload).
  useEffect(() => {
    const handler = (updated: ArtifactRecord) => {
      if (updated.resourceId !== resourceId) return;
      const prev = artifactRef.current;
      const prevHtml = typeof (prev?.state as Record<string, unknown> | undefined)?.html === 'string'
        ? (prev!.state as Record<string, unknown>).html as string
        : '';
      const nextHtml = typeof (updated.state as Record<string, unknown> | undefined)?.html === 'string'
        ? (updated.state as Record<string, unknown>).html as string
        : '';
      const htmlUnchanged = prevHtml === nextHtml && prevHtml !== '';

      if (htmlUnchanged && iframeRef.current?.contentWindow) {
        const updatedStateRec = updated.state as Record<string, unknown> | undefined;
        const nextData = updatedStateRec?.data;
        const nextLinkedData = updatedStateRec?.linkedData;
        const refreshPayload: Record<string, unknown> = {
          ...(nextData && typeof nextData === 'object' && !Array.isArray(nextData)
            ? (nextData as Record<string, unknown>)
            : {}),
          ...(nextLinkedData !== undefined ? { linkedData: nextLinkedData } : {}),
        };
        const prevPayload = mergedDomeDataPayload(prev);
        const refreshCanon = canonicalDataJson(refreshPayload);
        const refreshEchoOnly = canonicalDataJson(prevPayload) === refreshCanon;
        const recent = lastLocalDomePushRef.current;
        const IFRAME_ECHO_WINDOW_MS = 500;
        const iframeEcho =
          recent !== null &&
          Date.now() - recent.at < IFRAME_ECHO_WINDOW_MS &&
          recent.json === refreshCanon;
        const skipDomRefresh = refreshEchoOnly || iframeEcho;
        if (!skipDomRefresh) {
          // Sandbox (no allow-same-origin) → opaque origin: 'app://artifact'
          // when the frame is served from frameSource.src, 'null' for srcdoc fallback.
          const targetOrigin = frameSource.src ? new URL(frameSource.src).origin : 'null';
          iframeRef.current.contentWindow.postMessage(
            { type: 'dome:data:refresh', payload: refreshPayload },
            targetOrigin,
          );
        }
        lastLocalDomePushRef.current = null;
        setArtifact(updated);
      } else {
        setArtifact(updated);
      }
    };
    const remove = window.electron.on('artifact:updated', handler);
    return () => remove?.();
  }, [resourceId]);

  // Handle postMessage from iframe for state persistence + external link navigation
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (handleArtifactNavigateMessage(event, iframeRef.current?.contentWindow, openArtifactExternalUrl)) {
        return;
      }
      if (event.source !== iframeRef.current?.contentWindow) return;
      const art = artifactRef.current;
      if (!art) return;
      if (event.data?.type === 'dome:state:update') {
        const newData = event.data.payload;
        if (newData && typeof newData === 'object' && !Array.isArray(newData)) {
          lastLocalDomePushRef.current = {
            json: canonicalDataJson(newData as Record<string, unknown>),
            at: Date.now(),
          };
        } else {
          lastLocalDomePushRef.current = null;
        }
        try {
          // Data-only update: the main process merges into the current state,
          // so a concurrent html/css edit (e.g. from Many) is never clobbered.
          const result = await window.electron.artifacts.update({ resourceId, data: newData });
          if (result.success && result.data) {
            setArtifact(result.data);
          } else {
            lastLocalDomePushRef.current = null;
          }
        } catch {
          lastLocalDomePushRef.current = null;
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [resourceId]);

  // Push theme updates to iframe when CSS vars may have changed
  useEffect(() => {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: 'dome:theme:update', css: buildDomeThemeStyleContent(themeSnapshot.vars) },
      '*',
    );
  }, [themeSnapshot.themeKey, themeSnapshot.vars]);

  const handleExport = useCallback(async () => {
    try {
      const result = await window.electron.artifacts.export(resourceId);
      if (result && result.success === false && result.error) {
        notifications.show({ message: result.error, color: 'red' });
      }
    } catch {
      notifications.show({ message: t('common.error'), color: 'red' });
    }
  }, [resourceId, t]);

  const handleExportHtml = useCallback(async () => {
    try {
      const result = await window.electron.artifacts.exportHtml(resourceId);
      if (result && result.success === false && result.error) {
        notifications.show({ message: result.error, color: 'red' });
      }
    } catch {
      notifications.show({ message: t('common.error'), color: 'red' });
    }
  }, [resourceId, t]);

  const handleSaveState = useCallback(() => {
    const w = iframeRef.current?.contentWindow;
    if (!w) {
      notifications.show({ message: t('artifacts.save_state_no_iframe'), color: 'yellow' });
      return;
    }
    const reqId = ++saveRequestIdRef.current;
    setSaving(true);

    let onSnap: ((event: MessageEvent) => void) | null = null;
    const tmr = window.setTimeout(() => {
      if (onSnap) window.removeEventListener('message', onSnap);
      setSaving(false);
      notifications.show({ message: t('artifacts.save_state_timeout'), color: 'red' });
    }, 8000);

    onSnap = (event: MessageEvent) => {
      if (event.source !== w) return;
      if (event.data?.type !== 'dome:state:snapshot' || event.data?.requestId !== reqId) return;
      if (onSnap) window.removeEventListener('message', onSnap);
      window.clearTimeout(tmr);

      void (async () => {
        try {
          const art = artifactRef.current;
          if (!art) {
            setSaving(false);
            return;
          }
          const payload = event.data.payload;
          const result = await window.electron.artifacts.update({ resourceId, data: payload });
          if (result.success && result.data) {
            setArtifact(result.data);
            notifications.show({ message: t('artifacts.save_state_ok'), color: 'green' });
          } else {
            notifications.show({
              message: result.error ?? t('artifacts.save_state_error'),
              color: 'red',
            });
          }
        } catch {
          notifications.show({ message: t('artifacts.save_state_error'), color: 'red' });
        } finally {
          setSaving(false);
        }
      })();
    };

    window.addEventListener('message', onSnap);
    try {
      w.postMessage({ type: 'dome:request-state', requestId: reqId }, '*');
    } catch {
      window.removeEventListener('message', onSnap);
      window.clearTimeout(tmr);
      setSaving(false);
      notifications.show({ message: t('artifacts.save_state_error'), color: 'red' });
    }
  }, [resourceId, t]);

  const handleRefreshLinked = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await window.electron.artifacts.refreshLinked(resourceId);
      if (result.success) {
        notifications.show({ message: t('artifacts.refresh_linked_ok'), color: 'green' });
      } else {
        notifications.show({ message: result.error ?? t('artifacts.refresh_linked_error'), color: 'red' });
      }
    } catch {
      notifications.show({ message: t('artifacts.refresh_linked_error'), color: 'red' });
    } finally {
      setRefreshing(false);
    }
  }, [resourceId, t]);

  if (loading) {
    return <HubListState variant="loading" loadingLabel={t('common.loading')} />;
  }
  if (error || !artifact) {
    return <HubListState variant="error" errorMessage={error ?? t('common.error')} />;
  }

  return (
    <div
      className="flex flex-col h-full min-h-0 overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      <DomeSubpageHeader>
        <DomeSubpageHeader.Title>
          <span className="flex items-center gap-2">
            <Layers className="size-4 shrink-0" style={{ color: 'var(--accent)' }} />
            <span style={{ color: 'var(--primary-text)' }}>{artifact.title}</span>
          </span>
        </DomeSubpageHeader.Title>
        <DomeSubpageHeader.Trailing>
          <>
            <IndexStatusBadge resourceId={resourceId} resourceType="artifact" />
            {artifact.linkedResourceId && (
              <button
                type="button"
                onClick={handleRefreshLinked}
                disabled={refreshing}
                title={t('artifacts.refresh_linked_title')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50"
                style={{
                  color: 'var(--accent)',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                <RefreshCw className={`size-3.5${refreshing ? ' animate-spin' : ''}`} />
                {t('artifacts.refresh_linked')}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSaveState()}
              disabled={saving}
              title={t('artifacts.save_state_title')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50"
              style={{
                color: 'var(--primary-text)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <Save className="size-3.5" />
              {saving ? t('common.saving') : t('artifacts.save_state')}
            </button>
            <button
              type="button"
              onClick={handleExport}
              title={t('artifacts.export_artifact')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
              style={{
                color: 'var(--secondary-text)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <Download className="size-3.5" />
              {t('artifacts.export_artifact')}
            </button>
            <button
              type="button"
              onClick={handleExportHtml}
              title={t('artifacts.export_html')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
              style={{
                color: 'var(--secondary-text)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <FileDown className="size-3.5" />
              {t('artifacts.export_html')}
            </button>
          </>
        </DomeSubpageHeader.Trailing>
      </DomeSubpageHeader>
      <div
        className="flex items-center gap-1 px-4 py-2 border-b shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
      >
        <button
          type="button"
          onClick={() => setWorkspaceTab('dashboard')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
          style={{
            color: workspaceTab === 'dashboard' ? 'var(--accent)' : 'var(--secondary-text)',
            background: workspaceTab === 'dashboard' ? 'var(--bg)' : 'transparent',
            border: workspaceTab === 'dashboard' ? '1px solid var(--border)' : '1px solid transparent',
          }}
        >
          <LayoutDashboard className="size-3.5" />
          {t('feeders.tab_dashboard')}
        </button>
        <button
          type="button"
          onClick={() => setWorkspaceTab('feeders')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
          style={{
            color: workspaceTab === 'feeders' ? 'var(--accent)' : 'var(--secondary-text)',
            background: workspaceTab === 'feeders' ? 'var(--bg)' : 'transparent',
            border: workspaceTab === 'feeders' ? '1px solid var(--border)' : '1px solid transparent',
          }}
        >
          <Database className="size-3.5" />
          {t('feeders.tab_feeders')}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {workspaceTab === 'feeders' ? (
          <FeedersPanel artifactResourceId={resourceId} />
        ) : (
        <iframe
          ref={iframeRef}
          key={resourceId}
          {...(frameSource.src
            ? { src: frameSource.src }
            : { srcDoc: frameSource.fallbackSrcdoc ?? undefined })}
          sandbox="allow-scripts allow-forms allow-modals"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
          }}
          title={artifact.title}
        />
        )}
      </div>
    </div>
  );
}
