import { isLanguage } from '@linguacall/i18n';
import type { Language } from '@linguacall/i18n';

const LANGUAGE_KEY = 'linguacall.language';
const MEDIA_KEY = 'linguacall.media';

export type MediaPreferences = {
  cameraId?: string;
  microphoneId?: string;
};

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

export function loadMediaPreferences(): MediaPreferences {
  const store = storage();
  if (store === null) return {};
  const raw = store.getItem(MEDIA_KEY);
  if (raw === null) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const preferences: MediaPreferences = {};
    if (typeof parsed['cameraId'] === 'string') preferences.cameraId = parsed['cameraId'];
    if (typeof parsed['microphoneId'] === 'string') {
      preferences.microphoneId = parsed['microphoneId'];
    }
    return preferences;
  } catch {
    return {};
  }
}

export function saveMediaPreferences(preferences: MediaPreferences): void {
  const store = storage();
  if (store === null) return;
  store.setItem(MEDIA_KEY, JSON.stringify(preferences));
}
