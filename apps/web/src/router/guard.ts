import type { RouterState, Screen } from './state';

export type GuardResult =
  | { allowed: true; screen: Screen }
  | { allowed: false; screen: Screen; reason: string };

/**
 * Rules for entering a screen. The returned `screen` is the screen the app
 * should actually show: the requested one when allowed, otherwise a safe
 * fallback screen.
 */
export function guard(state: RouterState, target: Screen): GuardResult {
  if (target === 'language') return { allowed: true, screen: 'language' };

  if (state.callActive && target !== 'call' && target !== 'ended') {
    return {
      allowed: false,
      screen: 'call',
      reason: 'Сначала завершите звонок',
    };
  }

  if (target === 'lobby') {
    return state.nativeLanguage === null
      ? { allowed: false, screen: 'language', reason: 'Сначала выберите родной язык' }
      : { allowed: true, screen: 'lobby' };
  }

  if (target === 'devices') {
    if (state.nativeLanguage === null) {
      return { allowed: false, screen: 'language', reason: 'Сначала выберите родной язык' };
    }
    return state.transportReady
      ? { allowed: true, screen: 'devices' }
      : { allowed: false, screen: 'lobby', reason: 'Сначала создайте чат или подключитесь по токену' };
  }

  if (target === 'call') {
    if (state.nativeLanguage === null) {
      return { allowed: false, screen: 'language', reason: 'Сначала выберите родной язык' };
    }
    if (!state.transportReady) {
      return { allowed: false, screen: 'lobby', reason: 'Нет соединения с собеседником' };
    }
    return state.devicesReady
      ? { allowed: true, screen: 'call' }
      : { allowed: false, screen: 'devices', reason: 'Проверьте камеру и микрофон' };
  }

  // 'ended' is always reachable: it is the safe exit from a call.
  return { allowed: true, screen: 'ended' };
}

/** Resolves what screen should be shown for a requested navigation. */
export function resolveScreen(state: RouterState, target: Screen): Screen {
  return guard(state, target).screen;
}
