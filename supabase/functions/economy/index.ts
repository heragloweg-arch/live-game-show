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

    if (action === 'list_cosmetics') {
      const [{ data: catalog, error: catalogError }, { data: owned }, { data: profile }] = await Promise.all([
        supabase.from('cosmetic_catalog').select('id,kind,title,price_coins,metadata,active').eq('active', true).order('price_coins'),
        supabase.from('user_cosmetics').select('cosmetic_id,equipped').eq('user_id', user.id),
        supabase.from('profiles').select('coins').eq('id', user.id).single(),
      ]);
      if (catalogError) return json({ error: catalogError.message }, 500);
      const ownedMap = new Map((owned ?? []).map((row: any) => [row.cosmetic_id, row]));
      return json({
        coins: profile?.coins ?? 0,
        items: (catalog ?? []).map((item: any) => ({
          ...item,
          owned: ownedMap.has(item.id),
          equipped: !!ownedMap.get(item.id)?.equipped,
        })),
      });
    }

    if (action === 'buy_cosmetic') {
      const cosmeticId = String(body.cosmeticId ?? '');
      if (!cosmeticId) return json({ error: 'cosmeticId required' }, 400);
      const { data, error } = await supabase.rpc('purchase_cosmetic_atomic', {
        p_user_id: user.id,
        p_cosmetic_id: cosmeticId,
      });
      if (error) return json({ error: error.message }, 400);
      return json(data);
    }

    if (action === 'equip_cosmetic') {
      const cosmeticId = String(body.cosmeticId ?? '');
      if (!cosmeticId) return json({ error: 'cosmeticId required' }, 400);
      const { data, error } = await supabase.rpc('equip_cosmetic_atomic', {
        p_user_id: user.id,
        p_cosmetic_id: cosmeticId,
      });
      if (error) return json({ error: error.message }, 400);
      return json(data);
    }

    if (action === 'weekly_journey') {
      const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const today = now.toISOString().slice(0, 10);
      const start = new Date(now);
      start.setUTCDate(start.getUTCDate() - 6);
      const startDate = start.toISOString().slice(0, 10);
      const { data: packs, error: packsError } = await supabase.from('daily_packs').select('id,pack_date').gte('pack_date', startDate).lte('pack_date', today).order('pack_date');
      if (packsError) return json({ error: packsError.message }, 500);
      const packIds = (packs ?? []).map((p: any) => p.id);
      const { data: completions } = packIds.length ? await supabase.from('daily_pack_completions').select('pack_id,slot_id').eq('user_id', user.id).in('pack_id', packIds) : { data: [] };
      const counts = new Map<string, number>();
      for (const row of completions ?? []) counts.set(row.pack_id, (counts.get(row.pack_id) ?? 0) + 1);
      return json({ today, days: (packs ?? []).map((p: any) => ({ date: p.pack_date, completedSlots: Math.min(3, counts.get(p.id) ?? 0), complete: (counts.get(p.id) ?? 0) >= 3 })) });
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
      const { matchId } = body;
      if (!matchId) return json({ error: 'matchId required' }, 400);

      // Participant + server winner only
      const { data: matchRow } = await supabase
        .from('matches')
        .select('id, winner_id, status')
        .eq('id', matchId)
        .single();
      if (!matchRow) return json({ error: 'Match not found' }, 404);
      const { data: part } = await supabase
        .from('match_participants')
        .select('user_id')
        .eq('match_id', matchId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!part) return json({ error: 'Not a participant' }, 403);
      if (!['MATCH_FINISHED', 'FINAL_RESULT'].includes(matchRow.status)) {
        return json({ error: 'Match not finished' }, 409);
      }
      const won = matchRow.winner_id === user.id;
      const draw = matchRow.winner_id == null;

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

      const amount = draw ? 25 : won ? WIN_COINS : LOSS_COINS;
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

    
    if (action === 'ad_reward_claim') {
      const requestId = String(body.requestId || '');
      const placement = String(body.placement || 'rewarded_extra_coins');
      if (!requestId) return json({ error: 'requestId required' }, 400);
      const { data, error } = await supabase.rpc('claim_ad_reward_atomic', {
        p_user_id: user.id,
        p_request_id: requestId,
        p_placement: placement,
        p_coins: 20,
        p_daily_cap: 12,
      });
      if (error) return json({ error: error.message, code: /limit/i.test(error.message) ? 'CAPPED' : 'CLAIM_FAILED' }, /limit/i.test(error.message) ? 429 : 400);
      return json(data);
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
