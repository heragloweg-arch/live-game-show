import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Copy, Heart, Link2, Loader2, Sparkles, Users } from 'lucide-react';
import { ScreenShell } from '../../components/layout/ScreenShell';
import { coupleCreate, coupleDissolve, coupleJoin, coupleStatus } from '../../services/api/coupleApi';
import { createCoupleMatch } from '../../services/api/matchApi';
import { track } from '../../services/analytics/events';
import { cn } from '../../utils/cn';

export function CoupleScreen() {
  const navigate = useNavigate();
  const [couple, setCouple] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await coupleStatus();
      setCouple(r.couple);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    track('screen_view', { screen: 'couple' });
  }, [load]);

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await coupleCreate();
      setCouple(r.couple);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await coupleJoin(code);
      setCouple(r.couple);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const dissolve = async () => {
    setBusy(true);
    try {
      await coupleDissolve();
      setCouple(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!couple?.invite_code) return;
    await navigator.clipboard?.writeText(couple.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <ScreenShell>
      <header className="mb-6 flex items-center gap-3">
        <Link to="/home" className="btn-ghost -mr-2 p-2">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-black text-gradient">الثنائي</h1>
          <p className="text-xs text-white/45">العبوا معاً… وقدّوها!</p>
        </div>
      </header>

      {err && (
        <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {err}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
        </div>
      ) : couple?.status === 'active' ? (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
          <div className="card-glow p-6 text-center">
            <div className="relative z-10">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-pink-500/30 to-violet-500/30">
                <Heart className="h-8 w-8 text-pink-400" fill="currentColor" />
              </div>
              <h2 className="font-display text-xl font-bold">أنتم ثنائي نشط ✨</h2>
              <p className="mt-1 text-sm text-white/50">انتصارات مشتركة ومباريات مع بعض</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="glass px-3 py-3">
                  <p className="text-[11px] text-white/40">انتصارات</p>
                  <p className="font-display text-2xl font-bold text-amber-300">{couple.shared_wins ?? 0}</p>
                </div>
                <div className="glass px-3 py-3">
                  <p className="text-[11px] text-white/40">مباريات</p>
                  <p className="font-display text-2xl font-bold text-violet-300">{couple.shared_matches ?? 0}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setErr(null);
                  try {
                    const r = await createCoupleMatch('normal');
                    const id = r.match?.matchId || (r.match as any)?.id;
                    if (id) navigate(`/match/${id}`);
                    else setErr('تعذر إنشاء مباراة الثنائي');
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
                className="btn-primary mt-6 w-full gap-2"
              >
                <Sparkles className="h-4 w-4" />
                {busy ? 'جاري التحضير…' : 'ابدأ جولات Co-op معاً'}
              </button>
              <button type="button" onClick={dissolve} disabled={busy} className="btn-ghost mt-3 w-full text-sm text-white/40">
                فك الارتباط
              </button>
            </div>
          </div>
        </motion.div>
      ) : couple?.status === 'pending' ? (
        <div className="card-glow p-6 text-center">
          <div className="relative z-10">
            <p className="text-sm text-white/50">شارك الرمز مع شريكك</p>
            <p className="mt-4 font-display text-4xl font-black tracking-[0.3em] text-gradient-gold">
              {couple.invite_code}
            </p>
            <button type="button" onClick={copy} className="btn-secondary mt-5 w-full gap-2">
              <Copy className="h-4 w-4" />
              {copied ? 'تم النسخ' : 'نسخ الرمز'}
            </button>
            <button type="button" onClick={dissolve} className="btn-ghost mt-3 w-full text-sm">
              إلغاء الدعوة
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="card-glow p-5">
            <div className="relative z-10 flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-pink-500/20">
                <Heart className="h-6 w-6 text-pink-400" />
              </div>
              <div className="flex-1">
                <h2 className="font-display font-bold">إنشاء دعوة</h2>
                <p className="mt-1 text-xs text-white/45">احصل على رمز من 6 أحرف وأرسله لشريكك</p>
                <button type="button" onClick={create} disabled={busy} className="btn-primary mt-4 w-full">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'إنشاء رمز'}
                </button>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Link2 className="h-5 w-5 text-violet-400" />
              <h2 className="font-display font-bold">الانضمام برمز</h2>
            </div>
            <input
              className="input-field text-center font-display text-lg tracking-widest"
              placeholder="XXXXXX"
              value={code}
              maxLength={8}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button
              type="button"
              onClick={join}
              disabled={busy || code.length < 4}
              className="btn-secondary mt-3 w-full"
            >
              انضمام
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-xs text-white/40">
            <Users className="h-4 w-4 shrink-0" />
            الثنائي وضع اجتماعي — لا يغيّر قواعد اللعب النزيه ولا يبيع ميزة فوز.
          </div>
        </div>
      )}
    </ScreenShell>
  );
}
