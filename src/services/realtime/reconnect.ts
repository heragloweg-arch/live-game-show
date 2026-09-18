/**
 * Match reconnect helpers — persist active match for resume after refresh/network blip.
 */

const KEY = 'qaddaha:activeMatch';
const TERMINAL = new Set([
  'MATCH_FINISHED',
  'FINAL_RESULT',
  'MATCH_TERMINATED',
  'IDLE',
]);

export interface ActiveMatchRef {
  matchId: string;
  savedAt: string;
  mode?: string;
}

export function saveActiveMatch(matchId: string, mode?: string) {
  if (typeof window === 'undefined') return;
  if (!matchId || matchId === 'solo-demo' || matchId.startsWith('solo')) return;
  const payload: ActiveMatchRef = {
    matchId,
    mode,
    savedAt: new Date().toISOString(),
  };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* private mode */
  }
}

export function loadActiveMatch(): ActiveMatchRef | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveMatchRef;
  } catch {
    return null;
  }
}

export function clearActiveMatch() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* */
  }
}

export function shouldClearForStatus(status: string | undefined) {
  return !!status && TERMINAL.has(status);
}

/** Simple online detector */
export function subscribeOnline(cb: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const on = () => cb(true);
  const off = () => cb(false);
  window.addEventListener('online', on);
  window.addEventListener('offline', off);
  cb(navigator.onLine);
  return () => {
    window.removeEventListener('online', on);
    window.removeEventListener('offline', off);
  };
}
