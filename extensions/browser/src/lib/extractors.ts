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
  'settings',
  'features',
  'pricing',
  'orgs',
  'topics',
  'collections',
  'marketplace',
  'sponsors',
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
    if (parts[0] !== requiredPrefix || !parts[1] || parts.length !== 2)
      return '';
    return parts[1].replace(/^@/, '').split('?')[0];
  }
  if (parts.length !== 1) return '';
  const candidate = (parts[0] || '').replace(/^@/, '');
  if (!candidate || SKIP_PATHS.has(candidate.toLowerCase())) return '';
  return candidate;
}

function jsonLdPeople(doc: Document): Array<{
  name?: string;
  image?: string;
  description?: string;
  url?: string;
  jobTitle?: string;
  email?: string;
  telephone?: string;
  worksFor?: string;
  location?: string;
}> {
  const out: Array<{
    name?: string;
    image?: string;
    description?: string;
    url?: string;
    jobTitle?: string;
    email?: string;
    telephone?: string;
    worksFor?: string;
    location?: string;
  }> = [];
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent || 'null');
      const items = Array.isArray(parsed)
        ? parsed
        : parsed?.['@graph']
          ? parsed['@graph']
          : [parsed];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const type = item['@type'];
        const isPerson =
          type === 'Person' || (Array.isArray(type) && type.includes('Person'));
        if (!isPerson) continue;
        out.push({
          jobTitle:
            typeof item.jobTitle === 'string' ? item.jobTitle : undefined,
          email:
            typeof item.email === 'string'
              ? item.email.replace(/^mailto:/, '')
              : undefined,
          telephone:
            typeof item.telephone === 'string' ? item.telephone : undefined,
          worksFor:
            typeof item.worksFor?.name === 'string'
              ? item.worksFor.name
              : undefined,
          location:
            typeof item.address?.addressLocality === 'string'
              ? item.address.addressLocality
              : undefined,
          name: typeof item.name === 'string' ? item.name : undefined,
          image: typeof item.image === 'string' ? item.image : item.image?.url,
          description:
            typeof item.description === 'string' ? item.description : undefined,
          url: typeof item.url === 'string' ? item.url : undefined,
        });
      }
    } catch {
      /* ignore broken JSON-LD */
    }
  }
  return out;
}

function sourceFromHost(
  host: string,
): { source: IdentitySource; prefix?: string } | null {
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com'))
    return { source: 'social_linkedin', prefix: 'in' };
  if (host === 'instagram.com' || host.endsWith('.instagram.com'))
    return { source: 'social_instagram' };
  if (
    host === 'x.com' ||
    host.endsWith('.x.com') ||
    host === 'twitter.com' ||
    host.endsWith('.twitter.com')
  )
    return { source: 'social_x' };
  if (host === 'github.com') return { source: 'github' };
  return null;
}

function cleanText(element: Element | null, limit = 6000): string {
  if (!element) return '';
  const clone = element.cloneNode(true) as Element;
  clone
    .querySelectorAll(
      'script, style, nav, aside, [aria-hidden="true"], [hidden], button',
    )
    .forEach((node) => node.remove());
  return (clone.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim()
    .slice(0, limit);
}

function normalizeHeading(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const LINKEDIN_SECTIONS: Record<string, string[]> = {
  about: ['about', 'acerca de', 'info', 'informacion'],
  experience: ['experience', 'experiencia'],
  education: ['education', 'educacion', 'formacion academica', 'formacion'],
  skills: ['skills', 'aptitudes'],
  certifications: [
    'licenses and certifications',
    'licencias y certificaciones',
    'certifications',
    'certificaciones',
    'licenses',
    'licencias',
  ],
  projects: ['projects', 'proyectos'],
  services: ['services', 'servicios'],
  languages: ['languages', 'idiomas'],
};

function headingMatches(text: string, aliases: string[]): boolean {
  const normalized = normalizeHeading(text);
  if (!normalized) return false;
  return aliases.some(
    (alias) => normalized === alias || normalized.startsWith(`${alias} `),
  );
}

function findSectionByHeading(
  root: ParentNode,
  aliases: string[],
): Element | null {
  for (const heading of root.querySelectorAll('h2, h3')) {
    if (!headingMatches(heading.textContent || '', aliases)) continue;
    return heading.closest('section') || heading.parentElement;
  }
  return null;
}

function firstBetween(
  start: Element | null,
  end: Element | null,
  selector: string,
  scope: ParentNode,
): Element | null {
  if (!start) return scope.querySelector(selector);
  for (const node of scope.querySelectorAll(selector)) {
    const afterStart =
      (start.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !==
      0;
    if (!afterStart) continue;
    if (end) {
      const afterEnd =
        (end.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !==
        0;
      if (afterEnd) continue;
    }
    return node;
  }
  return null;
}

function looksLikeSocialChrome(text: string): boolean {
  return /\d[\d.,]*\s*(\+|k)?\s*(followers?|conexiones|connections|seguidores)/i.test(
    text,
  );
}
function extractProfileFacts(
  doc: Document,
  source?: IdentitySource,
): Record<string, string> {
  const root = doc.querySelector('main') || doc;
  const text = (selectors: string, scope: ParentNode = root) =>
    cleanText(scope.querySelector(selectors));
  const attr = (
    selectors: string,
    attribute: string,
    scope: ParentNode = root,
  ) => scope.querySelector(selectors)?.getAttribute(attribute) || '';
  const facts: Record<string, string> = {};
  let profile: ParentNode = root;
  if (source === 'social_linkedin') {
    const name = root.querySelector('h1');
    const firstH2 = root.querySelector('h2');
    profile =
      name?.closest('section') ||
      name?.parentElement ||
      doc.createElement('div');
    facts.name = cleanText(name, 200);
    const headlineEl =
      firstBetween(
        name,
        firstH2,
        '.text-body-medium.break-words, [data-anonymize="headline"], .top-card-layout__headline, .text-body-medium',
        root,
      ) ||
      profile.querySelector(
        '.text-body-medium, [data-anonymize="headline"], .top-card-layout__headline',
      );
    facts.headline = cleanText(headlineEl, 400);
    facts.location = text(
      '.text-body-small.inline.t-black--light, [data-anonymize="location"], .top-card-layout__first-subline',
      profile,
    );
    if (!facts.location) {
      facts.location = cleanText(
        firstBetween(
          name,
          firstH2,
          '.text-body-small.inline.t-black--light, [data-anonymize="location"]',
          root,
        ),
        200,
      );
    }
    facts.company = text(
      '[data-field="experience_company_logo"] [aria-hidden="true"], [aria-label*="Current company"]',
      profile,
    );
    facts.avatar = attr(
      'img.pv-top-card-profile-picture__image--show, img.profile-photo-edit__preview, img.top-card-layout__entity-image',
      'src',
      profile,
    );
    const sections: Record<string, string[]> = {
      about: ['about', 'summary'],
      experience: ['experience'],
      education: ['education'],
      skills: ['skills'],
      certifications: ['licenses_and_certifications', 'certifications'],
      languages: ['languages'],
      projects: ['projects'],
      services: ['services'],
    };
    for (const [field, ids] of Object.entries(sections)) {
      for (const id of ids) {
        const anchor = root.querySelector(`[id="${id}"]`);
        const section = anchor?.closest('section');
        if (section) {
          facts[field] = cleanText(section);
          break;
        }
      }
      if (!facts[field]) {
        const byHeading = findSectionByHeading(
          root,
          LINKEDIN_SECTIONS[field] || ids,
        );
        if (byHeading) facts[field] = cleanText(byHeading);
      }
    }
    if (
      !facts.about &&
      !facts.experience &&
      !facts.education &&
      !facts.projects
    ) {
      facts.extractionNote =
        'Profile chrome loaded, but About/Experience/Education were empty. Scroll those headings into view and extract again.';
    }
    // LinkedIn's explicit contact-info dialog belongs to this profile; recommendations do not.
    const dialog = doc.querySelector(
      '[role="dialog"] .pv-contact-info, .artdeco-modal .pv-contact-info',
    );
    if (dialog) {
      facts.email = attr('a[href^="mailto:"]', 'href', dialog)
        .replace(/^mailto:/, '')
        .split('?')[0];
      facts.phone = attr('a[href^="tel:"]', 'href', dialog).replace(
        /^tel:/,
        '',
      );
      facts.website = attr(
        '.pv-contact-info__contact-type a[href^="http"]',
        'href',
        dialog,
      );
    }
  } else if (source === 'github') {
    profile =
      doc.querySelector('.js-profile-editable-area') ||
      doc.querySelector('.h-card') ||
      doc.createElement('div');
    facts.name = text('[itemprop="name"]', profile);
    facts.about = text('.p-note, [data-bio-text]', profile);
    facts.headline = facts.about;
    facts.company = text('[itemprop="worksFor"]', profile);
    facts.location = text('[itemprop="homeLocation"]', profile);
    facts.website = attr('[itemprop="url"]', 'href', profile);
    facts.avatar = attr('img.avatar-user', 'src', profile);
  } else if (source === 'social_x') {
    facts.name = text('[data-testid="UserName"] > div:first-child')
      .split('@')[0]
      .trim();
    facts.about = text('[data-testid="UserDescription"]');
    facts.location = text('[data-testid="UserLocation"]');
    facts.website = attr('[data-testid="UserUrl"] a', 'href');
    profile = root.querySelector('[data-testid="primaryColumn"]') || root;
  } else if (source === 'social_instagram') {
    profile = root.querySelector('header') || root;
    facts.name = text('h1', profile);
    facts.about = text('[data-testid="user-bio"]', profile);
  }
  facts.email ||= attr('a[href^="mailto:"]', 'href', profile)
    .replace(/^mailto:/, '')
    .split('?')[0];
  facts.phone ||= attr('a[href^="tel:"]', 'href', profile).replace(/^tel:/, '');
  // Only expose actual links from the selected profile region.
  const links = Array.from(profile.querySelectorAll('a[href^="http"]'))
    .map((a) => a.getAttribute('href') || '')
    .filter(
      (href) =>
        !/linkedin\.com\/(?:in|search|feed)|github\.com\/(?:followers|following)/.test(
          href,
        ),
    );
  facts.links = [...new Set(links)].slice(0, 12).join('\n');
  return Object.fromEntries(
    Object.entries(facts).filter(([, value]) => Boolean(value)),
  );
}

export function extractContact(
  doc: Document,
  pageUrl: string,
): ContactDraft | null {
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
  const ogDesc =
    metaContent(doc, 'og:description') || metaContent(doc, 'description');

  const facts = extractProfileFacts(doc, social?.source);
  if (social) {
    const handle = firstHandle(parsed.pathname, social.prefix);
    if (!handle) return null;
    const displayName = (
      facts.name ||
      ld?.name ||
      ogTitle
        .replace(/\s*[|\-–].*$/, '')
        .replace(/\(@.*\)$/, '')
        .trim() ||
      handle
    ).trim();
    const ogHeadline =
      social.source === 'social_linkedin' && looksLikeSocialChrome(ogDesc)
        ? ''
        : social.source === 'social_linkedin'
          ? ogDesc
          : '';
    return {
      displayName,
      source: social.source,
      externalId: handle.toLowerCase(),
      displayLabel: (
        facts.headline ||
        ld?.jobTitle ||
        ogHeadline ||
        `@${handle.replace(/^@/, '')}`
      ).slice(0, 200),
      primaryEmail: facts.email || ld?.email,
      avatarUrl: facts.avatar || ld?.image || ogImage || undefined,
      notes:
        (facts.about ||
          ld?.description ||
          (looksLikeSocialChrome(ogDesc) ? '' : ogDesc) ||
          '').slice(0, 4000) ||
        undefined,
      profile: {
        ...facts,
        name: undefined,
        email: undefined,
        avatar: undefined,
        headline: facts.headline || ld?.jobTitle || (looksLikeSocialChrome(ogDesc) ? '' : ogDesc) || undefined,
        handle,
        sourceUrl: parsed.href,
        extractedAt: new Date().toISOString(),
      },
      pageUrl: parsed.href,
    };
  }

  // Article metadata describes the page, not a person. Require an explicit Person.
  if (!ld?.name) return null;
  const websiteId = `${parsed.host}${parsed.pathname}`
    .replace(/\/$/, '')
    .toLowerCase();
  const displayName = (facts.name || ld?.name || ogTitle || host).trim();
  if (!displayName) return null;
  return {
    displayName,
    source: 'website',
    externalId: websiteId,
    displayLabel: host,
    avatarUrl: ld?.image || ogImage || undefined,
    notes: (ld?.description || ogDesc || '').slice(0, 4000) || undefined,
    primaryEmail: ld.email,
    profile: {
      website: ld.url || parsed.href,
      headline: ld.jobTitle,
      company: ld.worksFor,
      phone: ld.telephone,
      location: ld.location,
      sourceUrl: parsed.href,
      extractedAt: new Date().toISOString(),
    },
    pageUrl: parsed.href,
  };
}

export function detectMediaKind(url: string): 'youtube' | 'video' | 'article' {
  if (/(?:youtube\.com\/(?:watch|embed|shorts)|youtu\.be\/)/i.test(url))
    return 'youtube';
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url) || /vimeo\.com/i.test(url))
    return 'video';
  return 'article';
}
