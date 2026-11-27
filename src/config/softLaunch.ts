/**
 * Soft Launch configuration — MENA focus first.
 */

export type SoftLaunchRegion = 'sa' | 'eg' | 'ae' | 'global';

export const SOFT_LAUNCH = {
  /** Primary Soft Launch markets */
  regions: ['sa', 'eg'] as SoftLaunchRegion[],
  /** Feature gates during soft launch */
  features: {
    hostShow: false,
    dailyChallenge: true,
    matchmaking: true,
    // Rewarded ads stay off until production AdMob SSV evidence exists.
    ads: false,
    // The shop remains readable; purchase/restore is not a soft-launch CTA.
    billing: false,
    tournaments: false,
    couples: false,
    teams: false,
    creator: false,
  },
  /** Minimum quality gates before paid growth */
  qualityGates: {
    minMatchCompletionRate: 0.7,
    minCrashFreeSessionRate: 0.99,
    targetD1Retention: 0.25,
  },
  supportEmail: 'support@qaddaha.app',
  privacyUrl: '/legal/privacy',
  termsUrl: '/legal/terms',
} as const;

export function isFeatureEnabled(key: keyof typeof SOFT_LAUNCH.features): boolean {
  return SOFT_LAUNCH.features[key];
}
