/**
 * Production analytics — PostHog HTTP + local buffer + session metrics.
 * Enable with VITE_ANALYTICS_ENABLED=true and VITE_POSTHOG_KEY / VITE_POSTHOG_HOST
 */

import { FLAGS } from '../../config/flags';
import { BRAND } from '../../config/brand';
import { recordOpen, retentionSnapshot } from './retention';
import { trackFirebase } from './firebaseBridge';

export type AnalyticsEvent =
  | 'install'
  | 'app_open'
  | 'onboarding_start'
  | 'onboarding_complete'
  | 'match_start'
  | 'match_finish'
  | 'match_complete'
  | 'match_win'
  | 'match_loss'
  | 'match_draw'
  | 'match_abandon'
  | 'round_start'
  | 'answer_submit'
  | 'answer_correct'
  | 'answer_wrong'
  | 'daily_start'
  | 'daily_complete'
  | 'invite_created'
  | 'invite_accepted'
  | 'host_create'
  | 'host_go_live'
  | 'host_end'
  | 'room_join'
  | 'soft_launch_region'
  | 'ad_impression'
  | 'ad_clicked'
  | 'ad_reward_claimed'
  | 'ad_skipped'
  | 'ad_failed'
  | 'reward_claim'
  | 'subscription_view'
  | 'subscription_start'
  | 'subscription_success'
  | 'tournament_join'
  | 'share_result'
  | 'team_queue'
  | 'screen_view'
  | 'error_client';

type Props = Record<string, string | number | boolean | null | undefined>;

interface BufferedEvent {
  name: AnalyticsEvent;
  props: Props;
  at: string;
}

const buffer: BufferedEvent[] = [];
const SESSION_KEY = 'qaddaha_analytics_sid';
const FIRST_OPEN_KEY = 'qaddaha_first_open';

function sessionId(): string {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return `s_${Date.now()}`;
  }
}

function isFirstOpen(): boolean {
  try {
    if (localStorage.getItem(FIRST_OPEN_KEY)) return false;
    localStorage.setItem(FIRST_OPEN_KEY, new Date().toISOString());
    return true;
  } catch {
    return false;
  }
}

function baseProps(): Props {
  return {
    brand: BRAND.nameEn,
    app: BRAND.name,
    session_id: sessionId(),
    platform: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : 'unknown',
    path: typeof location !== 'undefined' ? location.pathname : undefined,
  };
}

async function sendPostHog(name: string, props: Props) {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com';
  if (!key) return;

  const payload = {
    api_key: key,
    event: name,
    properties: {
      ...baseProps(),
      ...props,
      $lib: 'qaddaha-web',
      distinct_id: props.user_id || sessionId(),
    },
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(`${host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    /* offline — buffer only */
  }
}

export function track(name: AnalyticsEvent, props: Props = {}) {
  const entry: BufferedEvent = {
    name,
    props: { ...baseProps(), ...props },
    at: new Date().toISOString(),
  };
  buffer.push(entry);
  if (buffer.length > 300) buffer.shift();

  if (FLAGS.analyticsEnabled) {
    void sendPostHog(name, entry.props);
    try { trackFirebase(name, entry.props as Record<string, unknown>); } catch { /* */ }
    try {
      (window as unknown as { qaddahaAnalytics?: { track: (n: string, p: Props) => void } })
        .qaddahaAnalytics?.track(name, entry.props);
    } catch {
      /* */
    }
  }

  if (import.meta.env.DEV) {
    console.debug('[analytics]', name, props);
  }
}

export function trackScreen(screen: string) {
  track('screen_view', { screen });
}

export function trackAppOpen(userId?: string) {
  const ret = recordOpen(userId);
  track('app_open', {
    first_open: isFirstOpen(),
    day_number: ret.dayNumber,
    is_d1_return: ret.isD1,
    is_d7_return: ret.isD7,
    unique_days: ret.state.openDays.length,
    total_opens: ret.state.totalOpens,
    user_id: userId,
  });
  if (ret.isD1) track('soft_launch_region', { retention_event: 'd1_return' });
  if (ret.isD7) track('soft_launch_region', { retention_event: 'd7_return' });
}

export function getRetentionSnapshot() {
  return retentionSnapshot();
}

export function getAnalyticsBuffer() {
  return [...buffer];
}

export function clearAnalyticsBuffer() {
  buffer.length = 0;
}

export function summarizeFunnel() {
  const counts: Record<string, number> = {};
  for (const e of buffer) {
    counts[e.name] = (counts[e.name] ?? 0) + 1;
  }
  const starts = counts.match_start ?? 0;
  const finishes = counts.match_finish ?? 0;
  const impressions = counts.ad_impression ?? 0;
  return {
    counts,
    matchCompletionRate: starts ? finishes / starts : null,
    adImpressions: impressions,
    bufferSize: buffer.length,
    sessionId: sessionId(),
    retention: retentionSnapshot(),
  };
}
