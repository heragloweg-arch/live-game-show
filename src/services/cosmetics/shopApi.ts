import { supabase } from '../supabase/client';

export type CosmeticKind = 'frame' | 'title' | 'theme' | 'emote';
export interface CosmeticItem {
  id: string;
  kind: CosmeticKind;
  title: string;
  price_coins: number;
  metadata: Record<string, unknown>;
  active: boolean;
  owned?: boolean;
  equipped?: boolean;
}

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : '';

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('يجب تسجيل الدخول أولاً');
  const response = await fetch(`${FUNCTIONS_URL}/economy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data.error ?? 'تعذر تنفيذ العملية'));
  return data as T;
}

export async function getCosmetics(): Promise<{ items: CosmeticItem[]; coins: number }> {
  return invoke({ action: 'list_cosmetics' });
}

export async function buyCosmetic(cosmeticId: string) {
  return invoke<{ ok: boolean; alreadyOwned?: boolean; cosmeticId: string; coins: number }>({
    action: 'buy_cosmetic', cosmeticId,
  });
}

export async function equipCosmetic(cosmeticId: string) {
  return invoke<{ ok: boolean; cosmeticId: string }>({ action: 'equip_cosmetic', cosmeticId });
}
