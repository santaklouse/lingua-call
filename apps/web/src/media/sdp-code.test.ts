import { describe, expect, it } from 'bun:test';
import { decodeSdpCode, encodeSdpCode } from './sdp-code';

const SAMPLE_SDP = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0 1',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111',
  'a=ice-ufrag:test',
  'a=ice-pwd:secretpassword',
].join('\r\n');

describe('manual signaling codes', () => {
  it('round-trips an SDP through a copyable code', () => {
    const code = encodeSdpCode(SAMPLE_SDP);
    expect(code.startsWith('LC1.')).toBe(true);
    expect(decodeSdpCode(code)).toEqual({ ok: true, sdp: SAMPLE_SDP });
  });

  it('rejects empty, foreign and corrupted codes', () => {
    expect(decodeSdpCode('')).toEqual({ ok: false, reason: 'empty' });
    expect(decodeSdpCode('pnc1_abcdef')).toEqual({ ok: false, reason: 'prefix' });
    expect(decodeSdpCode('LC1.$$$')).toEqual({ ok: false, reason: 'decode' });
  });

  it('rejects payloads that do not contain a session description', () => {
    const notSdp = encodeSdpCode('hello world');
    expect(decodeSdpCode(notSdp)).toEqual({ ok: false, reason: 'sdp' });
  });
});
