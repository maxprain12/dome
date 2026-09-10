const MAX_PAGE_TEXT = 24_000;
const MAX_SELECTION = 50_000;

export function getSelectionText(): string {
  return String(globalThis.getSelection?.()?.toString() || '')
    .trim()
    .slice(0, MAX_SELECTION);
}

export function getReadableText(doc: Document = document): string {
  const article = doc.querySelector('article');
  const root = article || doc.body;
  const text = String(root?.innerText || doc.body?.innerText || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.slice(0, MAX_PAGE_TEXT);
}

export function getPageSnapshot(doc: Document = document, href = location.href) {
  return {
    url: href,
    title: doc.title || href,
    selection: getSelectionText(),
    readableText: getReadableText(doc),
  };
}

/** Temporary session highlight; not restored when the page is revisited. */
export function highlightCurrentSelection(doc: Document = document): void {
  const selection = globalThis.getSelection?.();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const mark = doc.createElement('mark');
  mark.setAttribute('data-dome-highlight', '1');
  mark.style.background = 'rgba(216, 196, 160, 0.45)';
  try {
    range.surroundContents(mark);
  } catch {
    /* overlapping ranges — citation still saved */
  }
}
