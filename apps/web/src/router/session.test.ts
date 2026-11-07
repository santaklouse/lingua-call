import { beforeEach, describe, expect, it } from 'bun:test';
import { loadRouterState, saveRouterState } from './session';
import { createInitialRouterState } from './state';

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('router session persistence', () => {
  it('round-trips a valid router state', () => {
    const state = {
      ...createInitialRouterState(),
      screen: 'devices' as const,
      nativeLanguage: 'en' as const,
      transportReady: true,
    };
    saveRouterState(state);
    expect(loadRouterState()).toEqual(state);
  });

  it('drops an invalid screen to the nearest allowed one', () => {
    window.sessionStorage.setItem(
      'linguacall.router',
      JSON.stringify({ ...createInitialRouterState(), screen: 'call' }),
    );
    const loaded = loadRouterState();
    expect(loaded?.screen).toBe('language');
  });
});
