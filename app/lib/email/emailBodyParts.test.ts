import { describe, expect, it } from 'vitest';
import { injectEmailContainment, wrapEmailHtml } from './emailBodyParts';

describe('wrapEmailHtml / injectEmailContainment', () => {
  it('injects containment into HTML fragments', () => {
    const out = wrapEmailHtml('<p>Hello</p><table width="600"><tr><td>x</td></tr></table>');
    expect(out).toContain('dome-email-contain');
    expect(out).toContain('max-width: 100%');
    expect(out).toContain('<p>Hello</p>');
  });

  it('injects containment into full HTML documents that previously skipped styles', () => {
    const doc = '<!doctype html><html><head><title>x</title></head><body><table width="600"><tr><td>wide</td></tr></table></body></html>';
    const out = wrapEmailHtml(doc);
    expect(out).toContain('dome-email-contain');
    expect(out).toContain('name="viewport"');
    expect(out).toContain('wide');
  });

  it('does not double-inject containment', () => {
    const once = injectEmailContainment('<html><head></head><body>a</body></html>');
    const twice = injectEmailContainment(once);
    expect(twice.match(/dome-email-contain/g)?.length).toBe(1);
  });
});
