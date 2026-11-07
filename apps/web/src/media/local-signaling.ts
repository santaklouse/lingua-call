import {
  DATA_CHANNEL_LABEL,
  acquireUserMedia,
  attachLocalTracks,
  newPeerConnection,
  waitForIceGathering,
} from './manual-rtc';

/**
 * Zero-server signaling between two tabs of the same browser using
 * BroadcastChannel. Intended for quick local testing of the call + translation
 * pipeline; cross-machine calls still need the manual SDP codes.
 */

const ROOM_PREFIX = 'linguacall-quick-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const ICE_TIMEOUT_MS = 2_500;
const JOIN_INTERVAL_MS = 500;
const OFFER_TIMEOUT_MS = 20_000;

export type QuickLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type QuickCallbacks = {
  onLog?: (level: QuickLogLevel, message: string) => void;
  onPeerJoined?: () => void;
};

export type QuickSession = {
  pc: RTCPeerConnection;
  localStream: MediaStream;
  channel: Promise<RTCDataChannel>;
  dispose(): void;
};

type QuickMessage =
  | { kind: 'join' }
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'bye' };

export function createRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = '';
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

export function normalizeRoomCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, '')
    .slice(0, CODE_LENGTH);
}

function roomName(code: string): string {
  return `${ROOM_PREFIX}${normalizeRoomCode(code)}`;
}


export async function startQuickHost(code: string, callbacks: QuickCallbacks = {}): Promise<QuickSession> {
  const broadcast = new BroadcastChannel(roomName(code));
  const localStream = await acquireUserMedia();
  callbacks.onLog?.(
    'info',
    `Media ready: ${localStream.getTracks().map((track) => track.kind).join(', ')}`,
  );
  const pc = newPeerConnection();
  attachLocalTracks(pc, localStream);
  const dataChannel = pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
  callbacks.onLog?.('info', `Hosting quick room ${normalizeRoomCode(code)}`);

  let cachedOfferSdp = '';
  let offerPending: Promise<void> | null = null;

  const sendOffer = () => {
    if (cachedOfferSdp.length > 0) {
      broadcast.postMessage({ kind: 'offer', sdp: cachedOfferSdp } satisfies QuickMessage);
      return;
    }
    offerPending ??= (async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForIceGathering(pc, ICE_TIMEOUT_MS);
        cachedOfferSdp = pc.localDescription?.sdp ?? '';
        broadcast.postMessage({ kind: 'offer', sdp: cachedOfferSdp } satisfies QuickMessage);
        callbacks.onLog?.('debug', `Offer sent (${cachedOfferSdp.length} chars)`);
      } catch (error) {
        offerPending = null;
        callbacks.onLog?.('error', `Offer failed: ${String(error)}`);
      }
    })();
  };

  broadcast.onmessage = (event: MessageEvent) => {
    const message = event.data as QuickMessage;
    if (message.kind === 'join') {
      callbacks.onLog?.('info', 'Guest joined the room; sending offer');
      callbacks.onPeerJoined?.();
      sendOffer();
    } else if (message.kind === 'answer') {
      void pc
        .setRemoteDescription({ type: 'answer', sdp: message.sdp })
        .then(() => callbacks.onLog?.('info', 'Answer applied'))
        .catch((error: unknown) => callbacks.onLog?.('error', `Answer failed: ${String(error)}`));
    } else if (message.kind === 'bye') {
      callbacks.onLog?.('warn', 'Guest left the room');
    }
  };

  return {
    pc,
    localStream,
    channel: Promise.resolve(dataChannel),
    dispose() {
      broadcast.close();
      pc.close();
      for (const track of localStream.getTracks()) track.stop();
    },
  };
}

export async function startQuickGuest(code: string, callbacks: QuickCallbacks = {}): Promise<QuickSession> {
  const broadcast = new BroadcastChannel(roomName(code));
  const state: { pc: RTCPeerConnection | null; localStream: MediaStream | null } = {
    pc: null,
    localStream: null,
  };
  let disposed = false;
  let resolveChannel: ((channel: RTCDataChannel) => void) | null = null;
  let rejectChannel: ((error: Error) => void) | null = null;

  const channel = new Promise<RTCDataChannel>((resolve, reject) => {
    resolveChannel = resolve;
    rejectChannel = reject;
  });

  const joinTimer = setInterval(() => broadcast.postMessage({ kind: 'join' } satisfies QuickMessage), JOIN_INTERVAL_MS);
  broadcast.postMessage({ kind: 'join' } satisfies QuickMessage);
  callbacks.onLog?.('info', `Looking for quick room ${normalizeRoomCode(code)}…`);

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('No host found for this code')), OFFER_TIMEOUT_MS);
      broadcast.onmessage = (event: MessageEvent) => {
        const message = event.data as QuickMessage;
        if (message.kind !== 'offer' || disposed) return;
        if (state.pc !== null) return; // duplicate offer from repeated joins
        clearTimeout(timeout);
        clearInterval(joinTimer);
        callbacks.onLog?.('info', 'Offer received; preparing answer');
        void (async () => {
          try {
            const stream = await acquireUserMedia();
            state.localStream = stream;
            callbacks.onLog?.(
              'info',
              `Media ready: ${stream.getTracks().map((track) => track.kind).join(', ')}`,
            );
            const pc = newPeerConnection();
            state.pc = pc;
            attachLocalTracks(pc, stream);
            pc.addEventListener('datachannel', (channelEvent: RTCDataChannelEvent) => {
              if (channelEvent.channel.label !== DATA_CHANNEL_LABEL) return;
              resolveChannel?.(channelEvent.channel);
            });
            await pc.setRemoteDescription({ type: 'offer', sdp: message.sdp });
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await waitForIceGathering(pc, ICE_TIMEOUT_MS);
            broadcast.postMessage({ kind: 'answer', sdp: pc.localDescription?.sdp ?? '' });
            callbacks.onLog?.('debug', `Answer sent (${pc.localDescription?.sdp.length ?? 0} chars)`);
            resolve();
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        })();
      };
    });
  } catch (error) {
    clearInterval(joinTimer);
    broadcast.close();
    state.pc?.close();
    state.localStream?.getTracks().forEach((track) => track.stop());
    throw error;
  }

  const pc = state.pc;
  const localStream = state.localStream;
  if (pc === null || localStream === null) throw new Error('Quick call was not established');

  return {
    pc,
    localStream,
    channel,
    dispose() {
      disposed = true;
      clearInterval(joinTimer);
      rejectChannel?.(new Error('Quick call disposed'));
      broadcast.close();
      pc.close();
      for (const track of localStream.getTracks()) track.stop();
    },
  };
}
