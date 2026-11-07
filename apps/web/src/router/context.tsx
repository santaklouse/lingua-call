import { createContext, useContext, useMemo, useReducer } from 'react';
import type { Dispatch, ReactNode } from 'react';
import type { Language } from '@linguacall/i18n';
import { createInitialRouterState, routerReducer } from './state';
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
  const [state, dispatch] = useReducer(routerReducer, undefined, createInitialRouterState);

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
