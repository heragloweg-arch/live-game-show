import { supabase } from '../supabase/client';

export async function spendFiftyFifty(matchId: string, roundId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/answer`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '' },
    body: JSON.stringify({ action: 'spend_lifeline', lifelineType: 'fifty_fifty', matchId, roundId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Lifeline unavailable');
  return data as { ok: boolean; remaining: number; removedChoiceIds: string[]; alreadyUsed?: boolean };
}
