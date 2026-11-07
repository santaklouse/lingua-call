/**
 * Minimal WebSocket signaling server for quick calls.
 *
 * Two peers join the same short room code and exchange opaque offer/answer
 * payloads. The server never sees or stores media; it is a self-hosted helper for
 * the Cloudflare Tunnel deployment (no paid services, no third-party signaling).
 */

import type { ServerWebSocket } from 'bun';

export type PeerRole = 'host' | 'guest';

type PeerData = {
  room?: string;
  role?: PeerRole;
};

type Room = {
  host?: ServerWebSocket<PeerData>;
  guest?: ServerWebSocket<PeerData>;
  lastActivity: number;
};

const ROOM_TTL_MS = 10 * 60 * 1000;
const MAX_ROOM_CODE_LENGTH = 6;

export function normalizeRoom(value: unknown): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, '')
    .slice(0, MAX_ROOM_CODE_LENGTH);
}

function send(socket: ServerWebSocket<PeerData>, message: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(message));
}

function otherPeer(room: Room, role: PeerRole): ServerWebSocket<PeerData> | undefined {
  return role === 'host' ? room.guest : room.host;
}

export type SignalingServer = {
  port: number;
  stop(): void;
};

/** Starts the signaling server; port 0 picks a free port (useful in tests). */
export function createSignalingServer(port = 8787): SignalingServer {
  const rooms = new Map<string, Room>();

  const cleanupRoom = (roomCode: string): void => {
    const room = rooms.get(roomCode);
    if (room === undefined) return;
    if (room.host === undefined && room.guest === undefined) rooms.delete(roomCode);
  };

  const detach = (socket: ServerWebSocket<PeerData>): void => {
    const { room: roomCode, role } = socket.data;
    if (roomCode === undefined || role === undefined) return;
    const room = rooms.get(roomCode);
    if (room === undefined) return;
    if (room[role] === socket) delete room[role];
    const other = otherPeer(room, role);
    if (other !== undefined) send(other, { type: 'peer-left' });
    cleanupRoom(roomCode);
  };

  const server = Bun.serve<PeerData>({
    port,
    fetch(request, upgradeServer) {
      const url = new URL(request.url);
      if (url.pathname === '/healthz') return new Response('ok\n', { status: 200 });
      if (url.pathname !== '/signal') return new Response('not found', { status: 404 });
      if (upgradeServer.upgrade(request, { data: {} })) return undefined;
      return new Response('WebSocket upgrade failed', { status: 400 });
    },
    websocket: {
      open() {
        // The client must send a join message before the room is assigned.
      },
      message(socket, raw) {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(String(raw)) as Record<string, unknown>;
        } catch {
          send(socket, { type: 'error', message: 'Invalid JSON' });
          return;
        }

        if (message['type'] === 'join') {
          const roomCode = normalizeRoom(message['room']);
          const role: PeerRole = message['role'] === 'guest' ? 'guest' : 'host';
          if (roomCode.length < 4) {
            send(socket, { type: 'error', message: 'Invalid room code' });
            return;
          }
          let room = rooms.get(roomCode);
          if (room === undefined) {
            room = { lastActivity: Date.now() };
            rooms.set(roomCode, room);
          }
          if (room[role] !== undefined) {
            send(socket, { type: 'error', message: 'Room role is already taken' });
            return;
          }
          room[role] = socket;
          room.lastActivity = Date.now();
          socket.data = { room: roomCode, role };
          const other = otherPeer(room, role);
          send(socket, { type: 'joined', role, peerPresent: other !== undefined });
          if (other !== undefined) send(other, { type: 'peer-joined' });
          console.info(`[signal] ${role} joined ${roomCode}`);
          return;
        }

        if (message['type'] === 'relay') {
          const { room: roomCode, role } = socket.data;
          if (roomCode === undefined || role === undefined) return;
          const room = rooms.get(roomCode);
          if (room === undefined) return;
          room.lastActivity = Date.now();
          const other = otherPeer(room, role);
          if (other !== undefined) send(other, { type: 'relay', payload: message['payload'] });
          return;
        }

        if (message['type'] === 'leave') detach(socket);
      },
      close(socket) {
        detach(socket);
      },
    },
  });

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [roomCode, room] of rooms) {
      if (now - room.lastActivity <= ROOM_TTL_MS) continue;
      room.host?.close();
      room.guest?.close();
      rooms.delete(roomCode);
      console.info(`[signal] expired room ${roomCode}`);
    }
  }, 60_000);
  timer.unref?.();

  return {
    port: server.port ?? 8787,
    stop() {
      clearInterval(timer);
      server.stop(true);
    },
  };
}
