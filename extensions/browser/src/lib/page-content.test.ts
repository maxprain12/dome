import { describe, expect, it } from 'vitest';
import { getHeadings, getReadableText, getSections } from './page-content';

function htmlDoc(html: string): Document {
  const doc = document.implementation.createHTMLDocument('page');
  doc.documentElement.innerHTML = html;
  return doc;
}

describe('page content', () => {
  it('prefers main text over body chrome and keeps section headings', () => {
    const doc = htmlDoc(`<body><nav>Skip</nav><main><h1>Ada</h1><h2>Experiencia</h2><p>Engineer at Analytical Engine</p><h2>Educación</h2><p>Self-taught</p></main><aside>Ads</aside></body>`);
    const text = getReadableText(doc);
    expect(text).toContain('Engineer');
    expect(text).not.toContain('Ads');
    expect(getHeadings(doc).map((item) => item.text)).toEqual([
      'Ada',
      'Experiencia',
      'Educación',
    ]);
    const sections = getSections(doc);
    expect(sections.find((item) => item.heading === 'Experiencia')?.text).toContain(
      'Analytical Engine',
    );
  });
});
