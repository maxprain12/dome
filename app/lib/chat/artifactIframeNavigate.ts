/** postMessage protocol for sandboxed artifact iframes → parent opens external URLs. */
export const DOME_ARTIFACT_MSG = 'dome-artifact';

/** Inline boot script: intercept `<a>`, `data-href`, and `window.open` inside sandboxed iframes. */
export function buildArtifactNavigateBootScript(extraJs = ''): string {
  return `
(function() {
  function postNavigate(href) {
    if (!href || !window.parent) return;
    try {
      window.parent.postMessage({ type: '${DOME_ARTIFACT_MSG}', kind: 'navigate', href: String(href) }, '*');
    } catch (e) {}
  }
  document.addEventListener('click', function(ev) {
    var el = ev.target;
    while (el && el !== document.body) {
      if (el.tagName === 'A' && el.href) {
        ev.preventDefault();
        postNavigate(el.href);
        return;
      }
      var dataHref = el.getAttribute && (el.getAttribute('data-href') || el.getAttribute('data-external-href'));
      if (dataHref) {
        ev.preventDefault();
        postNavigate(dataHref);
        return;
      }
      el = el.parentElement;
    }
  }, true);
  window.open = function(url) {
    postNavigate(url);
    return null;
  };
  ${extraJs}
})();`.trim();
}

export function handleArtifactNavigateMessage(
  ev: MessageEvent,
  iframeWindow: Window | null | undefined,
  onNavigate: (href: string) => void,
): boolean {
  if (ev.source !== iframeWindow) return false;
  const d = ev.data as { type?: string; kind?: string; href?: string } | null;
  if (!d || d.type !== DOME_ARTIFACT_MSG || d.kind !== 'navigate') return false;
  if (typeof d.href === 'string' && d.href.trim()) {
    onNavigate(d.href.trim());
  }
  return true;
}

export function openArtifactExternalUrl(href: string): void {
  void window.electron?.invoke?.('open-external-url', href).catch(() => {});
}
