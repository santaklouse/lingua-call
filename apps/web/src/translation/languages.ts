import type { Language } from '@linguacall/i18n';

/** The other MVP language; used until the peer reports its own language. */
export function otherLanguage(language: Language): Language {
  return language === 'ru' ? 'en' : 'ru';
}
