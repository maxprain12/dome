import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Download } from 'lucide-react';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import HubListState from '@/components/ui/HubListState';
import type { ArtifactRecord } from '@/types';

interface Props {
  resourceId: string;
}

/** Read Dome's current CSS variable values from the document root. */
function getDomeCssVars(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  const vars = [
    '--bg',
    '--bg-secondary',
    '--bg-tertiary',
    '--bg-hover',
    '--primary-text',
    '--secondary-text',
    '--tertiary-text',
    '--accent',
    '--border',
    '--border-hover',
  ];
  const result: Record<string, string> = {};
  for (const v of vars) {
    result[v] = style.getPropertyValue(v).trim();
  }
  return result;
}

/** Build the full srcdoc for the sandboxed iframe, injecting CSS vars and DOME_DATA. */
function buildSrcdoc(artifact: ArtifactRecord): string {
  const cssVars = getDomeCssVars();
  const cssVarsBlock = Object.entries(cssVars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');

  const htmlState = artifact.state && typeof artifact.state === 'object' ? artifact.state as { html?: string; data?: unknown } : {};
  const html = htmlState.html ?? '<p style="color:var(--secondary-text);padding:1rem">Empty artifact — ask Many to generate content.</p>';
  const data = JSON.stringify(htmlState.data ?? {});

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root {
${cssVarsBlock}
}
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  padding: 0;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  background: var(--bg);
  color: var(--primary-text);
  line-height: 1.5;
}
</style>
</head>
<body>
<script>
window.DOME_DATA = ${data};
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'dome:theme:update') {
    var style = document.createElement('style');
    style.textContent = ':root{' + Object.entries(e.data.vars).map(function(kv){return kv[0]+':'+kv[1]}).join(';') + '}';
    document.head.appendChild(style);
  }
});
</script>
${html}
<script>
// Notify parent of state changes
window.__dome_updateState = function(newData) {
  window.parent.postMessage({ type: 'dome:state:update', payload: newData }, '*');
};
</script>
</body>
</html>`;
}

export default function ArtifactWorkspaceClient({ resourceId }: Props) {
  const { t } = useTranslation();
  const [artifact, setArtifact] = useState<ArtifactRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

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
  }, [resourceId]);

  // Listen to artifact update broadcasts (e.g. from Many)
  useEffect(() => {
    const handler = (updated: ArtifactRecord) => {
      if (updated.resourceId === resourceId) {
        setArtifact(updated);
      }
    };
    const remove = window.electron.on('artifact:updated', handler);
    return () => remove?.();
  }, [resourceId]);

  // Handle postMessage from iframe for state persistence
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (!artifact) return;
      if (event.data?.type === 'dome:state:update') {
        const newData = event.data.payload;
        const currentState = (artifact.state ?? {}) as Record<string, unknown>;
        const updatedState = { ...currentState, data: newData };
        try {
          const result = await window.electron.artifacts.update({ resourceId, state: updatedState });
          if (result.success && result.data) {
            setArtifact(result.data);
          }
        } catch {
          // state update failure is non-fatal; iframe continues working
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [artifact, resourceId]);

  // Push theme updates to iframe when CSS vars may have changed
  useEffect(() => {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: 'dome:theme:update', vars: getDomeCssVars() },
      '*',
    );
  }, [artifact]);

  const handleExport = useCallback(async () => {
    await window.electron.artifacts.export(resourceId);
  }, [resourceId]);

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
      <DomeSubpageHeader
        title={
          <span className="flex items-center gap-2">
            <Layers className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
            <span style={{ color: 'var(--primary-text)' }}>{artifact.title}</span>
          </span>
        }
        trailing={
          <button
            onClick={handleExport}
            title={t('artifacts.export_artifact')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
            style={{
              color: 'var(--secondary-text)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            <Download className="w-3.5 h-3.5" />
            {t('artifacts.export_artifact')}
          </button>
        }
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        <iframe
          ref={iframeRef}
          key={`${resourceId}-${artifact.version}`}
          srcDoc={buildSrcdoc(artifact)}
          sandbox="allow-scripts allow-same-origin"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
          }}
          title={artifact.title}
        />
      </div>
    </div>
  );
}
