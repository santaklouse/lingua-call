/**
 * Routes the remote participant's audio through a WebAudio graph so the original
 * voice can be ducked while the translated speech is playing.
 *
 * The <video> element must be muted (otherwise the original would play twice).
 */
export type RemoteAudioMixer = {
  setVolume(value: number): void;
  duck(active: boolean): void;
  dispose(): void;
};

export type RemoteAudioMixerOptions = {
  /** Playback volume of the remote original when not ducked (0..1). */
  normalVolume?: number;
  /** Playback volume while the translation is speaking (0..1). */
  duckedVolume?: number;
};

export async function createRemoteAudioMixer(
  stream: MediaStream,
  options: RemoteAudioMixerOptions = {},
): Promise<RemoteAudioMixer> {
  const normalVolume = options.normalVolume ?? 1;
  const duckedVolume = options.duckedVolume ?? 0.2;
  const AudioContextCtor =
    globalThis.AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (AudioContextCtor === undefined) throw new Error('AudioContext is not available');

  const context = new AudioContextCtor();
  await context.resume();
  const source = context.createMediaStreamSource(stream);
  const gain = context.createGain();
  gain.gain.value = normalVolume;
  source.connect(gain);
  gain.connect(context.destination);

  return {
    setVolume(value: number) {
      gain.gain.setTargetAtTime(clamp(value), context.currentTime, 0.05);
    },
    duck(active: boolean) {
      gain.gain.setTargetAtTime(active ? duckedVolume : normalVolume, context.currentTime, 0.06);
    },
    dispose() {
      source.disconnect();
      gain.disconnect();
      void context.close();
    },
  };
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
