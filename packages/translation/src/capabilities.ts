import type { Language } from '@linguacall/i18n';
import type { AsrEngine, MtEngine, TtsEngine } from './types';

export type EngineCapabilities = {
  asr: ReadonlyArray<{ id: string; languages: readonly Language[] }>;
  mt: ReadonlyArray<{ id: string; pairs: ReadonlyArray<readonly [Language, Language]> }>;
  tts: ReadonlyArray<{ id: string; languages: readonly Language[] }>;
};

export type CapabilityManifest = {
  languages: readonly Language[];
  /** Translation pairs that the prototype is expected to support. */
  pairs: ReadonlyArray<readonly [Language, Language]>;
  engines: EngineCapabilities;
};

/** The MVP manifest (P5P). Prototype engines are browser built-ins (D22). */
export function createPrototypeManifest(): CapabilityManifest {
  return {
    languages: ['ru', 'en'],
    pairs: [
      ['ru', 'en'],
      ['en', 'ru'],
    ],
    engines: {
      asr: [{ id: 'web-speech', languages: ['ru', 'en'] }],
      mt: [
        {
          id: 'chrome-translator',
          pairs: [
            ['ru', 'en'],
            ['en', 'ru'],
          ],
        },
      ],
      tts: [{ id: 'web-speech-synthesis', languages: ['ru', 'en'] }],
    },
  };
}

export function supportsPair(
  manifest: CapabilityManifest,
  source: Language,
  target: Language,
): boolean {
  return manifest.pairs.some(([from, to]) => from === source && to === target);
}

export function supportsLanguage(manifest: CapabilityManifest, language: Language): boolean {
  return manifest.languages.includes(language);
}

export function resolveCapabilities(
  manifest: CapabilityManifest,
  engines: { asr: AsrEngine | null; mt: MtEngine | null; tts: TtsEngine | null },
): { asr: boolean; mt: boolean; tts: boolean } {
  return {
    asr: engines.asr !== null && engines.asr.languages.length > 0,
    mt:
      engines.mt !== null &&
      engines.mt.pairs.some(([from, to]) => supportsPair(manifest, from, to)),
    tts: engines.tts !== null && engines.tts.languages.length > 0,
  };
}
