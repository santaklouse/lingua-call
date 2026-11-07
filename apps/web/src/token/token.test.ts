import { describe, expect, it } from 'bun:test';
import {
  createMockToken,
  readTokenFromHash,
  shareLinkForToken,
  validateToken,
} from './token';

describe('token helpers', () => {
  it('creates tokens with the pnc1_ prefix and a base64url payload', () => {
    const token = createMockToken();
    expect(token.startsWith('pnc1_')).toBe(true);
    expect(/^[A-Za-z0-9_-]+$/u.test(token.slice('pnc1_'.length))).toBe(true);
  });

  it('creates different tokens for different calls', () => {
    expect(createMockToken()).not.toBe(createMockToken());
  });

  it('validates token shape', () => {
    expect(validateToken('')).toEqual({ valid: false, reason: 'empty' });
    expect(validateToken('token')).toEqual({ valid: false, reason: 'prefix' });
    expect(validateToken('pnc1_$$$')).toEqual({ valid: false, reason: 'payload' });
    expect(validateToken('pnc1_abcdefgh')).toEqual({ valid: true, token: 'pnc1_abcdefgh' });
  });

  it('builds and reads invite links through the URL hash', () => {
    const token = createMockToken();
    const link = shareLinkForToken(token, 'https://call.example/app');
    expect(link).toContain('#token=');
    const parsed = new URL(link);
    expect(readTokenFromHash(parsed.hash)).toBe(token);
    expect(readTokenFromHash('')).toBeNull();
    expect(readTokenFromHash('#other=1')).toBeNull();
  });
});
