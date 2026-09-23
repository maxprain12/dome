import { slugifyPluginTitle } from '@/lib/plugins/fields';

export interface AdaptedCmsEntry {
  title: string;
  description: string;
  slug: string;
  body: string;
}

export function adaptationPrompt(input: {
  targetLanguage: string;
  title: string;
  description: string;
  slug: string;
  body: string;
}): string {
  return [
    'Adapt this CMS entry into the target language.',
    'Return ONLY JSON with keys title, description, slug, body.',
    'Keep Markdown structure, links, and image references such as ![alt](dome-media:id) or /media/... unchanged.',
    'Generate a lowercase URL slug in the target language.',
    `Target language: ${input.targetLanguage}`,
    `Source title: ${input.title}`,
    `Source description: ${input.description}`,
    `Source slug: ${input.slug}`,
    'Source body:',
    input.body,
  ].join('\n');
}

export function adaptationBatchPrompt(input: {
  sourceLanguage: string;
  targets: string[];
  title: string;
  description: string;
  slug: string;
  body: string;
}): string {
  return [
    'Adapt this CMS entry into every target language in one response.',
    'Return ONLY JSON: {"translations":[{"language":"en","title":"","description":"","slug":"","body":""}]}',
    'Include one object for each target language, using that language code.',
    'Keep Markdown structure, links, and image references such as ![alt](dome-media:id) or /media/... unchanged.',
    'Generate a lowercase URL slug in each target language.',
    `Source language: ${input.sourceLanguage}`,
    `Target languages: ${input.targets.join(', ')}`,
    `Source title: ${input.title}`,
    `Source description: ${input.description}`,
    `Source slug: ${input.slug}`,
    'Source body:',
    input.body,
  ].join('\n');
}

export function parseAdaptedBatch(
  raw: string,
  targets: string[],
  fallbackTitle: string,
): Array<AdaptedCmsEntry & { language: string }> {
  const match = String(raw || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('ADAPT_PARSE');
  const parsed = JSON.parse(match[0]) as { translations?: unknown };
  const items = Array.isArray(parsed.translations) ? parsed.translations : [];
  return targets.map((language) => {
    const item = items.find((entry) => (
      entry
      && typeof entry === 'object'
      && String((entry as { language?: string }).language || '').trim() === language
    ));
    if (!item) throw new Error('ADAPT_PARSE');
    return { language, ...parseAdaptedEntry(JSON.stringify(item), fallbackTitle) };
  });
}

export function parseAdaptedEntry(raw: string, fallbackTitle: string): AdaptedCmsEntry {
  const match = String(raw || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('ADAPT_PARSE');
  const parsed = JSON.parse(match[0]) as Partial<AdaptedCmsEntry>;
  const title = String(parsed.title || '').trim() || fallbackTitle;
  const description = String(parsed.description || '').trim();
  const body = String(parsed.body || '').trim();
  if (!body) throw new Error('ADAPT_PARSE');
  const slugSource = String(parsed.slug || '').trim() || title;
  const slug = slugifyPluginTitle(slugSource) || slugifyPluginTitle(fallbackTitle);
  return { title, description, slug, body };
}
