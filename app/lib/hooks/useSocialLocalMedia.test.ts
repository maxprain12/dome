import { describe, expect, it } from 'vitest';
import { socialPreviewRequest, socialStoragePath } from './useSocialLocalMedia';

describe('socialPreviewRequest', () => {
  it('uses a local path or vault id before a cloud storage path', () => {
    expect(socialStoragePath('social-media/u1/a.jpg')).toBe('social-media/u1/a.jpg');
    expect(socialStoragePath('https://cdn.example.test/a.jpg')).toBeUndefined();
    expect(socialPreviewRequest({ path: '/tmp/a.jpg', url: 'social-media/u1/a.jpg' })).toEqual({
      path: '/tmp/a.jpg',
      resourceId: undefined,
      storagePath: 'social-media/u1/a.jpg',
    });
    expect(socialPreviewRequest({ resourceId: 'res-1' }, 'social-media/u1/b.jpg')).toEqual({
      path: undefined,
      resourceId: 'res-1',
      storagePath: 'social-media/u1/b.jpg',
    });
  });
});
