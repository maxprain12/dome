import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Code, ExternalLink, PanelRight } from 'lucide-react';
import type { HtmlArtifactV } from '@/lib/chat/artifactSchemas';
import DomeButton from '@/components/ui/DomeButton';
import { useTabStore } from '@/lib/store/useTabStore';
import { buildDomeThemeStyleContent, useDomeThemeSnapshot } from '@/lib/chat/useDomeThemeSnapshot';
import i18n from '@/lib/i18n';
import { DOME_IFRAME_STORAGE_SHIM_SCRIPT } from '@/lib/chat/artifactStorageShim';
import { useArtifactFrameSrc } from '@/lib/chat/artifactFrameUrl';
import {
  buildArtifactNavigateBootScript,
  DOME_ARTIFACT_MSG,
  handleArtifactNavigateMessage,
  openArtifactExternalUrl,
} from '@/lib/chat/artifactIframeNavigate';
import './html-artifact-frame.css';

const DOME_ARTIFACT = DOME_ARTIFACT_MSG;
const DOME_THEME = 'dome:theme';
// Keep aligned with ARTIFACT_FRAME_CSP (electron/core/csp.cjs). This meta only
// matters on the srcdoc fallback path (non-Electron); when the frame is served
// from app://artifact/<token> the response header carries the same policy.
const DOME_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline' https:",
  "script-src 'unsafe-inline' 'unsafe-eval' https:",
  'img-src data: blob: https:',
  'font-src data: https:',
  'connect-src data: blob: https:',
  'media-src data: blob: https:',
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

function buildSrcDoc(artifact: HtmlArtifactV, themeCss: string): string {
  const { html, css = '', js = '' } = artifact;
  const boot = `
<script>
${DOME_IFRAME_STORAGE_SHIM_SCRIPT}
(function() {
  var resizeTimer;
  function postReady() {
    if (!window.parent) return;
    try {
      window.parent.postMessage({ type: '${DOME_ARTIFACT}', kind: 'ready' }, '*');
    } catch (e) {}
  }
  function postResize() {
    if (!window.parent) return;
    var h = Math.max(
      document.body.scrollHeight, document.documentElement.scrollHeight,
      document.body.offsetHeight, document.documentElement.offsetHeight
    );
    try {
      window.parent.postMessage({ type: '${DOME_ARTIFACT}', kind: 'resize', height: h }, '*');
    } catch (e) {}
  }
  window.addEventListener('message', function(ev) {
    var d = ev && ev.data;
    if (!d || d.type !== '${DOME_THEME}') return;
    var style = document.getElementById('dome-theme');
    if (style && typeof d.css === 'string') {
      style.textContent = d.css;
    }
  });
  window.addEventListener('load', function() {
    postReady();
    postResize();
  });
  if (window.ResizeObserver) {
    new ResizeObserver(postResize).observe(document.body);
  } else {
    resizeTimer = setInterval(postResize, 500);
  }
  window.addEventListener('unload', function() {
    if (resizeTimer) clearInterval(resizeTimer);
  });
  ${js ? js : ''}
})();
${buildArtifactNavigateBootScript()}
</script>`.trim();

  return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${DOME_CSP}">
<style id="dome-theme">${themeCss}</style>
<style>
${css}
</style></head><body>
${html}
${boot}
</body></html>`;
}

export default function HtmlArtifactFrame({
  artifact,
  onOpenNewWindow,
}: {
  artifact: HtmlArtifactV;
  onOpenNewWindow?: (srcdoc: string) => void;
}) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeReadyRef = useRef(false);
  const [height, setHeight] = useState(artifact.height ?? 240);
  const [showSource, setShowSource] = useState(false);

  const themeSnapshot = useDomeThemeSnapshot();
  const themeCss = useMemo(
    () => buildDomeThemeStyleContent(themeSnapshot.vars),
    [themeSnapshot.vars],
  );

  const postThemeToIframe = useCallback(() => {
    if (!iframeReadyRef.current) return;
    const w = iframeRef.current?.contentWindow;
    if (!w) return;
    try {
      w.postMessage({ type: DOME_THEME, css: themeCss, vars: themeSnapshot.vars }, '*');
    } catch {
      // iframe was unloaded
    }
  }, [themeCss, themeSnapshot.vars]);
  const postThemeRef = useRef(postThemeToIframe);
  postThemeRef.current = postThemeToIframe;

  // We only want the initial `srcdoc` to be recomputed when the artifact payload
  // changes — theme updates after mount are pushed via postMessage so we avoid
  // reloading the iframe (which would reset scroll position and inline state).
  const initialThemeCssRef = useRef(themeCss);
  const srcdoc = useMemo(
    () => buildSrcDoc(artifact, initialThemeCssRef.current),
    [artifact],
  );

  const openInDomeTab = useCallback(() => {
    const title = artifact.title || i18n.t('artifacts.html');
    useTabStore.getState().openArtifactTab(title, JSON.stringify(artifact));
  }, [artifact]);

  const onMsg = useCallback((ev: MessageEvent) => {
    if (handleArtifactNavigateMessage(ev, iframeRef.current?.contentWindow, openArtifactExternalUrl)) {
      return;
    }
    if (ev.source !== iframeRef.current?.contentWindow) return;
    const d = ev.data;
    if (!d || d.type !== DOME_ARTIFACT) return;
    if (d.kind === 'ready') {
      iframeReadyRef.current = true;
      postThemeRef.current();
      return;
    }
    if (d.kind === 'resize' && typeof d.height === 'number' && d.height > 0) {
      setHeight(Math.min(1200, Math.max(80, d.height + 8)));
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onMsg]);

  useEffect(() => {
    postThemeToIframe();
  }, [postThemeToIframe]);

  const prevSrcdocRef = useRef(srcdoc);
  if (srcdoc !== prevSrcdocRef.current) {
    prevSrcdocRef.current = srcdoc;
    iframeReadyRef.current = false;
  }

  // Served frame URL with its own CSP (falls back to srcdoc outside Electron) —
  // srcdoc would inherit the strict renderer CSP and block inline scripts in prod.
  const frameSource = useArtifactFrameSrc(srcdoc);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <DomeButton
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => {
            setShowSource((s) => !s);
          }}
          className="gap-1"
          leftIcon={<Code className="size-3" aria-hidden />}
        >
          {showSource ? t('chat.artifact_source_hide') : t('chat.artifact_source_show')}
        </DomeButton>
        <DomeButton
          type="button"
          variant="ghost"
          size="xs"
          onClick={openInDomeTab}
          className="gap-1"
          leftIcon={<PanelRight className="size-3" aria-hidden />}
        >
          {t('chat.open_in_tab')}
        </DomeButton>
        {onOpenNewWindow && (
          <DomeButton
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onOpenNewWindow(srcdoc)}
            className="gap-1"
            leftIcon={<ExternalLink className="size-3" aria-hidden />}
          >
            {t('chat.artifact_open_window')}
          </DomeButton>
        )}
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--tertiary-text)',
          lineHeight: 1.4,
        }}
      >
        {t('chat.artifact_sandbox_note')}
      </div>
      {showSource && (
        <pre className="html-artifact-source-pre">
          {srcdoc}
        </pre>
      )}
      <iframe
        ref={iframeRef}
        title="HTML artifact"
        sandbox="allow-scripts allow-modals"
        style={{
          width: '100%',
          height,
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg)',
        }}
        {...(frameSource.src
          ? { src: frameSource.src }
          : { srcDoc: frameSource.fallbackSrcdoc ?? undefined })}
      />
    </div>
  );
}
