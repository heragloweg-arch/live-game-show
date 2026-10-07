/**
 * Economy API — talks to Edge Function `economy`
 * Production source of truth is the economy Edge Function.
 */

import { supabase } from '../supabase/client';
import { getFunctionsUrl, getSupabaseAnonKey } from '../../config/runtime';
import type { Wallet, LedgerEntry } from '../../types/economy';

const FUNCTIONS_URL = getFunctionsUrl();

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
      apikey: getSupabaseAnonKey(),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Economy request failed');
  return data as T;
}

export async function fetchWallet(): Promise<Wallet> {
  return invokeEconomy<Wallet>({ action: 'get_wallet' });
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

export async function grantMatchReward(matchId: string, _won?: boolean): Promise<Wallet> {
  return invokeEconomy<Wallet>({
    action: 'match_reward',
    matchId,
      });
}
