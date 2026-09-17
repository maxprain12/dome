import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  decodeEntities,
  parseProfileCounts,
  parsePostOgMetrics,
  parsePostOgPublishedAt,
  cleanProfileName,
  mediaIdToShortcode,
  extractPublicPostsFromHtml,
  extractPublicProfileFromHtml,
  extractProfileAvatarFromHtml,
} = require('../social/social-public-html.cjs');

describe('social public html', () => {
  it('decodes numeric entities and profile counts from Instagram OG', () => {
    const title = decodeEntities('Manychat (&#064;manychat) &#x2022; Instagram photos and videos');
    assert.equal(cleanProfileName(title, 'manychat'), 'Manychat');
    const counts = parseProfileCounts('655K Followers, 667 Following, 1,328 Posts - See Instagram photos');
    assert.equal(counts.followers, 655000);
    assert.equal(counts.following, 667);
    assert.equal(counts.postsCount, 1328);
  });

  it('extracts public reel view counts from embedded JSON', () => {
    const html = `<script type="application/json">${JSON.stringify({
      code: 'AbCdef12345',
      like_count: 42,
      play_count: 9800,
      is_video: true,
      caption: { text: 'Launch hook' },
      owner: { username: 'manychat', full_name: 'Manychat' },
    })}</script>`;
    const posts = extractPublicPostsFromHtml(html, 'instagram');
    assert.equal(posts.length, 1);
    assert.equal(posts[0].metrics.impressions, 9800);
    assert.equal(posts[0].metrics.likes, 42);
    assert.match(posts[0].url, /\/reel\/AbCdef12345\//);
    assert.equal(posts[0].body, 'Launch hook');
    assert.equal(posts[0].format, 'reel');
  });

  it('maps Polar logged-out timeline nodes to carousel and reel without inventing metrics', () => {
    assert.equal(mediaIdToShortcode('3986134798359736850'), 'DdRmHrLDjIS');
    const html = `<script type="application/json">${JSON.stringify({
      data: {
        xig_user_by_igid_v2: {
          full_name: 'Manychat',
          username: 'manychat',
          biography: 'Automation by creators',
          follower_count: 655662,
          following_count: 651,
          profile_pic_url: 'https://scontent.cdninstagram.com/v/t51.2885-19/hd.jpg',
          polaris_timeline_connection: {
            edges: [
              {
                node: {
                  __typename: 'XIGPolarisCarouselMedia',
                  pk: '3986134798359736850',
                  product_type: 'carousel_container',
                  media_type: 8,
                  caption: { text: 'Dream job carousel' },
                  image_versions2: { candidates: [{ url: 'https://scontent.cdninstagram.com/v/carousel.jpg' }] },
                },
              },
              {
                node: {
                  __typename: 'XIGPolarisVideoMedia',
                  pk: '3983597535263528305',
                  product_type: 'clips',
                  media_type: 2,
                  caption: { text: 'Plot twist reel' },
                  image_versions2: { candidates: [{ url: 'https://scontent.cdninstagram.com/v/reel.jpg' }] },
                },
              },
            ],
          },
        },
      },
    })}</script>`;
    const posts = extractPublicPostsFromHtml(html, 'instagram');
    assert.equal(posts.length, 2);
    assert.equal(posts[0].format, 'carousel');
    assert.match(posts[0].url, /\/p\/DdRmHrLDjIS\//);
    assert.equal(posts[0].metrics, null);
    assert.ok(posts[0].limitations.includes('metrics_unavailable'));
    assert.equal(posts[1].format, 'reel');
    assert.match(posts[1].url, /\/reel\//);
    const profile = extractPublicProfileFromHtml(html);
    assert.equal(profile.followers, 655662);
    assert.equal(profile.following, 651);
    assert.equal(profile.name, 'Manychat');
    assert.equal(profile.biography, 'Automation by creators');
  });

  it('extracts a public Instagram profile picture from page JSON', () => {
    const html = `<script type="application/json">${JSON.stringify({
      username: 'dome_ia',
      full_name: 'Dome',
      profile_pic_url_hd: 'https://scontent.cdninstagram.com/v/t51.2885-19/hd.jpg',
    })}</script>
    <meta property="og:image" content="https://example.com/og.jpg" />`;
    assert.equal(
      extractProfileAvatarFromHtml(html),
      'https://scontent.cdninstagram.com/v/t51.2885-19/hd.jpg',
    );
  });

  it('parses likes and comments from a post OG description without inventing views', () => {
    const metrics = parsePostOgMetrics('105 likes, 8 comments - manychat on September 16, 2025: "Launch hook"');
    assert.equal(metrics.likes, 105);
    assert.equal(metrics.comments, 8);
    assert.equal(metrics.impressions, undefined);
    assert.equal(parsePostOgPublishedAt('105 likes, 8 comments - manychat on September 16, 2025: "Launch hook"'), Date.parse('September 16, 2025'));
    assert.equal(parsePostOgMetrics('655K Followers, 667 Following, 1,328 Posts - See Instagram photos'), null);
    const reel = parsePostOgMetrics('12.4k likes, 90 comments - 1.2m views');
    assert.equal(reel.likes, 12400);
    assert.equal(reel.impressions, 1200000);
  });
});
