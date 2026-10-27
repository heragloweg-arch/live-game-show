/**
 * Ephemeral client diagnostics only.
 * Authoritative D1/D7/D14 and session-2 retention is recorded by the server in retention_opens.
 * Deliberately does not persist to localStorage/sessionStorage.
 */
export interface RetentionState {
  firstOpenAt: string;
  lastOpenAt: string;
  openDays: string[];
  totalOpens: number;
  userId?: string;
}

let memoryState: RetentionState | null = null;

function todayMena(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T12:00:00Z').getTime();
  const db = new Date(b + 'T12:00:00Z').getTime();
  return Math.round((db - da) / 86400000);
}

export function loadRetention(): RetentionState {
  if (memoryState) return { ...memoryState, openDays: [...memoryState.openDays] };
  const now = new Date().toISOString();
  return { firstOpenAt: now, lastOpenAt: now, openDays: [], totalOpens: 0 };
}

export function saveRetention(s: RetentionState) {
  memoryState = { ...s, openDays: [...s.openDays] };
}

export function recordOpen(userId?: string): {
  state: RetentionState;
  isD1: boolean;
  isD7: boolean;
  dayNumber: number;
} {
  const s = loadRetention();
  const today = todayMena();
  const firstDay = s.openDays[0] ?? today;
  if (!s.openDays.includes(today)) s.openDays = [...s.openDays, today].slice(-60);
  s.lastOpenAt = new Date().toISOString();
  s.totalOpens += 1;
  if (userId) s.userId = userId;
  if (!s.firstOpenAt) s.firstOpenAt = s.lastOpenAt;
  saveRetention(s);
  const dayNumber = daysBetween(firstDay, today);
  return { state: s, isD1: dayNumber === 1, isD7: dayNumber === 7, dayNumber };
}

export function retentionSnapshot() {
  const s = loadRetention();
  const today = todayMena();
  const firstDay = s.openDays[0] ?? today;
  const dayNumber = daysBetween(firstDay, today);
  return {
    source: 'client_diagnostic_only' as const,
    firstOpenAt: s.firstOpenAt,
    lastOpenAt: s.lastOpenAt,
    totalOpens: s.totalOpens,
    uniqueDays: s.openDays.length,
    dayNumber,
    returnedD1: s.openDays.some((d) => daysBetween(firstDay, d) === 1),
    returnedD7: s.openDays.some((d) => daysBetween(firstDay, d) === 7),
    openDays: s.openDays,
  };
}
