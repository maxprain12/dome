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

it('excludes CSS-hidden dashboard history instead of reading a detached clone', () => {
  document.body.innerHTML = '<style>.old-view{display:none}</style><main><section class="old-view">Old notifications</section><section><h1>Vulnerabilities</h1><p>87 pending</p></section><p style="visibility:hidden">Secret history</p></main>';
  expect(getReadableText(document)).toContain('87 pending');
  expect(getReadableText(document)).not.toMatch(/Old notifications|Secret history/);
  document.body.innerHTML = '';
});

it('reads same-origin embedded dashboards and open shadow content', () => {
  document.body.innerHTML = '<main><h1>Dashboard shell</h1><iframe title="Metrics"></iframe><div id="widget"></div></main>';
  const frame = document.querySelector('iframe')!.contentDocument!;
  frame.body.innerHTML = '<h1>Vulnerabilities</h1><table><tr><th>Asset</th><th>Pending</th></tr><tr><td>Turbine</td><td>87</td></tr></table>';
  document.querySelector('#widget')!.attachShadow({ mode: 'open' }).innerHTML = '<p>Mitigation overview</p>';
  const text = getReadableText(document);
  expect(text).toContain('Vulnerabilities');
  expect(text).toContain('Turbine\n87');
  expect(text).toContain('Mitigation overview');
  expect(getHeadings(document).map((heading) => heading.text)).toContain('Vulnerabilities');
  document.body.innerHTML = '';
});
