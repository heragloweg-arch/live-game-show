/**
 * Edge Function: answer
 * Server-authoritative answer validation + scoring + idempotency.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { normalizeArabic } from '../_shared/arabic.ts';
import { calculateScore, DEFAULT_SCORING } from '../_shared/scoring.ts';
import { assertMatchParticipant, assertMatchNotFinished } from '../_shared/authz.ts';
import { validateAnswer } from '../_shared/answerValidator.ts';

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
    const { matchId, roundId, requestId, answer, clientTimestamp } = body;

    if (!matchId || !roundId || !requestId || answer === undefined) {
      return json({ error: 'Missing required fields: matchId, roundId, requestId, answer' }, 400);
    }

    // P0: must be participant + round belongs to match
    const authz = await assertMatchParticipant(supabase, matchId, user.id);
    if (!authz.ok) return json({ error: authz.error }, authz.status);
    const live = await assertMatchNotFinished(supabase, matchId);
    if (!live.ok) return json({ error: live.error }, live.status);

    // Already answered this round (unique round_id,user_id)
    const { data: prior } = await supabase
      .from('answer_submissions')
      .select('*')
      .eq('round_id', roundId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (prior) {
      return json({
        result: {
          requestId: prior.request_id,
          outcome: prior.outcome,
          points: prior.points,
          bonus: prior.bonus,
          serverValidatedAt: prior.server_validated_at,
          normalizedAnswer: prior.normalized_answer,
        },
        duplicate: true,
      });
    }


    // Idempotency
    const { data: existing } = await supabase
      .from('answer_submissions')
      .select('*')
      .eq('request_id', requestId)
      .maybeSingle();

    if (existing) {
      return json({
        result: {
          requestId: existing.request_id,
          outcome: existing.outcome,
          points: existing.points,
          bonus: existing.bonus,
          serverValidatedAt: existing.server_validated_at,
          normalizedAnswer: existing.normalized_answer,
        },
        duplicate: true,
      });
    }

    // Load round + challenge
    const { data: round } = await supabase
      .from('rounds')
      .select('*, challenge:challenges(id, type, subtype, prompt, difficulty, time_limit_ms, validation_mode, validation_rules, letter_pool)')
      .eq('id', roundId)
      .single();

    if (!round) return json({ error: 'Round not found' }, 404);
    if (round.match_id !== matchId) return json({ error: 'Round does not belong to match' }, 403);
    if (round.status !== 'active') return json({ error: 'Round not active' }, 400);

    // Time check
    const now = new Date();
    if (round.server_end_at && now > new Date(round.server_end_at)) {
      const result = await persistAnswer(supabase, {
        requestId, matchId, roundId, userId: user.id,
        answer: String(answer), outcome: 'timeout', points: 0, bonus: 0,
        responseTimeMs: null, clientTimestamp, normalized: normalizeArabic(String(answer)),
      });
      return json({ result });
    }

    // Validate answer (exact + choice + open_speed rules)
    const normalized = normalizeArabic(String(answer));
    const chMeta = round.challenge || {};

    const { data: accepted } = await supabase
      .from('challenge_answers')
      .select('normalized_answer')
      .eq('challenge_id', round.challenge_id);

    const { data: choices } = await supabase
      .from('challenge_choices')
      .select('choice_id, label, is_correct')
      .eq('challenge_id', round.challenge_id);

    const verdict = validateAnswer({
      rawAnswer: String(answer),
      acceptedNormalized: (accepted || []).map((a: any) => a.normalized_answer).filter(Boolean),
      choices: choices || [],
      meta: {
        type: chMeta.type,
        subtype: chMeta.subtype,
        prompt: chMeta.prompt,
        validation_mode: chMeta.validation_mode,
        validation_rules: chMeta.validation_rules,
        letter_pool: chMeta.letter_pool,
      },
    });
    const isCorrect = verdict.correct;

    // Security audit trail (abuse / forensics)
    if (!isCorrect) {
      try {
        await supabase.from('security_events').insert({
          user_id: user.id,
          event_type: 'answer_wrong',
          meta: { matchId, roundId, method: verdict.method, reason: verdict.reason ?? null },
        });
      } catch { /* non-blocking */ }
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

    const result = await persistAnswer(supabase, {
      requestId, matchId, roundId, userId: user.id,
      answer: String(answer), outcome: isCorrect ? 'correct' : 'wrong',
      points: score.points, bonus: score.bonus,
      responseTimeMs, clientTimestamp, normalized,
    });

    // Update participant score
    if (score.total > 0) {
      const { data: part } = await supabase
        .from('match_participants')
        .select('id, score')
        .eq('match_id', matchId)
        .eq('user_id', user.id)
        .single();
      if (part) {
        await supabase.from('match_participants').update({
          score: part.score + score.total,
        }).eq('id', part.id);
      }
    }

    // Update match sequence + status
    const { data: match } = await supabase.from('matches').select('sequence').eq('id', matchId).single();
    await supabase.from('matches').update({
      status: 'ANSWER_SUBMITTED',
      sequence: (match?.sequence ?? 0) + 1,
      server_now: now.toISOString(),
    }).eq('id', matchId);

    return json({ result });
  } catch (err) {
    console.error('[answer]', err);
    return json({ error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function persistAnswer(supabase: any, opts: {
  requestId: string; matchId: string; roundId: string; userId: string;
  answer: string; outcome: string; points: number; bonus: number;
  responseTimeMs: number | null; clientTimestamp?: string; normalized: string;
}) {
  const { data, error } = await supabase.rpc('submit_answer_atomic', {
    p_request_id: opts.requestId,
    p_match_id: opts.matchId,
    p_round_id: opts.roundId,
    p_user_id: opts.userId,
    p_answer: opts.answer,
    p_normalized: opts.normalized,
    p_outcome: opts.outcome,
    p_points: opts.points,
    p_bonus: opts.bonus,
    p_response_time_ms: opts.responseTimeMs,
    p_client_timestamp: opts.clientTimestamp ?? null,
  });
  if (!error && data) {
    return {
      requestId: data.requestId ?? opts.requestId,
      outcome: data.outcome ?? opts.outcome,
      points: data.points ?? opts.points,
      bonus: data.bonus ?? opts.bonus,
      serverValidatedAt: new Date().toISOString(),
      normalizedAnswer: opts.normalized,
      duplicate: !!data.duplicate,
    };
  }
  console.warn('[answer] atomic rpc fallback', error?.message);
  const { data: prior } = await supabase.from('answer_submissions').select('*')
    .eq('round_id', opts.roundId).eq('user_id', opts.userId).maybeSingle();
  if (prior) {
    return {
      requestId: prior.request_id,
      outcome: prior.outcome,
      points: prior.points,
      bonus: prior.bonus,
      serverValidatedAt: prior.server_validated_at,
      normalizedAnswer: prior.normalized_answer,
      duplicate: true,
    };
  }
  await supabase.from('answer_submissions').insert({
    request_id: opts.requestId,
    match_id: opts.matchId,
    round_id: opts.roundId,
    user_id: opts.userId,
    answer: opts.answer,
    normalized_answer: opts.normalized,
    outcome: opts.outcome,
    points: opts.points,
    bonus: opts.bonus,
    response_time_ms: opts.responseTimeMs,
    client_timestamp: opts.clientTimestamp,
    server_validated_at: new Date().toISOString(),
  });
  const { data: part } = await supabase.from('match_participants').select('score')
    .eq('match_id', opts.matchId).eq('user_id', opts.userId).maybeSingle();
  await supabase.from('match_participants').update({
    score: (part?.score ?? 0) + opts.points + (opts.bonus ?? 0),
  }).eq('match_id', opts.matchId).eq('user_id', opts.userId);
  return {
    requestId: opts.requestId,
    outcome: opts.outcome,
    points: opts.points,
    bonus: opts.bonus,
    serverValidatedAt: new Date().toISOString(),
    normalizedAnswer: opts.normalized,
  };
}
