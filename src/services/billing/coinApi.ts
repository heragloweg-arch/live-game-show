import { supabase } from '../supabase/client';
import { getFunctionsUrl, getSupabaseAnonKey } from '../../config/runtime';

const FUNCTIONS_URL = getFunctionsUrl();

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  const response = await fetch(`${FUNCTIONS_URL}/subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: getSupabaseAnonKey(),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'تعذر تنفيذ شراء الكوين');
  return data as T;
}

export interface CoinPack {
  pack_id: string;
  title: string;
  coins: number;
  price_micros: number;
  currency: string;
  google_product_id: string;
}

export async function fetchCoinCatalog(): Promise<{ catalog: CoinPack[] }> {
  return invoke({ action: 'coin_catalog' });
}

export async function verifyGoogleCoinPurchase(params: {
  packId: string;
  productId: string;
  purchaseToken: string;
  orderId?: string;
}) {
  return invoke<{ ok: boolean; already?: boolean; coins: number; awarded: number; packId: string }>({
    action: 'verify_google_coin',
    ...params,
  });
}
