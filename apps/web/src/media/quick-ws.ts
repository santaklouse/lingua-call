import {
  DATA_CHANNEL_LABEL,
  acquireUserMedia,
  attachLocalTracks,
  newPeerConnection,
  waitForIceGathering,
} from './manual-rtc';
import { connectSignalSocket } from './ws-transport';
import type { QuickCallbacks, QuickSession } from './local-signaling';

const ICE_TIMEOUT_MS = 5_000;
const OFFER_TIMEOUT_MS = 20_000;

type RelayPayload = { kind: 'offer'; sdp: string } | { kind: 'answer'; sdp: string } | { kind: 'bye' };

function relay(socket: WebSocket, room: string, payload: RelayPayload): void {
  socket.send(JSON.stringify({ type: 'relay', room, payload }));
}

/** Quick call host over the self-hosted WebSocket signaling server. */
export async function startQuickHostWs(code: string, callbacks: QuickCallbacks = {}): Promise<QuickSession> {
  const socket = await connectSignalSocket();
  const localStream = await acquireUserMedia();
  callbacks.onLog?.(
    'info',
    `Media ready: ${localStream.getTracks().map((track) => track.kind).join(', ')}`,
  );
  const pc = newPeerConnection();
  attachLocalTracks(pc, localStream);
  const dataChannel = pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
  callbacks.onLog?.('info', `Hosting room ${code} via WebSocket signaling`);

  let cachedOfferSdp = '';
  let offerPending = false;
  const sendOffer = () => {
    if (cachedOfferSdp.length > 0) {
      relay(socket, code, { kind: 'offer', sdp: cachedOfferSdp });
      return;
    }
    if (offerPending) return;
    offerPending = true;
    void (async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForIceGathering(pc, ICE_TIMEOUT_MS);
        cachedOfferSdp = pc.localDescription?.sdp ?? '';
        relay(socket, code, { kind: 'offer', sdp: cachedOfferSdp });
        callbacks.onLog?.('debug', `Offer sent (${cachedOfferSdp.length} chars)`);
      } catch (cause) {
        callbacks.onLog?.('error', `Offer failed: ${String(cause)}`);
      } finally {
        offerPending = false;
      }
    })();
  };

  socket.addEventListener('message', (event) => {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(String(event.data)) as Record<string, unknown>;
    } catch {
      return;
    }
    if (message['type'] === 'peer-joined') {
      callbacks.onLog?.('info', 'Peer joined the room; sending offer');
      callbacks.onPeerJoined?.();
      sendOffer();
    } else if (message['type'] === 'joined' && message['peerPresent'] === true) {
      // The guest was already waiting when we registered; send the offer now.
      callbacks.onLog?.('info', 'Guest is already in the room; sending offer');
      callbacks.onPeerJoined?.();
      sendOffer();
    } else if (message['type'] === 'relay') {
      const payload = message['payload'] as RelayPayload | undefined;
      if (payload?.kind === 'answer') {
        void pc
          .setRemoteDescription({ type: 'answer', sdp: payload.sdp })
          .then(() => callbacks.onLog?.('info', 'Answer applied'))
          .catch((cause: unknown) => callbacks.onLog?.('error', `Answer failed: ${String(cause)}`));
      } else if (payload?.kind === 'bye') {
        callbacks.onLog?.('warn', 'Peer left the room');
      }
    } else if (message['type'] === 'error') {
      callbacks.onLog?.('error', String(message['message'] ?? 'Signaling error'));
    }
  });

  // Register the message handler before joining so "peer-joined"/"joined" events
  // cannot be missed during the connection setup race.
  socket.send(JSON.stringify({ type: 'join', room: code, role: 'host' }));

  return {
    pc,
    localStream,
    channel: Promise.resolve(dataChannel),
    dispose() {
      socket.close();
      pc.close();
      for (const track of localStream.getTracks()) track.stop();
    },
  };
}

/** Quick call guest over the self-hosted WebSocket signaling server. */
export async function startQuickGuestWs(code: string, callbacks: QuickCallbacks = {}): Promise<QuickSession> {
  const socket = await connectSignalSocket();
  socket.send(JSON.stringify({ type: 'join', room: code, role: 'guest' }));
  callbacks.onLog?.('info', `Joining room ${code} via WebSocket signaling`);

  return new Promise<QuickSession>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The other participant did not appear')), OFFER_TIMEOUT_MS);
    let settled = false;

    socket.addEventListener('message', (event) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(String(event.data)) as Record<string, unknown>;
      } catch {
        return;
      }

      if (message['type'] === 'error') {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          socket.close();
          reject(new Error(String(message['message'] ?? 'Signaling error')));
        }
        return;
      }

      if (message['type'] !== 'relay') return;
      const payload = message['payload'] as RelayPayload | undefined;
      if (payload?.kind !== 'offer' || settled) return;
      settled = true;
      clearTimeout(timer);

      void (async () => {
        try {
          const localStream = await acquireUserMedia();
          callbacks.onLog?.(
            'info',
            `Media ready: ${localStream.getTracks().map((track) => track.kind).join(', ')}`,
          );
          const pc = newPeerConnection();
          attachLocalTracks(pc, localStream);
          let resolveChannel: ((channel: RTCDataChannel) => void) | null = null;
          const channel = new Promise<RTCDataChannel>((channelResolve) => {
            resolveChannel = channelResolve;
          });
          pc.addEventListener('datachannel', (channelEvent: RTCDataChannelEvent) => {
            if (channelEvent.channel.label !== DATA_CHANNEL_LABEL) return;
            resolveChannel?.(channelEvent.channel);
          });
          await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await waitForIceGathering(pc, ICE_TIMEOUT_MS);
          relay(socket, code, { kind: 'answer', sdp: pc.localDescription?.sdp ?? '' });
          callbacks.onLog?.('debug', 'Answer sent');

          resolve({
            pc,
            localStream,
            channel,
            dispose() {
              socket.close();
              pc.close();
              for (const track of localStream.getTracks()) track.stop();
            },
          });
        } catch (cause) {
          socket.close();
          reject(cause instanceof Error ? cause : new Error(String(cause)));
        }
      })();
    });

    socket.addEventListener('close', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('Signaling connection closed'));
    });
  });
}
