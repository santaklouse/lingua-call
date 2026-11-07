import { isLanguage } from '@linguacall/i18n';
import type { Language } from '@linguacall/i18n';

const LANGUAGE_KEY = 'linguacall.language';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadLanguage(): Language | null {
  const store = storage();
  if (store === null) return null;
  const value = store.getItem(LANGUAGE_KEY);
  return isLanguage(value) ? value : null;
}

export function saveLanguage(language: Language): void {
  const store = storage();
  if (store === null) return;
  store.setItem(LANGUAGE_KEY, language);
}
