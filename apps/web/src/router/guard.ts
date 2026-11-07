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
      reason: 'Finish the current call first',
    };
  }

  if (target === 'lobby') {
    return state.nativeLanguage === null
      ? { allowed: false, screen: 'language', reason: 'Choose your native language first' }
      : { allowed: true, screen: 'lobby' };
  }

  if (target === 'devices') {
    if (state.nativeLanguage === null) {
      return { allowed: false, screen: 'language', reason: 'Choose your native language first' };
    }
    return state.transportReady
      ? { allowed: true, screen: 'devices' }
      : { allowed: false, screen: 'lobby', reason: 'Create or join a chat first' };
  }

  if (target === 'call') {
    if (state.nativeLanguage === null) {
      return { allowed: false, screen: 'language', reason: 'Choose your native language first' };
    }
    if (!state.transportReady) {
      return { allowed: false, screen: 'lobby', reason: 'Not connected to the peer' };
    }
    return state.devicesReady
      ? { allowed: true, screen: 'call' }
      : { allowed: false, screen: 'devices', reason: 'Check your camera and microphone' };
  }

  if (target === 'translate-demo') {
    return state.nativeLanguage === null
      ? { allowed: false, screen: 'language', reason: 'Choose your native language first' }
      : { allowed: true, screen: 'translate-demo' };
  }

  if (target === 'manual-call') {
    return state.nativeLanguage === null
      ? { allowed: false, screen: 'language', reason: 'Choose your native language first' }
      : { allowed: true, screen: 'manual-call' };
  }

  // 'ended' is always reachable: it is the safe exit from a call.
  return { allowed: true, screen: 'ended' };
}

/** Resolves what screen should be shown for a requested navigation. */
export function resolveScreen(state: RouterState, target: Screen): Screen {
  return guard(state, target).screen;
}
