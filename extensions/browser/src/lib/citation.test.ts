import { describe, expect, it } from 'vitest';
import { formatWebCitation } from './citation';

describe('formatWebCitation', () => {
  it('quotes the excerpt with title, url and ISO date', () => {
    const md = formatWebCitation({
      text: 'Hello\nworld',
      title: 'Page [1]',
      url: 'https://example.com/a',
      capturedAt: Date.parse('2026-03-01T12:00:00Z'),
    });
    expect(md).toContain('> Hello');
    expect(md).toContain('> world');
    expect(md).toContain('[Page \\[1\\]](https://example.com/a)');
    expect(md).toContain('(2026-03-01)');
  });

  it('returns empty for blank text', () => {
    expect(formatWebCitation({ text: '  ' })).toBe('');
  });
});
