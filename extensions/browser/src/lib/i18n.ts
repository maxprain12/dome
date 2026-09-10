import { createInstance } from 'i18next';
import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import pt from '../locales/pt.json';
import enNotes from '../../../../packages/i18n/locales/en/notes.json';
import esNotes from '../../../../packages/i18n/locales/es/notes.json';
import frNotes from '../../../../packages/i18n/locales/fr/notes.json';
import ptNotes from '../../../../packages/i18n/locales/pt/notes.json';

// A dedicated instance keeps the host page and Desktop's application state isolated.
export const extensionI18n = createInstance();
export function initializeI18n(language = browser.i18n.getUILanguage()) {
  return extensionI18n.init({
    lng: language.split('-')[0],
    fallbackLng: 'es',
    supportedLngs: ['en', 'es', 'fr', 'pt'],
    resources: {
      en: { translation: { ...en, notes: enNotes } },
      es: { translation: { ...es, notes: esNotes } },
      fr: { translation: { ...fr, notes: frNotes } },
      pt: { translation: { ...pt, notes: ptNotes } },
    },
    interpolation: { escapeValue: false },
  });
}
