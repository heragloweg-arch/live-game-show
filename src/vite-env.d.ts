/// <reference types="vite/client" />

interface QaddahaRuntimeEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

declare global {
  const __QADDAHA_BUILD_SUPABASE_URL__: string;
  const __QADDAHA_BUILD_SUPABASE_ANON_KEY__: string;
  interface Window {
    __QADDAHA_ENV__?: QaddahaRuntimeEnv;
  }
}

export {};
