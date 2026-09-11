const MAX_PAGE_TEXT = 32_000;
const MAX_SELECTION = 50_000;
const MAX_SECTION_TEXT = 4_000;
const MAX_SECTIONS = 16;

export type PageHeading = { index: number; text: string };
export type PageSection = { heading: string; text: string };

function readableRoot(doc: Document): HTMLElement | null {
  return (
    doc.querySelector('main') ||
    doc.querySelector('article') ||
    doc.body
  );
}

function normalizeSpace(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function cloneReadableRoot(doc: Document): HTMLElement | null {
  const root = readableRoot(doc);
  if (!root) return null;
  const clone = root.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      'script, style, nav, aside, footer, noscript, [hidden], [aria-hidden="true"]',
    )
    .forEach((node) => node.remove());
  return clone;
}

export function getSelectionText(): string {
  return String(globalThis.getSelection?.()?.toString() || '')
    .trim()
    .slice(0, MAX_SELECTION);
}

export function getReadableText(doc: Document = document): string {
  const root = cloneReadableRoot(doc);
  const text = normalizeSpace(
    String(root?.innerText || root?.textContent || doc.body?.innerText || ''),
  );
  return text.slice(0, MAX_PAGE_TEXT);
}

export function getHeadings(doc: Document = document): PageHeading[] {
  const root = readableRoot(doc);
  if (!root) return [];
  return Array.from(root.querySelectorAll('h1, h2, h3'))
    .map((el) => normalizeSpace((el.textContent || '').replace(/\s+/g, ' ')).slice(0, 160))
    .filter(Boolean)
    .slice(0, 80)
    .map((text, index) => ({ index, text }));
}

export function getSections(doc: Document = document): PageSection[] {
  const root = readableRoot(doc);
  if (!root) return [];
  const headings = Array.from(root.querySelectorAll('h2'));
  const seen = new Set<string>();
  const sections: PageSection[] = [];
  for (let i = 0; i < headings.length && sections.length < MAX_SECTIONS; i++) {
    const heading = headings[i];
    const title = normalizeSpace(
      (heading.textContent || '').replace(/\s+/g, ' '),
    ).slice(0, 160);
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const sectionEl = heading.closest('section');
    const shared =
      sectionEl &&
      headings.some(
        (other, index) => index !== i && other.closest('section') === sectionEl,
      );
    let body = '';
    if (sectionEl && !shared) {
      const clone = sectionEl.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('script, style, nav, button, [aria-hidden="true"]').forEach((node) =>
        node.remove(),
      );
      body = normalizeSpace(clone.innerText || clone.textContent || '');
      if (body.toLowerCase().startsWith(key)) {
        body = body.slice(title.length).trim();
      }
    } else {
      const end = headings[i + 1];
      const parts: string[] = [];
      let node: ChildNode | null = heading.nextSibling;
      while (node && node !== end) {
        if (node instanceof HTMLElement) {
          const piece = normalizeSpace(
            (node.innerText || node.textContent || '').replace(/\s+/g, ' '),
          );
          if (piece) parts.push(piece);
        }
        node = node.nextSibling;
      }
      body = parts.join('\n');
    }
    if (body) sections.push({ heading: title, text: body.slice(0, MAX_SECTION_TEXT) });
  }
  return sections;
}

export function getPageSnapshot(doc: Document = document, href = location.href) {
  return {
    url: href,
    title: doc.title || href,
    selection: getSelectionText(),
    readableText: getReadableText(doc),
    headings: getHeadings(doc),
    sections: getSections(doc),
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
