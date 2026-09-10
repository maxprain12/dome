import { describe, expect, it } from 'vitest';
import { extractContact, detectMediaKind } from './extractors';

function htmlDoc(html: string): Document {
  const doc = document.implementation.createHTMLDocument('page');
  doc.documentElement.innerHTML = html;
  return doc;
}

describe('extractContact', () => {
  it('reads a LinkedIn profile from /in/{handle} plus Open Graph', () => {
    const doc = htmlDoc(`
      <head>
        <meta property="og:title" content="Ada Lovelace | LinkedIn" />
        <meta property="og:image" content="https://media.licdn.com/ada.jpg" />
        <meta property="og:description" content="Mathematician at Analytical Engine" />
      </head><body></body>
    `);
    const contact = extractContact(doc, 'https://www.linkedin.com/in/ada-lovelace/');
    expect(contact?.source).toBe('social_linkedin');
    expect(contact?.externalId).toBe('ada-lovelace');
    expect(contact?.displayName).toBe('Ada Lovelace');
    expect(contact?.avatarUrl).toContain('ada.jpg');
  });

  it('reads Instagram and X handles and skips non-profile paths', () => {
    const ig = extractContact(htmlDoc('<head><title>@ada</title></head>'), 'https://www.instagram.com/ada.lovelace/');
    expect(ig?.source).toBe('social_instagram');
    expect(ig?.externalId).toBe('ada.lovelace');

    const x = extractContact(htmlDoc('<head><meta property="og:title" content="Ada (@ada)" /></head>'), 'https://x.com/ada');
    expect(x?.source).toBe('social_x');
    expect(x?.displayLabel).toBe('@ada');

    expect(extractContact(htmlDoc(''), 'https://www.linkedin.com/feed/')).toBeNull();
    expect(extractContact(htmlDoc(''), 'https://www.instagram.com/p/ABC123/')).toBeNull();
    expect(extractContact(htmlDoc(''), 'https://x.com/i/status/1')).toBeNull();
  });

  it('does not turn articles, lookalike domains or social posts into people', () => {
    const article = htmlDoc('<head><meta property="og:title" content="Our Economic Future" /></head>');
    expect(extractContact(article, 'https://anthropic.com/institute/econ-scenarios')).toBeNull();
    expect(extractContact(article, 'https://notlinkedin.com/in/ada')).toBeNull();
    expect(extractContact(article, 'https://x.com/ada/status/123')).toBeNull();
    expect(extractContact(article, 'https://www.linkedin.com/in/ada/details/experience/')).toBeNull();
  });

  it('falls back to JSON-LD Person and a website identity', () => {
    const doc = htmlDoc(`
      <head>
        <script type="application/ld+json">{"@type":"Person","name":"Ada Lovelace","image":"https://example.com/a.png","description":"Writer"}</script>
      </head>
    `);
    const contact = extractContact(doc, 'https://example.com/people/ada');
    expect(contact?.source).toBe('website');
    expect(contact?.displayName).toBe('Ada Lovelace');
    expect(contact?.externalId).toBe('example.com/people/ada');
  });
});

describe('detectMediaKind', () => {
  it('classifies youtube, video hosts and articles', () => {
    expect(detectMediaKind('https://www.youtube.com/watch?v=abcdefghijk')).toBe('youtube');
    expect(detectMediaKind('https://youtu.be/abcdefghijk')).toBe('youtube');
    expect(detectMediaKind('https://vimeo.com/123')).toBe('video');
    expect(detectMediaKind('https://cdn.example.com/talk.mp4')).toBe('video');
    expect(detectMediaKind('https://example.com/blog/post')).toBe('article');
  });
});
