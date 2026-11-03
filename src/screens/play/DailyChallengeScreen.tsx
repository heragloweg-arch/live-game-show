import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Flame, Loader2, Sparkles, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import { getDailyPack, submitDailyPackSlot, claimDailyPackAdReward, type DailyPackState } from '../../services/daily/dailyApi';
import { useAuthStore } from '../../store/authStore';
import { cn } from '../../utils/cn';
import { track } from '../../services/analytics/events';
import { RewardedCoinsCTA } from '../../components/ads/RewardedCoinsCTA';
import { AnswerHint } from '../../components/game/AnswerHint';
import { UnifiedAnswerInput } from '../../components/game/UnifiedAnswerInput';
import { hasPlayableAnswerContract } from '../../utils/challengeContract';

export function DailyChallengeScreen() {
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const [pack, setPack] = useState<DailyPackState | null>(null);
  const [activeSlot, setActiveSlot] = useState(0);
  const [answer, setAnswer] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<{ correct: boolean; coinGain: number; xpGain: number } | null>(null);
  const [packComplete, setPackComplete] = useState(false);
  const [perfectPack, setPerfectPack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());

  useEffect(() => {
    getDailyPack()
      .then((next) => {
        setPack(next);
        track('daily_pack_start', { packId: next.pack.id, slots: next.slots.length });
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const slot = pack?.slots[activeSlot];
  const completed = new Set(pack?.completed.map((x) => x.slot_id));

  const moveToSlot = (index: number) => {
    setActiveSlot(index);
    setStartedAt(Date.now());
    setResult(null);
    setAnswer('');
    setSelected(null);
    setPackComplete(false);
    setPerfectPack(false);
  };

  const submit = async (submittedValue: string) => {
    if (!slot || !submittedValue || submitting || result) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitDailyPackSlot(slot.id, submittedValue, Date.now() - startedAt);
      if (!res.alreadyCompleted) {
        track('daily_slot_complete', { slotId: slot.id, correct: res.correct, points: res.points, packComplete: !!res.packComplete });
        if (res.packComplete) track('daily_pack_complete', { packId: slot.pack_id, coinGain: res.coinGain, xpGain: res.xpGain, streak: res.streak.current_streak });
        setResult({ correct: res.correct, coinGain: res.coinGain ?? 0, xpGain: res.xpGain ?? 0 });
        if (res.packComplete) {
          setPackComplete(true);
          setPerfectPack(!!(res as { perfectPack?: boolean }).perfectPack);
        }
        setPack((current) => current ? {
          ...current,
          completed: [...current.completed, { slot_id: slot.id, outcome: res.correct ? 'correct' : 'wrong', points: res.points }],
          streak: res.streak,
        } : current);
        if (res.correct) {
          confetti({ particleCount: 85, spread: 70, origin: { y: 0.65 }, colors: ['#22c55e', '#eab308', '#f97316'] });
          try { navigator.vibrate?.([35, 20, 55]); } catch { /* optional haptic */ }
        } else {
          try { navigator.vibrate?.(70); } catch { /* optional haptic */ }
        }
        void refreshProfile();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!result || !pack || packComplete || activeSlot >= pack.slots.length - 1) return;
    const timer = window.setTimeout(() => moveToSlot(activeSlot + 1), 1050);
    return () => window.clearTimeout(timer);
  }, [activeSlot, pack, packComplete, result]);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-orange-400" /></div>;
  if (!pack) return <div className="p-6 text-center text-red-300">{error ?? 'تعذر تحميل رحلة اليوم'}</div>;

  return (
    <div className="daily-shell relative min-h-screen overflow-hidden px-5 pb-12 pt-6">
      <div className="pointer-events-none absolute -left-16 top-24 h-56 w-56 rounded-full bg-orange-500/10 blur-3xl" />
      <header className="daily-hero relative z-10 mb-5 flex items-center gap-3">
        <Link to="/home" className="btn-ghost -mr-2 p-2"><ArrowRight className="h-5 w-5" /></Link>
        <div className="flex-1"><h1 className="font-display text-2xl font-bold">{pack.pack.title}</h1><p className="text-xs text-white/45">{pack.date} · 3 تحديات مترابطة</p></div>
        <div className="streak-chip flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/15 px-3 py-1.5 text-sm font-bold text-orange-400"><Flame className="h-4 w-4" />{pack.streak.current_streak}</div>
      </header>
      {error && <div className="relative z-10 mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      <div className="daily-slot-rail relative z-10 mb-5 grid grid-cols-3 gap-2">
        {pack.slots.map((item, index) => <button key={item.id} type="button" onClick={() => moveToSlot(index)} className={cn('card flex flex-col items-center gap-1 p-3 text-xs', index === activeSlot && 'border-orange-400/60 bg-orange-500/10')}><span className="text-white/45">المحطة {item.slot_number}</span>{completed.has(item.id) ? <CheckCircle2 className="h-5 w-5 text-green-400" /> : <Sparkles className="h-5 w-5 text-orange-400" />}</button>)}
      </div>
      {slot && <div className="daily-question-card relative z-10 card overflow-hidden p-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-orange-500 via-zatona-500 to-gold-400" />
        <p className="mb-2 text-center text-xs text-orange-400">{slot.challenge.type} · {slot.challenge.difficulty}</p>
        <h2 className="mb-2 text-center font-display text-xl font-bold leading-relaxed">{slot.challenge.prompt}</h2>
        <AnswerHint challenge={slot.challenge} />
        {!hasPlayableAnswerContract(slot.challenge) && <p className="content-warning mt-4 text-center">هذه المحطة غير متاحة حالياً لأن عقد الإجابة غير مكتمل.</p>}
        {result || completed.has(slot.id) ? <div className="result-glow text-center" role="status">
          <p className={cn('font-display text-2xl font-black', result?.correct ? 'text-zatona-400' : 'text-white/60')}>{result ? (result.correct ? 'أحسنت! 🔥' : 'إجابة خاطئة') : 'أنجزت هذه المحطة'}</p>
          {result && <p className={cn('mt-2 text-sm font-bold', result.correct ? 'text-emerald-300' : 'text-red-300')}>{result.correct ? `إجابة صحيحة · +${result.coinGain || 50} عملة` : 'إجابة خاطئة · بدون مكافأة عملات لهذه المحطة'}</p>}
          {result?.correct && <p className="mt-1 text-sm text-white/55">+{result.xpGain} XP</p>}
          {packComplete && <RewardedCoinsCTA packId={pack.pack.id} perfect={perfectPack} claimApi={claimDailyPackAdReward} onClaimed={() => { void refreshProfile(); }} />}
          {!packComplete && activeSlot < pack.slots.length - 1 && <p className="mt-5 text-xs text-white/45">جاري فتح المحطة التالية…</p>}
        </div> : hasPlayableAnswerContract(slot.challenge) ? <>
          <div className="mb-4 flex items-center justify-center gap-2 text-xs text-white/45"><Trophy className="h-4 w-4 text-gold-400" />+{slot.bonus_coins} عملة · +{slot.bonus_xp} XP</div>
          <UnifiedAnswerInput challenge={slot.challenge} value={answer} selectedChoice={selected} disabled={submitting} onChange={setAnswer} onChoiceChange={setSelected} onSubmit={(value) => void submit(value)} />
          {submitting && <p className="mt-3 text-center text-xs text-white/45">جاري التحقق من السيرفر…</p>}
        </> : null}
      </div>}
    </div>
  );
}
