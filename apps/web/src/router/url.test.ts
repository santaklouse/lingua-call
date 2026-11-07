import { describe, expect, it } from 'bun:test';
import { legacyTokenFromHash, parseHash, screenToHash } from './url';

describe('url routing', () => {
  it('round-trips screens and params', () => {
    expect(screenToHash('language')).toBe('#/language');
    expect(screenToHash('call', { room: 'ABC123' })).toBe('#/call?room=ABC123');
    expect(parseHash('#/call?room=ABC123')).toEqual({
      screen: 'call',
      params: { room: 'ABC123' },
    });
    expect(parseHash('#/manual-call?mode=quick-host')).toEqual({
      screen: 'manual-call',
      params: { mode: 'quick-host' },
    });
  });

  it('rejects unknown or legacy hashes', () => {
    expect(parseHash('')).toBeNull();
    expect(parseHash('#token=pnc1_abc')).toBeNull();
    expect(parseHash('#/unknown')).toBeNull();
  });

  it('reads legacy invite tokens', () => {
    expect(legacyTokenFromHash('#token=pnc1_abc')).toBe('pnc1_abc');
    expect(legacyTokenFromHash('#/lobby?token=x')).toBeNull();
    expect(legacyTokenFromHash('#')).toBeNull();
  });
});
