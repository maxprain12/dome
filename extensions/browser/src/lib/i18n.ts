import { createInstance } from 'i18next';
import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import pt from '../locales/pt.json';
import enNotes from '../../../../packages/i18n/locales/en/notes.json';
import esNotes from '../../../../packages/i18n/locales/es/notes.json';
import frNotes from '../../../../packages/i18n/locales/fr/notes.json';
import ptNotes from '../../../../packages/i18n/locales/pt/notes.json';
import enMany from '../../../../packages/i18n/locales/en/many.json';
import esMany from '../../../../packages/i18n/locales/es/many.json';
import frMany from '../../../../packages/i18n/locales/fr/many.json';
import ptMany from '../../../../packages/i18n/locales/pt/many.json';
import enChat from '../../../../packages/i18n/locales/en/chat.json';
import esChat from '../../../../packages/i18n/locales/es/chat.json';
import frChat from '../../../../packages/i18n/locales/fr/chat.json';
import ptChat from '../../../../packages/i18n/locales/pt/chat.json';
import enSocial from '../../../../packages/i18n/locales/en/social.json';
import esSocial from '../../../../packages/i18n/locales/es/social.json';
import frSocial from '../../../../packages/i18n/locales/fr/social.json';
import ptSocial from '../../../../packages/i18n/locales/pt/social.json';

// A dedicated instance keeps the host page and Desktop's application state isolated.
export const extensionI18n = createInstance();
export function initializeI18n(language = browser.i18n.getUILanguage()) {
  return extensionI18n.init({
    lng: language.split('-')[0],
    fallbackLng: 'es',
    supportedLngs: ['en', 'es', 'fr', 'pt'],
    resources: {
      en: { translation: { ...en, notes: enNotes, chat: enChat, social: enSocial, many: enMany } },
      es: { translation: { ...es, notes: esNotes, chat: esChat, social: esSocial, many: esMany } },
      fr: { translation: { ...fr, notes: frNotes, chat: frChat, social: frSocial, many: frMany } },
      pt: { translation: { ...pt, notes: ptNotes, chat: ptChat, social: ptSocial, many: ptMany } },
    },
    interpolation: { escapeValue: false },
  });
}
