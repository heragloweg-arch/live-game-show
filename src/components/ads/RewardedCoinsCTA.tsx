import { useState } from 'react';
import { PlayCircle, Loader2 } from 'lucide-react';
import { showAd } from '../../services/ads/adMob';
import { shouldShowAds } from '../../services/billing/entitlements';

export function RewardedCoinsCTA() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!shouldShowAds()) return null;
  const claim = async () => {
    setBusy(true); setMessage(null);
    const result = await showAd('rewarded_extra_coins');
    setMessage(result === 'rewarded' ? 'أضيفت مكافأتك إلى المحفظة' : result === 'capped' ? 'وصلت إلى حد المكافآت اليومي' : 'المكافأة غير متاحة الآن');
    setBusy(false);
  };
  return <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-3 text-center"><button type="button" onClick={() => void claim()} disabled={busy} className="mx-auto inline-flex items-center gap-2 text-xs font-bold text-amber-100">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4 text-amber-300" />}شاهد اختيارياً واحصل على عملات</button>{message && <p className="mt-2 text-[11px] text-white/45">{message}</p>}</div>;
}
