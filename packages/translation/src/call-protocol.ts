import type { Language } from '@linguacall/i18n';

/**
 * Messages exchanged over the data channel of the temporary WebRTC transport.
 * Kept as JSON for the prototype; the final go-p2p-netcat transport will use a
 * versioned binary framing (PLAN.md, deferred P2N).
 */

export type SubtitleMessage = {
  type: 'subtitle';
  id: number;
  srcLang: Language;
  dstLang: Language;
  srcText: string;
  dstText: string;
  final: boolean;
  t0: number;
  t1: number;
};

export type HelloMessage = {
  type: 'hello';
  lang: Language;
};

export type CallMessage = HelloMessage | SubtitleMessage;

const MAX_TEXT_LENGTH = 2_000;

function isLanguage(value: unknown): value is Language {
  return value === 'ru' || value === 'en';
}

export function encodeCallMessage(message: CallMessage): string {
  return JSON.stringify(message);
}

/** Parses and validates an incoming message; returns null for anything unknown. */
export function decodeCallMessage(raw: string): CallMessage | null {
  if (raw.length === 0 || raw.length > 20_000) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;

  if (record['type'] === 'hello') {
    return isLanguage(record['lang']) ? { type: 'hello', lang: record['lang'] } : null;
  }

  if (record['type'] === 'subtitle') {
    const { id, srcLang, dstLang, srcText, dstText, final, t0, t1 } = record;
    if (typeof id !== 'number' || !Number.isFinite(id)) return null;
    if (!isLanguage(srcLang) || !isLanguage(dstLang)) return null;
    if (typeof srcText !== 'string' || typeof dstText !== 'string') return null;
    if (srcText.length > MAX_TEXT_LENGTH || dstText.length > MAX_TEXT_LENGTH) return null;
    if (typeof final !== 'boolean') return null;
    if (typeof t0 !== 'number' || typeof t1 !== 'number') return null;
    return {
      type: 'subtitle',
      id,
      srcLang,
      dstLang,
      srcText,
      dstText,
      final,
      t0,
      t1,
    };
  }

  return null;
}
