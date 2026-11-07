import { describe, expect, it } from 'bun:test';
import {
  createPrototypeManifest,
  resolveCapabilities,
  supportsLanguage,
  supportsPair,
} from './capabilities';
import type { AsrEngine, MtEngine, TtsEngine } from './types';

describe('capability manifest', () => {
  it('declares the MVP languages and pairs', () => {
    const manifest = createPrototypeManifest();
    expect(supportsLanguage(manifest, 'ru')).toBe(true);
    expect(supportsLanguage(manifest, 'en')).toBe(true);
    expect(supportsPair(manifest, 'ru', 'en')).toBe(true);
    expect(supportsPair(manifest, 'en', 'ru')).toBe(true);
  });

  it('rejects unsupported pairs', () => {
    const manifest = createPrototypeManifest();
    expect(supportsPair(manifest, 'ru', 'ru')).toBe(false);
    expect(supportsPair(manifest, 'en', 'en')).toBe(false);
  });

  it('reports which engines are available', () => {
    const manifest = createPrototypeManifest();
    const asr: AsrEngine = {
      id: 'test-asr',
      languages: ['ru'],
      start: async () => {},
      stop: async () => {},
    };
    const mt: MtEngine = {
      id: 'test-mt',
      pairs: [['ru', 'en']],
      supports: (from, to) => from === 'ru' && to === 'en',
      translate: async (text) => text,
    };
    const tts: TtsEngine = {
      id: 'test-tts',
      languages: ['en'],
      supports: (language) => language === 'en',
      speak: async () => {},
      cancel: () => {},
    };

    expect(resolveCapabilities(manifest, { asr, mt, tts })).toEqual({
      asr: true,
      mt: true,
      tts: true,
    });
    expect(resolveCapabilities(manifest, { asr: null, mt: null, tts: null })).toEqual({
      asr: false,
      mt: false,
      tts: false,
    });
  });
});
