/**
 * Soft Launch configuration — MENA focus first.
 */

export type SoftLaunchRegion = 'sa' | 'eg' | 'ae' | 'global';

export const SOFT_LAUNCH = {
  /** Primary Soft Launch markets */
  regions: ['sa', 'eg'] as SoftLaunchRegion[],
  /** Feature gates during soft launch */
  features: {
    hostShow: true,
    dailyChallenge: true,
    matchmaking: true,
    ads: false, // enable after retention baseline
    billing: true,
    tournaments: true,
    couples: false,
  },
  /** Minimum quality gates before paid growth */
  qualityGates: {
    minMatchCompletionRate: 0.7,
    minCrashFreeSessionRate: 0.99,
    targetD1Retention: 0.25,
  },
  supportEmail: 'support@zatona.app',
  privacyUrl: '/legal/privacy',
  termsUrl: '/legal/terms',
} as const;

export function isFeatureEnabled(key: keyof typeof SOFT_LAUNCH.features): boolean {
  return SOFT_LAUNCH.features[key];
}
