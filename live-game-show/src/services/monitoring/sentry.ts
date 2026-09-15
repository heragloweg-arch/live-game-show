/**
 * Crash monitoring abstraction.
 * Production: set VITE_SENTRY_DSN and optionally install @sentry/react.
 * Without DSN — safe no-op hooks (console in dev).
 */
import { FLAGS } from '../../config/flags';

const dsn = typeof import.meta !== 'undefined' ? import.meta.env.VITE_SENTRY_DSN : '';

export function initMonitoring() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    captureException(e.error || e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    captureException(e.reason);
  });
  if (dsn) {
    console.info('[monitoring] Sentry DSN configured — wire @sentry/react SDK for full production');
  }
}

export function captureException(err: unknown, context?: Record<string, unknown>) {
  const msg = err instanceof Error ? err.message : String(err);
  if (import.meta.env.DEV) {
    console.error('[monitoring]', msg, context);
  }
  // Hook for future Sentry.captureException
  try {
    (window as any).__qaddaha_last_error = { msg, context, at: new Date().toISOString() };
  } catch { /* */ }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  if (import.meta.env.DEV) console[level === 'error' ? 'error' : 'log']('[monitoring]', message);
}
