/**
 * Manual signaling codes for the temporary WebRTC transport.
 *
 * A session description is UTF-8 encoded and wrapped in a base64url string with
 * a short version prefix, so it can be copied between participants by hand
 * without any signaling server.
 */

const CODE_PREFIX = 'LC1.';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeSdpCode(sdp: string): string {
  return `${CODE_PREFIX}${toBase64Url(new TextEncoder().encode(sdp))}`;
}

export type SdpCodeResult = { ok: true; sdp: string } | { ok: false; reason: 'empty' | 'prefix' | 'decode' | 'sdp' };

export function decodeSdpCode(code: string): SdpCodeResult {
  const value = code.trim();
  if (value.length === 0) return { ok: false, reason: 'empty' };
  if (!value.startsWith(CODE_PREFIX)) return { ok: false, reason: 'prefix' };
  const payload = value.slice(CODE_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/u.test(payload)) return { ok: false, reason: 'decode' };
  try {
    const sdp = new TextDecoder().decode(fromBase64Url(payload));
    if (!sdp.startsWith('v=0')) return { ok: false, reason: 'sdp' };
    return { ok: true, sdp };
  } catch {
    return { ok: false, reason: 'decode' };
  }
}
