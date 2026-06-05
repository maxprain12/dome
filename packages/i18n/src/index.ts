// @dome/i18n public API
// Translations, split by language × namespace. This is the ONE package
// the renderer is allowed to import as runtime (not just types).
//
// Phase 5: every key from the previous `app/lib/i18n.ts` lives in
// `packages/i18n/locales/<lang>/<namespace>.json`. The barrel below exposes
// the supported-language list and the default language; the actual JSON
// resources are loaded directly by the consumer (the renderer) using Vite's
// `import.meta.glob` so they are inlined into the bundle. Keeping the glob
// at the consumer site (rather than inside the package) avoids having
// `@dome/i18n` depend on Vite's bundler-mode extensions in its own build
// pipeline.

export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'pt'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const defaultLanguage: SupportedLanguage = 'es';
