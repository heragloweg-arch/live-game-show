import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Copy, Share2, Loader2 } from 'lucide-react';
import { ScreenShell } from '../../components/layout/ScreenShell';
import { createMatchInvite } from '../../services/api/matchApi';
import type { Difficulty } from '../../types';

export function InviteCreateScreen() {
  const [diff, setDiff] = useState<Difficulty>('normal');
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const link =
    token && typeof window !== 'undefined'
      ? `${window.location.origin}/play/invite/${token}`
      : token
        ? `/play/invite/${token}`
        : '';

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await createMatchInvite(diff);
      setToken(r.token);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* */ }
  };

  const share = async () => {
    if (!link) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'قدها — تحدّاني 1 ضد 1', text: 'ادخل الرابط وقدّها!', url: link });
      } else {
        await copy();
      }
    } catch { /* */ }
  };

  return (
    <ScreenShell>
      <header className="mb-6 flex items-center gap-3">
        <Link to="/play" className="btn-ghost -mr-2 p-2"><ArrowRight className="h-5 w-5" /></Link>
        <div>
          <h1 className="font-display text-2xl font-black text-gradient">ادعُ صديقاً</h1>
          <p className="text-xs text-white/45">دعوة 1 ضد 1 · رابط صالح لمدة محدودة</p>
        </div>
      </header>

      {err && <p className="mb-3 text-sm text-red-300">{err}</p>}

      {!token ? (
        <div className="card space-y-4 p-5">
          <p className="text-sm text-white/60">اختر الصعوبة ثم أنشئ رابط الدعوة</p>
          <div className="flex gap-2">
            {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDiff(d)}
                className={`flex-1 rounded-xl py-2 text-sm font-bold ${
                  diff === d ? 'bg-violet-500 text-white' : 'bg-white/10 text-white/60'
                }`}
              >
                {d === 'easy' ? 'سهل' : d === 'normal' ? 'عادي' : 'صعب'}
              </button>
            ))}
          </div>
          <button type="button" className="btn-primary w-full" disabled={busy} onClick={() => void create()}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'إنشاء دعوة'}
          </button>
        </div>
      ) : (
        <div className="card space-y-4 p-5">
          <p className="text-sm text-white/60">أرسل هذا الرابط لصديقك:</p>
          <p className="break-all rounded-xl bg-black/30 p-3 text-xs text-violet-200">{link}</p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1 gap-2" onClick={() => void copy()}>
              <Copy className="h-4 w-4" />
              {copied ? 'تم النسخ' : 'نسخ'}
            </button>
            <button type="button" className="btn-primary flex-1 gap-2" onClick={() => void share()}>
              <Share2 className="h-4 w-4" />
              مشاركة
            </button>
          </div>
          <p className="text-center text-[11px] text-white/35">انتظر قبول الصديق — ستُفتح المباراة تلقائياً لديه</p>
        </div>
      )}
    </ScreenShell>
  );
}
