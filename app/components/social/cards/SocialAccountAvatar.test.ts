import { describe, expect, it } from 'vitest';
import { socialInitials, usableAvatarSrc } from './SocialAccountAvatar';

describe('SocialAccountAvatar helpers', () => {
  it('accepts cached data URLs and https avatars', () => {
    expect(usableAvatarSrc('data:image/jpeg;base64,/9j/4AAQ')).toMatch(/^data:image\/jpeg/);
    expect(usableAvatarSrc('https://scontent.cdninstagram.com/a.jpg')).toContain('cdninstagram');
    expect(usableAvatarSrc('javascript:alert(1)')).toBeUndefined();
  });

  it('builds initials from a display name', () => {
    expect(socialInitials('Alder V. Obando')).toBe('AV');
    expect(socialInitials('@dome_ia')).toBe('DO');
  });
});
