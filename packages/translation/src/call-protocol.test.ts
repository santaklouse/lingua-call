import { describe, expect, it } from 'bun:test';
import { decodeCallMessage, encodeCallMessage } from './call-protocol';

const subtitle = {
  type: 'subtitle' as const,
  id: 1,
  srcLang: 'ru' as const,
  dstLang: 'en' as const,
  srcText: 'привет',
  dstText: 'hello',
  final: true,
  t0: 10,
  t1: 20,
};

describe('call protocol', () => {
  it('round-trips hello and subtitle messages', () => {
    expect(decodeCallMessage(encodeCallMessage({ type: 'hello', lang: 'ru' }))).toEqual({
      type: 'hello',
      lang: 'ru',
    });
    expect(decodeCallMessage(encodeCallMessage(subtitle))).toEqual(subtitle);
  });

  it('rejects malformed and unknown messages', () => {
    expect(decodeCallMessage('')).toBeNull();
    expect(decodeCallMessage('not json')).toBeNull();
    expect(decodeCallMessage('{"type":"unknown"}')).toBeNull();
    expect(decodeCallMessage('{"type":"hello","lang":"de"}')).toBeNull();
    expect(decodeCallMessage('{"type":"subtitle"}')).toBeNull();
  });

  it('rejects oversized text', () => {
    expect(
      decodeCallMessage(
        JSON.stringify({ ...subtitle, srcText: 'x'.repeat(2_001) }),
      ),
    ).toBeNull();
  });
});
