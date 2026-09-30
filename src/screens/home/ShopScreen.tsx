import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Coins, Crown, Flame, Lock, Sparkles } from 'lucide-react';
import { buyCosmetic, equipCosmetic, getCosmetics, type CosmeticItem } from '../../services/cosmetics/shopApi';
import { track } from '../../services/analytics/events';
import { cn } from '../../utils/cn';
import { BottomAdBanner } from '../../components/ads/BottomAdBanner';

const kindLabel: Record<CosmeticItem['kind'], string> = {
  frame: 'إطار', title: 'لقب', theme: 'مظهر', emote: 'تعبير',
};

export function ShopScreen() {
  const [items, setItems] = useState<CosmeticItem[]>([]);
  const [coins, setCoins] = useState(0);
  const [filter, setFilter] = useState<CosmeticItem['kind'] | 'all' | 'owned' | 'equipped'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    try {
      const result = await getCosmetics();
      setItems(result.items); setCoins(result.coins);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'تعذر تحميل المتجر'); }
  };
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => filter === 'all' ? items : filter === 'owned' ? items.filter((x) => x.owned) : filter === 'equipped' ? items.filter((x) => x.equipped) : items.filter((x) => x.kind === filter), [filter, items]);

  const purchase = async (item: CosmeticItem) => {
    setBusy(item.id); setMessage(null);
    try {
      const result = await buyCosmetic(item.id);
      setCoins(result.coins);
      setItems((current) => current.map((x) => x.id === item.id ? { ...x, owned: true } : x));
      track('shop_purchase', { cosmeticId: item.id, price: item.price_coins, alreadyOwned: !!result.alreadyOwned });
      setMessage(result.alreadyOwned ? 'هذا العنصر موجود لديك بالفعل' : `تم فتح ${item.title}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'تعذر إتمام الشراء'); }
    finally { setBusy(null); }
  };

  const equip = async (item: CosmeticItem) => {
    setBusy(item.id); setMessage(null);
    try {
      await equipCosmetic(item.id);
      setItems((current) => current.map((x) => ({ ...x, equipped: x.id === item.id ? true : false })));
      setMessage(`تم تجهيز ${item.title}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'تعذر تجهيز العنصر'); }
    finally { setBusy(null); }
  };

  return <main className="screen-pad mx-auto min-h-screen max-w-2xl">
    <header className="mb-6 flex items-center gap-3">
      <Link to="/home" className="btn-ghost -mr-2 p-2" aria-label="العودة"><ArrowRight className="h-5 w-5" /></Link>
      <div className="flex-1"><p className="eyebrow">عبّر عن أسلوبك</p><h1 className="font-display text-3xl font-black">متجر قدها</h1></div>
      <div className="coin-pill"><Coins className="h-4 w-4" />{coins}</div>
    </header>
    <section className="card-glow mb-5 p-5">
      <div className="relative z-10 flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300"><Crown className="h-7 w-7" /></div><div><p className="eyebrow">اقتصاد عادل</p><h2 className="font-display text-xl font-black">كل ما تشتريه تجميلي</h2><p className="mt-1 text-xs text-white/50">لا شراء لقوة أو إجابة أو وقت إضافي.</p></div></div>
    </section>
    <div className="mb-5 flex gap-2 overflow-x-auto pb-1">{(['all', 'owned', 'equipped', 'frame', 'title', 'emote'] as const).map((key) => <button key={key} type="button" onClick={() => setFilter(key)} className={cn('chip whitespace-nowrap', filter === key && 'border-violet-300/40 bg-violet-500/20 text-white')}>{key === 'all' ? 'الكل' : key === 'owned' ? 'مملوك' : key === 'equipped' ? 'مجهز' : kindLabel[key]}</button>)}</div>
    {message && <div className="mb-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">{message}</div>}
    <div className="grid gap-3 sm:grid-cols-2">{visible.map((item) => <article key={item.id} className={cn('card relative overflow-hidden p-4', item.equipped && 'border-emerald-300/40')}><div className="mb-4 flex items-start justify-between"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-amber-400/20 text-amber-200">{item.kind === 'title' ? <Crown className="h-6 w-6" /> : item.kind === 'emote' ? <Flame className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}</div><span className="chip">{kindLabel[item.kind]}</span></div><h3 className="font-display text-lg font-black">{item.title}</h3><p className="mt-1 min-h-10 text-xs leading-5 text-white/45">تخصيص ملفك وإظهار هويتك في عالم قدها.</p>{item.owned ? <button type="button" onClick={() => void equip(item)} disabled={busy === item.id} className={cn('btn-secondary mt-4 w-full text-sm', item.equipped && 'border-emerald-300/30 text-emerald-200')}>{item.equipped ? <><Check className="h-4 w-4" />مجهز</> : 'تجهيز'}</button> : <button type="button" onClick={() => void purchase(item)} disabled={busy === item.id || coins < item.price_coins} className="btn-gold mt-4 w-full text-sm">{coins < item.price_coins ? <Lock className="h-4 w-4" /> : <Coins className="h-4 w-4" />}{busy === item.id ? 'جارٍ التنفيذ...' : `${item.price_coins} عملة`}</button>}</article>)}</div>
    <BottomAdBanner />
  </main>;
}
