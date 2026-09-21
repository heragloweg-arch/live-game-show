#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")" 2>/dev/null || cd /workspaces/live-game-show
ROOT="${1:-.}"
cd "$ROOT"
echo "Applying daily fix under $(pwd)"

mkdir -p "$(dirname "src/services/daily/dailyApi.ts")"
cat > 'src/services/daily/dailyApi.ts' << 'QADDAHA_EOF'
import { supabase } from '../supabase/client';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : '';

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const res = await fetch(`${FUNCTIONS_URL}/daily`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify(body),
  });

  let data: any = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      res.ok ? 'Daily API returned non-JSON' : `Daily API failed (${res.status})`
    );
  }
  if (!res.ok) throw new Error(data?.error ?? `Daily API failed (${res.status})`);
  return data as T;
}

export interface DailyState {
  date: string;
  completed: boolean;
  bonusCoins: number;
  bonusXp: number;
  challenge: {
    id: string;
    type: string;
    subtype?: string;
    prompt: string;
    difficulty: string;
    timeLimitMs: number;
    letterPool?: string[];
    /** عدد الكلمات المطلوب استخراجها من الحروف */
    targetWordCount?: number;
    choices?: { id: string; label: string }[];
  };
  streak: {
    current_streak: number;
    longest_streak: number;
    last_daily_date: string | null;
  };
}

export async function getTodayDaily(): Promise<DailyState> {
  return invoke<DailyState>({ action: 'get_today' });
}

/** إجابة واحدة أو عدة كلمات مفصولة بـ | */
export async function submitDailyAnswer(answer: string, responseTimeMs?: number) {
  return invoke<{
    correct: boolean;
    points: number;
    coinGain: number;
    xpGain: number;
    streak: DailyState['streak'];
    alreadyCompleted?: boolean;
    matchedWords?: string[];
    needed?: number;
  }>({ action: 'submit', answer, responseTimeMs });
}

export async function getStreak() {
  return invoke<{ streak: DailyState['streak'] }>({ action: 'get_streak' });
}

export async function completeOnboarding() {
  return invoke<{ ok: boolean }>({ action: 'complete_onboarding' });
}

QADDAHA_EOF
echo "  wrote src/services/daily/dailyApi.ts"

mkdir -p "$(dirname "src/screens/play/DailyChallengeScreen.tsx")"
cat > 'src/screens/play/DailyChallengeScreen.tsx' << 'QADDAHA_EOF'
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Flame, Loader2, Calendar, Sparkles, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  getTodayDaily,
  submitDailyAnswer,
  type DailyState,
} from '../../services/daily/dailyApi';
import { useAuthStore } from '../../store/authStore';
import { LetterPoolBoard } from '../../components/game/LetterPoolBoard';
import { cn } from '../../utils/cn';

export function DailyChallengeScreen() {
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const [state, setState] = useState<DailyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [builtWord, setBuiltWord] = useState('');
  const [words, setWords] = useState<string[]>([]);
  const [result, setResult] = useState<{
    correct: boolean;
    coinGain: number;
    xpGain: number;
    matchedWords?: string[];
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const [letterKey, setLetterKey] = useState(0);

  useEffect(() => {
    getTodayDaily()
      .then(setState)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const targetCount = state?.challenge.targetWordCount ?? 3;
  const hasLetterPool = !!(state?.challenge.letterPool && state.challenge.letterPool.length > 0);

  const addWord = () => {
    const w = builtWord.trim();
    if (!w) return;
    if (words.includes(w)) {
      setError('هذه الكلمة مضافة مسبقاً');
      return;
    }
    if (words.length >= targetCount) return;
    setWords((prev) => [...prev, w]);
    setBuiltWord('');
    setLetterKey((k) => k + 1);
    setError(null);
  };

  const removeWord = (idx: number) => {
    setWords((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    if (!state) return;
    let value = '';
    if (hasLetterPool) {
      if (words.length < targetCount) {
        setError(`يلزم ${targetCount} كلمات — لديك ${words.length}`);
        return;
      }
      value = words.join('|');
    } else if (state.challenge.choices) {
      value = selected ?? '';
    } else {
      value = answer.trim();
    }
    if (!value) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await submitDailyAnswer(value, Date.now() - startedAt);
      if (res.alreadyCompleted) {
        setState((s) => (s ? { ...s, completed: true } : s));
        return;
      }
      setResult({
        correct: res.correct,
        coinGain: res.coinGain ?? 0,
        xpGain: res.xpGain ?? 0,
        matchedWords: res.matchedWords,
      });
      setState((s) =>
        s
          ? {
              ...s,
              completed: true,
              streak: (res.streak as DailyState['streak']) ?? s.streak,
            }
          : s
      );
      if (res.correct) {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.65 },
          colors: ['#22c55e', '#eab308', '#f97316'],
        });
      }
      void refreshProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Loader2 className="h-9 w-9 animate-spin text-orange-400" />
        <p className="text-sm text-white/40">جاري تحميل تحدي اليوم...</p>
      </div>
    );
  }

  const streak = state?.streak?.current_streak ?? 0;

  return (
    <div className="relative min-h-screen overflow-hidden px-5 pb-12 pt-6">
      <div className="pointer-events-none absolute -left-16 top-24 h-56 w-56 rounded-full bg-orange-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 bottom-20 h-40 w-40 rounded-full bg-zatona-500/10 blur-3xl" />

      <header className="relative z-10 mb-6 flex items-center gap-3">
        <Link to="/home" className="btn-ghost -mr-2 p-2">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">تحدي اليوم</h1>
          <p className="text-xs text-white/45">{state?.date}</p>
        </div>
        <motion.div
          animate={streak > 0 ? { scale: [1, 1.06, 1] } : {}}
          transition={{ repeat: Infinity, duration: 2.2 }}
          className="flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/15 px-3 py-1.5 text-sm font-bold text-orange-400"
        >
          <Flame className="h-4 w-4" />
          {streak}
        </motion.div>
      </header>

      {error && (
        <div className="relative z-10 mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="relative z-10 mb-5 grid grid-cols-2 gap-3">
        <div className="card flex items-center gap-3 p-3.5">
          <Calendar className="h-5 w-5 text-zatona-400" />
          <div>
            <p className="text-[11px] text-white/40">مكافأة اليوم</p>
            <p className="text-sm font-bold text-white">
              +{state?.bonusCoins ?? 40} · +{state?.bonusXp ?? 35} XP
            </p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-3.5">
          <Trophy className="h-5 w-5 text-gold-400" />
          <div>
            <p className="text-[11px] text-white/40">أطول سلسلة</p>
            <p className="text-sm font-bold text-white">{state?.streak?.longest_streak ?? 0} يوم</p>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {state && (
          <motion.div
            key={state.challenge.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-10 card overflow-hidden p-6"
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-orange-500 via-zatona-500 to-gold-400" />
            <div className="mb-3 flex items-center justify-center gap-2 text-xs font-semibold text-orange-400/90">
              <Sparkles className="h-3.5 w-3.5" />
              {hasLetterPool
                ? `استخرج ${targetCount} كلمات من الحروف`
                : `${state.challenge.type} · ${state.challenge.difficulty}`}
            </div>
            <h2 className="mb-6 text-center font-display text-xl font-bold leading-relaxed text-white">
              {state.challenge.prompt}
            </h2>

            {state.completed || result ? (
              <div className="text-center">
                {result ? (
                  <>
                    <p
                      className={cn(
                        'font-display text-2xl font-bold',
                        result.correct ? 'text-emerald-400' : 'text-red-400'
                      )}
                    >
                      {result.correct ? 'أحسنت!' : 'للأسف…'}
                    </p>
                    {result.correct && (
                      <p className="mt-2 text-sm text-white/55">
                        +{result.coinGain} عملة · +{result.xpGain} XP
                      </p>
                    )}
                    {result.matchedWords && result.matchedWords.length > 0 && (
                      <p className="mt-2 text-sm text-white/60">
                        كلماتك: {result.matchedWords.join(' · ')}
                      </p>
                    )}
                    <p className="mt-3 text-sm text-orange-400">
                      سلسلتك الآن: {state.streak?.current_streak ?? 0} يوم متتالي
                    </p>
                  </>
                ) : (
                  <p className="text-white/50">أكملت تحدي اليوم — عد غداً لإشعال السلسلة</p>
                )}
                <Link to="/home" className="btn-primary mt-6 flex w-full justify-center py-3.5">
                  العودة للرئيسية
                </Link>
              </div>
            ) : hasLetterPool ? (
              <>
                <p className="mb-3 text-center text-sm text-white/50">
                  كوّن كلمة ثم اضغط «أضف كلمة» — المطلوب {targetCount}
                </p>
                <div className="mb-4 flex flex-wrap justify-center gap-2">
                  {Array.from({ length: targetCount }).map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => words[i] && removeWord(i)}
                      className={cn(
                        'min-w-[4.5rem] rounded-xl border px-3 py-2 text-sm font-bold',
                        words[i]
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : 'border-white/10 bg-white/5 text-white/30'
                      )}
                    >
                      {words[i] ?? `كلمة ${i + 1}`}
                    </button>
                  ))}
                </div>
                <LetterPoolBoard
                  key={letterKey}
                  letters={state.challenge.letterPool!}
                  onChange={setBuiltWord}
                  disabled={words.length >= targetCount}
                />
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={addWord}
                    disabled={!builtWord.trim() || words.length >= targetCount}
                    className="btn-secondary flex-1 py-3"
                  >
                    أضف كلمة
                  </button>
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={submitting || words.length < targetCount}
                    className="btn-primary flex-1 py-3"
                  >
                    {submitting ? 'جاري التحقق...' : 'إرسال'}
                  </button>
                </div>
              </>
            ) : state.challenge.choices?.length ? (
              <>
                <div className="grid gap-2">
                  {state.challenge.choices.map((c) => (
                    <motion.button
                      key={c.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelected(c.id)}
                      className={cn(
                        'rounded-xl border px-4 py-3.5 text-right text-sm transition-all',
                        selected === c.id
                          ? 'border-orange-500/60 bg-orange-500/15 text-white'
                          : 'border-white/10 bg-white/5 text-white/80'
                      )}
                    >
                      {c.label}
                    </motion.button>
                  ))}
                </div>
                <button
                  onClick={() => void submit()}
                  disabled={submitting || !selected}
                  className="btn-primary mt-5 w-full py-3.5"
                >
                  {submitting ? 'جاري التحقق...' : 'إرسال الإجابة'}
                </button>
              </>
            ) : (
              <>
                <input
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void submit()}
                  className="input-field text-center text-lg"
                  placeholder="إجابتك هنا..."
                  dir="rtl"
                  autoFocus
                />
                <button
                  onClick={() => void submit()}
                  disabled={submitting || !answer.trim()}
                  className="btn-primary mt-5 w-full py-3.5"
                >
                  {submitting ? 'جاري التحقق...' : 'إرسال الإجابة'}
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

QADDAHA_EOF
echo "  wrote src/screens/play/DailyChallengeScreen.tsx"

mkdir -p "$(dirname "supabase/functions/daily/index.ts")"
cat > 'supabase/functions/daily/index.ts' << 'QADDAHA_EOF'
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

QADDAHA_EOF
echo "  wrote supabase/functions/daily/index.ts"

mkdir -p "$(dirname "supabase/migrations/20260311000027_daily_letter_words.sql")"
cat > 'supabase/migrations/20260311000027_daily_letter_words.sql' << 'QADDAHA_EOF'
-- Daily: letter pool → extract 3 words
-- Seed challenges with rich letter pools + multiple accepted answers

INSERT INTO public.challenges (
  id, type, subtype, prompt, difficulty, time_limit_ms, active, qa_status, weight, letter_pool, validation_mode
) VALUES
(
  'd0000001-0000-4000-8000-000000000001',
  'speed',
  'letters',
  'من الحروف التالية: كوّن 3 كلمات عربية صحيحة (أسماء أو أفعال شائعة)',
  'normal',
  90000,
  true,
  'approved',
  10,
  ARRAY['م','د','ر','س','ة','ك','ت','ا','ب','و','ل','ع','ب','ن'],
  'open_speed'
),
(
  'd0000001-0000-4000-8000-000000000002',
  'speed',
  'letters',
  'استخرج 3 كلمات من هذه الحروف — كل كلمة من حروف موجودة في المجموعة',
  'normal',
  90000,
  true,
  'approved',
  10,
  ARRAY['ش','م','س','ق','م','ر','ن','ج','م','ر','ي','ح','ب','ح','ر'],
  'open_speed'
),
(
  'd0000001-0000-4000-8000-000000000003',
  'words',
  'letters',
  'رتّب الحروف لتكوّن 3 كلمات مختلفة',
  'easy',
  90000,
  true,
  'approved',
  10,
  ARRAY['ب','ي','ت','ب','ا','ب','ش','ب','ا','ك','غ','ر','ف','ة'],
  'open_speed'
)
ON CONFLICT (id) DO UPDATE SET
  prompt = EXCLUDED.prompt,
  letter_pool = EXCLUDED.letter_pool,
  active = true,
  qa_status = 'approved',
  weight = 10;

-- Accepted answers for challenge 1
INSERT INTO public.challenge_answers (challenge_id, accepted_answer, normalized_answer)
SELECT 'd0000001-0000-4000-8000-000000000001', a, a FROM (VALUES
  ('مدرسة'),('كتاب'),('لعب'),('ولد'),('بنت'),('كرة'),('درس'),('كتب'),('مدرس'),('لعبة')
) AS v(a)
ON CONFLICT DO NOTHING;

INSERT INTO public.challenge_answers (challenge_id, accepted_answer, normalized_answer)
SELECT 'd0000001-0000-4000-8000-000000000002', a, a FROM (VALUES
  ('شمس'),('قمر'),('نجم'),('ريح'),('بحر'),('سمر'),('مرح')
) AS v(a)
ON CONFLICT DO NOTHING;

INSERT INTO public.challenge_answers (challenge_id, accepted_answer, normalized_answer)
SELECT 'd0000001-0000-4000-8000-000000000003', a, a FROM (VALUES
  ('بيت'),('باب'),('شباك'),('غرفة'),('تراب'),('بائع')
) AS v(a)
ON CONFLICT DO NOTHING;

-- Reset today's daily row so next get_today can prefer letter-pool (optional manual)
-- DELETE FROM public.daily_challenges WHERE challenge_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date;

QADDAHA_EOF
echo "  wrote supabase/migrations/20260311000027_daily_letter_words.sql"

echo "Done. Next: git add/commit/push, supabase db push, functions deploy daily --use-api, Railway redeploy"