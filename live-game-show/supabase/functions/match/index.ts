/**
 * Edge Function: match — Phase A production lifecycle
 * Solo includes deterministic AI scoring. Finish settles XP + coins idempotently.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { calculateScore, DEFAULT_SCORING } from '../_shared/scoring.ts';

const TOTAL_ROUNDS = 5;
const ROUND_SEQUENCE = ['speed', 'knowledge', 'words', 'speed', 'mystery'];
const WIN_COINS = 50;
const LOSS_COINS = 15;
const WIN_XP = 50;
const LOSS_XP = 20;

const AI_ACCURACY: Record<string, number> = { easy: 0.45, normal: 0.68, hard: 0.88 };

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
      case 'create_1v1':
        return await create1v1Match(supabase, user, body.opponentId);
      case 'get':
        return await getMatch(supabase, body.matchId);
      case 'start_round':
        return await startRound(supabase, body.matchId);
      case 'next_round':
        return await nextRound(supabase, body.matchId);
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
      display_name: user.user_metadata?.display_name ?? 'لاعب زتونة',
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
      .select('id, type, subtype, prompt, difficulty, time_limit_ms, letter_pool')
      .eq('active', true);
    if (desiredType) query = query.eq('type', desiredType);
    const { data } = await query.limit(50);
    const pool = (data ?? []).filter((c: any) => !used.has(c.id));
    if (!pool.length && data?.length) {
      challenges.push(data[Math.floor(Math.random() * data.length)]);
      continue;
    }
    if (!pool.length) continue;
    const pick = pool[Math.floor(Math.random() * pool.length)];
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

async function getMatch(supabase: any, matchId: string) {
  if (!matchId) return json({ error: 'matchId required' }, 400);
  const full = await buildMatchState(supabase, matchId);
  if (!full) return json({ error: 'Match not found' }, 404);
  return json({ match: full });
}

async function startRound(supabase: any, matchId: string) {
  const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single();
  if (!match) return json({ error: 'Match not found' }, 404);

  const { data: round } = await supabase
    .from('rounds')
    .select('*, challenge:challenges(id, type, subtype, prompt, difficulty, time_limit_ms, letter_pool)')
    .eq('match_id', matchId)
    .eq('round_number', match.current_round)
    .single();
  if (!round) return json({ error: 'Round not found' }, 404);

  const now = new Date();
  const end = new Date(now.getTime() + (round.challenge?.time_limit_ms ?? 15000));

  await supabase
    .from('rounds')
    .update({
      status: 'active',
      server_start_at: now.toISOString(),
      server_end_at: end.toISOString(),
      sequence: match.sequence + 1,
    })
    .eq('id', round.id);

  await supabase
    .from('matches')
    .update({
      status: 'ROUND_ACTIVE',
      sequence: match.sequence + 1,
      server_now: now.toISOString(),
      started_at: match.started_at ?? now.toISOString(),
    })
    .eq('id', matchId);

  return json({ match: await buildMatchState(supabase, matchId) });
}

/** Apply AI points for the current round before advancing (solo only). */
async function applyAiRoundScore(supabase: any, matchId: string, roundNumber: number) {
  const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single();
  if (!match || match.mode !== 'solo') return;

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

async function nextRound(supabase: any, matchId: string) {
  const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single();
  if (!match) return json({ error: 'Match not found' }, 404);

  // Close current round + AI score
  await applyAiRoundScore(supabase, matchId, match.current_round);
  await supabase
    .from('rounds')
    .update({ status: 'finished' })
    .eq('match_id', matchId)
    .eq('round_number', match.current_round);

  const nextNum = match.current_round + 1;
  if (nextNum > match.total_rounds) {
    return await finishMatch(supabase, matchId, null);
  }

  const now = new Date().toISOString();
  await supabase
    .from('matches')
    .update({
      current_round: nextNum,
      status: 'ROUND_STARTING',
      sequence: match.sequence + 1,
      server_now: now,
    })
    .eq('id', matchId);

  return json({ match: await buildMatchState(supabase, matchId) });
}

async function finishMatch(supabase: any, matchId: string, _userId: string | null) {
  const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single();
  if (!match) return json({ error: 'Match not found' }, 404);

  // Idempotent: already finished
  if (match.status === 'MATCH_FINISHED' || match.status === 'FINAL_RESULT') {
    const state = await buildMatchState(supabase, matchId);
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

async function buildMatchState(supabase: any, matchId: string) {
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

  let choices: any[] | undefined;
  if (round?.challenge_id) {
    const { data: ch } = await supabase
      .from('challenge_choices')
      .select('choice_id, label')
      .eq('challenge_id', round.challenge_id);
    choices = ch?.map((c: any) => ({ id: c.choice_id, label: c.label }));
  }

  const player = participants?.find((p: any) => p.side === 'player');
  const opponent = participants?.find((p: any) => p.is_ai || p.side === 'opponent' || p.side === 'ai');

  return {
    matchId: match.id,
    mode: match.mode,
    status: match.status,
    sequence: match.sequence,
    currentRound: match.current_round,
    totalRounds: match.total_rounds,
    player: player
      ? {
          id: player.user_id,
          username: player.username,
          avatarUrl: player.avatar_url,
          score: player.score,
          side: player.side,
        }
      : null,
    opponent: opponent
      ? {
          id: opponent.user_id ?? 'ai',
          username: opponent.username,
          avatarUrl: opponent.avatar_url,
          score: opponent.score,
          side: opponent.side,
          isAi: opponent.is_ai,
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
    lastAnswerResult: null,
    lastRoundResult: null,
    winnerId: match.winner_id,
    serverNow: new Date().toISOString(),
    createdAt: match.created_at,
    startedAt: match.started_at,
    endedAt: match.ended_at,
  };
}
