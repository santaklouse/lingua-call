import type { Language } from '@linguacall/i18n';
import type { TtsEngine, TtsOptions, VoiceGender } from '@linguacall/translation';
import { LANGUAGE_BCP47 } from './language';
import { UnsupportedEngineError } from './errors';

export function isWebSpeechTtsSupported(): boolean {
  return (
    typeof globalThis.speechSynthesis !== 'undefined' &&
    typeof globalThis.SpeechSynthesisUtterance !== 'undefined'
  );
}

const FEMALE_VOICE_TOKENS = [
  'female',
  'woman',
  'milena',
  'irina',
  'alena',
  'katya',
  'tatyana',
  'anna',
  'maria',
  'elena',
  'svetlana',
  'victoria',
  'olga',
  'daria',
  'samantha',
  'karen',
  'moira',
  'zira',
  'susan',
  'hazel',
  'catherine',
  'serena',
  'allison',
  'ava',
  'joanna',
  'salli',
  'kendra',
  'kimberly',
  'ivy',
  'emma',
  'amy',
  'olivia',
  'sophie',
  'fiona',
  'tessa',
  'veena',
  'aria',
  'jenny',
  'michelle',
];

const MALE_VOICE_TOKENS = [
  'male',
  'man',
  'yuri',
  'pavel',
  'dmitri',
  'denis',
  'aleksei',
  'artem',
  'maxim',
  'ivan',
  'sergey',
  'andrei',
  'tom',
  'daniel',
  'alex',
  'fred',
  'george',
  'david',
  'mark',
  'james',
  'brian',
  'matthew',
  'justin',
  'aaron',
  'arthur',
  'rishi',
  'diego',
  'jorge',
  'luca',
  'thomas',
  'oliver',
  'william',
  'guy',
  'ryan',
  'eric',
  'andrew',
];

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z]+/u)
    .filter((token) => token.length > 1);
}

/** Best-effort voice gender classification from the voice name. */
export function classifyVoiceGender(voice: SpeechSynthesisVoice): VoiceGender {
  const parts = tokens(voice.name);
  if (parts.some((part) => FEMALE_VOICE_TOKENS.includes(part))) return 'female';
  if (parts.some((part) => MALE_VOICE_TOKENS.includes(part))) return 'male';
  return 'unknown';
}

function voicesForLanguage(language: Language): SpeechSynthesisVoice[] {
  const tag = LANGUAGE_BCP47[language].toLowerCase();
  const prefix = tag.split('-')[0] ?? tag;
  return globalThis.speechSynthesis
    .getVoices()
    .filter((voice) => {
      const voiceLang = voice.lang.toLowerCase();
      return voiceLang === tag || voiceLang.startsWith(prefix);
    });
}

function pickVoice(language: Language, gender?: VoiceGender): SpeechSynthesisVoice | null {
  const candidates = voicesForLanguage(language);
  if (candidates.length === 0) return null;
  if (gender === 'male' || gender === 'female') {
    const match = candidates.find((voice) => classifyVoiceGender(voice) === gender);
    if (match !== undefined) return match;
  }
  return candidates[0] ?? null;
}

/** Web Speech Synthesis TTS (prototype): uses system voices, no downloads. */
export function createWebSpeechTts(): TtsEngine {
  if (!isWebSpeechTtsSupported()) throw new UnsupportedEngineError('Web Speech Synthesis');

  const languages: readonly Language[] = ['ru', 'en'];

  return {
    id: 'web-speech-synthesis',
    languages,
    supports: (language) => languages.includes(language),
    async warmup() {
      if (globalThis.speechSynthesis.getVoices().length > 0) return;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          globalThis.speechSynthesis.onvoiceschanged = null;
          resolve();
        }, 1_000);
        globalThis.speechSynthesis.onvoiceschanged = () => {
          clearTimeout(timer);
          globalThis.speechSynthesis.onvoiceschanged = null;
          resolve();
        };
      });
    },
    speak(text, language, options?: TtsOptions) {
      return new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = LANGUAGE_BCP47[language];
        utterance.rate = options?.rate ?? 1.05;
        const voice = pickVoice(language, options?.gender);
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
