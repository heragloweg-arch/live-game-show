import { useState } from 'react';
import { PlayCircle, Loader2, Sparkles, Zap } from 'lucide-react';
import { showAd } from '../../services/ads/adMob';
import { shouldShowAds } from '../../services/billing/entitlements';
import { cn } from '../../utils/cn';

type Props = {
  packId?: string;
  perfect?: boolean;
  onClaimed?: (coins: number, multiplier: number) => void;
  claimApi?: (
    packId: string,
    adsWatched: number,
  ) => Promise<{ coinGain?: number; multiplier?: number; alreadyClaimed?: boolean }>;
};

export function RewardedCoinsCTA({ packId, perfect = false, onClaimed, claimApi }: Props) {
  const [busy, setBusy] = useState(false);
  const [adsDone, setAdsDone] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  if (!shouldShowAds()) return null;

  const multLabel = perfect ? '×3' : '×2';

  const claim = async () => {
    setBusy(true);
    setMessage(null);
    try {
      let watched = adsDone;
      while (watched < 2) {
        setMessage(watched === 0 ? 'الإعلان 1 من 2…' : 'الإعلان 2 من 2…');
        const result = await showAd('rewarded_extra_coins');
        if (result !== 'rewarded' && result !== 'reward_pending') {
          setMessage(
            result === 'capped'
              ? 'وصلت إلى حد المكافآت اليومي'
              : 'أكمل مشاهدة الإعلانين للحصول على المكافأة',
          );
          setBusy(false);
          return;
        }
        watched += 1;
        setAdsDone(watched);
      }
      if (packId && claimApi) {
        const data = await claimApi(packId, watched);
        if (data.alreadyClaimed) {
          setMessage('تم استلام مكافأة الإعلانات سابقًا');
        } else {
          const coins = data.coinGain ?? 0;
          const mult = data.multiplier ?? (perfect ? 3 : 2);
          setMessage(`+${coins} عملة (${mult === 3 ? 'مضاعفة ثلاثية' : 'مضاعفة'}) 🎉`);
          onClaimed?.(coins, mult);
        }
      } else {
        setMessage(perfect ? 'مكافأة ثلاثية قيد الإضافة بعد التحقق' : 'أضيفت مكافأتك المضاعفة بعد الإعلانين');
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'تعذر إكمال المكافأة');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="reward-boost-card mt-5 overflow-hidden rounded-2xl border border-amber-300/40 bg-gradient-to-br from-amber-500/25 via-orange-500/15 to-fuchsia-600/20 p-4 text-center shadow-[0_0_40px_rgba(251,191,36,0.25)]">
      <div className="mb-2 flex items-center justify-center gap-2 text-amber-100">
        <Sparkles className="h-5 w-5 animate-pulse text-amber-300" />
        <span className="font-display text-sm font-black tracking-wide">ضاعف مكافأتك {multLabel}</span>
        <Zap className="h-5 w-5 text-yellow-300" />
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-white/70">
        شاهد <strong className="text-amber-200">إعلانين متتاليين</strong>
        {perfect ? ' — الثلاث محطات صحيحة؟ تحصل على مضاعفة ×3!' : ' لتحصل على مضاعفة ×2 لمكافأة اليوم.'}
      </p>
      <button
        type="button"
        onClick={() => void claim()}
        disabled={busy}
        className={cn(
          'relative mx-auto flex w-full max-w-xs items-center justify-center gap-2 overflow-hidden rounded-2xl px-4 py-3.5',
          'bg-gradient-to-l from-amber-400 via-orange-500 to-pink-500 font-display text-sm font-black text-white',
          'shadow-[0_8px_30px_rgba(251,146,60,0.45)] transition active:scale-[0.98] disabled:opacity-60',
        )}
      >
        <span className="pointer-events-none absolute inset-0 animate-pulse bg-white/10" />
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlayCircle className="h-5 w-5" />}
        {busy ? (adsDone < 2 ? `مشاهدة ${adsDone + 1}/2…` : 'جاري إضافة المكافأة…') : 'شاهد وضاعف المكافأة'}
      </button>
      {adsDone > 0 && adsDone < 2 && (
        <p className="mt-2 text-[11px] font-bold text-amber-200">تم {adsDone}/2 — أكمل الإعلان التالي</p>
      )}
      {message && <p className="mt-2 text-[11px] text-white/80">{message}</p>}
    </div>
  );
}
