import { slugifyPluginTitle } from '@/lib/plugins/fields';

export interface AdaptedCmsEntry {
  title: string;
  description: string;
  slug: string;
  body: string;
}

const bodyInstructions = [
  'Translate the entire body, including headings, paragraphs, lists, quotes and image alt text. Do not copy source-language prose into the target body.',
  'Preserve Markdown syntax, code, URLs, dome-media: references and /media/ paths exactly; translate human-readable text around them.',
  'If the body contains no translatable prose, preserve it unchanged.',
];

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
    ...bodyInstructions,
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
    ...bodyInstructions,
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

/** A copied body is not a translation when it contains human-readable prose. */
export function hasUntranslatedBody(sourceBody: string, translatedBody: string): boolean {
  if (sourceBody.trim() !== translatedBody.trim()) return false;
  const prose = sourceBody
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/https?:\/\/\S+|dome-media:\S+|\/media\/\S+/g, '');
  return /\p{L}{4,}/u.test(prose);
}

function hasChangedMediaReferences(sourceBody: string, translatedBody: string): boolean {
  const refs = (body: string) => Array.from(body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g), (match) => match[1]);
  return JSON.stringify(refs(sourceBody)) !== JSON.stringify(refs(translatedBody));
}

export async function generateCmsTranslations(
  input: Parameters<typeof adaptationBatchPrompt>[0],
  generate: (prompt: string) => Promise<string>,
): Promise<Array<AdaptedCmsEntry & { language: string }>> {
  const translations = parseAdaptedBatch(
    await generate(adaptationBatchPrompt(input)),
    input.targets,
    input.title,
  );
  for (const translation of translations) {
    if (!hasUntranslatedBody(input.body, translation.body) && !hasChangedMediaReferences(input.body, translation.body)) continue;
    const retry = parseAdaptedEntry(await generate(adaptationPrompt({
      targetLanguage: translation.language,
      title: input.title,
      description: input.description,
      slug: input.slug,
      body: input.body,
    })), input.title);
    if (hasUntranslatedBody(input.body, retry.body)) throw new Error('ADAPT_UNTRANSLATED');
    if (hasChangedMediaReferences(input.body, retry.body)) throw new Error('ADAPT_MEDIA_CHANGED');
    Object.assign(translation, retry);
  }
  return translations;
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
