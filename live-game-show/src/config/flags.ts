/**
 * Feature flags — production defaults hide all demo paths.
 * Local engine only when explicitly enabled for developers.
 */
export const FLAGS = {
  /** When false (default), UI never routes to solo-demo / local match engine */
  enableLocalDemo: import.meta.env.VITE_ENABLE_LOCAL_DEMO === 'true',
  /** Soft-fail analytics if not configured */
  analyticsEnabled: import.meta.env.VITE_ANALYTICS_ENABLED === 'true',
  adsEnabled: import.meta.env.VITE_ADS_ENABLED === 'true',
} as const;
