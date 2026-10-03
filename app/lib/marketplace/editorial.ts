import catalog from './complements-catalog.json';

export type ComplementCategory = 'plugins' | 'agents' | 'workflows' | 'skills' | 'mcp';
export function complementEditorial(category: ComplementCategory, id: string, language: string) {
  const item = catalog.items.find((entry) => entry.category === category && entry.id === id);
  if (!item) return null;
  const locale = language.split('-')[0] as keyof typeof item.locales;
  return { ...item, copy: item.locales[locale] ?? item.locales.en };
}
