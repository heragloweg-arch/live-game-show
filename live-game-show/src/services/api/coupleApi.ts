import { supabase } from '../supabase/client';

const BASE = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/couple`
  : '';

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Couple API failed');
  return data as T;
}

export const coupleStatus = () => invoke<{ couple: any }>({ action: 'status' });
export const coupleCreate = () => invoke<{ couple: any }>({ action: 'create' });
export const coupleJoin = (code: string) => invoke<{ couple: any; ok: boolean }>({ action: 'join', code });
export const coupleDissolve = () => invoke<{ ok: boolean }>({ action: 'dissolve' });
