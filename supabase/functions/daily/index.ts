/**
 * Daily Challenge + Streak
 * actions: get_today | submit | get_streak
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

/** Game day in MENA (Asia/Riyadh) — not raw UTC */
function gameDayMena(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { normalizeArabic } from '../_shared/arabic.ts';
import { calculateScore, DEFAULT_SCORING } from '../_shared/scoring.ts';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function todayUTC(): string {
  return gameDayMena();
}

function yesterdayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
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
    const day = todayUTC();

    if (action === 'get_today') {
      let { data: daily } = await supabase
        .from('daily_challenges')
        .select('*, challenge:challenges(id, type, subtype, prompt, difficulty, time_limit_ms, letter_pool)')
        .eq('challenge_date', day)
        .maybeSingle();

      if (!daily) {
        // Prefer letter-pool challenges (extract N words from letters)
        let { data: pool } = await supabase
          .from('challenges')
          .select('id')
          .eq('active', true)
          .not('letter_pool', 'is', null)
          .limit(120);
        if (!pool?.length) {
          const fallback = await supabase
            .from('challenges')
            .select('id')
            .eq('active', true)
            .limit(80);
          pool = fallback.data;
        }
        if (!pool?.length) return json({ error: 'No challenges' }, 500);
        // Deterministic pick by date
        let h = 0;
        for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) >>> 0;
        const pick = pool[h % pool.length];
        const { data: inserted } = await supabase
          .from('daily_challenges')
          .upsert({
            challenge_date: day,
            challenge_id: pick.id,
            bonus_coins: 40,
            bonus_xp: 35,
          }, { onConflict: 'challenge_date' })
          .select('*, challenge:challenges(id, type, subtype, prompt, difficulty, time_limit_ms, letter_pool)')
          .single();
        daily = inserted;
      }

      const { data: choices } = await supabase
        .from('challenge_choices')
        .select('choice_id, label')
        .eq('challenge_id', daily.challenge_id);

      const { data: completion } = await supabase
        .from('daily_completions')
        .select('*')
        .eq('user_id', user.id)
        .eq('challenge_date', day)
        .maybeSingle();

      const streak = await getStreakRow(supabase, user.id);

      return json({
        date: day,
        completed: !!completion,
        completion,
        bonusCoins: daily.bonus_coins,
        bonusXp: daily.bonus_xp,
        challenge: {
          id: daily.challenge?.id ?? daily.challenge_id,
          type: daily.challenge?.type,
          subtype: daily.challenge?.subtype,
          prompt: daily.challenge?.prompt,
          difficulty: daily.challenge?.difficulty,
          timeLimitMs: daily.challenge?.time_limit_ms ?? 15000,
          letterPool: daily.challenge?.letter_pool,
          targetWordCount: daily.challenge?.letter_pool?.length ? 3 : 1,
          choices: choices?.map((c: any) => ({ id: c.choice_id, label: c.label })),
        },
        streak,
      });
    }

    if (action === 'submit') {
      const answer = String(body.answer ?? '');
      const { data: daily } = await supabase
        .from('daily_challenges')
        .select('*')
        .eq('challenge_date', day)
        .single();
      if (!daily) return json({ error: 'No daily challenge' }, 404);

      const { data: accepted } = await supabase
        .from('challenge_answers')
        .select('normalized_answer')
        .eq('challenge_id', daily.challenge_id);

      const { data: chMeta } = await supabase
        .from('challenges')
        .select('letter_pool')
        .eq('id', daily.challenge_id)
        .maybeSingle();

      const acceptedSet = new Set(
        (accepted ?? []).map((a: any) => normalizeArabic(a.normalized_answer))
      );

      // Multi-word daily: "word1|word2|word3" — need 3 unique accepted words
      const parts = String(answer)
        .split(/[|,،\n]+/)
        .map((s) => normalizeArabic(s.trim()))
        .filter(Boolean);
      const uniqueParts = [...new Set(parts)];

      let correct = false;
      let matchedWords: string[] = [];
      const TARGET = chMeta?.letter_pool?.length ? 3 : 1;

      if (TARGET > 1 && acceptedSet.size > 0) {
        matchedWords = uniqueParts.filter((w) => acceptedSet.has(w));
        correct = matchedWords.length >= TARGET;
      } else {
        const normalized = normalizeArabic(answer);
        if (acceptedSet.size) {
          correct = acceptedSet.has(normalized);
          if (correct) matchedWords = [normalized];
        }
        if (!correct) {
          const { data: choices } = await supabase
            .from('challenge_choices')
            .select('choice_id, label, is_correct')
            .eq('challenge_id', daily.challenge_id);
          correct = !!choices?.find(
            (c: any) =>
              c.is_correct &&
              (c.choice_id === answer || normalizeArabic(c.label) === normalized)
          );
        }
      }

      const { data: ch } = await supabase
        .from('challenges')
        .select('type, difficulty, time_limit_ms')
        .eq('id', daily.challenge_id)
        .single();

      const score = calculateScore({
        outcome: correct ? 'correct' : 'wrong',
        responseTimeMs: body.responseTimeMs ?? 5000,
        timeLimitMs: ch?.time_limit_ms ?? 15000,
        difficulty: ch?.difficulty ?? 'normal',
        challengeType: ch?.type ?? 'knowledge',
        config: DEFAULT_SCORING,
      });

      const { data: atomic, error: atomicErr } = await supabase.rpc('complete_daily_atomic', {
        p_user_id: user.id,
        p_day: day,
        p_challenge_id: daily.challenge_id,
        p_outcome: correct ? 'correct' : 'wrong',
        p_points: score.total,
        p_bonus_coins: correct ? (daily.bonus_coins ?? 40) : 0,
        p_bonus_xp: correct ? (daily.bonus_xp ?? 35) : 0,
      });

      if (!atomicErr && atomic?.ok) {
        return json({
          ok: true,
          correct,
          points: score.total,
          coinGain: correct ? (daily.bonus_coins ?? 40) : 0,
          xpGain: correct ? (daily.bonus_xp ?? 35) : 0,
          alreadyCompleted: !!atomic.already,
          coins: atomic.coins,
          awarded: atomic.awarded,
          streak: { current_streak: atomic.streak, longest_streak: atomic.streak, last_daily_date: day },
          matchedWords,
          needed: TARGET,
          multiplier: atomic.multiplier ?? 1,
        });
      }

      // Fallback if RPC missing
      console.warn('[daily] atomic fallback', atomicErr?.message);
      const { data: existing } = await supabase
        .from('daily_completions')
        .select('*')
        .eq('user_id', user.id)
        .eq('challenge_date', day)
        .maybeSingle();
      if (existing) {
        return json({ alreadyCompleted: true, completion: existing, streak: await getStreakRow(supabase, user.id) });
      }
      await supabase.from('daily_completions').insert({
        user_id: user.id,
        challenge_date: day,
        outcome: correct ? 'correct' : 'wrong',
        points: score.total,
      });
      const streak = await updateStreak(supabase, user.id, day);
      let coinGain = 0;
      if (correct) {
        const { data: prof } = await supabase.from('profiles').select('subscription_plan, subscription_expires_at').eq('id', user.id).single();
        let mult = 1;
        if (prof?.subscription_plan && ['plus_monthly','plus_yearly','host_pro'].includes(prof.subscription_plan)) {
          const exp = prof.subscription_expires_at ? new Date(prof.subscription_expires_at) : null;
          if (!exp || exp.getTime() > Date.now()) mult = 2;
        }
        coinGain = (daily.bonus_coins ?? 40) * mult;
        await supabase.rpc('credit_coins', {
          p_user_id: user.id,
          p_amount: coinGain,
          p_type: 'daily_challenge',
          p_reference: day,
        });
      }
      return json({
        ok: true,
        correct,
        points: score.total,
        coinGain,
        streak,
      });
    }

    if (action === 'get_streak') {
      return json({ streak: await getStreakRow(supabase, user.id) });
    }

    if (action === 'complete_onboarding') {
      await supabase.from('profiles').update({ onboarding_done: true }).eq('id', user.id);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('[daily]', err);
    return json({ error: String(err) }, 500);
  }
});

async function getStreakRow(supabase: any, userId: string) {
  const { data } = await supabase.from('user_streaks').select('*').eq('user_id', userId).maybeSingle();
  return data ?? { user_id: userId, current_streak: 0, longest_streak: 0, last_daily_date: null };
}

async function updateStreak(supabase: any, userId: string, day: string) {
  const row = await getStreakRow(supabase, userId);
  let current = row.current_streak ?? 0;
  let longest = row.longest_streak ?? 0;
  const last = row.last_daily_date;

  if (last === day) {
    // already counted
  } else if (last && yesterdayOf(day) === last) {
    current += 1;
  } else {
    current = 1;
  }
  longest = Math.max(longest, current);

  await supabase.from('user_streaks').upsert({
    user_id: userId,
    current_streak: current,
    longest_streak: longest,
    last_daily_date: day,
    updated_at: new Date().toISOString(),
  });

  return { user_id: userId, current_streak: current, longest_streak: longest, last_daily_date: day };
}

