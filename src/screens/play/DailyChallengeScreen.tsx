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

