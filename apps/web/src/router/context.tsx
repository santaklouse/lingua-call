import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Dispatch, ReactNode } from 'react';
import type { Language } from '@linguacall/i18n';
import { createInitialRouterState, routerReducer } from './state';
import { legacyTokenFromHash, parseHash, screenToHash } from './url';
import { loadRouterState, saveRouterState } from './session';
import type { RouterAction, RouterState, Screen } from './state';
import { guard } from './guard';

export type RouterContextValue = {
  state: RouterState;
  dispatch: Dispatch<RouterAction>;
  /** Navigates only if the target screen is allowed; returns a guard reason otherwise. */
  go: (target: Screen) => { allowed: boolean; reason?: string };
  /** Applies a state change and navigates based on the resulting state (atomic). */
  goWith: (action: RouterAction, target: Screen) => { allowed: boolean; reason?: string };
  setLanguage: (language: Language) => void;
};

const RouterContext = createContext<RouterContextValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(routerReducer, undefined, () => {
    const persisted = loadRouterState() ?? createInitialRouterState();
    const route = parseHash(window.location.hash);
    const invite = route?.params['token'] ?? legacyTokenFromHash(window.location.hash) ?? null;
    if (invite !== null && invite.length > 0) {
      try {
        window.sessionStorage.setItem('linguacall.pendingInvite', invite);
      } catch {
        // Session storage may be unavailable; the lobby falls back to empty input.
      }
    }
    const candidate = route === null ? persisted : { ...persisted, screen: route.screen };
    const allowed = guard(candidate, candidate.screen);
    return allowed.allowed ? candidate : { ...candidate, screen: allowed.screen };
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // Keep the URL hash in sync with the current screen so F5 restores it.
  useEffect(() => {
    saveRouterState(state);
    const hash = screenToHash(state.screen);
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash);
    }
  }, [state]);

  // Back/forward navigation: route through the guard so invalid states redirect.
  useEffect(() => {
    const onHashChange = () => {
      const route = parseHash(window.location.hash);
      if (route === null) return;
      const current = stateRef.current;
      if (current.screen === route.screen) return;
      const result = guard(current, route.screen);
      dispatch({ type: 'navigate', screen: result.screen });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const value = useMemo<RouterContextValue>(() => {
    return {
      state,
      dispatch,
      go: (target) => {
        const result = guard(state, target);
        dispatch({ type: 'navigate', screen: result.screen });
        return result.allowed ? { allowed: true } : { allowed: false, reason: result.reason };
      },
      goWith: (action, target) => {
        const nextState = routerReducer(state, action);
        const result = guard(nextState, target);
        dispatch(action);
        dispatch({ type: 'navigate', screen: result.screen });
        return result.allowed ? { allowed: true } : { allowed: false, reason: result.reason };
      },
      setLanguage: (language) => dispatch({ type: 'setLanguage', language }),
    };
  }, [state]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterContextValue {
  const value = useContext(RouterContext);
  if (value === null) throw new Error('useRouter must be used inside <RouterProvider>');
  return value;
}
