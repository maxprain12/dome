import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Minimal i18n setup — all strings are already in Spanish in the components
i18n
  .use(initReactI18next)
  .init({
    lng: 'es',
    fallbackLng: 'es',
    resources: {
      es: {
        translation: {},
      },
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
