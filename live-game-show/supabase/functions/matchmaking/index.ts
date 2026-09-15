/**
 * Edge Function: matchmaking
 * Real 1v1 matchmaking queue.
 *
 * Actions:
 *  join   { difficulty?, region? }
 *  cancel {}
 *  status {}  — check if matched
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const MATCH_TIMEOUT_MS = 60000; // 60s search window

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

    // Ensure profile
    const { data: profile } = await supabase.from('profiles').select('id, username, avatar_url').eq('id', user.id).maybeSingle();
    if (!profile) {
      await supabase.from('profiles').insert({
        id: user.id,
        username: 'player_' + user.id.slice(0, 8),
        display_name: 'لاعب قدها',
      });
    }

    const body = await req.json();
    const action = body.action as string;

    if (action === 'join') {
      return await joinQueue(supabase, user, body.difficulty ?? 'normal', body.region ?? 'mena');
    }
    if (action === 'cancel') {
      await supabase.from('matchmaking_queue').delete().eq('user_id', user.id);
      return json({ status: 'cancelled' });
    }
    if (action === 'status') {
      return await checkStatus(supabase, user.id);
    }

    return json({ error: 'Unknown action. Use join | cancel | status' }, 400);
  } catch (err) {
    console.error('[matchmaking]', err);
    return json({ error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function joinQueue(supabase: any, user: any, difficulty: string, region: string) {
  // Remove any existing queue entry
  await supabase.from('matchmaking_queue').delete().eq('user_id', user.id);

  // Try to find an opponent waiting
  const { data: candidates } = await supabase
    .from('matchmaking_queue')
    .select('*')
    .neq('user_id', user.id)
    .eq('region', region)
    .order('enqueued_at', { ascending: true })
    .limit(5);

  // Atomic claim with row lock (SKIP LOCKED) — prevents double-match race
  const { data: claimed, error: claimErr } = await supabase.rpc('claim_matchmaking_opponent', {
    p_user_id: user.id,
    p_region: region,
    p_difficulty: difficulty,
  });

  if (claimErr) {
    console.error('[matchmaking] claim', claimErr);
    // fallback to non-atomic path only if RPC missing
  } else if (claimed) {
    const match = await create1v1(supabase, user.id, claimed);
    return json({ status: 'matched', match });
  }

  if (!claimErr && candidates && candidates.length > 0) {
    // Should not reach if RPC works; kept as soft fallback
    const opponent = candidates[0];
    await supabase.from('matchmaking_queue').delete().eq('user_id', user.id);
    await supabase.from('matchmaking_queue').delete().eq('user_id', opponent.user_id);
    const match = await create1v1(supabase, user.id, opponent.user_id);
    return json({ status: 'matched', match });
  }

  // No opponent — enqueue
  await supabase.from('matchmaking_queue').insert({
    user_id: user.id,
    difficulty,
    region,
    skill_mmr: 1000,
  });

  return json({ status: 'queued', message: 'Waiting for opponent...' });
}

async function checkStatus(supabase: any, userId: string) {
  // Still in queue?
  const { data: queueRow } = await supabase
    .from('matchmaking_queue')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (queueRow) {
    const waited = Date.now() - new Date(queueRow.enqueued_at).getTime();
    if (waited > MATCH_TIMEOUT_MS) {
      await supabase.from('matchmaking_queue').delete().eq('user_id', userId);
      return json({ status: 'timeout', message: 'No opponent found. Try again.' });
    }
    return json({ status: 'queued', waitedMs: waited });
  }

  // Check if recently matched (participant in a VS/ROUND match created in last 30s)
  const { data: recent } = await supabase
    .from('match_participants')
    .select('match_id, matches!inner(id, status, created_at, mode)')
    .eq('user_id', userId)
    .eq('matches.mode', '1v1')
    .in('matches.status', ['VS', 'ROUND_STARTING', 'ROUND_ACTIVE'])
    .order('joined_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent) {
    return json({ status: 'matched', matchId: recent.match_id });
  }

  return json({ status: 'idle' });
}

async function create1v1(supabase: any, userId1: string, userId2: string) {
  const TOTAL = 5;
  const SEQUENCE = ['speed', 'knowledge', 'words', 'speed', 'mystery'];
  const now = new Date().toISOString();

  // Pick challenges
  const challenges: any[] = [];
  for (let i = 0; i < TOTAL; i++) {
    const t = SEQUENCE[i] === 'mystery' ? null : SEQUENCE[i];
    let q = supabase.from('challenges').select('id').eq('active', true).eq('qa_status', 'approved');
    if (t) q = q.eq('type', t);
    const { data } = await q.limit(20);
    if (data?.length) challenges.push(data[Math.floor(Math.random() * data.length)]);
  }

  const { data: match } = await supabase.from('matches').insert({
    mode: '1v1', status: 'VS', current_round: 1, total_rounds: TOTAL, sequence: 1, server_now: now,
  }).select().single();

  if (!match) throw new Error('Failed to create match');

  const { data: p1 } = await supabase.from('profiles').select('username, avatar_url').eq('id', userId1).single();
  const { data: p2 } = await supabase.from('profiles').select('username, avatar_url').eq('id', userId2).single();

  await supabase.from('match_participants').insert([
    { match_id: match.id, user_id: userId1, side: 'player', score: 0, username: p1?.username ?? 'p1', avatar_url: p1?.avatar_url },
    { match_id: match.id, user_id: userId2, side: 'opponent', score: 0, username: p2?.username ?? 'p2', avatar_url: p2?.avatar_url },
  ]);

  if (challenges.length > 0) {
    await supabase.from('rounds').insert(
      challenges.map((ch: any, i: number) => ({
        match_id: match.id, round_number: i + 1, challenge_id: ch.id, status: 'pending', sequence: 0,
      }))
    );
  }

  return { matchId: match.id, status: 'VS' };
}
