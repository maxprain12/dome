import { describe, expect, it } from 'vitest';
import {
  classifyPreviewContent,
  formatMailAddress,
  personContactSnippet,
  previewPlainText,
  sanitizeIssuePreviewMarkdown,
  wrapCmdkPreviewHtml,
} from './commandPalettePreviewBody';

describe('classifyPreviewContent', () => {
  it('treats HTML documents as visual html, not markdown source', () => {
    const classified = classifyPreviewContent(`
      <style>h1{font-family:var(--font-heading)}</style>
      <div class="wrap"><h1>Hallazgos de seguridad</h1></div>
    `);
    expect(classified.html).toContain('<h1>Hallazgos de seguridad</h1>');
    expect(classified.markdown).toBeNull();
    expect(classified.text).toBeNull();
  });

  it('keeps markdown notes as markdown', () => {
    const classified = classifyPreviewContent('# Hallazgos\n\nUn párrafo.');
    expect(classified.markdown).toContain('# Hallazgos');
    expect(classified.html).toBeNull();
  });

  it('turns note HTML fragments into markdown instead of a scaled document', () => {
    const classified = classifyPreviewContent('<p>Enlaces</p><p>Dome</p>');
    expect(classified.html).toBeNull();
    expect(classified.markdown).toMatch(/Enlaces/);
    expect(classified.markdown).toMatch(/Dome/);
  });

  it('does not paint raw from_json as the snippet', () => {
    expect(previewPlainText('{"name":null,"addr":"alder@example.com"}')).toBe('alder@example.com');
    expect(previewPlainText('{"name":"Alder","addr":"alder@example.com"}')).toBe('Alder');
    expect(classifyPreviewContent('{"name":null,"addr":"alder@example.com"}').text).toBe('alder@example.com');
  });
});

describe('formatMailAddress', () => {
  it('parses himalaya from_json objects', () => {
    expect(formatMailAddress({ name: null, addr: 'alder@example.com' })).toEqual({
      name: '',
      email: 'alder@example.com',
      label: 'alder@example.com',
    });
    expect(formatMailAddress('Alder Velásquez <alder@example.com>')).toEqual({
      name: 'Alder Velásquez',
      email: 'alder@example.com',
      label: 'Alder Velásquez',
    });
  });
});

describe('wrapCmdkPreviewHtml', () => {
  it('injects theme tokens into a fragment', () => {
    const doc = wrapCmdkPreviewHtml('<h1>Hola</h1>', '--background: white;');
    expect(doc).toContain('id="dome-theme"');
    expect(doc).toContain(':root{--background: white;}');
    expect(doc).not.toContain(':root{:root');
    expect(doc).toContain('<h1>Hola</h1>');
  });
});

describe('sanitizeIssuePreviewMarkdown', () => {
  it('lifts severity/rule and hides Sonar keys', () => {
    const parsed = sanitizeIssuePreviewMarkdown(`## SonarQube
- **Key**: b3e55473-7f29-4997-9850-d2941f0944ec
- **Rule**: typescript:S3776
- **Severity**: CRITICAL

Reduce complexity.`);
    expect(parsed.severity).toBe('CRITICAL');
    expect(parsed.rule).toBe('typescript:S3776');
    expect(parsed.markdown).toBe('Reduce complexity.');
    expect(parsed.markdown).not.toContain('b3e55473');
  });
});

describe('personContactSnippet', () => {
  it('returns a single email instead of identity dumps', () => {
    expect(personContactSnippet('dome@noreply.github.com email:dome@noreply.github.com')).toBe(
      'dome@noreply.github.com',
    );
  });
});
