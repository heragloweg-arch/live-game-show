/**
 * Edge Function: economy
 * Wallet + rewards + daily bonus (server-authoritative).
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const WIN_COINS = 50;
const LOSS_COINS = 15;
const DAILY_BONUS = 25;

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authErr || !user) return json({ error: 'Invalid token' }, 401);

    const body = await req.json();
    const action = body.action as string;

    if (action === 'get_wallet') {
      const { data } = await supabase.from('profiles').select('id, coins, updated_at').eq('id', user.id).single();
      return json({
        userId: user.id,
        coins: data?.coins ?? 0,
        gems: 0,
        updatedAt: data?.updated_at ?? new Date().toISOString(),
      });
    }

    if (action === 'get_ledger') {
      const limit = Math.min(body.limit ?? 20, 50);
      const { data } = await supabase
        .from('wallet_ledger')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      const entries = (data ?? []).map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        type: r.type,
        currency: r.currency,
        amount: r.amount,
        balanceAfter: r.balance_after,
        referenceId: r.reference_id,
        meta: r.meta,
        createdAt: r.created_at,
      }));
      return json({ entries });
    }

    if (action === 'daily_bonus') {
      const today = new Date().toISOString().slice(0, 10);
      const { data: claim } = await supabase
        .from('daily_bonus_claims')
        .select('last_claim')
        .eq('user_id', user.id)
        .maybeSingle();

      if (claim?.last_claim === today) {
        return json({ error: 'Already claimed today' }, 400);
      }

      const { data: balance } = await supabase.rpc('credit_coins', {
        p_user_id: user.id,
        p_amount: DAILY_BONUS,
        p_type: 'daily_bonus',
        p_reference: today,
      });

      await supabase.from('daily_bonus_claims').upsert({
        user_id: user.id,
        last_claim: today,
      });

      return json({
        userId: user.id,
        coins: balance ?? 0,
        gems: 0,
        updatedAt: new Date().toISOString(),
      });
    }

    if (action === 'match_reward') {
      const { matchId, won } = body;
      if (!matchId) return json({ error: 'matchId required' }, 400);

      // Prevent double reward
      const { data: existing } = await supabase
        .from('wallet_ledger')
        .select('id')
        .eq('user_id', user.id)
        .eq('type', 'match_reward')
        .eq('reference_id', matchId)
        .maybeSingle();

      if (existing) {
        const { data } = await supabase.from('profiles').select('coins, updated_at').eq('id', user.id).single();
        return json({
          userId: user.id,
          coins: data?.coins ?? 0,
          gems: 0,
          updatedAt: data?.updated_at ?? new Date().toISOString(),
          alreadyRewarded: true,
        });
      }

      const amount = won ? WIN_COINS : LOSS_COINS;
      const { data: balance } = await supabase.rpc('credit_coins', {
        p_user_id: user.id,
        p_amount: amount,
        p_type: 'match_reward',
        p_reference: matchId,
      });

      return json({
        userId: user.id,
        coins: balance ?? 0,
        gems: 0,
        updatedAt: new Date().toISOString(),
        rewarded: amount,
      });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('[economy]', err);
    return json({ error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
