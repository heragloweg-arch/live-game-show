import { useState } from 'react';
import { PlayCircle, Loader2, Sparkles, Zap } from 'lucide-react';
import { showAd, type RewardContext } from '../../services/ads/adMob';
import { shouldShowAds } from '../../services/billing/entitlements';
import { cn } from '../../utils/cn';

type Props = {
  perfect?: boolean;
  rewardContext?: RewardContext;
  onComplete?: () => void;
  title?: string;
};

export function RewardedCoinsCTA({ perfect = false, rewardContext, onComplete, title = 'ضاعف مكافأتك' }: Props) {
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
      const boostGroupId = rewardContext && typeof crypto?.randomUUID === 'function'
        ? (rewardContext.boostGroupId ?? crypto.randomUUID())
        : undefined;
      while (watched < 2) {
        setMessage(watched === 0 ? 'الإعلان 1 من 2…' : 'الإعلان 2 من 2…');
        const result = await showAd('rewarded_extra_coins', { rewardContext: rewardContext ? { ...rewardContext, boostGroupId, boostSlot: (watched + 1) as 1 | 2 } : undefined });
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
      // Each rewarded ad already carries server-generated custom_data. AdMob SSV
      // credits the reward after signature verification; never call a client-side
      // claim endpoint or trust the local watched counter.
      setMessage(perfect
        ? 'تم إرسال الإعلانين للتحقق الآمن — ستضاف المكافأة بعد وصول AdMob SSV'
        : 'تم إرسال الإعلانين للتحقق الآمن — ستضاف المكافأة بعد وصول AdMob SSV');
      onComplete?.();
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
        <span className="font-display text-sm font-black tracking-wide">{title} {multLabel}</span>
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
