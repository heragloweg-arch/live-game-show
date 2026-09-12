/**
 * Economy API — talks to Edge Function `economy`
 * Falls back to profile.coins when function not deployed yet.
 */

import { supabase } from '../supabase/client';
import type { Wallet, LedgerEntry } from '../../types/economy';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : '';

async function token(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function invokeEconomy<T>(body: Record<string, unknown>): Promise<T> {
  const t = await token();
  if (!t) throw new Error('Not authenticated');

  const res = await fetch(`${FUNCTIONS_URL}/economy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${t}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Economy request failed');
  return data as T;
}

export async function fetchWallet(): Promise<Wallet> {
  try {
    return await invokeEconomy<Wallet>({ action: 'get_wallet' });
  } catch {
    // Fallback: read from profiles
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data } = await supabase
      .from('profiles')
      .select('id, coins, updated_at')
      .eq('id', user.id)
      .single();
    return {
      userId: user.id,
      coins: data?.coins ?? 0,
      gems: 0,
      updatedAt: data?.updated_at ?? new Date().toISOString(),
    };
  }
}

export async function fetchLedger(limit = 20): Promise<LedgerEntry[]> {
  try {
    const data = await invokeEconomy<{ entries: LedgerEntry[] }>({
      action: 'get_ledger',
      limit,
    });
    return data.entries ?? [];
  } catch {
    return [];
  }
}

export async function claimDailyBonus(): Promise<Wallet> {
  return invokeEconomy<Wallet>({ action: 'daily_bonus' });
}

export async function grantMatchReward(matchId: string, won: boolean): Promise<Wallet> {
  return invokeEconomy<Wallet>({
    action: 'match_reward',
    matchId,
    won,
  });
}
