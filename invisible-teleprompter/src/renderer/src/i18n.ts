import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import ja from './locales/ja.json'
import en from './locales/en.json'

// 拡張時はここに追加 → SUPPORTED_LNGS に ID 追加 → locales に <code>.json を置く
export const SUPPORTED_LNGS = ['ja', 'en'] as const
export type SupportedLng = (typeof SUPPORTED_LNGS)[number]

export const LANGUAGE_LABELS: Record<SupportedLng, string> = {
  ja: '日本語',
  en: 'English',
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ja: { translation: ja },
      en: { translation: en },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LNGS as unknown as string[],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  })

export default i18n
