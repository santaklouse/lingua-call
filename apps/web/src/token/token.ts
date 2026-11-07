/**
 * Mock invite tokens for the UI phase. Real `pnc1_` tokens are produced by
 * `p2p-netcat-core` in P2 and must be authenticated; this module only keeps the
 * UX and validation shape.
 */

const TOKEN_PREFIX = 'pnc1_';
const TOKEN_PAYLOAD_LENGTH = 43; // base64url of 32 bytes, without padding

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

export function createMockToken(service = 31337): string {
  const payload = new Uint8Array(32 + 2);
  payload.set(crypto.getRandomValues(new Uint8Array(32)));
  // Encode the logical service as two extra bytes so tokens differ per port.
  payload[32] = (service >> 8) & 0xff;
  payload[33] = service & 0xff;
  return `${TOKEN_PREFIX}${base64UrlEncode(payload)}`;
}

export type TokenValidation =
  | { valid: true; token: string }
  | { valid: false; reason: 'empty' | 'prefix' | 'payload' };

export function validateToken(value: string): TokenValidation {
  const token = value.trim();
  if (token.length === 0) return { valid: false, reason: 'empty' };
  if (!token.startsWith(TOKEN_PREFIX)) return { valid: false, reason: 'prefix' };
  const payload = token.slice(TOKEN_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/u.test(payload) || payload.length < 8) {
    return { valid: false, reason: 'payload' };
  }
  return { valid: true, token };
}

export const MOCK_TOKEN_PAYLOAD_LENGTH = TOKEN_PAYLOAD_LENGTH;

export function shareLinkForToken(token: string, href: string): string {
  const url = new URL(href);
  url.hash = `token=${encodeURIComponent(token)}`;
  return url.toString();
}

export function readTokenFromHash(hash: string): string | null {
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash;
  if (normalized.length === 0) return null;
  const params = new URLSearchParams(normalized);
  const token = params.get('token');
  return token === null ? null : token;
}
