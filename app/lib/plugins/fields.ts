import type { PluginFieldValues, PluginHostContext } from '@/types/plugin';

export function slugifyPluginTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export function pluginSelectOptionLabel(fieldId: string, option: string, locale: string): string {
  if (fieldId === 'language' && option) {
    try {
      const label = new Intl.DisplayNames([locale], { type: 'language' }).of(option);
      if (label) return label;
    } catch {
      // Use the capitalized option when the locale has no language name.
    }
  }
  if (!option) return option;
  return `${option.charAt(0).toUpperCase()}${option.slice(1)}`;
}

export function cmsDestinationPath(
  destination: PluginHostContext['destination'],
  fields: PluginFieldValues,
): string | null {
  const slug = fieldScalar(fields, 'slug');
  if (!slug || !destination) return null;
  const collection = fieldScalar(fields, 'collection');
  const language = fieldScalar(fields, 'language');
  const mapped = destination.contentPaths?.[`${collection}/${language}`];
  const folder = (mapped || destination.pathPrefix || '').replace(/\/$/, '');
  if (!folder) return null;
  return `${folder}/${slug}.md`;
}

export function fieldScalar(fields: PluginFieldValues, id: string): string {
  const value = fields[id];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export function publicEntryUrl(
  destination: PluginHostContext['destination'],
  fields: PluginFieldValues,
): string | null {
  if (!destination?.siteUrl) return null;
  const siteUrl = destination.siteUrl.replace(/\/+$/, '');
  const slug = fieldScalar(fields, 'slug');
  if (!slug || !siteUrl) return null;
  const pattern = destination.sitePathPattern || '/{collection}/{slug}';
  const resolved = pattern
    .replace(/\{collection\}/g, fieldScalar(fields, 'collection'))
    .replace(/\{language\}/g, fieldScalar(fields, 'language'))
    .replace(/\{slug\}/g, slug);
  if (!resolved.startsWith('/') || resolved.includes('..')) return null;
  return `${siteUrl}${resolved}`;
}

export function siblingLanguageKeys(
  contentPaths: Record<string, string> | undefined,
  collection: string,
  language: string,
): string[] {
  if (!contentPaths || !collection) return [];
  const prefix = `${collection}/`;
  return Object.keys(contentPaths)
    .filter((key) => key.startsWith(prefix) && key !== `${prefix}${language}`)
    .map((key) => key.slice(prefix.length))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

export function hasLocalMedia(markdown: string, fields: PluginFieldValues): boolean {
  const values = [markdown, ...Object.values(fields).map((value) => (Array.isArray(value) ? value.join(' ') : value || ''))];
  return values.some((value) => /(?:blob:|data:|https?:\/\/localhost(?:[:/]|$)|https?:\/\/127\.0\.0\.1)/i.test(value));
}
