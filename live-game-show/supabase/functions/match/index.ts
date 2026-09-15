/**
 * Edge Function: match — Phase A production lifecycle
 * Solo includes deterministic AI scoring. Finish settles XP + coins idempotently.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { calculateScore, DEFAULT_SCORING } from '../_shared/scoring.ts';
import {
  assertMatchParticipant,
  assertMatchNotFinished,
  canAdvanceRound,
} from '../_shared/authz.ts';

const TOTAL_ROUNDS = 5;
const ROUND_SEQUENCE = ['speed', 'knowledge', 'words', 'speed', 'mystery'];
const WIN_COINS = 50;
const LOSS_COINS = 15;
const WIN_XP = 50;
const LOSS_XP = 20;

const AI_ACCURACY: Record<string, number> = { easy: 0.45, normal: 0.68, hard: 0.88 };


/** Team/multiplayer: never block forever — round ends when server_end_at passed */
const FORCE_CLOSE_ON_TIMEOUT = true;

async function closeActiveRoundIfExpired(supabase: any, matchId: string) {
  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('match_id', matchId)
    .eq('status', 'active')
    .maybeSingle();
  if (!round?.server_end_at) return;
  if (new Date(round.server_end_at).getTime() > Date.now()) return;
  await supabase.from('rounds').update({ status: 'finished', sequence: (round.sequence || 0) + 1 }).eq('id', round.id);
}

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

    await ensureProfile(supabase, user);
    const body = await req.json();
    const action = body.action as string;

    switch (action) {
      case 'create_solo':
        return await createSoloMatch(supabase, user, body.difficulty ?? 'normal');
      case 'create_couple':
        return await createCoupleMatch(supabase, user, body.difficulty ?? 'normal');
      case 'create_invite':
        return await createMatchInvite(supabase, user, body.difficulty ?? 'normal');
      case 'accept_invite':
        return await acceptMatchInvite(supabase, user, body.token);
      case 'create_1v1':
        // Public create_1v1 requires invite token (anti-abuse)
        if (!body.inviteToken) {
          return json({ error: 'استخدم دعوة 1v1 (inviteToken) أو matchmaking', code: 'INVITE_REQUIRED' }, 403);
        }
        return await acceptMatchInvite(supabase, user, body.inviteToken);
      case 'get':
        return await getMatch(supabase, body.matchId, user.id);
      case 'start_round':
        return await startRound(supabase, body.matchId, user.id);
      case 'next_round':
        if (FORCE_CLOSE_ON_TIMEOUT) await closeActiveRoundIfExpired(supabase, body.matchId || body.match_id);

        return await nextRound(supabase, body.matchId, user.id);
      case 'finish':
        return await finishMatch(supabase, body.matchId, user.id);
      case 'settle':
        return await finishMatch(supabase, body.matchId, user.id);
      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (err) {
    console.error('[match]', err);
    return json({ error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

async function ensureProfile(supabase: any, user: any) {
  const { data } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!data) {
    await supabase.from('profiles').insert({
      id: user.id,
      username: user.user_metadata?.username ?? 'player_' + user.id.slice(0, 8),
      display_name: user.user_metadata?.display_name ?? 'لاعب قدها',
    });
  }
}

async function pickChallenges(supabase: any, count: number) {
  const challenges: any[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    const desiredType = ROUND_SEQUENCE[i] === 'mystery' ? null : ROUND_SEQUENCE[i];
    let query = supabase
      .from('challenges')
      .select('id, type, subtype, prompt, difficulty, time_limit_ms, letter_pool, weight')
      .eq('active', true)
      .eq('qa_status', 'approved');
    if (desiredType) query = query.eq('type', desiredType);
    const { data } = await query.limit(80);
    const pool = (data ?? []).filter((c: any) => !used.has(c.id));
    if (!pool.length && data?.length) {
      challenges.push(data[Math.floor(Math.random() * data.length)]);
      continue;
    }
    if (!pool.length) continue;
    // Weighted random: prefer higher weight (Speed/Words/Mystery)
    const totalW = pool.reduce((s: number, c: any) => s + (Number(c.weight) || 10), 0);
    let r = Math.random() * totalW;
    let pick = pool[0];
    for (const c of pool) {
      r -= Number(c.weight) || 10;
      if (r <= 0) { pick = c; break; }
    }
    used.add(pick.id);
    const { data: choices } = await supabase
      .from('challenge_choices')
      .select('choice_id, label')
      .eq('challenge_id', pick.id);
    challenges.push({
      ...pick,
      timeLimitMs: pick.time_limit_ms,
      choices: choices?.map((c: any) => ({ id: c.choice_id, label: c.label })) ?? undefined,
    });
  }
  return challenges;
}

async function createSoloMatch(supabase: any, user: any, difficulty: string) {
  const now = new Date().toISOString();
  const challenges = await pickChallenges(supabase, TOTAL_ROUNDS);
  if (challenges.length < TOTAL_ROUNDS) {
    return json({ error: 'Not enough challenges in bank. Run seed migrations.' }, 500);
  }

  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .insert({
      mode: 'solo',
      status: 'VS',
      difficulty,
      current_round: 1,
      total_rounds: TOTAL_ROUNDS,
      sequence: 1,
      server_now: now,
    })
    .select()
    .single();
  if (matchErr) return json({ error: matchErr.message }, 500);

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, avatar_url')
    .eq('id', user.id)
    .single();

  await supabase.from('match_participants').insert([
    {
      match_id: match.id,
      user_id: user.id,
      side: 'player',
      score: 0,
      is_ai: false,
      username: profile?.username ?? 'player',
      avatar_url: profile?.avatar_url,
    },
    {
      match_id: match.id,
      user_id: null,
      side: 'ai',
      score: 0,
      is_ai: true,
      ai_difficulty: difficulty,
      username: 'AI (' + difficulty + ')',
    },
  ]);

  await supabase.from('rounds').insert(
    challenges.map((ch: any, i: number) => ({
      match_id: match.id,
      round_number: i + 1,
      challenge_id: ch.id,
      status: 'pending',
      sequence: 0,
    }))
  );

  return json({ match: await buildMatchState(supabase, match.id) });
}

async function create1v1Match(supabase: any, user: any, opponentId: string) {
  if (!opponentId) return json({ error: 'opponentId required' }, 400);
  const now = new Date().toISOString();
  const challenges = await pickChallenges(supabase, TOTAL_ROUNDS);
  if (challenges.length < TOTAL_ROUNDS) {
    return json({ error: 'Not enough challenges in bank' }, 500);
  }

  const { data: match, error } = await supabase
    .from('matches')
    .insert({
      mode: '1v1',
      status: 'VS',
      current_round: 1,
      total_rounds: TOTAL_ROUNDS,
      sequence: 1,
      server_now: now,
    })
    .select()
    .single();
  if (error) return json({ error: error.message }, 500);

  const { data: p1 } = await supabase.from('profiles').select('username, avatar_url').eq('id', user.id).single();
  const { data: p2 } = await supabase.from('profiles').select('username, avatar_url').eq('id', opponentId).single();

  await supabase.from('match_participants').insert([
    { match_id: match.id, user_id: user.id, side: 'player', score: 0, username: p1?.username ?? 'p1', avatar_url: p1?.avatar_url },
    { match_id: match.id, user_id: opponentId, side: 'opponent', score: 0, username: p2?.username ?? 'p2', avatar_url: p2?.avatar_url },
  ]);

  await supabase.from('rounds').insert(
    challenges.map((ch: any, i: number) => ({
      match_id: match.id,
      round_number: i + 1,
      challenge_id: ch.id,
      status: 'pending',
      sequence: 0,
    }))
  );

  return json({ match: await buildMatchState(supabase, match.id) });
}

async function getMatch(supabase: any, matchId: string, userId: string) {
  if (!matchId) return json({ error: 'matchId required' }, 400);
  const authz = await assertMatchParticipant(supabase, matchId, userId);
  if (!authz.ok) return json({ error: authz.error }, authz.status);
  const full = await buildMatchState(supabase, matchId, userId);
  if (!full) return json({ error: 'Match not found' }, 404);
  return json({ match: full });
}


/** Co-op: both partners vs shared rounds; team score = sum of human scores. */

function randomToken() {
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 12; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

async function createMatchInvite(supabase: any, user: any, difficulty: string) {
  const token = randomToken();
  const { data, error } = await supabase.from('match_invites').insert({
    from_user: user.id,
    token,
    difficulty,
    status: 'pending',
  }).select().single();
  if (error) return json({ error: error.message }, 500);
  return json({ invite: data, token, sharePath: `/play/invite/${token}` });
}

async function acceptMatchInvite(supabase: any, user: any, token: string) {
  if (!token) return json({ error: 'token required' }, 400);
  const { data: inv } = await supabase.from('match_invites').select('*').eq('token', token).maybeSingle();
  if (!inv) return json({ error: 'دعوة غير موجودة' }, 404);
  if (inv.status !== 'pending') return json({ error: 'الدعوة غير متاحة' }, 400);
  if (new Date(inv.expires_at) < new Date()) {
    await supabase.from('match_invites').update({ status: 'expired' }).eq('id', inv.id);
    return json({ error: 'انتهت صلاحية الدعوة' }, 400);
  }
  if (inv.from_user === user.id) return json({ error: 'لا تقبل دعوتك' }, 400);

    const now = new Date().toISOString();
  const challenges = await pickChallenges(supabase, TOTAL_ROUNDS);
  if (challenges.length < TOTAL_ROUNDS) return json({ error: 'Not enough challenges' }, 500);

  const { data: match, error: matchErr } = await supabase.from('matches').insert({
    mode: '1v1',
    status: 'VS',
    difficulty: inv.difficulty || 'normal',
    current_round: 1,
    total_rounds: TOTAL_ROUNDS,
    sequence: 1,
    server_now: now,
  }).select().single();
  if (matchErr) return json({ error: matchErr.message }, 500);

  const { data: a } = await supabase.from('profiles').select('username, display_name, avatar_url').eq('id', inv.from_user).single();
  const { data: b } = await supabase.from('profiles').select('username, display_name, avatar_url').eq('id', user.id).single();

  await supabase.from('match_participants').insert([
    { match_id: match.id, user_id: inv.from_user, side: 'player', username: a?.display_name || a?.username, avatar_url: a?.avatar_url, score: 0, is_ai: false },
    { match_id: match.id, user_id: user.id, side: 'opponent', username: b?.display_name || b?.username, avatar_url: b?.avatar_url, score: 0, is_ai: false },
  ]);
  for (let i = 0; i < challenges.length; i++) {
    await supabase.from('rounds').insert({
      match_id: match.id,
      round_number: i + 1,
      challenge_id: challenges[i].id,
      status: 'pending',
      sequence: 0,
    });
  }
  await supabase.from('match_invites').update({
    status: 'accepted',
    to_user: user.id,
    match_id: match.id,
  }).eq('id', inv.id);

  return json({ match: await buildMatchState(supabase, match.id, user.id) });
}

async function createCoupleMatch(supabase: any, user: any, difficulty: string) {
  const { data: couple } = await supabase
    .from('couples')
    .select('*')
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .eq('status', 'active')
    .maybeSingle();
  if (!couple || !couple.user_b) {
    return json({ error: 'لا توجد ثنائية نشطة — اربط شريكك أولاً' }, 400);
  }

  const partnerId = couple.user_a === user.id ? couple.user_b : couple.user_a;
  const { data: me } = await supabase.from('profiles').select('username, display_name, avatar_url').eq('id', user.id).single();
  const { data: partner } = await supabase.from('profiles').select('username, display_name, avatar_url').eq('id', partnerId).single();

  const challenges = await pickChallenges(supabase, TOTAL_ROUNDS);
  if (challenges.length < TOTAL_ROUNDS) {
    return json({ error: 'Not enough challenges' }, 500);
  }

  const now = new Date().toISOString();
  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .insert({
      mode: 'couple',
      status: 'VS',
      difficulty,
      current_round: 1,
      total_rounds: TOTAL_ROUNDS,
      sequence: 1,
      server_now: now,
      couple_id: couple.id,
    })
    .select()
    .single();
  if (matchErr) return json({ error: matchErr.message }, 500);

  // Co-op vs AI: both humans on team "player", AI is opponent
  await supabase.from('match_participants').insert([
    {
      match_id: match.id,
      user_id: user.id,
      side: 'player',
      username: me?.display_name || me?.username || 'أنت',
      avatar_url: me?.avatar_url,
      score: 0,
      is_ai: false,
    },
    {
      match_id: match.id,
      user_id: partnerId,
      side: 'player',
      username: partner?.display_name || partner?.username || 'الشريك',
      avatar_url: partner?.avatar_url,
      score: 0,
      is_ai: false,
    },
    {
      match_id: match.id,
      user_id: null,
      side: 'ai',
      username: 'الخصم الذكي',
      score: 0,
      is_ai: true,
      ai_difficulty: difficulty,
    },
  ]);

  for (let i = 0; i < challenges.length; i++) {
    const c = challenges[i];
    await supabase.from('rounds').insert({
      match_id: match.id,
      round_number: i + 1,
      challenge_id: c.id,
      status: i === 0 ? 'pending' : 'pending',
      sequence: 0,
    });
  }

  await supabase.from('couples').update({
    last_match_id: match.id,
    updated_at: now,
  }).eq('id', couple.id);

  return json({ match: await buildMatchState(supabase, match.id, user.id), coupleId: couple.id });
}

async function startRound(supabase: any, matchId: string, userId: string) {
  const authz = await assertMatchParticipant(supabase, matchId, userId);
  if (!authz.ok) return json({ error: authz.error }, authz.status);

  const notFin = await assertMatchNotFinished(supabase, matchId);
  if (!notFin.ok) return json({ error: notFin.error }, notFin.status);
  const match = notFin.match;

  // Atomic: only transitions pending → active once
  const { data: atomic, error: atomicErr } = await supabase.rpc('atomic_start_round', {
    p_match_id: matchId,
    p_round_number: match.current_round,
  });

  if (atomicErr) {
    console.error('[start_round] atomic', atomicErr);
    return json({ error: atomicErr.message }, 500);
  }

  const row = Array.isArray(atomic) ? atomic[0] : atomic;
  if (!row?.ok) return json({ error: 'Round not found or invalid state' }, 404);

  return json({
    match: await buildMatchState(supabase, matchId, userId),
    alreadyStarted: !!row.already_started,
  });
}

/** Apply AI points for the current round before advancing (solo only). */
async function applyAiRoundScore(supabase: any, matchId: string, roundNumber: number) {
  const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single();
  if (!match || (match.mode !== 'solo' && match.mode !== 'couple')) return;

  const { data: ai } = await supabase
    .from('match_participants')
    .select('*')
    .eq('match_id', matchId)
    .eq('is_ai', true)
    .maybeSingle();
  if (!ai) return;

  const { data: round } = await supabase
    .from('rounds')
    .select('*, challenge:challenges(type, difficulty, time_limit_ms)')
    .eq('match_id', matchId)
    .eq('round_number', roundNumber)
    .maybeSingle();
  if (!round) return;

  const difficulty = ai.ai_difficulty ?? match.difficulty ?? 'normal';
  const accuracy = AI_ACCURACY[difficulty] ?? 0.68;
  const roll = hash01(`${matchId}:${roundNumber}:ai`);
  const correct = roll < accuracy;
  const responseRatio = 0.35 + hash01(`${matchId}:${roundNumber}:t`) * 0.5;
  const timeLimit = round.challenge?.time_limit_ms ?? 15000;
  const responseTimeMs = Math.round(timeLimit * responseRatio);

  const score = calculateScore({
    outcome: correct ? 'correct' : 'wrong',
    responseTimeMs,
    timeLimitMs: timeLimit,
    difficulty: round.challenge?.difficulty ?? difficulty,
    challengeType: round.challenge?.type ?? 'knowledge',
    config: DEFAULT_SCORING,
  });

  if (score.total > 0) {
    await supabase
      .from('match_participants')
      .update({ score: (ai.score ?? 0) + score.total })
      .eq('id', ai.id);
  }
}

async function nextRound(supabase: any, matchId: string, userId: string) {
  const authz = await assertMatchParticipant(supabase, matchId, userId);
  if (!authz.ok) return json({ error: authz.error }, authz.status);

  const notFin = await assertMatchNotFinished(supabase, matchId);
  if (!notFin.ok) return json({ error: notFin.error }, notFin.status);
  const match = notFin.match;

  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('match_id', matchId)
    .eq('round_number', match.current_round)
    .maybeSingle();
  if (!round) return json({ error: 'Round not found' }, 404);

  // Gate: both humans answered OR time expired (solo: one answer)
  const gate = await canAdvanceRound(supabase, matchId, round.id, round.server_end_at);
  if (!gate.can) {
    return json({
      error: 'لا يمكن الانتقال بعد — بانتظار الخصم أو انتهاء الوقت',
      code: 'ROUND_NOT_READY',
      reason: gate.reason,
      match: await buildMatchState(supabase, matchId, userId),
    }, 409);
  }

  // Close current round once
  await applyAiRoundScore(supabase, matchId, match.current_round);
  await supabase
    .from('rounds')
    .update({ status: 'finished' })
    .eq('id', round.id)
    .neq('status', 'finished');

  const nextNum = match.current_round + 1;
  if (nextNum > match.total_rounds) {
    return await finishMatch(supabase, matchId, userId);
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('matches')
    .update({
      current_round: nextNum,
      status: 'ROUND_STARTING',
      sequence: (match.sequence ?? 0) + 1,
      server_now: now,
    })
    .eq('id', matchId)
    .eq('current_round', match.current_round) // optimistic concurrency
    .select()
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  // If concurrent next_round, still return current state
  return json({ match: await buildMatchState(supabase, matchId, userId), advanced: !!updated });
}

async function finishMatch(supabase: any, matchId: string, userId: string | null) {
  // Prefer atomic DB settlement
  try {
    if (userId) {
      const authz = await assertMatchParticipant(supabase, matchId, userId);
      if (!authz.ok) return json({ error: authz.error }, authz.status);
    }
    const { data: settled, error: settleErr } = await supabase.rpc('settle_match', { p_match_id: matchId });
    if (!settleErr && settled?.ok) {
      const state = await buildMatchState(supabase, matchId, userId ?? undefined);
      return json({ match: state, rewards: settled.rewards, alreadySettled: !!settled.already });
    }
  } catch (e) {
    console.warn('[finish] settle_match fallback', e);
  }

  if (userId) {
    const authz = await assertMatchParticipant(supabase, matchId, userId);
    if (!authz.ok) return json({ error: authz.error }, authz.status);
  }

  const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single();
  if (!match) return json({ error: 'Match not found' }, 404);

  // Idempotent: already finished
  if (match.status === 'MATCH_FINISHED' || match.status === 'FINAL_RESULT') {
    const state = await buildMatchState(supabase, matchId, userId ?? undefined);
    const rewards = await loadRewardSnapshot(supabase, matchId);
    return json({ match: state, rewards, alreadySettled: true });
  }

  // Ensure AI scored last round if needed
  if (match.mode === 'solo') {
    await applyAiRoundScore(supabase, matchId, match.current_round);
  }

  const { data: participants } = await supabase
    .from('match_participants')
    .select('*')
    .eq('match_id', matchId);

  let winnerId: string | null = null;
  if (participants && participants.length >= 2) {
    const sorted = [...participants].sort((a: any, b: any) => b.score - a.score);
    if (sorted[0].score > sorted[1].score) winnerId = sorted[0].user_id;
  }

  const now = new Date().toISOString();
  await supabase
    .from('matches')
    .update({
      status: 'MATCH_FINISHED',
      winner_id: winnerId,
      sequence: (match.sequence ?? 0) + 1,
      ended_at: now,
      server_now: now,
    })
    .eq('id', matchId);

  const rewards: any[] = [];

  if (participants) {
    for (const p of participants) {
      if (!p.user_id || p.is_ai) continue;
      const won = winnerId != null && p.user_id === winnerId;
      const draw = winnerId == null;
      const xpGain = draw ? 30 : won ? WIN_XP : LOSS_XP;
      const coinGain = draw ? 25 : won ? WIN_COINS : LOSS_COINS;

      // Profile stats — only once per match via ledger check
      const { data: existingXp } = await supabase
        .from('xp_events')
        .select('id')
        .eq('user_id', p.user_id)
        .eq('match_id', matchId)
        .eq('source', 'match_result')
        .maybeSingle();

      if (!existingXp) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('wins, losses, total_matches, xp, level, xp_to_next, coins')
          .eq('id', p.user_id)
          .single();

        if (prof) {
          let newXp = (prof.xp ?? 0) + xpGain;
          let level = prof.level ?? 1;
          let xpToNext = prof.xp_to_next ?? 100;
          while (newXp >= xpToNext) {
            newXp -= xpToNext;
            level += 1;
            xpToNext = Math.round(xpToNext * 1.25);
          }

          await supabase
            .from('profiles')
            .update({
              wins: (prof.wins ?? 0) + (won ? 1 : 0),
              losses: (prof.losses ?? 0) + (!won && !draw ? 1 : 0),
              total_matches: (prof.total_matches ?? 0) + 1,
              xp: newXp,
              level,
              xp_to_next: xpToNext,
            })
            .eq('id', p.user_id);

          await supabase.from('xp_events').insert({
            user_id: p.user_id,
            source: 'match_result',
            amount: xpGain,
            match_id: matchId,
          });
        }
      }

      // Coins via credit_coins RPC (idempotent via ledger reference)
      const { data: existingCoin } = await supabase
        .from('wallet_ledger')
        .select('id')
        .eq('user_id', p.user_id)
        .eq('type', 'match_reward')
        .eq('reference_id', matchId)
        .maybeSingle();

      let coins = 0;
      if (!existingCoin) {
        const { data: balance } = await supabase.rpc('credit_coins', {
          p_user_id: p.user_id,
          p_amount: coinGain,
          p_type: 'match_reward',
          p_reference: matchId,
        });
        coins = balance ?? coinGain;
      } else {
        const { data: prof } = await supabase
          .from('profiles')
          .select('coins')
          .eq('id', p.user_id)
          .single();
        coins = prof?.coins ?? 0;
      }

      const { data: finalProf } = await supabase
        .from('profiles')
        .select('wins, losses, total_matches, xp, level, xp_to_next, coins, username, display_name')
        .eq('id', p.user_id)
        .single();

      rewards.push({
        userId: p.user_id,
        won,
        draw,
        xpGain: existingXp ? 0 : xpGain,
        coinGain: existingCoin ? 0 : coinGain,
        profile: finalProf,
        coinsBalance: finalProf?.coins ?? coins,
      });
    }
  }

  const state = await buildMatchState(supabase, matchId);
  
  // Couple co-op: update shared bond stats (team success = both did well / not zero)
  if (match.mode === 'couple' && match.couple_id) {
    const totalScore = (participants || []).reduce((s: number, p: any) => s + (p.score || 0), 0);
    const won = totalScore > 0;
    const { data: c } = await supabase.from('couples').select('shared_wins, shared_matches').eq('id', match.couple_id).single();
    if (c) {
      await supabase.from('couples').update({
        shared_matches: (c.shared_matches ?? 0) + 1,
        shared_wins: (c.shared_wins ?? 0) + (won ? 1 : 0),
        last_played_at: now,
        last_match_id: matchId,
        updated_at: now,
      }).eq('id', match.couple_id);
    }
  }

return json({ match: state, rewards, alreadySettled: false });
}

async function loadRewardSnapshot(supabase: any, matchId: string) {
  const { data: parts } = await supabase
    .from('match_participants')
    .select('user_id, is_ai')
    .eq('match_id', matchId);
  const out = [];
  for (const p of parts ?? []) {
    if (!p.user_id || p.is_ai) continue;
    const { data: prof } = await supabase
      .from('profiles')
      .select('wins, losses, total_matches, xp, level, xp_to_next, coins, username, display_name')
      .eq('id', p.user_id)
      .single();
    out.push({ userId: p.user_id, profile: prof, coinsBalance: prof?.coins ?? 0 });
  }
  return out;
}

async function buildMatchState(supabase: any, matchId: string, viewerId?: string) {
  const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single();
  if (!match) return null;

  const { data: participants } = await supabase
    .from('match_participants')
    .select('*')
    .eq('match_id', matchId);

  const { data: round } = await supabase
    .from('rounds')
    .select('*, challenge:challenges(id, type, subtype, prompt, difficulty, time_limit_ms, letter_pool)')
    .eq('match_id', matchId)
    .eq('round_number', match.current_round)
    .maybeSingle();

  // NEVER expose is_correct to client
  let choices: any[] | undefined;
  if (round?.challenge_id) {
    const { data: ch } = await supabase
      .from('challenge_choices')
      .select('choice_id, label')
      .eq('challenge_id', round.challenge_id);
    choices = ch?.map((c: any) => ({ id: c.choice_id, label: c.label }));
  }

  let myLastAnswer = null;
  if (viewerId && round?.id) {
    const { data: sub } = await supabase
      .from('answer_submissions')
      .select('id, outcome, points, bonus, response_time_ms, server_validated_at')
      .eq('round_id', round.id)
      .eq('user_id', viewerId)
      .order('server_validated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sub) {
      myLastAnswer = {
        isCorrect: sub.outcome === 'correct',
        score: (sub.points ?? 0) + (sub.bonus ?? 0),
        responseTimeMs: sub.response_time_ms,
        submittedAt: sub.server_validated_at,
        outcome: sub.outcome,
      };
    }
  }
  const player = participants?.find((p: any) => p.side === 'player' || (!p.is_ai && p.user_id === viewerId));
  const opponent = participants?.find((p: any) => p.is_ai || p.side === 'opponent' || p.side === 'ai');
  // For 1v1 without sides, pick other human
  let playerOut = player;
  let opponentOut = opponent;
  if (viewerId && participants) {
    const me = participants.find((p: any) => p.user_id === viewerId);
    const other = participants.find((p: any) => p.user_id !== viewerId);
    if (me) playerOut = me;
    if (other) opponentOut = other;
  }

  return {
    matchId: match.id,
    mode: match.mode,
    status: match.status,
    sequence: match.sequence,
    currentRound: match.current_round,
    totalRounds: match.total_rounds,
    player: playerOut
      ? {
          id: playerOut.user_id,
          username: playerOut.username,
          avatarUrl: playerOut.avatar_url,
          score: playerOut.score,
          side: playerOut.side,
        }
      : null,
    opponent: opponentOut
      ? {
          id: opponentOut.user_id ?? 'ai',
          username: opponentOut.username,
          avatarUrl: opponentOut.avatar_url,
          score: opponentOut.score,
          side: opponentOut.side,
          isAi: opponentOut.is_ai,
        }
      : null,
    round: round
      ? {
          roundId: round.id,
          matchId: match.id,
          roundNumber: round.round_number,
          challenge: {
            id: round.challenge?.id ?? round.challenge_id,
            type: round.challenge?.type,
            subtype: round.challenge?.subtype,
            prompt: round.challenge?.prompt,
            difficulty: round.challenge?.difficulty,
            timeLimitMs: round.challenge?.time_limit_ms ?? 15000,
            letterPool: round.challenge?.letter_pool,
            choices,
            version: 1,
          },
          status: round.status,
          serverStartAt: round.server_start_at,
          serverEndAt: round.server_end_at,
          sequence: round.sequence,
        }
      : null,
    lastAnswerResult: myLastAnswer,
    myLastAnswer,
    lastRoundResult: null,
    winnerId: match.winner_id,
    coupleId: match.couple_id ?? null,
    teamScore:
      match.mode === 'couple' && participants
        ? participants.filter((p: any) => !p.is_ai).reduce((s: number, p: any) => s + (Number(p.score) || 0), 0)
        : null,
    teamSize: match.team_size ?? null,
    participants: (participants || []).map((p: any) => ({
      userId: p.user_id,
      username: p.username,
      score: p.score,
      side: p.side,
      isAi: p.is_ai,
    })),
    teamScoreA:
      match.mode === 'team' && participants
        ? participants.filter((p: any) => p.side === 'team_a' || p.side === 'player').reduce((s: number, p: any) => s + (Number(p.score) || 0), 0)
        : null,
    teamScoreB:
      match.mode === 'team' && participants
        ? participants.filter((p: any) => p.side === 'team_b' || p.side === 'opponent').reduce((s: number, p: any) => s + (Number(p.score) || 0), 0)
        : null,
    aiScore:
      participants
        ? participants.filter((p: any) => p.is_ai).reduce((s: number, p: any) => s + (Number(p.score) || 0), 0)
        : null,
    serverNow: new Date().toISOString(),
    createdAt: match.created_at,
    startedAt: match.started_at,
    endedAt: match.ended_at,
  };
}
