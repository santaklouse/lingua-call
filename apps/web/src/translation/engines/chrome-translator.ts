import type { Language } from '@linguacall/i18n';
import type { MtEngine } from '@linguacall/translation';
import { UnsupportedEngineError } from './errors';

type TranslatorAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';
type TranslatorInstance = {
  translate(text: string): Promise<string>;
  destroy?(): void;
};
type TranslatorStatic = {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<TranslatorAvailability>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: unknown) => void;
  }): Promise<TranslatorInstance>;
};

function translatorApi(): TranslatorStatic | null {
  const scope = globalThis as unknown as {
    Translator?: TranslatorStatic;
    ai?: { translator?: TranslatorStatic };
  };
  return scope.Translator ?? scope.ai?.translator ?? null;
}

export function isChromeTranslatorSupported(): boolean {
  return translatorApi() !== null;
}

/**
 * Chrome/Edge built-in Translator API (prototype, D22): on-device translation
 * with no server. Firefox/Safari do not expose it yet, which is why the UI shows
 * a clear fallback state instead of failing silently.
 */
export function createChromeTranslator(): MtEngine {
  const api = translatorApi();
  if (api === null) throw new UnsupportedEngineError('Chrome Translator API');

  const cache = new Map<string, Promise<TranslatorInstance>>();
  const pairs: ReadonlyArray<readonly [Language, Language]> = [
    ['ru', 'en'],
    ['en', 'ru'],
  ];

  const instance = (source: Language, target: Language): Promise<TranslatorInstance> => {
    const key = `${source}->${target}`;
    const existing = cache.get(key);
    if (existing !== undefined) return existing;
    const created = api
      .create({ sourceLanguage: source, targetLanguage: target })
      .then(async (translator) => {
        const availability = await api.availability({ sourceLanguage: source, targetLanguage: target });
        if (availability === 'unavailable') {
          throw new Error(`Translation ${source}->${target} is unavailable`);
        }
        return translator;
      })
      .catch((error) => {
        cache.delete(key);
        throw error;
      });
    cache.set(key, created);
    return created;
  };

  return {
    id: 'chrome-translator',
    pairs,
    supports: (source, target) => pairs.some(([from, to]) => from === source && to === target),
    async translate(text, source, target) {
      const translator = await instance(source, target);
      return translator.translate(text);
    },
  };
}
