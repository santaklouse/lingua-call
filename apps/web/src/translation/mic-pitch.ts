import { GenderEstimator } from '@linguacall/translation';
import type { VoiceGender } from '@linguacall/translation';

export type PitchTracker = {
  gender(): VoiceGender;
  stop(): void;
};

/**
 * Estimates the speaker's gender from the microphone signal in parallel with
 * speech recognition. Used to pick a TTS voice that matches the speaker.
 *
 * Disables echo cancellation/noise suppression/AGC so the pitch is not distorted.
 */
export async function startMicPitchTracker(
  onGender: (gender: VoiceGender) => void,
): Promise<PitchTracker> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const AudioContextCtor =
    globalThis.AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (AudioContextCtor === undefined) throw new Error('AudioContext is not available');

  const context = new AudioContextCtor();
  await context.resume();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const samples = new Float32Array(analyser.fftSize);
  const estimator = new GenderEstimator();
  let current: VoiceGender = 'unknown';

  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    const next = estimator.push(samples, context.sampleRate);
    if (next !== current) {
      current = next;
      onGender(next);
    }
  }, 60);

  return {
    gender: () => current,
    stop() {
      clearInterval(timer);
      for (const track of stream.getTracks()) track.stop();
      void context.close();
    },
  };
}
