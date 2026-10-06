import { createClient } from '@supabase/supabase-js';

const runtimeEnv = typeof window !== 'undefined' ? window.__QADDAHA_ENV__ : undefined;
const supabaseUrl = runtimeEnv?.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = runtimeEnv?.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const invalidProductionConfig = import.meta.env.PROD && (
  !supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')
);
if (invalidProductionConfig) {
  throw new Error('[Qaddaha] Production requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Railway runtime variables.');
}

export const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'local-development-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  },
);

export type SupabaseClient = typeof supabase;
