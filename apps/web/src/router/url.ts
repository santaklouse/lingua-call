import { isScreen } from './state';
import type { Screen } from './state';

export type Route = {
  screen: Screen;
  params: Record<string, string>;
};

/** Serializes a screen and optional params into a hash route: `#/call?room=ABC123`. */
export function screenToHash(screen: Screen, params: Record<string, string | undefined> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value.length > 0) search.set(key, value);
  }
  const query = search.toString();
  return `#/${screen}${query.length > 0 ? `?${query}` : ''}`;
}

/** Parses `#/screen?key=value` routes; returns null for unknown or legacy hashes. */
export function parseHash(hash: string): Route | null {
  if (!hash.startsWith('#/')) return null;
  const [path = '', query = ''] = hash.slice(2).split('?');
  const decoded = decodeURIComponent(path);
  if (!isScreen(decoded)) return null;
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(query)) params[key] = value;
  return { screen: decoded, params };
}

/** Reads a legacy invite hash (`#token=pnc1_…`) used by shared links. */
export function legacyTokenFromHash(hash: string): string | null {
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash;
  if (normalized.startsWith('/')) return null;
  const token = new URLSearchParams(normalized).get('token');
  return token !== null && token.length > 0 ? token : null;
}
