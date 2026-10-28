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
import { corsHeaders, handleCors, serveWithCors } from '../_shared/cors.ts';
import { normalizeArabic } from '../_shared/arabic.ts';
import { calculateScore, DEFAULT_SCORING } from '../_shared/scoring.ts';
import {
  acceptedAnswersAfterReveal,
  answerContextMatches,
  isRoomMember,
} from '../_shared/roomChallengeSecurity.ts';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serveWithCors(async (req) => {
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
      return await getState(supabase, user.id, body.roomId);
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
      return await leaderboard(supabase, user.id, body.roomId);
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
  const access = await isRoomParticipant(supabase, roomId, userId);
  if (!access.allowed) throw new Error('Room safety check failed or membership unavailable');
  return room;
}

async function isRoomParticipant(supabase: any, roomId: string, userId: string) {
  const { data: room, error: roomError } = await supabase.from('rooms').select('host_id').eq('id', roomId).maybeSingle();
  if (roomError || !room) return { exists: false, allowed: false };
  const { data: participant, error: participantError } = await supabase.from('room_participants')
    .select('user_id').eq('room_id', roomId).eq('user_id', userId).maybeSingle();
  if (participantError) return { exists: true, allowed: false };
  if (!isRoomMember(userId, room.host_id, participant?.user_id)) return { exists: true, allowed: false };

  const { data: members, error: membersError } = await supabase.from('room_participants')
    .select('user_id').eq('room_id', roomId).neq('user_id', userId);
  if (membersError) return { exists: true, allowed: false };
  const otherIds = new Set((members ?? []).map((row: any) => String(row.user_id)));
  if (!otherIds.size) return { exists: true, allowed: true };
  const { data: blocks, error: blocksError } = await supabase.from('user_blocks')
    .select('blocker_id,blocked_id').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
  if (blocksError) return { exists: true, allowed: false };
  const hasBlockedPeer = (blocks ?? []).some((row: any) => {
    const peer = String(row.blocker_id) === userId ? String(row.blocked_id) : String(row.blocker_id);
    return otherIds.has(peer);
  });
  return { exists: true, allowed: !hasBlockedPeer };
}

async function startChallenge(supabase: any, userId: string, roomId: string) {
  if (!roomId) return json({ error: 'roomId required' }, 400);
  const room = await assertHost(supabase, roomId, userId);

  // A repeated start request must not close or replace a live round.
  const { data: activeRound } = await supabase
    .from('room_rounds')
    .select('*, challenge:challenges(id, type, subtype, prompt, difficulty, time_limit_ms, letter_pool, max_length, image_url, asset_path)')
    .eq('room_id', roomId)
    .eq('status', 'active')
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeRound) {
    const { data: activeChoices } = await supabase.from('challenge_choices').select('choice_id, label').eq('challenge_id', activeRound.challenge_id).order('choice_id');
    return json({
      round: {
        id: activeRound.id,
        roomId,
        roundNumber: activeRound.round_number,
        status: activeRound.status,
        serverStartAt: activeRound.server_start_at,
        serverEndAt: activeRound.server_end_at,
        sequence: activeRound.sequence,
        challenge: {
          id: activeRound.challenge?.id ?? activeRound.challenge_id,
          type: activeRound.challenge?.type,
          subtype: activeRound.challenge?.subtype,
          prompt: activeRound.challenge?.prompt,
          difficulty: activeRound.challenge?.difficulty,
          timeLimitMs: activeRound.challenge?.time_limit_ms ?? 15000,
          letterPool: activeRound.challenge?.letter_pool,
          maxLength: activeRound.challenge?.max_length,
          imageUrl: activeRound.challenge?.image_url ?? null,
          imageAssetPath: activeRound.challenge?.asset_path ?? null,
          choices: (activeChoices ?? []).map((choice: any) => ({ id: choice.choice_id, label: choice.label })),
        },
      },
    });
  }

  // Next round number
  const { data: last } = await supabase
    .from('room_rounds')
    .select('round_number, challenge:challenges(subtype)')
    .eq('room_id', roomId)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const roundNumber = (last?.round_number ?? 0) + 1;
  const previousSubtype = last?.challenge?.subtype ?? null;
  const { data: priorRounds } = await supabase
    .from('room_rounds')
    .select('challenge_id')
    .eq('room_id', roomId);
  const usedChallengeIds = new Set((priorRounds ?? []).map((r: any) => r.challenge_id));

  // Pick a production-approved, playable challenge matching the room contract.
  const { data: pool } = await supabase
    .from('challenges')
    .select('id, type, subtype, prompt, difficulty, time_limit_ms, letter_pool, max_length, image_url, asset_path')
    .eq('active', true)
    .eq('qa_status', 'approved')
    .eq('difficulty', room.difficulty ?? 'normal')
    .limit(240);

  if (!pool?.length) return json({ error: 'No challenges in bank' }, 500);
  const shuffled = [...pool]
    .filter((candidate: any) => !usedChallengeIds.has(candidate.id) && candidate.subtype !== previousSubtype)
    .sort(() => Math.random() - 0.5);
  let challenge: any = null;
  for (const candidate of shuffled) { challenge = candidate; break; }
  if (!challenge) return json({ error: 'No playable challenges in bank' }, 500);

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

  // Retire prior rounds only after the replacement is safely stored.
  await supabase
    .from('room_rounds')
    .update({ status: 'closed' })
    .eq('room_id', roomId)
    .neq('id', round.id)
    .in('status', ['pending', 'revealed']);

  // Ensure room is live
  await supabase.from('rooms').update({ status: 'live' }).eq('id', roomId).eq('status', 'waiting');

  const { data: challengeChoices } = await supabase
    .from('challenge_choices')
    .select('choice_id, label')
    .eq('challenge_id', challenge.id)
    .order('choice_id');

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
        maxLength: challenge.max_length,
        imageUrl: challenge.image_url ?? null,
        imageAssetPath: challenge.asset_path ?? null,
        choices: (challengeChoices ?? []).map((choice: any) => ({ id: choice.choice_id, label: choice.label })),
      },
    },
  });
}

async function getState(supabase: any, userId: string, roomId: string) {
  if (!roomId) return json({ error: 'roomId required' }, 400);

  const access = await isRoomParticipant(supabase, roomId, userId);
  if (!access.exists) return json({ error: 'Room not found' }, 404);
  if (!access.allowed) return json({ error: 'Not a room participant' }, 403);

  const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
  if (!room) return json({ error: 'Room not found' }, 404);

  const { data: expired } = await supabase.from('room_rounds').select('id')
    .eq('room_id', roomId).eq('status', 'active').lt('server_end_at', new Date().toISOString()).limit(1);
  if (expired?.[0]?.id) {
    await supabase.from('room_rounds').update({ status: 'revealed' }).eq('id', expired[0].id).eq('status', 'active');
  }

  const { data: round } = await supabase
    .from('room_rounds')
    .select('*, challenge:challenges(id, type, subtype, prompt, difficulty, time_limit_ms, letter_pool, max_length, image_url, asset_path)')
    .eq('room_id', roomId)
    .in('status', ['active', 'revealed'])
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle();

  let payload: any = null;
  if (round) {
    const { data: roundChoices } = await supabase.from('challenge_choices').select('choice_id, label').eq('challenge_id', round.challenge_id).order('choice_id');
    let acceptedAnswers: string[] = [];
    if (round.status === 'revealed') {
      const { data: answerRows } = await supabase
        .from('challenge_answers')
        .select('accepted_answer')
        .eq('challenge_id', round.challenge_id)
        .limit(10);
      acceptedAnswers = acceptedAnswersAfterReveal(round.status, answerRows ?? []);
    }

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
        maxLength: round.challenge?.max_length,
        imageUrl: round.challenge?.image_url ?? null,
        imageAssetPath: round.challenge?.asset_path ?? null,
        choices: (roundChoices ?? []).map((choice: any) => ({ id: choice.choice_id, label: choice.label })),
        acceptedAnswers: acceptedAnswers.length ? acceptedAnswers : undefined,
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

function answerContextFromRow(row: any) {
  return { roomId: row.room_id, roundId: row.room_round_id, userId: row.user_id };
}

function answerResult(requestId: string, answer: any, duplicate = false) {
  return json({
    result: {
      requestId,
      outcome: answer.outcome,
      points: answer.points,
      bonus: answer.bonus,
      total: (answer.points ?? 0) + (answer.bonus ?? 0),
      duplicate,
    },
  });
}

async function insertRoomAnswer(supabase: any, answer: any) {
  const { error } = await supabase.from('room_answers').insert(answer);
  if (!error) return { answer, duplicate: false };

  const { data: byRequestId } = await supabase
    .from('room_answers')
    .select('*')
    .eq('request_id', answer.request_id)
    .maybeSingle();
  if (byRequestId) {
    if (!answerContextMatches(answerContextFromRow(byRequestId), answerContextFromRow(answer))) {
      return { error: 'request_id_conflict' };
    }
    return { answer: byRequestId, duplicate: true };
  }

  const { data: byParticipant } = await supabase
    .from('room_answers')
    .select('*')
    .eq('room_round_id', answer.room_round_id)
    .eq('user_id', answer.user_id)
    .maybeSingle();
  if (byParticipant && answerContextMatches(answerContextFromRow(byParticipant), answerContextFromRow(answer))) {
    return { answer: byParticipant, duplicate: true };
  }

  return { error: error.message || 'answer_insert_failed' };
}

async function submitAnswer(supabase: any, userId: string, body: any) {
  const { roomId, roomRoundId, requestId, answer, clientTimestamp } = body;
  if (
    typeof roomId !== 'string' || !roomId ||
    typeof roomRoundId !== 'string' || !roomRoundId ||
    typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 128 ||
    typeof answer !== 'string' || !answer.trim() || answer.length > 500
  ) {
    return json({ error: 'Missing fields' }, 400);
  }

  const access = await isRoomParticipant(supabase, roomId, userId);
  if (!access.exists) return json({ error: 'Room not found' }, 404);
  if (!access.allowed) return json({ error: 'Not a participant' }, 403);

  // Idempotency keys are scoped to the authenticated participant, room, and round.
  const { data: existing } = await supabase
    .from('room_answers')
    .select('*')
    .eq('request_id', requestId)
    .maybeSingle();
  if (existing) {
    if (!answerContextMatches(answerContextFromRow(existing), { roomId, roundId: roomRoundId, userId })) {
      return json({ error: 'request_id_conflict' }, 409);
    }
    return answerResult(requestId, existing, true);
  }

  const { data: round } = await supabase
    .from('room_rounds')
    .select('*, challenge:challenges(id, type, difficulty, time_limit_ms)')
    .eq('id', roomRoundId)
    .eq('room_id', roomId)
    .single();
  if (!round) return json({ error: 'Round not found' }, 404);

  const { data: room } = await supabase
    .from('rooms')
    .select('status')
    .eq('id', roomId)
    .maybeSingle();
  if (!room) return json({ error: 'Room not found' }, 404);
  if (room.status === 'ended') return json({ error: 'Room ended' }, 400);

  const { data: previousRoundAnswer } = await supabase
    .from('room_answers')
    .select('*')
    .eq('room_round_id', roomRoundId)
    .eq('user_id', userId)
    .maybeSingle();
  if (previousRoundAnswer) return answerResult(requestId, previousRoundAnswer, true);

  if (round.status !== 'active') return json({ error: 'Round not active' }, 400);

  const now = new Date();
  if (round.server_end_at && now > new Date(round.server_end_at)) {
    const stored = await insertRoomAnswer(supabase, {
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
    if (stored.error) return json({ error: stored.error }, stored.error === 'request_id_conflict' ? 409 : 500);
    return answerResult(requestId, stored.answer, stored.duplicate);
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

  const stored = await insertRoomAnswer(supabase, {
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
  if (stored.error) return json({ error: stored.error }, stored.error === 'request_id_conflict' ? 409 : 500);
  return answerResult(requestId, stored.answer, stored.duplicate);
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

async function leaderboard(supabase: any, userId: string, roomId: string) {
  if (!roomId) return json({ error: 'roomId required' }, 400);

  const access = await isRoomParticipant(supabase, roomId, userId);
  if (!access.exists) return json({ error: 'Room not found' }, 404);
  if (!access.allowed) return json({ error: 'Not a room participant' }, 403);

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
