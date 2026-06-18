// design-sync bundle stub for `@/lib/i18n`. The real module uses Vite's
// `import.meta.glob` to load locale files, which throws in a plain IIFE and
// aborts the whole bundle. This stub initializes i18next minimally (no glob)
// so react-i18next's useTranslation renders (missing keys fall back to the key
// text) without pulling Vite-only macros. design-sync build only.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
// Real Spanish translations merged from packages/i18n/locales/es/*.json (no glob).
// Regenerate via the node snippet in NOTES.md if locales change.
import esTranslation from './i18n-es.json';

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    lng: 'es',
    fallbackLng: 'es',
    resources: { es: { translation: esTranslation as Record<string, unknown> } },
    interpolation: { escapeValue: false },
  });
}

export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'pt'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export function mapAppLocaleToSupported(_raw: string): SupportedLanguage | null { return null; }
export async function reconcileLanguageWithOsIfNeeded(): Promise<void> {}
export function changeLanguage(lang: string): void { i18n.changeLanguage(lang); }
export function getCurrentLanguage(): string { return 'es'; }
export function getDateTimeLocaleTag(): string { return 'es-ES'; }
export function getDateFnsLocale(): undefined { return undefined; }
export default i18n;
