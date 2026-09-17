import { describe, expect, it } from 'vitest';
import { coversFromPosts } from './socialCoverSrc';

describe('coversFromPosts', () => {
  it('dedupes the same image served with different query strings', () => {
    const covers = coversFromPosts([
      { format: 'reel', media: [{ type: 'reel', thumbnailUrl: 'https://cdn.example/a.jpg?oh=1' }] },
      { format: 'reel', media: [{ type: 'reel', thumbnailUrl: 'https://cdn.example/a.jpg?oh=2' }] },
      { format: 'image', media: [{ type: 'image', url: 'https://cdn.example/b.jpg' }] },
    ]);
    expect(covers).toEqual([
      'https://cdn.example/a.jpg?oh=1',
      'https://cdn.example/b.jpg',
    ]);
  });

  it('does not pad empty mosaic slots', () => {
    const covers = coversFromPosts([
      { format: 'reel', media: [{ type: 'reel', thumbnailUrl: 'https://cdn.example/only.jpg' }] },
    ]);
    expect(covers).toHaveLength(1);
  });
});
