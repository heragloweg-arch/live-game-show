const runtimeEnv = typeof window !== 'undefined' ? window.__QADDAHA_ENV__ : undefined;

export function getSupabaseUrl(): string {
  return (runtimeEnv?.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
}

export function getSupabaseAnonKey(): string {
  return runtimeEnv?.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
}

export function getFunctionsUrl(functionName?: string): string {
  const base = `${getSupabaseUrl()}/functions/v1`;
  return functionName ? `${base}/${functionName}` : base;
}
