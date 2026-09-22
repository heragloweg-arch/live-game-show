import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Flame, Loader2, Calendar, Sparkles, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  getTodayDaily,
  submitDailyAnswer,
  type DailyState,
} from '../../services/daily/dailyApi';
import { supabase } from '../../services/supabase/client';
import { useAuthStore } from '../../store/authStore';
import { cn } from '../../utils/cn';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : '';

async function checkDailyWord(word: string): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return false;
  const res = await fetch(`${FUNCTIONS_URL}/daily`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify({ action: 'check_word', word }),
  });
  const data = await res.json().catch(() => ({}));
  return !!(res.ok && data.ok);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function DailyChallengeScreen() {
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const [state, setState] = useState<DailyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pool, setPool] = useState<{ id: string; ch: string }[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [words, setWords] = useState<(string | null)[]>([]);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{
    correct: boolean;
    coinGain: number;
    xpGain: number;
    matchedWords?: string[];
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    getTodayDaily()
      .then((s) => {
        setState(s);
        const slots = s.challenge.targetSlots?.length
          ? s.challenge.targetSlots
          : Array.from({ length: s.challenge.targetWordCount ?? 3 }, (_, i) => ({
              index: i,
              length: 0,
            }));
        setWords(slots.map(() => null));
        const letters = s.challenge.letterPool ?? [];
        setPool(
          shuffle(letters).map((ch, i) => ({ id: `${ch}-${i}-${Math.random()}`, ch }))
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const slots = useMemo(() => {
    if (state?.challenge.targetSlots?.length) return state.challenge.targetSlots;
    const n = state?.challenge.targetWordCount ?? 3;
    return Array.from({ length: n }, (_, i) => ({ index: i, length: 0 as number, hint: undefined as string | undefined }));
  }, [state]);

  const targetCount = slots.length || 3;
  const builtWord = picked
    .map((id) => pool.find((p) => p.id === id)?.ch ?? '')
    .join('');
  const nextEmpty = words.findIndex((w) => !w);
  const needLen = nextEmpty >= 0 ? slots[nextEmpty]?.length ?? 0 : 0;
  const allDone = words.every((w) => !!w) && words.length === targetCount;

  const tryAutoRegister = useCallback(
    async (word: string, usedIds: string[]) => {
      if (nextEmpty < 0 || checking) return;
      if (needLen > 0 && word.length !== needLen) return;
      setChecking(true);
      setError(null);
      try {
        const ok = await checkDailyWord(word);
        if (!ok) {
          setError('ليست من الكلمات المطلوبة — جرّب ترتيباً آخر');
          setPicked([]);
          return;
        }
        setWords((prev) => {
          const copy = [...prev];
          copy[nextEmpty] = word;
          return copy;
        });
        // احذف الحروف المستخدمة من المجموعة
        setPool((prev) => prev.filter((p) => !usedIds.includes(p.id)));
        setPicked([]);
      } finally {
        setChecking(false);
      }
    },
    [nextEmpty, needLen, checking]
  );

  useEffect(() => {
    if (!builtWord || nextEmpty < 0) return;
    if (needLen > 0 && builtWord.length === needLen) {
      void tryAutoRegister(builtWord, picked);
    }
  }, [builtWord, needLen, nextEmpty]);

  const pick = (id: string) => {
    if (allDone || checking || nextEmpty < 0) return;
    if (needLen > 0 && picked.length >= needLen) return;
    setPicked((p) => [...p, id]);
    setError(null);
  };

  const undo = () => {
    if (checking) return;
    setPicked((p) => p.slice(0, -1));
  };

  const clearPicked = () => setPicked([]);

  const removeWord = (idx: number) => {
    const w = words[idx];
    if (!w) return;
    // أعد الحروف للمجموعة
    const restored = w.split('').map((ch, i) => ({
      id: `restored-${idx}-${i}-${Math.random()}`,
      ch,
    }));
    setPool((prev) => shuffle([...prev, ...restored]));
    setWords((prev) => {
      const copy = [...prev];
      copy[idx] = null;
      return copy;
    });
  };

  const submit = async () => {
    if (!state || !allDone) return;
    setSubmitting(true);
    setError(null);
    try {
      const value = words.filter(Boolean).join('|');
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
          particleCount: 100,
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

  // إرسال تلقائي عند اكتمال الثلاث
  useEffect(() => {
    if (allDone && !result && !state?.completed) {
      void submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Loader2 className="h-9 w-9 animate-spin text-orange-400" />
        <p className="text-sm text-white/40">جاري تحميل تحدي اليوم...</p>
      </div>
    );
  }

  const streak = state?.streak?.current_streak ?? 0;
  const theme = state?.challenge.theme;
  const available = pool.filter((p) => !picked.includes(p.id));

  return (
    <div className="relative min-h-screen overflow-hidden px-5 pb-12 pt-6">
      <header className="relative z-10 mb-6 flex items-center gap-3">
        <Link to="/home" className="btn-ghost -mr-2 p-2">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">تحدي اليوم</h1>
          <p className="text-xs text-white/45">{state?.date}</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/15 px-3 py-1.5 text-sm font-bold text-orange-400">
          <Flame className="h-4 w-4" />
          {streak}
        </div>
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
            <div className="mb-2 flex items-center justify-center gap-2 text-xs font-semibold text-orange-400/90">
              <Sparkles className="h-3.5 w-3.5" />
              {theme ? `موضوع: ${theme}` : 'تحدي الحروف'}
            </div>
            <h2 className="mb-5 text-center font-display text-lg font-bold leading-relaxed text-white">
              {state.challenge.prompt}
            </h2>

            {state.completed || result ? (
              <div className="text-center">
                <p
                  className={cn(
                    'font-display text-2xl font-bold',
                    result?.correct || state.completed ? 'text-emerald-400' : 'text-red-400'
                  )}
                >
                  {result?.correct ? 'أحسنت! اكتمل التحدي' : result ? 'غير مكتمل' : 'مكتمل مسبقاً'}
                </p>
                {result?.correct && (
                  <p className="mt-2 text-sm text-white/55">
                    +{result.coinGain} عملة · +{result.xpGain} XP
                  </p>
                )}
                {result?.matchedWords && (
                  <p className="mt-2 text-sm text-white/60">{result.matchedWords.join(' · ')}</p>
                )}
                <Link to="/home" className="btn-primary mt-6 flex w-full justify-center py-3.5">
                  العودة للرئيسية
                </Link>
              </div>
            ) : (
              <>
                {/* خانات بشرطات بعدد الحروف */}
                <div className="mb-6 space-y-3">
                  {slots.map((slot, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => words[i] && removeWord(i)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl border px-3 py-3',
                        words[i]
                          ? 'border-emerald-500/40 bg-emerald-500/10'
                          : i === nextEmpty
                            ? 'border-violet-500/50 bg-violet-500/10'
                            : 'border-white/10 bg-white/5'
                      )}
                    >
                      <div className="text-right">
                        <p className="text-[11px] text-white/45">
                          كلمة {i + 1}
                          {slot.hint ? ` · ${slot.hint}` : ''}
                        </p>
                        <p className="font-display text-xl font-bold tracking-widest text-white" dir="ltr">
                          {words[i]
                            ? words[i]
                            : slot.length > 0
                              ? 'ـ '.repeat(slot.length).trim()
                              : '؟ ؟ ؟'}
                        </p>
                      </div>
                      <span className="rounded-lg bg-white/10 px-2 py-1 text-xs font-bold text-violet-300">
                        {slot.length || '?'} حروف
                      </span>
                    </button>
                  ))}
                </div>

                {/* الكلمة قيد البناء */}
                <div className="mb-3 flex min-h-[52px] flex-wrap items-center justify-center gap-2 rounded-2xl border border-violet-500/25 bg-violet-500/10 px-3 py-2">
                  {picked.length === 0 && (
                    <span className="text-sm text-white/35">
                      {checking ? 'جاري التحقق...' : `اختر ${needLen || ''} حروف`}
                    </span>
                  )}
                  {picked.map((id) => (
                    <span
                      key={id}
                      className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/40 font-display text-lg font-bold text-white"
                    >
                      {pool.find((p) => p.id === id)?.ch}
                    </span>
                  ))}
                </div>
                <div className="mb-4 flex justify-center gap-2">
                  <button type="button" className="btn-ghost text-sm" onClick={undo} disabled={!picked.length}>
                    تراجع
                  </button>
                  <button type="button" className="btn-ghost text-sm" onClick={clearPicked} disabled={!picked.length}>
                    مسح
                  </button>
                </div>

                {/* الحروف المبعثرة */}
                <div className="flex flex-wrap justify-center gap-2.5">
                  {available.map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      disabled={checking || allDone}
                      onClick={() => pick(x.id)}
                      className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-white/15 bg-surface-800 font-display text-xl font-bold text-white active:border-violet-400/60"
                    >
                      {x.ch}
                    </button>
                  ))}
                </div>

                {submitting && (
                  <p className="mt-4 text-center text-sm text-white/50">جاري احتساب المكافأة...</p>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
