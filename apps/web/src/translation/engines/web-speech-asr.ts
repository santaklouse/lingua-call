import type { Language } from '@linguacall/i18n';
import type { AsrEngine, AsrResult } from '@linguacall/translation';
import { LANGUAGE_BCP47 } from './language';
import { UnsupportedEngineError } from './errors';

/** Minimal typings for the Web Speech API (not present in lib.dom). */
type SpeechAlternative = { transcript: string };
type SpeechResult = { isFinal: boolean; length: number; 0: SpeechAlternative };
type SpeechResultList = { readonly length: number; [index: number]: SpeechResult };
type SpeechEvent = { resultIndex: number; results: SpeechResultList };
type SpeechErrorEvent = { error: string };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  const scope = globalThis as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function isWebSpeechAsrSupported(): boolean {
  return recognitionCtor() !== null;
}

/**
 * Web Speech API ASR (prototype, D22). Gives real partial/final results with
 * very low integration cost. In Chrome this may use a vendor cloud service, so it
 * is a prototype engine only until local WASM ASR is integrated (P5A).
 */
export function createWebSpeechAsr(): AsrEngine {
  const Ctor = recognitionCtor();
  if (Ctor === null) throw new UnsupportedEngineError('Web Speech ASR');

  let recognition: SpeechRecognitionLike | null = null;
  let running = false;
  let segmentId = 0;
  let lastInterim = '';

  const languages: readonly Language[] = ['ru', 'en'];

  return {
    id: 'web-speech',
    languages,
    async start(language, onResult, onError) {
      if (running) return;
      const rec = new Ctor();
      recognition = rec;
      running = true;
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = LANGUAGE_BCP47[language];
      rec.maxAlternatives = 1;

      rec.onresult = (event) => {
        if (!running) return;
        let finalText = '';
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result === undefined) continue;
          const transcript = result[0]?.transcript ?? '';
          if (result.isFinal) finalText += transcript;
          else interimText += transcript;
        }

        if (interimText.length > 0 && interimText !== lastInterim) {
          lastInterim = interimText;
          emit({ segmentId, text: interimText, final: false });
        }
        if (finalText.trim().length > 0) {
          segmentId += 1;
          lastInterim = '';
          emit({ segmentId, text: finalText.trim(), final: true });
        }
      };

      rec.onerror = (event) => {
        if (event.error === 'aborted' || event.error === 'no-speech') return;
        onError(new Error(`Speech recognition error: ${event.error}`));
      };

      rec.onend = () => {
        // Chrome stops recognition on silence; restart while the pipeline runs.
        if (!running) return;
        try {
          rec.start();
        } catch {
          // Ignore restart races.
        }
      };

      function emit(result: Omit<AsrResult, 'atMs'>) {
        onResult({ ...result, atMs: performance.now() });
      }

      rec.start();
    },
    async stop() {
      running = false;
      recognition?.stop();
      recognition = null;
    },
  };
}
