/**
 * Feature flags — production defaults hide all demo paths.
 * Local engine only when explicitly enabled for developers.
 */
export const FLAGS = {
  /** Permanently disabled in production; all released matches use the server engine. */
  enableLocalDemo: false,
  /** Soft-fail analytics if not configured */
  analyticsEnabled: import.meta.env.VITE_ANALYTICS_ENABLED === 'true',
  adsEnabled: import.meta.env.VITE_ADS_ENABLED === 'true',
} as const;
