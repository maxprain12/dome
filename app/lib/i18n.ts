import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { enUS, es as esFns, fr as frFns, ptBR } from 'date-fns/locale';
import type { Locale as DateFnsLocale } from 'date-fns';
import {
  SUPPORTED_LANGUAGES,
  defaultLanguage,
  type SupportedLanguage,
} from '@dome/i18n';

const LANG_KEY = 'dome:language';

// Re-export from the package so consumers that import from `app/lib/i18n`
// keep working with the same public API.
export { SUPPORTED_LANGUAGES };
export type { SupportedLanguage };

function mapLocaleTagToSupported(raw: string): SupportedLanguage | null {
  const normalized = raw.toLowerCase().replace(/_/g, '-');
  const primary = normalized.split('-')[0];
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(primary)) {
    return primary as SupportedLanguage;
  }
  return null;
}

// TODO: Verify if mapAppLocaleToSupported is used - appears unused
export function mapAppLocaleToSupported(raw: string): SupportedLanguage | null {
  return mapLocaleTagToSupported(raw);
}

function getInitialLanguage(): string {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
      return stored;
    }
  } catch { /* ignore */ }
  if (typeof navigator !== 'undefined') {
    const tag = navigator.languages?.[0] || navigator.language;
    if (tag) {
      const mapped = mapLocaleTagToSupported(tag);
      if (mapped) return mapped;
    }
  }
  return defaultLanguage;
}

/** If the user has not chosen a language, prefer Electron OS locale over Chromium navigator. */
export async function reconcileLanguageWithOsIfNeeded(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(LANG_KEY)) return;
  } catch {
    return;
  }
  const invoke = window.electron?.invoke;
  if (!invoke) return;
  try {
    const locale = await invoke('system:get-app-locale');
    if (typeof locale !== 'string' || !locale) return;
    const mapped = mapLocaleTagToSupported(locale);
    if (!mapped) return;
    changeLanguage(mapped);
  } catch {
    /* ignore */
  }
}

/**
 * Eagerly load every locale JSON shipped with `@dome/i18n`. Vite inlines
 * these as part of the renderer bundle, so there is no runtime `fs` cost.
 */
const localeModules = import.meta.glob<Record<string, unknown>>(
  '../../packages/i18n/locales/*/*.json',
  { eager: true, import: 'default' },
);

function buildResources(): Record<SupportedLanguage, { translation: Record<string, unknown> }> {
  const perLang: Record<SupportedLanguage, Record<string, Record<string, unknown>>> = {
    en: {},
    es: {},
    fr: {},
    pt: {},
  };
  for (const [path, mod] of Object.entries(localeModules)) {
    const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
    if (!match) continue;
    const lang = match[1] as SupportedLanguage;
    const ns = match[2];
    if (!perLang[lang]) continue;
    perLang[lang][ns] = mod as Record<string, unknown>;
  }
  const out: Record<SupportedLanguage, { translation: Record<string, unknown> }> = {
    en: { translation: {} },
    es: { translation: {} },
    fr: { translation: {} },
    pt: { translation: {} },
  };
  for (const lang of Object.keys(perLang) as SupportedLanguage[]) {
    // Nest each namespace under its own key so i18next resolves the
    // original dot-separated paths (`t('common.loading')`,
    // `t('agent.active')`, …). The previous version spread the namespace
    // contents to the top level with `Object.assign`, which destroyed the
    // namespace parent — breaking every `t('ns.key')` lookup and silently
    // overwriting same-named leaf keys across namespaces (e.g. `title` in
    // both `agents` and `calendarPage`). The original `app/lib/i18n.ts`
    // wired `translation: { common: {...}, agent: {...}, ... }`, which is
    // exactly the per-namespace nesting reconstructed here.
    const merged: Record<string, unknown> = {};
    for (const ns of Object.keys(perLang[lang])) {
      merged[ns] = perLang[lang][ns];
    }
    out[lang].translation = merged;
  }
  return out;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
i18n
  .use(initReactI18next)
  .init({
    lng: getInitialLanguage(),
    fallbackLng: defaultLanguage,
    // Resources come from `@dome/i18n`'s locale JSON files (Phase 5
    // extraction: previously these were 13k lines of inline objects; now
    // they live in `packages/i18n/locales/<lang>/<namespace>.json`).
    resources: buildResources(),
    interpolation: {
      escapeValue: false,
    },
  });

export function changeLanguage(lang: string): void {
  i18n.changeLanguage(lang);
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch { /* ignore */ }
}

export function getCurrentLanguage(): string {
  return i18n.language || defaultLanguage;
}

/** BCP 47 tag for `Intl` / `toLocaleString` from the active app language. */
export function getDateTimeLocaleTag(): string {
  const lang = (getCurrentLanguage().split('-')[0] || defaultLanguage) as SupportedLanguage;
  const map: Record<SupportedLanguage, string> = {
    en: 'en-US',
    es: 'es',
    fr: 'fr-FR',
    pt: 'pt-BR',
  };
  return map[lang] ?? defaultLanguage;
}

/** date-fns `format` locale from the active app language. */
export function getDateFnsLocale(): DateFnsLocale {
  const lang = (getCurrentLanguage().split('-')[0] || defaultLanguage) as SupportedLanguage;
  const map: Record<SupportedLanguage, DateFnsLocale> = {
    en: enUS,
    es: esFns,
    fr: frFns,
    pt: ptBR,
  };
  return map[lang] ?? esFns;
}

export default i18n;
