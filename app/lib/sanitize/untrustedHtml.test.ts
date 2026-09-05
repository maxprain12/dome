import { describe, expect, it } from 'vitest';
import { sanitizeUntrustedHtml } from './untrustedHtml';

describe('sanitizeUntrustedHtml', () => {
  it('strips script blocks and event handlers', () => {
    const dirty = '<p onclick="alert(1)">ok</p><script>alert(2)</script>';
    const clean = sanitizeUntrustedHtml(dirty);
    expect(clean).toContain('<p>ok</p>');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onclick');
  });

  it('strips javascript: URLs and iframes', () => {
    const dirty = '<a href="javascript:alert(1)">x</a><iframe src="https://evil"></iframe>';
    const clean = sanitizeUntrustedHtml(dirty);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).not.toContain('iframe');
  });
});
