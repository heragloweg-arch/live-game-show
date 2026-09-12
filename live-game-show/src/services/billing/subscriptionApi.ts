import { supabase } from '../supabase/client';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : '';

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  const res = await fetch(`${FUNCTIONS_URL}/subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Subscription API failed');
  return data as T;
}

export type PlanId = 'free' | 'plus_monthly' | 'plus_yearly' | 'host_pro';

export interface CatalogItem {
  plan: PlanId;
  title: string;
  description: string;
  price_micros: number;
  currency: string;
  period_days: number;
  google_product_id: string | null;
  benefits_json: Record<string, unknown>;
}

export async function fetchCatalog() {
  return invoke<{ catalog: CatalogItem[] }>({ action: 'catalog' });
}

export async function fetchSubscriptionStatus() {
  return invoke<{
    plan: PlanId;
    status: string;
    expiresAt?: string;
    subscription?: unknown;
  }>({ action: 'status' });
}

/** After Google Play Billing Client purchase */
export async function verifyGooglePurchase(params: {
  productId: string;
  purchaseToken: string;
  orderId?: string;
}) {
  return invoke<{ ok: boolean; plan: PlanId; expiresAt: string }>({
    action: 'verify_google',
    ...params,
  });
}

/** Staging only — server must allow ALLOW_DEV_BILLING=true */
export async function activateDevPlan(plan: PlanId) {
  return invoke<{ ok: boolean; plan: PlanId; expiresAt: string }>({
    action: 'activate_dev',
    plan,
  });
}

export async function cancelSubscription() {
  return invoke<{ ok: boolean }>({ action: 'cancel' });
}

export function formatPrice(micros: number, currency = 'SAR') {
  const value = micros / 1_000_000;
  try {
    return new Intl.NumberFormat('ar-SA', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}
