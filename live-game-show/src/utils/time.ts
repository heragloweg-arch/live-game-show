/**
 * Server-time helpers.
 * Client never trusts local clock for round end decisions.
 */

export function parseServerTime(iso: string): number {
  return new Date(iso).getTime();
}

export function remainingMs(serverEndAt: string, serverNow: string): number {
  const end = parseServerTime(serverEndAt);
  const now = parseServerTime(serverNow);
  return Math.max(0, end - now);
}

export function formatCountdown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) {
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  return s.toString();
}

export function isExpired(serverEndAt: string, serverNow: string): boolean {
  return remainingMs(serverEndAt, serverNow) <= 0;
}
