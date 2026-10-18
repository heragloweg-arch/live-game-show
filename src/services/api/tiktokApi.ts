import { supabase } from '../supabase/client';
import { getFunctionsUrl, getSupabaseAnonKey } from '../../config/runtime';

const FUNCTIONS_URL = getFunctionsUrl('tiktok');

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  const response = await fetch(FUNCTIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: getSupabaseAnonKey(),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'تعذر تنفيذ طلب TikTok');
  return data as T;
}

export interface TikTokConnection {
  open_id: string;
  display_name: string | null;
  avatar_url: string | null;
  scopes: string[];
  created_at: string;
  updated_at: string;
}

export interface TikTokStatus {
  connected: boolean;
  connection: TikTokConnection | null;
}

export async function getTikTokStatus(): Promise<TikTokStatus> {
  return invoke<TikTokStatus>({ action: 'status' });
}

export async function startTikTokLink(): Promise<string> {
  const result = await invoke<{ authorizationUrl: string }>({ action: 'start' });
  return result.authorizationUrl;
}

export async function disconnectTikTok(): Promise<void> {
  await invoke({ action: 'disconnect' });
}
