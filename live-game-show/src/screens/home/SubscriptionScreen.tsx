import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Crown, Loader2, Sparkles } from 'lucide-react';
import {
  fetchCatalog,
  fetchSubscriptionStatus,
  formatPrice,
  type CatalogItem,
  type PlanId,
} from '../../services/billing/subscriptionApi';
import { purchasePlan } from '../../services/billing/playBilling';
import { useAuthStore } from '../../store/authStore';
import { cn } from '../../utils/cn';

export function SubscriptionScreen() {
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [status, setStatus] = useState<{ plan: PlanId; status: string; expiresAt?: string } | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([fetchCatalog(), fetchSubscriptionStatus()]);
      setCatalog(c.catalog.filter((x) => x.plan !== 'free'));
      setStatus({ plan: s.plan, status: s.status, expiresAt: s.expiresAt });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const buy = async (plan: PlanId) => {
    setBusy(plan);
    setMessage(null);
    try {
      const res = await purchasePlan(plan);
      if (!res.ok) {
        setMessage(res.message ?? 'فشل الشراء');
      } else {
        setMessage('تم تفعيل الاشتراك بنجاح');
        await load();
        await refreshProfile();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen px-5 pb-12 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/home" className="btn-ghost -mr-2 p-2">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold">الاشتراكات</h1>
          <p className="text-xs text-white/45">بلس ومضيف برو — بلا Pay-to-Win</p>
        </div>
      </header>

      {status && (
        <div className="card mb-5 flex items-center gap-3 p-4">
          <Crown className="h-6 w-6 text-gold-400" />
          <div>
            <p className="font-semibold">خطتك: {status.plan}</p>
            <p className="text-xs text-white/45">
              {status.status}
              {status.expiresAt
                ? ` · حتى ${new Date(status.expiresAt).toLocaleDateString('ar')}`
                : ''}
            </p>
          </div>
        </div>
      )}

      {message && (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
          {message}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gold-400" />
        </div>
      ) : (
        <div className="space-y-3">
          {catalog.map((item, i) => (
            <motion.div
              key={item.plan}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={cn(
                'card p-5',
                item.plan === 'host_pro' && 'border-gold-500/30'
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <Sparkles
                  className={cn(
                    'h-5 w-5',
                    item.plan === 'host_pro' ? 'text-gold-400' : 'text-zatona-400'
                  )}
                />
                <h2 className="font-display text-lg font-bold">{item.title}</h2>
              </div>
              <p className="mb-3 text-sm text-white/50">{item.description}</p>
              <ul className="mb-4 space-y-1 text-xs text-white/55">
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-zatona-400" /> بدون إعلانات (عند التفعيل)
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-zatona-400" /> مكافآت يومية محسّنة
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-zatona-400" /> إطار تجميلي — لا قوة لعب
                </li>
                {item.plan === 'host_pro' && (
                  <li className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-gold-400" /> أدوات استضافة متقدمة
                  </li>
                )}
              </ul>
              <div className="flex items-center justify-between">
                <p className="font-display text-xl font-bold text-gold-400">
                  {formatPrice(item.price_micros, item.currency)}
                </p>
                <button
                  onClick={() => buy(item.plan)}
                  disabled={!!busy || status?.plan === item.plan}
                  className="btn-primary px-5 py-2.5 text-sm"
                >
                  {busy === item.plan ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : status?.plan === item.plan ? (
                    'مفعّل'
                  ) : (
                    'اشترك'
                  )}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-[11px] leading-5 text-white/30">
        الدفع عبر Google Play. الاشتراك لا يشتري إجابات ولا نقاط فوز. يمكن إلغاء التجديد من المتجر.
      </p>
    </div>
  );
}
