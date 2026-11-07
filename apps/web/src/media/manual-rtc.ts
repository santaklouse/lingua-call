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

const ICE_GATHERING_TIMEOUT_MS = 4_000;

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
  return navigator.mediaDevices
    .getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      throw new ManualCallError('media', message);
    });
}

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = ICE_GATHERING_TIMEOUT_MS): Promise<void> {
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

function attachLocalTracks(pc: RTCPeerConnection, stream: MediaStream): void {
  for (const track of stream.getTracks()) pc.addTrack(track, stream);
}

function newPeerConnection(): RTCPeerConnection {
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
};

export async function createCallerSession(): Promise<CallerSession> {
  const localStream = await acquireUserMedia();
  const pc = newPeerConnection();
  attachLocalTracks(pc, localStream);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGathering(pc);
  return { pc, localStream, offerCode: encodeSdpCode(localSdp(pc, offer.sdp ?? '')) };
}

export type CalleeSession = {
  pc: RTCPeerConnection;
  localStream: MediaStream;
  answerCode: string;
};

export async function createCalleeSession(offerCode: string): Promise<CalleeSession> {
  const decoded = decodeSdpCode(offerCode);
  if (!decoded.ok) throw new ManualCallError('invalid-code', `Invalid offer code: ${decoded.reason}`);

  const localStream = await acquireUserMedia();
  const pc = newPeerConnection();
  attachLocalTracks(pc, localStream);
  await pc.setRemoteDescription({ type: 'offer', sdp: decoded.sdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForIceGathering(pc);
  return { pc, localStream, answerCode: encodeSdpCode(localSdp(pc, answer.sdp ?? '')) };
}

export async function acceptAnswerCode(pc: RTCPeerConnection, answerCode: string): Promise<void> {
  const decoded = decodeSdpCode(answerCode);
  if (!decoded.ok) throw new ManualCallError('invalid-code', `Invalid answer code: ${decoded.reason}`);
  await pc.setRemoteDescription({ type: 'answer', sdp: decoded.sdp });
}
