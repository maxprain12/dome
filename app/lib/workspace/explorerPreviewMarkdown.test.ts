import { describe, expect, it } from 'vitest';
import { prepareNotePreviewMarkdown } from './explorerPreviewMarkdown';

describe('prepareNotePreviewMarkdown', () => {
  it('keeps normal markdown headings and body', () => {
    const md = prepareNotePreviewMarkdown('## Idea / brief\n\njhjhj\n');
    expect(md).toBe('## Idea / brief\n\njhjhj');
  });

  it('turns leaked HTML breaks into markdown line breaks', () => {
    const md = prepareNotePreviewMarkdown('## Enlaces\n<br />\nDome');
    expect(md).toContain('## Enlaces');
    expect(md).not.toMatch(/<br/i);
    expect(md).toContain('Dome');
  });

  it('converts an HTML fragment into markdown', () => {
    const md = prepareNotePreviewMarkdown('<h2>Enlaces</h2><p>Dome</p>');
    expect(md).not.toMatch(/<h2|<p/i);
    expect(md).toMatch(/Enlaces/);
    expect(md).toMatch(/Dome/);
  });

  it('strips YAML frontmatter', () => {
    const md = prepareNotePreviewMarkdown('---\ntitle: X\n---\n# Hello\n');
    expect(md).toBe('# Hello');
  });
});
