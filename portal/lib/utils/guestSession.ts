/**
 * Returns a stable anonymous session ID for the current browser tab (BL-90).
 * Uses sessionStorage so each tab gets its own ID, and it resets on tab close.
 */
export function getGuestSessionId(): string {
  const key = 'horuseye-anon-session';
  try {
    const stored = sessionStorage.getItem(key);
    if (stored) return stored;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return 'unknown';
  }
}
