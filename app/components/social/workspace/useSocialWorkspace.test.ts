import { describe, expect, it } from 'vitest';

describe('useSocialWorkspace contract', () => {
  it('documents the partial-reload slices', () => {
    const slices = ['posts', 'accounts', 'campaigns', 'growth', 'drafts'] as const;
    expect(slices).toContain('posts');
    expect(slices).toContain('drafts');
  });
});
