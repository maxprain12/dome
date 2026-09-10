import type { ContactDraft, IdentitySource } from './protocol';

const SKIP_PATHS = new Set([
  'home',
  'search',
  'explore',
  'reels',
  'stories',
  'p',
  'reel',
  'i',
  'intent',
  'hashtag',
  'share',
  'login',
  'signup',
  'about',
  'jobs',
  'feed',
  'mynetwork',
  'messaging',
  'notifications',
  'company',
  'school',
  'in',
]);

function metaContent(doc: Document, key: string): string {
  const el =
    doc.querySelector(`meta[property="${key}"]`) ||
    doc.querySelector(`meta[name="${key}"]`);
  return (el?.getAttribute('content') || '').trim();
}

function firstHandle(pathname: string, requiredPrefix?: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (requiredPrefix) {
    if (parts[0] !== requiredPrefix || !parts[1] || parts.length !== 2) return '';
    return parts[1].replace(/^@/, '').split('?')[0];
  }
  if (parts.length !== 1) return '';
  const candidate = (parts[0] || '').replace(/^@/, '');
  if (!candidate || SKIP_PATHS.has(candidate.toLowerCase())) return '';
  return candidate;
}

function jsonLdPeople(doc: Document): Array<{ name?: string; image?: string; description?: string; url?: string }> {
  const out: Array<{ name?: string; image?: string; description?: string; url?: string }> = [];
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent || 'null');
      const items = Array.isArray(parsed) ? parsed : parsed?.['@graph'] ? parsed['@graph'] : [parsed];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const type = item['@type'];
        const isPerson = type === 'Person' || (Array.isArray(type) && type.includes('Person'));
        if (!isPerson) continue;
        out.push({
          name: typeof item.name === 'string' ? item.name : undefined,
          image: typeof item.image === 'string' ? item.image : item.image?.url,
          description: typeof item.description === 'string' ? item.description : undefined,
          url: typeof item.url === 'string' ? item.url : undefined,
        });
      }
    } catch {
      /* ignore broken JSON-LD */
    }
  }
  return out;
}

function sourceFromHost(host: string): { source: IdentitySource; prefix?: string } | null {
  if ((host === 'linkedin.com' || host.endsWith('.linkedin.com'))) return { source: 'social_linkedin', prefix: 'in' };
  if ((host === 'instagram.com' || host.endsWith('.instagram.com'))) return { source: 'social_instagram' };
  if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) return { source: 'social_x' };
  return null;
}

export function extractContact(doc: Document, pageUrl: string): ContactDraft | null {
  let parsed: URL;
  try {
    parsed = new URL(pageUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
  const social = sourceFromHost(host);
  const ld = jsonLdPeople(doc)[0];
  const ogTitle = metaContent(doc, 'og:title') || doc.title || '';
  const ogImage = metaContent(doc, 'og:image');
  const ogDesc = metaContent(doc, 'og:description') || metaContent(doc, 'description');

  if (social) {
    const handle = firstHandle(parsed.pathname, social.prefix);
    if (!handle) return null;
    const displayName =
      (ld?.name || ogTitle.replace(/\s*[|\-–].*$/, '').replace(/\(@.*\)$/, '').trim() || handle).trim();
    return {
      displayName,
      source: social.source,
      externalId: handle.toLowerCase(),
      displayLabel: `@${handle.replace(/^@/, '')}`,
      avatarUrl: ld?.image || ogImage || undefined,
      notes: (ld?.description || ogDesc || '').slice(0, 4000) || undefined,
      profile: { headline: ogDesc || undefined, handle },
      pageUrl: parsed.href,
    };
  }

  // Article metadata describes the page, not a person. Require an explicit Person.
  if (!ld?.name) return null;
  const websiteId = `${parsed.host}${parsed.pathname}`.replace(/\/$/, '').toLowerCase();
  const displayName = (ld?.name || ogTitle || host).trim();
  if (!displayName) return null;
  return {
    displayName,
    source: 'website',
    externalId: websiteId,
    displayLabel: host,
    avatarUrl: ld?.image || ogImage || undefined,
    notes: (ld?.description || ogDesc || '').slice(0, 4000) || undefined,
    profile: { website: parsed.href },
    pageUrl: parsed.href,
  };
}

export function detectMediaKind(url: string): 'youtube' | 'video' | 'article' {
  if (/(?:youtube\.com\/(?:watch|embed|shorts)|youtu\.be\/)/i.test(url)) return 'youtube';
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url) || /vimeo\.com/i.test(url)) return 'video';
  return 'article';
}
