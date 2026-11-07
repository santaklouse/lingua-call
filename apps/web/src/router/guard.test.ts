import { describe, expect, it } from 'bun:test';
import { guard, resolveScreen } from './guard';
import { createInitialRouterState, routerReducer } from './state';
import type { RouterState } from './state';

function state(overrides: Partial<RouterState> = {}): RouterState {
  return { ...createInitialRouterState(), ...overrides };
}

describe('router guards', () => {
  it('always allows the language screen', () => {
    expect(guard(state(), 'language')).toEqual({ allowed: true, screen: 'language' });
  });

  it('requires a native language before the lobby', () => {
    expect(guard(state(), 'lobby')).toEqual({
      allowed: false,
      screen: 'language',
      reason: 'Сначала выберите родной язык',
    });
    expect(guard(state({ nativeLanguage: 'en' }), 'lobby')).toEqual({
      allowed: true,
      screen: 'lobby',
    });
  });

  it('requires a connection before the devices screen', () => {
    expect(guard(state({ nativeLanguage: 'en' }), 'devices').screen).toBe('lobby');
    expect(guard(state({ nativeLanguage: 'en', transportReady: true }), 'devices')).toEqual({
      allowed: true,
      screen: 'devices',
    });
  });

  it('requires checked devices before the call', () => {
    const connected = state({ nativeLanguage: 'en', transportReady: true });
    expect(guard(connected, 'call')).toEqual({
      allowed: false,
      screen: 'devices',
      reason: 'Проверьте камеру и микрофон',
    });
    expect(guard({ ...connected, devicesReady: true }, 'call')).toEqual({
      allowed: true,
      screen: 'call',
    });
  });

  it('locks navigation to the call while a call is active', () => {
    const inCall = state({
      nativeLanguage: 'en',
      transportReady: true,
      devicesReady: true,
      callActive: true,
      screen: 'call',
    });
    expect(guard(inCall, 'lobby')).toEqual({
      allowed: false,
      screen: 'call',
      reason: 'Сначала завершите звонок',
    });
    expect(guard(inCall, 'ended')).toEqual({ allowed: true, screen: 'ended' });
    expect(guard(inCall, 'call')).toEqual({ allowed: true, screen: 'call' });
  });

  it('requires a native language before the temporary manual call', () => {
    expect(guard(state(), 'manual-call')).toEqual({
      allowed: false,
      screen: 'language',
      reason: 'Choose your native language first',
    });
    expect(guard(state({ nativeLanguage: 'en' }), 'manual-call')).toEqual({
      allowed: true,
      screen: 'manual-call',
    });
  });

  it('resolves a safe screen through resolveScreen', () => {
    expect(resolveScreen(state(), 'call')).toBe('language');
    expect(resolveScreen(state({ nativeLanguage: 'en', transportReady: true }), 'devices')).toBe(
      'devices',
    );
  });
});

describe('router reducer', () => {
  it('stores the language and transport/device readiness', () => {
    let s = createInitialRouterState();
    s = routerReducer(s, { type: 'setLanguage', language: 'ru' });
    s = routerReducer(s, { type: 'setTransportReady', ready: true });
    s = routerReducer(s, { type: 'setDevicesReady', ready: true });
    s = routerReducer(s, { type: 'navigate', screen: 'devices' });
    expect(s.nativeLanguage).toBe('ru');
    expect(s.transportReady).toBe(true);
    expect(s.devicesReady).toBe(true);
    expect(s.screen).toBe('devices');
  });

  it('resets to the initial state', () => {
    const s = routerReducer(
      { ...createInitialRouterState(), nativeLanguage: 'en', screen: 'call' },
      { type: 'reset' },
    );
    expect(s).toEqual(createInitialRouterState());
  });
});
