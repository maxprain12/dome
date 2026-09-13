import { liveText, pageRoots, rendered, inViewport } from './page-dom';
const MAX_PAGE_TEXT = 32_000;
const MAX_SELECTION = 50_000;
const MAX_SECTION_TEXT = 4_000;
const MAX_SECTIONS = 16;

export type PageHeading = { index: number; text: string };
export type PageSection = { heading: string; text: string };

function readableRoot(doc: Document): HTMLElement | null {
  return (
    Array.from(doc.querySelectorAll('main')).find(rendered) ||
    Array.from(doc.querySelectorAll('article')).find(rendered) ||
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

export function getSelectionText(): string {
  return String(globalThis.getSelection?.()?.toString() || '')
    .trim()
    .slice(0, MAX_SELECTION);
}

export function getReadableText(doc: Document = document): string {
  return pageRoots(doc).roots.map(({ root }) =>
    liveText(root.nodeType === 9 ? readableRoot(root as Document) || root : root),
  ).filter(Boolean).join('\n\n').slice(0, MAX_PAGE_TEXT);
}

export function getHeadings(doc: Document = document): PageHeading[] {
  const root = readableRoot(doc);
  if (!root) return [];
  return pageRoots(doc).roots.flatMap(({ root: scope }) => Array.from(scope.querySelectorAll('h1, h2, h3, [role=heading]'))).filter(rendered)
    .map((el) => normalizeSpace((el.textContent || '').replace(/\s+/g, ' ')).slice(0, 160))
    .filter(Boolean)
    .slice(0, 80)
    .map((text, index) => ({ index, text }));
}

export function getSections(doc: Document = document): PageSection[] {
  const root = readableRoot(doc);
  if (!root) return [];
  const headings = pageRoots(doc).roots.flatMap(({ root: scope }) => Array.from(scope.querySelectorAll('h2'))).filter(rendered);
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
      body = normalizeSpace(liveText(sectionEl));
      if (body.toLowerCase().startsWith(key)) {
        body = body.slice(title.length).trim();
      }
    } else {
      const end = headings[i + 1];
      const parts: string[] = [];
      let node: ChildNode | null = heading.nextSibling;
      while (node && node !== end) {
        if (node.nodeType === 1 && rendered(node as Element)) {
          const piece = normalizeSpace(
            liveText(node).replace(/\s+/g, ' '),
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
  const { roots, limitations } = pageRoots(doc);
  const viewportText = roots.filter(({ frames }) => frames.every(inViewport))
    .map(({ root }) => liveText(root, true, 16000)).filter(Boolean).join('\n\n').slice(0, 16000);
  const tables = roots.flatMap(({ root }) => Array.from(root.querySelectorAll('table, [role=grid], [role=table]')))
    .filter(rendered).slice(0, 8).map((table) => ({
      label: table.getAttribute('aria-label') || table.querySelector('caption')?.textContent || '',
      inViewport: inViewport(table),
      rows: Array.from(table.querySelectorAll('tr, [role=row]')).filter(rendered).slice(0, 30).map((row) =>
        Array.from(row.querySelectorAll('th, td, [role=cell], [role=gridcell], [role=columnheader]')).filter(rendered).slice(0, 16).map((cell) => liveText(cell, false, 300))),
    }));
  return {
    capturedAt: new Date().toISOString(),
    viewportText,
    viewport: { width: doc.defaultView?.innerWidth, height: doc.defaultView?.innerHeight, scrollX: doc.defaultView?.scrollX, scrollY: doc.defaultView?.scrollY },
    tables,
    limitations,
    coverage: 'Rendered DOM, same-origin frames and open shadow roots. Text may include content outside the viewport; use viewportText for what is on screen. Tables are limited to 8 tables / 30 rows / 16 columns. Closed shadow roots and cross-origin frame contents are unavailable.',
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
