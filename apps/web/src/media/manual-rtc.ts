import { decodeSdpCode, encodeSdpCode } from './sdp-code';

/**
 * Temporary peer-to-peer media transport with manual signaling.
 *
 * The two participants exchange copyable SDP codes by hand. This exists so the
 * translation pipeline can be tested end-to-end before the go-p2p-netcat
 * transport is integrated. ICE uses public STUN servers, so symmetric NAT may
 * still fail — that limitation is acceptable for the prototype.
 */

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const ICE_GATHERING_TIMEOUT_MS = 8_000;
const CHANNEL_LABEL = 'linguacall-v1';

/** Label of the reliable data channel used for call messages. */
export const DATA_CHANNEL_LABEL = CHANNEL_LABEL;

export type ManualCallErrorCode = 'invalid-code' | 'media' | 'connection';

export class ManualCallError extends Error {
  readonly code: ManualCallErrorCode;

  constructor(code: ManualCallErrorCode, message: string) {
    super(message);
    this.name = 'ManualCallError';
    this.code = code;
  }
}

export function rtcConfiguration(): RTCConfiguration {
  return { iceServers: DEFAULT_ICE_SERVERS, bundlePolicy: 'max-bundle' };
}

export function acquireUserMedia(): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || navigator.mediaDevices === undefined) {
    return Promise.reject(new ManualCallError('media', 'mediaDevices is not available'));
  }
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  const video = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
  return navigator.mediaDevices
    .getUserMedia({ audio, video })
    .catch(() =>
      // Camera is often busy (another tab/app): fall back to audio-only so the
      // call and live translation still work.
      navigator.mediaDevices.getUserMedia({ audio }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        throw new ManualCallError('media', message);
      }),
    );
}

export function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = ICE_GATHERING_TIMEOUT_MS): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}

export function attachLocalTracks(pc: RTCPeerConnection, stream: MediaStream): void {
  for (const track of stream.getTracks()) pc.addTrack(track, stream);
}

export function newPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection(rtcConfiguration());
}

export function disposeCall(pc: RTCPeerConnection | null, stream: MediaStream | null): void {
  if (stream !== null) {
    for (const track of stream.getTracks()) track.stop();
  }
  pc?.close();
}

function localSdp(pc: RTCPeerConnection, fallback: string): string {
  return pc.localDescription?.sdp ?? fallback;
}

export type CallerSession = {
  pc: RTCPeerConnection;
  localStream: MediaStream;
  offerCode: string;
  /** Data channel used for hello/subtitle messages (resolved once created). */
  channel: Promise<RTCDataChannel>;
};

export async function createCallerSession(): Promise<CallerSession> {
  const localStream = await acquireUserMedia();
  const pc = newPeerConnection();
  attachLocalTracks(pc, localStream);
  const channel = pc.createDataChannel(CHANNEL_LABEL, { ordered: true });
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGathering(pc);
  return {
    pc,
    localStream,
    channel: Promise.resolve(channel),
    offerCode: encodeSdpCode(localSdp(pc, offer.sdp ?? '')),
  };
}

export type CalleeSession = {
  pc: RTCPeerConnection;
  localStream: MediaStream;
  answerCode: string;
  channel: Promise<RTCDataChannel>;
};

export async function createCalleeSession(offerCode: string): Promise<CalleeSession> {
  const decoded = decodeSdpCode(offerCode);
  if (!decoded.ok) throw new ManualCallError('invalid-code', `Invalid offer code: ${decoded.reason}`);

  const localStream = await acquireUserMedia();
  const pc = newPeerConnection();
  attachLocalTracks(pc, localStream);

  const channel = new Promise<RTCDataChannel>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ManualCallError('connection', 'Data channel timeout')), 8_000);
    pc.addEventListener('datachannel', (event: RTCDataChannelEvent) => {
      if (event.channel.label !== CHANNEL_LABEL) return;
      clearTimeout(timer);
      resolve(event.channel);
    });
  });

  await pc.setRemoteDescription({ type: 'offer', sdp: decoded.sdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForIceGathering(pc);
  return { pc, localStream, channel, answerCode: encodeSdpCode(localSdp(pc, answer.sdp ?? '')) };
}

/** Resolves when the data channel is open (or rejects after the timeout). */
export function waitForChannelOpen(channel: RTCDataChannel, timeoutMs = 8_000): Promise<void> {
  if (channel.readyState === 'open') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new ManualCallError('connection', 'Data channel did not open'));
    }, timeoutMs);
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      clearTimeout(timer);
      channel.removeEventListener('open', onOpen);
    };
    channel.addEventListener('open', onOpen);
  });
}

export async function acceptAnswerCode(pc: RTCPeerConnection, answerCode: string): Promise<void> {
  const decoded = decodeSdpCode(answerCode);
  if (!decoded.ok) throw new ManualCallError('invalid-code', `Invalid answer code: ${decoded.reason}`);
  await pc.setRemoteDescription({ type: 'answer', sdp: decoded.sdp });
}
