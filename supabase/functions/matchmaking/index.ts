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
const configuredOrigin = Deno.env.get('CORS_ALLOWED_ORIGIN') ?? Deno.env.get('TIKTOK_APP_ORIGIN') ?? 'https://qaddaha.app';
const corsHeaders = {
  'Access-Control-Allow-Origin': configuredOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Vary': 'Origin',
};
function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return null;
}

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
  const normalizedDifficulty = ['easy', 'normal', 'hard'].includes(difficulty) ? difficulty : 'normal';
  const normalizedRegion = typeof region === 'string' && region.trim() ? region.trim().slice(0, 32) : 'mena';

  // One server-side transaction now owns queue insertion, opponent claim,
  // match creation, participants, rounds, and both queue state transitions.
  const { data, error } = await supabase.rpc('join_matchmaking_atomic', {
    p_user_id: user.id,
    p_region: normalizedRegion,
    p_difficulty: normalizedDifficulty,
  });

  if (error || !data || !['queued', 'matched'].includes(data.status)) {
    console.error('[matchmaking] atomic join failed', error ?? data);
    return json({ error: 'تعذر إتمام المطابقة بأمان. حاول مرة أخرى.' }, 503);
  }

  if (data.status === 'matched') {
    return json({ status: 'matched', matchId: data.matchId, alreadyMatched: !!data.alreadyMatched });
  }

  if (data.reason === 'NOT_ENOUGH_PLAYABLE_CHALLENGES') {
    return json({
      status: 'queued',
      message: 'نبحث عن منافس؛ سيتم بدء المباراة عند توفر خمس جولات معتمدة.',
      code: data.reason,
    });
  }

  return json({ status: 'queued', message: 'Waiting for opponent...' });
}

async function checkStatus(supabase: any, userId: string) {
  // Still in queue?
  const { data: queueRow } = await supabase
    .from('matchmaking_queue')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'queued')
    .maybeSingle();

  if (queueRow) {
    const waited = Date.now() - new Date(queueRow.enqueued_at).getTime();
    if (waited > MATCH_TIMEOUT_MS) {
      const aiMatch = await createAiFallback(supabase, userId, queueRow.difficulty ?? 'normal');
      await supabase.from('matchmaking_queue').delete().eq('user_id', userId);
      return json({ status: 'matched', matchId: aiMatch.matchId, fallbackAi: true, message: 'لم نجد لاعباً متاحاً؛ بدأنا مباراة ضد خصم الكمبيوتر.' });
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

async function createAiFallback(supabase: any, userId: string, difficulty: string) {
  const TOTAL = 5;
  const { data: challenges } = await supabase
    .from('challenges')
    .select('id')
    .eq('active', true)
    .eq('qa_status', 'approved')
    .eq('difficulty', ['easy', 'normal', 'hard'].includes(difficulty) ? difficulty : 'normal')
    .limit(80);
  if (!challenges || challenges.length < TOTAL) throw new Error('Not enough approved challenges for AI fallback');
  const { data: profile } = await supabase.from('profiles').select('username, display_name, avatar_url').eq('id', userId).single();
  const { data: match, error } = await supabase.from('matches').insert({
    mode: '1v1', status: 'VS', difficulty, current_round: 1, total_rounds: TOTAL, sequence: 1, server_now: new Date().toISOString(),
  }).select().single();
  if (error || !match) throw new Error('Unable to create AI fallback match');
  await supabase.from('match_participants').insert([
    { match_id: match.id, user_id: userId, side: 'player', username: profile?.display_name || profile?.username || 'أنت', avatar_url: profile?.avatar_url, score: 0, is_ai: false },
    { match_id: match.id, user_id: null, side: 'ai', username: 'خصم الكمبيوتر', avatar_url: '/icons/app-icon.png', score: 0, is_ai: true, ai_difficulty: difficulty },
  ]);
  const selected = [...challenges].sort(() => Math.random() - 0.5).slice(0, TOTAL);
  const { error: roundsError } = await supabase.from('rounds').insert(selected.map((challenge: any, index: number) => ({
    match_id: match.id, round_number: index + 1, challenge_id: challenge.id, status: 'pending', sequence: 0,
  })));
  if (roundsError) throw new Error('Unable to prepare AI fallback rounds');
  return { matchId: match.id };
}
