import { describe, expect, it } from 'vitest';
import {
  formatEmailPinLabel,
  formatSocialPostPinLabel,
  normalizePinnedResource,
  stripPinnedMentionTokens,
  truncatePinLabel,
} from './pinLabels';

describe('formatSocialPostPinLabel', () => {
  it('prefers campaign over status and body', () => {
    expect(
      formatSocialPostPinLabel({
        provider: 'linkedin',
        status: 'draft',
        campaign: 'Lanzamiento Q3',
        fallbackTitle: 'En Dome solo hay un paso manual para crear una feature…',
      }),
    ).toBe('LinkedIn · Lanzamiento Q3');
  });

  it('falls back to provider · status', () => {
    expect(
      formatSocialPostPinLabel({ provider: 'instagram', status: 'scheduled' }),
    ).toBe('Instagram · scheduled');
  });

  it('ignores long prose fallback titles', () => {
    expect(
      formatSocialPostPinLabel({
        provider: 'x',
        fallbackTitle: 'En Dome solo hay un paso manual para crear una feature: escribir el prompt',
      }),
    ).toBe('X · post');
  });
});

describe('formatEmailPinLabel', () => {
  it('truncates long subjects', () => {
    const label = formatEmailPinLabel('A'.repeat(80));
    expect(label.endsWith('…')).toBe(true);
    expect(label.length).toBeLessThanOrEqual(48);
  });
});

describe('normalizePinnedResource', () => {
  it('rewrites social pins that used body as title', () => {
    const pin = normalizePinnedResource({
      id: 'sp-1',
      title: 'En Dome solo hay un paso manual para crear una feature: escribir el prompt',
      type: 'social_post',
      kind: 'social_post',
      meta: { provider: 'linkedin', status: 'draft' },
    });
    expect(pin.title).toBe('LinkedIn · draft');
  });

  it('keeps campaign names for social_campaign', () => {
    const pin = normalizePinnedResource({
      id: 'c1',
      title: 'Growth May',
      type: 'social_campaign',
      kind: 'social_post',
      meta: { campaign: 'Growth May' },
    });
    expect(pin.title).toBe('Growth May');
  });
});

describe('truncatePinLabel', () => {
  it('collapses whitespace', () => {
    expect(truncatePinLabel('  hello   world  ')).toBe('hello world');
  });
});

describe('stripPinnedMentionTokens', () => {
  it('removes typed social mentions already shown as chips', () => {
    const content =
      '[@LinkedIn · draft](social:sp-abc) revisa este post';
    expect(stripPinnedMentionTokens(content, [{ id: 'sp-abc' }])).toBe('revisa este post');
  });
});
