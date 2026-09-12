/**
 * Edge Function: room
 * Live room challenges — host pushes questions, participants answer.
 *
 * Actions:
 *  start_challenge { roomId }
 *  get_state       { roomId }
 *  submit_answer   { roomId, roomRoundId, requestId, answer, clientTimestamp }
 *  reveal          { roomId, roomRoundId }
 *  close_round     { roomId, roomRoundId }
 *  leaderboard     { roomId }
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { normalizeArabic } from '../_shared/arabic.ts';
import { calculateScore, DEFAULT_SCORING } from '../_shared/scoring.ts';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

    const body = await req.json();
    const action = body.action as string;

    if (action === 'start_challenge') {
      return await startChallenge(supabase, user.id, body.roomId);
    }
    if (action === 'get_state') {
      return await getState(supabase, body.roomId);
    }
    if (action === 'submit_answer') {
      return await submitAnswer(supabase, user.id, body);
    }
    if (action === 'reveal') {
      return await reveal(supabase, user.id, body.roomId, body.roomRoundId);
    }
    if (action === 'close_round') {
      return await closeRound(supabase, user.id, body.roomId, body.roomRoundId);
    }
    if (action === 'leaderboard') {
      return await leaderboard(supabase, body.roomId);
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('[room]', err);
    return json({ error: String(err) }, 500);
  }
});

async function assertHost(supabase: any, roomId: string, userId: string) {
  const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
  if (!room) throw new Error('Room not found');
  if (room.host_id !== userId) throw new Error('Only host can do this');
  if (room.status === 'ended') throw new Error('Room ended');
  return room;
}

async function startChallenge(supabase: any, userId: string, roomId: string) {
  if (!roomId) return json({ error: 'roomId required' }, 400);
  await assertHost(supabase, roomId, userId);

  // Close any active round
  await supabase
    .from('room_rounds')
    .update({ status: 'closed' })
    .eq('room_id', roomId)
    .in('status', ['pending', 'active', 'revealed']);

  // Next round number
  const { data: last } = await supabase
    .from('room_rounds')
    .select('round_number')
    .eq('room_id', roomId)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const roundNumber = (last?.round_number ?? 0) + 1;

  // Pick random active challenge
  const { data: pool } = await supabase
    .from('challenges')
    .select('id, type, subtype, prompt, difficulty, time_limit_ms, letter_pool')
    .eq('active', true)
    .limit(40);

  if (!pool?.length) return json({ error: 'No challenges in bank' }, 500);
  const challenge = pool[Math.floor(Math.random() * pool.length)];

  const now = new Date();
  const end = new Date(now.getTime() + (challenge.time_limit_ms ?? 15000));

  const { data: round, error } = await supabase
    .from('room_rounds')
    .insert({
      room_id: roomId,
      challenge_id: challenge.id,
      round_number: roundNumber,
      status: 'active',
      server_start_at: now.toISOString(),
      server_end_at: end.toISOString(),
      sequence: roundNumber,
    })
    .select()
    .single();

  if (error) return json({ error: error.message }, 500);

  // Ensure room is live
  await supabase.from('rooms').update({ status: 'live' }).eq('id', roomId).eq('status', 'waiting');

  const { data: choices } = await supabase
    .from('challenge_choices')
    .select('choice_id, label')
    .eq('challenge_id', challenge.id);

  return json({
    round: {
      id: round.id,
      roomId,
      roundNumber,
      status: 'active',
      serverStartAt: round.server_start_at,
      serverEndAt: round.server_end_at,
      sequence: round.sequence,
      challenge: {
        id: challenge.id,
        type: challenge.type,
        subtype: challenge.subtype,
        prompt: challenge.prompt,
        difficulty: challenge.difficulty,
        timeLimitMs: challenge.time_limit_ms,
        letterPool: challenge.letter_pool,
        choices: choices?.map((c: any) => ({ id: c.choice_id, label: c.label })),
      },
    },
  });
}

async function getState(supabase: any, roomId: string) {
  if (!roomId) return json({ error: 'roomId required' }, 400);

  const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
  if (!room) return json({ error: 'Room not found' }, 404);

  const { data: round } = await supabase
    .from('room_rounds')
    .select('*, challenge:challenges(id, type, subtype, prompt, difficulty, time_limit_ms, letter_pool)')
    .eq('room_id', roomId)
    .in('status', ['active', 'revealed'])
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle();

  let payload: any = null;
  if (round) {
    const { data: choices } = await supabase
      .from('challenge_choices')
      .select('choice_id, label')
      .eq('challenge_id', round.challenge_id);

    payload = {
      id: round.id,
      roomId,
      roundNumber: round.round_number,
      status: round.status,
      serverStartAt: round.server_start_at,
      serverEndAt: round.server_end_at,
      sequence: round.sequence,
      challenge: {
        id: round.challenge?.id ?? round.challenge_id,
        type: round.challenge?.type,
        subtype: round.challenge?.subtype,
        prompt: round.challenge?.prompt,
        difficulty: round.challenge?.difficulty,
        timeLimitMs: round.challenge?.time_limit_ms ?? 15000,
        letterPool: round.challenge?.letter_pool,
        choices: choices?.map((c: any) => ({ id: c.choice_id, label: c.label })),
      },
    };
  }

  return json({
    room: {
      id: room.id,
      code: room.code,
      title: room.title,
      status: room.status,
      hostId: room.host_id,
    },
    round: payload,
    serverNow: new Date().toISOString(),
  });
}

async function submitAnswer(supabase: any, userId: string, body: any) {
  const { roomId, roomRoundId, requestId, answer, clientTimestamp } = body;
  if (!roomId || !roomRoundId || !requestId || answer === undefined) {
    return json({ error: 'Missing fields' }, 400);
  }

  // Idempotency
  const { data: existing } = await supabase
    .from('room_answers')
    .select('*')
    .eq('request_id', requestId)
    .maybeSingle();
  if (existing) {
    return json({
      result: {
        requestId,
        outcome: existing.outcome,
        points: existing.points,
        bonus: existing.bonus,
        duplicate: true,
      },
    });
  }

  // Must be participant
  const { data: member } = await supabase
    .from('room_participants')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!member) return json({ error: 'Not a participant' }, 403);

  const { data: round } = await supabase
    .from('room_rounds')
    .select('*, challenge:challenges(id, type, difficulty, time_limit_ms)')
    .eq('id', roomRoundId)
    .single();
  if (!round) return json({ error: 'Round not found' }, 404);
  if (round.status !== 'active') return json({ error: 'Round not active' }, 400);

  const now = new Date();
  if (round.server_end_at && now > new Date(round.server_end_at)) {
    await supabase.from('room_answers').insert({
      request_id: requestId,
      room_round_id: roomRoundId,
      room_id: roomId,
      user_id: userId,
      answer: String(answer),
      normalized_answer: normalizeArabic(String(answer)),
      outcome: 'timeout',
      points: 0,
      bonus: 0,
    });
    return json({
      result: { requestId, outcome: 'timeout', points: 0, bonus: 0 },
    });
  }

  const normalized = normalizeArabic(String(answer));
  let isCorrect = false;

  const { data: accepted } = await supabase
    .from('challenge_answers')
    .select('normalized_answer')
    .eq('challenge_id', round.challenge_id);
  if (accepted?.length) {
    isCorrect = accepted.some((a: any) => a.normalized_answer === normalized);
  }
  if (!isCorrect) {
    const { data: choices } = await supabase
      .from('challenge_choices')
      .select('choice_id, label, is_correct')
      .eq('challenge_id', round.challenge_id);
    const match = choices?.find(
      (c: any) =>
        c.is_correct &&
        (c.choice_id === answer || normalizeArabic(c.label) === normalized)
    );
    isCorrect = !!match;
  }

  const responseTimeMs = round.server_start_at
    ? Math.max(0, now.getTime() - new Date(round.server_start_at).getTime())
    : 5000;

  const score = calculateScore({
    outcome: isCorrect ? 'correct' : 'wrong',
    responseTimeMs,
    timeLimitMs: round.challenge?.time_limit_ms ?? 15000,
    difficulty: round.challenge?.difficulty ?? 'normal',
    challengeType: round.challenge?.type ?? 'knowledge',
    config: DEFAULT_SCORING,
  });

  await supabase.from('room_answers').insert({
    request_id: requestId,
    room_round_id: roomRoundId,
    room_id: roomId,
    user_id: userId,
    answer: String(answer),
    normalized_answer: normalized,
    outcome: isCorrect ? 'correct' : 'wrong',
    points: score.points,
    bonus: score.bonus,
    response_time_ms: responseTimeMs,
  });

  return json({
    result: {
      requestId,
      outcome: isCorrect ? 'correct' : 'wrong',
      points: score.points,
      bonus: score.bonus,
      total: score.total,
    },
  });
}

async function reveal(supabase: any, userId: string, roomId: string, roomRoundId: string) {
  await assertHost(supabase, roomId, userId);
  await supabase
    .from('room_rounds')
    .update({ status: 'revealed' })
    .eq('id', roomRoundId)
    .eq('room_id', roomId);
  return json({ ok: true, status: 'revealed' });
}

async function closeRound(supabase: any, userId: string, roomId: string, roomRoundId: string) {
  await assertHost(supabase, roomId, userId);
  await supabase
    .from('room_rounds')
    .update({ status: 'closed' })
    .eq('id', roomRoundId)
    .eq('room_id', roomId);
  return json({ ok: true, status: 'closed' });
}

async function leaderboard(supabase: any, roomId: string) {
  if (!roomId) return json({ error: 'roomId required' }, 400);

  const { data: answers } = await supabase
    .from('room_answers')
    .select('user_id, points, bonus, profiles:user_id(username, display_name, avatar_url)')
    .eq('room_id', roomId);

  const map = new Map<string, { userId: string; name: string; score: number; avatarUrl: string | null }>();
  for (const a of answers ?? []) {
    const prev = map.get(a.user_id);
    const add = (a.points ?? 0) + (a.bonus ?? 0);
    if (prev) {
      prev.score += add;
    } else {
      map.set(a.user_id, {
        userId: a.user_id,
        name: a.profiles?.display_name || a.profiles?.username || 'لاعب',
        score: add,
        avatarUrl: a.profiles?.avatar_url ?? null,
      });
    }
  }

  const board = [...map.values()].sort((a, b) => b.score - a.score);
  return json({ leaderboard: board });
}
