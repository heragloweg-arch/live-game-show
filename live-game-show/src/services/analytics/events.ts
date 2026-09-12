/**
 * Product analytics — Soft Launch & investor metrics foundation.
 * Wire to PostHog / Firebase later via VITE_ANALYTICS_KEY.
 */

import { FLAGS } from '../../config/flags';

export type AnalyticsEvent =
  | 'app_open'
  | 'onboarding_complete'
  | 'match_start'
  | 'match_finish'
  | 'match_abandon'
  | 'daily_complete'
  | 'host_create'
  | 'host_go_live'
  | 'host_end'
  | 'room_join'
  | 'answer_submit'
  | 'soft_launch_region'
  | 'ad_impression'
  | 'ad_reward_claimed';

type Props = Record<string, string | number | boolean | null | undefined>;

const buffer: { name: AnalyticsEvent; props: Props; at: string }[] = [];

export function track(name: AnalyticsEvent, props: Props = {}) {
  const entry = { name, props, at: new Date().toISOString() };
  buffer.push(entry);
  if (buffer.length > 200) buffer.shift();

  if (FLAGS.analyticsEnabled) {
    // Hook for real provider
    try {
      (window as unknown as { zatonaAnalytics?: { track: (n: string, p: Props) => void } })
        .zatonaAnalytics?.track(name, props);
    } catch {
      /* no-op */
    }
  }

  if (import.meta.env.DEV) {
    console.debug('[analytics]', name, props);
  }
}

export function getAnalyticsBuffer() {
  return [...buffer];
}

export function clearAnalyticsBuffer() {
  buffer.length = 0;
}

/** Funnel helpers for Data Room weekly report */
export function summarizeFunnel() {
  const counts: Record<string, number> = {};
  for (const e of buffer) {
    counts[e.name] = (counts[e.name] ?? 0) + 1;
  }
  const starts = counts.match_start ?? 0;
  const finishes = counts.match_finish ?? 0;
  return {
    counts,
    matchCompletionRate: starts ? finishes / starts : null,
    bufferSize: buffer.length,
  };
}
