/**
 * Connects to the self-hosted signaling server used by cross-device quick calls.
 * The endpoint is proxied by nginx at the same origin (`/signal`), so it works
 * through the Cloudflare Tunnel over `wss://` without extra domains or ports.
 */
export function signalingUrl(): string {
  // Dev: Vite's proxy for WebSocket upgrades is unreliable under the Bun runtime,
  // so the dev script points directly at the signaling server. Production uses
  // same-origin nginx (`/signal`) behind the HTTPS tunnel.
  const explicit = import.meta.env.VITE_SIGNAL_URL as string | undefined;
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}/signal`;
}

export function connectSignalSocket(timeoutMs = 4_000): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = new WebSocket(signalingUrl());
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
        // ignore
      }
      reject(new Error('Signaling server did not respond'));
    }, timeoutMs);

    socket.addEventListener('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(socket);
    });
    socket.addEventListener('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('Signaling server is unavailable'));
    });
    socket.addEventListener('close', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('Signaling connection closed'));
    });
  });
}
