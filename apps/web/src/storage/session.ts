/** Small typed sessionStorage helpers used to survive F5 without leaking data
 * into localStorage or the server (sessionStorage is per-tab and ephemeral). */

export function loadSession<T>(key: string, validate: (value: unknown) => T | null): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return null;
    return validate(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function saveSession(key: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota/privacy failures.
  }
}

export function clearSession(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}
