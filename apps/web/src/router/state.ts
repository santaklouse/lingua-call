import type { Language } from '@linguacall/i18n';

/** Screens of the call flow, in order. */
export const SCREENS = ['language', 'lobby', 'manual-call', 'devices', 'call', 'ended'] as const;

export type Screen = (typeof SCREENS)[number];

export type RouterState = {
  screen: Screen;
  nativeLanguage: Language | null;
  /** Pairing/token step finished and the transport is connected. */
  transportReady: boolean;
  /** Camera/microphone checked on the devices screen. */
  devicesReady: boolean;
  callActive: boolean;
};

export function createInitialRouterState(): RouterState {
  return {
    screen: 'language',
    nativeLanguage: null,
    transportReady: false,
    devicesReady: false,
    callActive: false,
  };
}

export type RouterAction =
  | { type: 'navigate'; screen: Screen }
  | { type: 'setLanguage'; language: Language }
  | { type: 'setTransportReady'; ready: boolean }
  | { type: 'setDevicesReady'; ready: boolean }
  | { type: 'setCallActive'; active: boolean }
  | { type: 'reset' };

export function routerReducer(state: RouterState, action: RouterAction): RouterState {
  switch (action.type) {
    case 'navigate':
      return { ...state, screen: action.screen };
    case 'setLanguage':
      return { ...state, nativeLanguage: action.language };
    case 'setTransportReady':
      return { ...state, transportReady: action.ready };
    case 'setDevicesReady':
      return { ...state, devicesReady: action.ready };
    case 'setCallActive':
      return { ...state, callActive: action.active };
    case 'reset':
      return createInitialRouterState();
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export function isScreen(value: unknown): value is Screen {
  return typeof value === 'string' && (SCREENS as readonly string[]).includes(value);
}
