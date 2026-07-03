import { useEffect, useRef, useState } from 'react';

/**
 * Artifact frame loading (issue #465).
 *
 * `srcdoc` iframes inherit the embedding document's CSP. In packaged builds the
 * renderer CSP is `script-src 'self'`, so every inline <script> of an artifact
 * was silently blocked — artifacts rendered empty in production while working
 * in dev (whose CSP allows 'unsafe-inline'). A <meta> CSP inside the srcdoc
 * cannot fix this: meta policies only tighten, never relax, the inherited one.
 *
 * Fix: register the frame document with the main process and load it from
 * `app://artifact/<token>`, a real URL served with its own dedicated CSP
 * (`ARTIFACT_FRAME_CSP` in electron/core/csp.cjs). The iframe keeps
 * `sandbox="allow-scripts …"` (no allow-same-origin), so the document stays in
 * an opaque origin with no access to app internals.
 *
 * Outside Electron (browser-shim dev mode) we fall back to `srcdoc`, which
 * works there because the dev server imposes no strict CSP.
 */

export interface ArtifactFrameSource {
  /** `app://artifact/<token>` once registered; null while pending or in fallback. */
  src: string | null;
  /** Document string for the `srcDoc` fallback path (non-Electron / IPC failure). */
  fallbackSrcdoc: string | null;
}

function isElectronRuntime(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');
}

/**
 * Register `documentHtml` as a served artifact frame and return its URL.
 * Re-registers whenever the document changes and releases stale tokens.
 */
export function useArtifactFrameSrc(documentHtml: string | null): ArtifactFrameSource {
  const [source, setSource] = useState<ArtifactFrameSource>({ src: null, fallbackSrcdoc: null });
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const releasePrevious = () => {
      const token = tokenRef.current;
      tokenRef.current = null;
      if (token) {
        void window.electron?.invoke?.('artifact:frame:release', token)?.catch?.(() => {});
      }
    };

    if (!documentHtml || !documentHtml.trim()) {
      releasePrevious();
      setSource({ src: null, fallbackSrcdoc: null });
      return;
    }

    if (!isElectronRuntime() || !window.electron?.invoke) {
      releasePrevious();
      setSource({ src: null, fallbackSrcdoc: documentHtml });
      return;
    }

    (async () => {
      try {
        const res = await window.electron.invoke('artifact:frame:register', { html: documentHtml });
        if (cancelled) {
          if (res?.success && res.data?.token) {
            void window.electron.invoke('artifact:frame:release', res.data.token).catch(() => {});
          }
          return;
        }
        releasePrevious();
        if (res?.success && res.data?.url) {
          tokenRef.current = res.data.token;
          setSource({ src: res.data.url, fallbackSrcdoc: null });
        } else {
          setSource({ src: null, fallbackSrcdoc: documentHtml });
        }
      } catch {
        if (!cancelled) setSource({ src: null, fallbackSrcdoc: documentHtml });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentHtml]);

  // Release the last token on unmount.
  useEffect(() => {
    return () => {
      const token = tokenRef.current;
      tokenRef.current = null;
      if (token) {
        void window.electron?.invoke?.('artifact:frame:release', token)?.catch?.(() => {});
      }
    };
  }, []);

  return source;
}

/**
 * Renderer copy of `electron/artifacts/artifact-html-normalize.cjs`:
 * artifacts saved BEFORE write-time normalization may still hold a full
 * document in `state.html`; nesting it inside the frame wrapper produces
 * invalid markup and drops <head> styles. Extract body + hoist head styles.
 */
export function normalizeArtifactBodyHtml(html: string): { body: string; css: string } {
  const input = String(html ?? '');
  if (!/<!doctype\s|<html[\s>]/i.test(input)) {
    return { body: input, css: '' };
  }

  const headMatch = input.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headContent = headMatch ? headMatch[1] : '';
  const css = [...headContent.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean)
    .join('\n\n');

  const bodyMatch = input.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch
    ? bodyMatch[1].trim()
    : input
        .replace(/<!doctype[^>]*>/gi, '')
        .replace(/<\/?html[^>]*>/gi, '')
        .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
        .replace(/<\/?body[^>]*>/gi, '')
        .trim();

  return { body, css };
}
