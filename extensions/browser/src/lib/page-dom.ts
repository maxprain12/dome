/** Traverse only rendered DOM that the page itself can access. Never cross an origin boundary. */
export type PageRoot = { root: Document | ShadowRoot; frames: HTMLIFrameElement[] };
const EXCLUDED = 'script, style, noscript, template, [hidden], [inert], [aria-hidden="true"], dome-capture-panel, [data-dome-agent-ui]';

export function rendered(node: Element): boolean {
  let current: Element | null = node;
  while (current) {
    if (current.matches(EXCLUDED)) return false;
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse' || style?.opacity === '0') return false;
    current = current.parentElement || (current.getRootNode() as ShadowRoot).host || null;
  }
  return true;
}

export function inViewport(node: Element): boolean {
  const rect = node.getBoundingClientRect();
  const win = node.ownerDocument.defaultView;
  if (!win || rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.right <= 0 || rect.top >= win.innerHeight || rect.left >= win.innerWidth) return false;
  // Dashboard panes often clip content inside their own scrollers.
  let parent = node.parentElement;
  while (parent) {
    const style = win.getComputedStyle(parent);
    if (/(auto|scroll|hidden|clip)/.test(`${style.overflow} ${style.overflowY} ${style.overflowX}`)) {
      const box = parent.getBoundingClientRect();
      if (rect.bottom <= box.top || rect.top >= box.bottom || rect.right <= box.left || rect.left >= box.right) return false;
    }
    parent = parent.parentElement;
  }
  return true;
}

export function pageRoots(doc: Document) {
  const roots: PageRoot[] = [];
  const limitations: string[] = [];
  const visit = (root: Document | ShadowRoot, frames: HTMLIFrameElement[]) => {
    if (roots.length >= 32) {
      limitations.push('Document traversal limit reached. Snapshot is partial.');
      return;
    }
    roots.push({ root, frames });
    for (const node of root.querySelectorAll('*')) {
      if (!rendered(node)) continue;
      if (node.shadowRoot) visit(node.shadowRoot, frames);
      if (node.tagName !== 'IFRAME') continue;
      const frame = node as HTMLIFrameElement;
      try {
        const child = frame.contentDocument;
        if (child?.documentElement && frames.length < 5) visit(child, [...frames, frame]);
        else limitations.push(`Embedded frame unavailable: ${frame.title || frame.getAttribute('src') || 'untitled'}. Use a screenshot or open its URL.`);
      } catch {
        limitations.push(`Embedded frame unavailable: ${frame.title || 'cross-origin'}. Use a screenshot or open its URL.`);
      }
    }
  };
  visit(doc, []);
  if (roots.some(({ root }) => Array.from(root.querySelectorAll('canvas')).some(rendered))) limitations.push('Canvas graphics require a screenshot; DOM text cannot describe their pixels.');
  return { roots, limitations: [...new Set(limitations)].slice(0, 16) };
}

export function liveText(root: Node, viewportOnly = false, limit = 32000): string {
  const doc = root.ownerDocument || root as Document;
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */);
  const parts: string[] = [];
  let size = 0;
  while (walker.nextNode() && size < limit) {
    const text = walker.currentNode;
    const parent = text.parentElement;
    if (!parent || !rendered(parent) || (viewportOnly && !inViewport(parent))) continue;
    const value = (text.textContent || '').replace(/\s+/g, ' ').trim();
    if (value) { parts.push(value); size += value.length + 1; }
  }
  return parts.join('\n').slice(0, limit);
}
