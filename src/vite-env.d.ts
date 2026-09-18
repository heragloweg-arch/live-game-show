/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_ADS_ENABLED?: string;
  readonly VITE_ANALYTICS_ENABLED?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_ENABLE_LOCAL_DEMO?: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_ADMOB_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
