const lastByKey = new Map<string, number>();

/** Returns true if call is allowed (min interval ms) */
export function allowAction(key: string, minIntervalMs = 400): boolean {
  const now = Date.now();
  const prev = lastByKey.get(key) ?? 0;
  if (now - prev < minIntervalMs) return false;
  lastByKey.set(key, now);
  return true;
}
