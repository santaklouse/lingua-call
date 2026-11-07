import { afterAll, describe, expect, it } from 'bun:test';
import { createSignalingServer, normalizeRoom } from './signaling';

function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/signal`);
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', () => reject(new Error('socket error')), { once: true });
  });
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    socket.addEventListener(
      'message',
      (event) => resolve(JSON.parse(String(event.data)) as Record<string, unknown>),
      { once: true },
    );
  });
}

const server = createSignalingServer(0);

afterAll(() => server.stop());

describe('signaling server', () => {
  it('normalizes room codes', () => {
    expect(normalizeRoom(' ab-c12 ')).toBe('ABC12');
    expect(normalizeRoom('abcdefg')).toBe('ABCDEF');
  });

  it('joins a room and relays payloads between peers', async () => {
    const host = await connect(server.port);
    const joinedHost = nextMessage(host);
    host.send(JSON.stringify({ type: 'join', room: 'ROOM1', role: 'host' }));
    expect(await joinedHost).toMatchObject({ type: 'joined', role: 'host', peerPresent: false });

    const guest = await connect(server.port);
    const peerJoined = nextMessage(host);
    const joinedGuest = nextMessage(guest);
    guest.send(JSON.stringify({ type: 'join', room: 'ROOM1', role: 'guest' }));
    expect(await joinedGuest).toMatchObject({ type: 'joined', role: 'guest', peerPresent: true });
    expect(await peerJoined).toEqual({ type: 'peer-joined' });

    const relayed = nextMessage(guest);
    host.send(JSON.stringify({ type: 'relay', payload: { kind: 'offer', sdp: 'x' } }));
    expect(await relayed).toEqual({ type: 'relay', payload: { kind: 'offer', sdp: 'x' } });

    host.close();
    guest.close();
  });

  it('rejects a second host in the same room', async () => {
    const first = await connect(server.port);
    const joined = nextMessage(first);
    first.send(JSON.stringify({ type: 'join', room: 'ROOM2', role: 'host' }));
    await joined;

    const second = await connect(server.port);
    const error = nextMessage(second);
    second.send(JSON.stringify({ type: 'join', room: 'ROOM2', role: 'host' }));
    expect(await error).toMatchObject({ type: 'error' });
    first.close();
    second.close();
  });
});
