/**
 * AdMob production bridge — Capacitor @capacitor-community/admob (optional)
 * + frequency caps + server-safe reward claim hook.
 *
 * Env:
 *  VITE_ADMOB_BANNER_ID
 *  VITE_ADMOB_INTERSTITIAL_ID
 *  VITE_ADMOB_REWARDED_ID
 *  VITE_ADS_ENABLED=true
 */

import { Capacitor } from '@capacitor/core';
import { getFunctionsUrl, getSupabaseAnonKey } from '../../config/runtime';
import { isFeatureEnabled } from '../../config/softLaunch';
import { track } from '../analytics/events';
import { shouldShowAds } from '../billing/entitlements';

export type AdPlacement =
  | 'home_banner'
  | 'post_match_interstitial'
  | 'rewarded_extra_coins'
  | 'between_rounds';

export type AdResult = 'shown' | 'skipped' | 'disabled' | 'capped' | 'failed' | 'rewarded' | 'reward_pending';

const STORAGE_PREFIX = 'qaddaha_ad_';

interface CapState {
  lastInterstitialAt: number;
  interstitialCountToday: number;
  dayKey: string;
  rewardedCountToday: number;
}

function dayKey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

function loadState(): CapState {
  const today = dayKey();
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + 'state');
    if (raw) {
      const s = JSON.parse(raw) as CapState;
      if (s.dayKey === today) return s;
    }
  } catch {
    /* */
  }
  return { lastInterstitialAt: 0, interstitialCountToday: 0, dayKey: today, rewardedCountToday: 0 };
}

function saveState(s: CapState) {
  try {
    localStorage.setItem(STORAGE_PREFIX + 'state', JSON.stringify(s));
  } catch {
    /* */
  }
}

/** Product rules — never P2W */
export const AD_POLICY = {
  minMsBetweenInterstitials: 90_000,
  maxInterstitialsPerDay: 8,
  maxRewardedPerDay: 12,
  /** Never show ads during active answer window */
  allowDuringRound: false,
} as const;

function adsGloballyEnabled(): boolean {
  if (!shouldShowAds()) return false;
  if (import.meta.env.VITE_ADS_ENABLED === 'true') return true;
  return isFeatureEnabled('ads');
}

export function canShowAd(placement: AdPlacement, opts?: { inRound?: boolean }): boolean {
  if (!adsGloballyEnabled()) return false;
  if (opts?.inRound && !AD_POLICY.allowDuringRound) return false;

  const s = loadState();
  if (placement === 'post_match_interstitial' || placement === 'between_rounds') {
    if (s.interstitialCountToday >= AD_POLICY.maxInterstitialsPerDay) return false;
    if (Date.now() - s.lastInterstitialAt < AD_POLICY.minMsBetweenInterstitials) return false;
  }
  if (placement === 'rewarded_extra_coins') {
    if (s.rewardedCountToday >= AD_POLICY.maxRewardedPerDay) return false;
  }
  return true;
}

async function loadAdMob(): Promise<any | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    // Optional peer — install @capacitor-community/admob on device build
    const mod = await import(/* @vite-ignore */ '@capacitor-community/admob');
    return mod.AdMob ?? mod.default ?? mod;
  } catch {
    return null;
  }
}

let initialized = false;

export async function initAds(): Promise<void> {
  if (initialized || !adsGloballyEnabled()) return;
  const AdMob = await loadAdMob();
  if (!AdMob) return;
  try {
    await AdMob.initialize({
      requestTrackingAuthorization: true,
      initializeForTesting: import.meta.env.VITE_ADMOB_TEST === 'true',
    });
    initialized = true;
  } catch (e) {
    console.warn('[ads] init failed', e);
  }
}

function unitId(placement: AdPlacement): string | undefined {
  if (placement === 'home_banner') return import.meta.env.VITE_ADMOB_BANNER_ID;
  if (placement === 'rewarded_extra_coins') return import.meta.env.VITE_ADMOB_REWARDED_ID;
  return import.meta.env.VITE_ADMOB_INTERSTITIAL_ID;
}

/**
 * Show placement. On web/dev without AdMob: logs + tracks, returns skipped
 * unless VITE_ADS_SIMULATE=true then pretends shown.
 */
export async function showAd(
  placement: AdPlacement,
  opts?: { inRound?: boolean }
): Promise<AdResult> {
  if (!adsGloballyEnabled()) return 'disabled';
  if (!canShowAd(placement, opts)) {
    track('ad_skipped', { placement, reason: 'capped_or_policy' });
    return 'capped';
  }

  const id = unitId(placement);
  track('ad_impression', { placement, unit: id ?? 'none', platform: Capacitor.getPlatform() });

  const AdMob = await loadAdMob();
  if (AdMob && id) {
    try {
      if (placement === 'home_banner') {
        await AdMob.showBanner({
          adId: id,
          adSize: 'ADAPTIVE_BANNER',
          position: 'BOTTOM_CENTER',
          margin: 0,
        });
        return 'shown';
      }

      if (placement === 'rewarded_extra_coins') {
        const pending = await prepareAdRewardOnServer(placement);
        if (!pending) return 'failed';
        await AdMob.prepareRewardVideoAd({
          adId: id,
          ssv: { userId: pending.userId, customData: pending.requestId },
        });
        const reward = await AdMob.showRewardVideoAd();
        const s = loadState();
        s.rewardedCountToday += 1;
        saveState(s);
        track('rewarded_pending', {
          placement,
          rewardType: String(reward?.type ?? ''),
          serverVerification: 'pending',
          requestId: pending.requestId,
        });
        return 'reward_pending';
      }

      // interstitial
      await AdMob.prepareInterstitial({ adId: id });
      await AdMob.showInterstitial();
      const s = loadState();
      s.lastInterstitialAt = Date.now();
      s.interstitialCountToday += 1;
      saveState(s);
      return 'shown';
    } catch (e) {
      track('ad_failed', { placement, message: String(e) });
      return 'failed';
    }
  }

  // Simulate on web for QA
  if (import.meta.env.VITE_ADS_SIMULATE === 'true') {
    const s = loadState();
    if (placement === 'rewarded_extra_coins') {
      // Simulated ads must never mint production currency.
      track('ad_skipped', { placement, reason: 'ssv_not_available_in_simulation' });
      return 'failed';
    }
    if (placement !== 'home_banner') {
      s.lastInterstitialAt = Date.now();
      s.interstitialCountToday += 1;
      saveState(s);
    }
    return 'shown';
  }

  track('ad_skipped', { placement, reason: 'no_native_sdk' });
  return 'skipped';
}

export async function hideBanner(): Promise<void> {
  const AdMob = await loadAdMob();
  try {
    await AdMob?.hideBanner?.();
  } catch {
    /* */
  }
}


export interface PendingAdReward {
  requestId: string;
  userId: string;
}
export async function prepareAdRewardOnServer(placement: AdPlacement): Promise<PendingAdReward | null> {
  try {
    if (placement !== 'rewarded_extra_coins' || typeof crypto?.randomUUID !== 'function') return null;
    const { supabase } = await import('../supabase/client');
    const requestId = crypto.randomUUID();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    const response = await fetch(getFunctionsUrl('economy'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: getSupabaseAnonKey(),
      },
      body: JSON.stringify({ action: 'ad_reward_prepare', placement, requestId }),
    });
    if (!response.ok) return null;
    const result = await response.json() as { requestId?: string; userId?: string; status?: string };
    if (result.requestId !== requestId || result.userId !== session.user.id || result.status !== 'pending') return null;
    return { requestId, userId: result.userId };
  } catch { return null; }
}
