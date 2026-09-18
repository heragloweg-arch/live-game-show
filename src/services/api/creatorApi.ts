import { supabase } from '../supabase/client';

const BASE = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/creator`
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
  if (!res.ok) throw new Error(data.error ?? 'Creator API failed');
  return data as T;
}

export const creatorStatus = () => invoke<{ isCreator: boolean; bio?: string; submissions: number }>({ action: 'status' });
export const creatorEnable = (bio?: string) => invoke({ action: 'enable', bio });
export const creatorList = () => invoke<{ items: any[] }>({ action: 'list' });
export const creatorSubmit = (payload: {
  prompt: string;
  answers: string[];
  type?: string;
  difficulty?: string;
  timeLimitMs?: number;
}) => invoke({ action: 'submit', ...payload });
