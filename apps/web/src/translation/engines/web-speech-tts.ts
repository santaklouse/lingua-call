import type { Language } from '@linguacall/i18n';
import type { TtsEngine, TtsOptions } from '@linguacall/translation';
import { LANGUAGE_BCP47 } from './language';
import { UnsupportedEngineError } from './errors';

export function isWebSpeechTtsSupported(): boolean {
  return typeof globalThis.speechSynthesis !== 'undefined' && typeof globalThis.SpeechSynthesisUtterance !== 'undefined';
}

/** Web Speech Synthesis TTS (prototype): uses system voices, no downloads. */
export function createWebSpeechTts(): TtsEngine {
  if (!isWebSpeechTtsSupported()) throw new UnsupportedEngineError('Web Speech Synthesis');

  const languages: readonly Language[] = ['ru', 'en'];

  const pickVoice = (language: Language): SpeechSynthesisVoice | null => {
    const tag = LANGUAGE_BCP47[language].toLowerCase();
    const prefix = tag.split('-')[0] ?? tag;
    const voices = globalThis.speechSynthesis.getVoices();
    return (
      voices.find((voice) => voice.lang.toLowerCase() === tag) ??
      voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix)) ??
      null
    );
  };

  return {
    id: 'web-speech-synthesis',
    languages,
    supports: (language) => languages.includes(language),
    speak(text, language, options?: TtsOptions) {
      return new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = LANGUAGE_BCP47[language];
        utterance.rate = options?.rate ?? 1;
        const voice = pickVoice(language);
        if (voice !== null) utterance.voice = voice;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        globalThis.speechSynthesis.speak(utterance);
      });
    },
    cancel() {
      globalThis.speechSynthesis.cancel();
    },
  };
}
