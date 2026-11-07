import { normalizeLanguage } from '@linguacall/i18n';
import { createInitialRouterState, isScreen } from './state';
import type { RouterState, Screen } from './state';
import { guard } from './guard';

const ROUTER_KEY = 'linguacall.router';

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Persists a snapshot so a refresh restores the same screen and prerequisites. */
export function saveRouterState(state: RouterState): void {
  const store = storage();
  if (store === null) return;
  try {
    store.setItem(ROUTER_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota/privacy failures; URL still preserves the screen.
  }
}

export function loadRouterState(): RouterState | null {
  const store = storage();
  if (store === null) return null;
  const raw = store.getItem(ROUTER_KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const screen = isScreen(parsed['screen']) ? parsed['screen'] : 'language';
    const state: RouterState = {
      ...createInitialRouterState(),
      screen,
      nativeLanguage:
        parsed['nativeLanguage'] === null || parsed['nativeLanguage'] === undefined
          ? null
          : normalizeLanguage(parsed['nativeLanguage']),
      transportReady: parsed['transportReady'] === true,
      devicesReady: parsed['devicesReady'] === true,
      callActive: parsed['callActive'] === true,
    };
    const allowed = guard(state, state.screen);
    return allowed.allowed ? state : { ...state, screen: allowed.screen };
  } catch {
    return null;
  }
}

export function screenFromHashOrDefault(initial: RouterState): Screen {
  return initial.screen;
}
