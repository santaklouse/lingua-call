import { GenderEstimator } from '@linguacall/translation';
import type { VoiceGender } from '@linguacall/translation';

export type PitchTracker = {
  gender(): VoiceGender;
  stop(): void;
};

type PitchTrackerOptions = {
  /** Stop the stream tracks when the tracker stops (true for a mic we own). */
  stopTracks?: boolean;
};

/**
 * Estimates speaker gender from any audio stream (microphone or remote peer) in
 * parallel with speech recognition. Used to pick a matching TTS voice.
 *
 * Disables echo cancellation/noise suppression/AGC on the mic path so pitch is
 * not distorted; remote streams are analyzed as-is.
 */
export async function startStreamPitchTracker(
  stream: MediaStream,
  onGender: (gender: VoiceGender) => void,
  options: PitchTrackerOptions = {},
): Promise<PitchTracker> {
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
      source.disconnect();
      analyser.disconnect();
      if (options.stopTracks === true) {
        for (const track of stream.getTracks()) track.stop();
      }
      void context.close();
    },
  };
}

/** Mic-specific wrapper: requests a raw audio stream and stops it on close. */
export async function startMicPitchTracker(
  onGender: (gender: VoiceGender) => void,
): Promise<PitchTracker> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  return startStreamPitchTracker(stream, onGender, { stopTracks: true });
}
