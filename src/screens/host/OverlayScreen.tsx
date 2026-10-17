import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchOverlaySnapshot, type OverlaySnapshot } from '../../services/api/overlayApi';

function remainingTime(endAt: string | null): string | null {
  if (!endAt) return null;
  const seconds = Math.max(0, Math.ceil((new Date(endAt).getTime() - Date.now()) / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
export function OverlayScreen() {
  const { token = '' } = useParams();
  const [snapshot, setSnapshot] = useState<OverlaySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const root = document.documentElement, body = document.body;
    const oldRoot = root.style.background, oldBody = body.style.background;
    root.style.background = 'transparent'; body.style.background = 'transparent';
    return () => { root.style.background = oldRoot; body.style.background = oldBody; };
  }, []);
  useEffect(() => {
    if (!token) { setError('رابط العرض غير صالح أو انتهت صلاحيته.'); return; }
    let active = true;
    const refresh = async () => {
      try { const result = await fetchOverlaySnapshot(token); if (active) { setSnapshot(result); setError(null); } }
      catch (e) { if (active) setError(e instanceof Error ? e.message : 'تعذر تحميل العرض.'); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [token]);
  if (error && !snapshot) return <main className="min-h-screen bg-transparent p-4 text-white" dir="rtl"><div className="inline-flex rounded-xl border border-red-300/30 bg-black/75 px-4 py-3 text-sm text-red-100">{error}</div></main>;
  if (!snapshot) return <main className="min-h-screen bg-transparent p-4 text-white" dir="rtl"><div className="inline-flex rounded-xl bg-black/75 px-4 py-3 text-sm">جارٍ تحميل عرض قدها…</div></main>;
  const timer = remainingTime(snapshot.round?.serverEndAt ?? null), status = snapshot.room.status.toLowerCase();
  const ended = ['ended','closed','finished'].includes(status), live = status === 'live';
  return <main className="min-h-screen bg-transparent p-3 text-white" dir="rtl" aria-live="polite">
    <section className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/15 bg-slate-950/85 shadow-2xl backdrop-blur-sm">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3"><div className="min-w-0"><p className="text-[10px] font-bold tracking-[0.2em] text-violet-300">QADDAHA · LIVE CHALLENGE</p><h1 className="truncate text-xl font-black">{snapshot.room.title}</h1></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${ended ? 'bg-white/10 text-white/60' : live ? 'bg-red-500/20 text-red-200' : 'bg-amber-400/15 text-amber-100'}`}>{ended ? 'انتهى التحدي' : live ? 'مباشر' : 'بانتظار البدء'}</span></header>
      {snapshot.round && <div className="flex items-center justify-between gap-3 bg-violet-500/10 px-5 py-4"><div className="min-w-0"><p className="text-xs text-violet-200/75">الجولة {snapshot.round.number}</p><p className="mt-1 text-lg font-extrabold leading-snug">{snapshot.round.prompt || 'استعدوا للجولة التالية'}</p></div>{timer && <div className="rounded-xl border border-white/15 bg-black/40 px-4 py-2 font-mono text-2xl font-black tabular-nums">{timer}</div>}</div>}
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
        {snapshot.participants.map((p, i) => <article key={p.name + '-' + i} className="rounded-xl border border-white/10 bg-white/5 p-3"><div className="flex items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-400/15 text-xs font-black text-violet-200">{i + 1}</span><p className="min-w-0 flex-1 truncate text-sm font-bold">{p.name}</p>{p.isHost && <span className="text-[9px] text-amber-200">المضيف</span>}</div><p className="mt-3 text-2xl font-black tabular-nums">{p.score}<span className="mr-1 text-[10px] font-medium text-white/45">نقطة</span></p></article>)}
        {snapshot.participants.length === 0 && <p className="col-span-full p-4 text-center text-sm text-white/50">بانتظار المشاركين…</p>}
      </div>
      <footer className="flex items-center justify-between border-t border-white/10 px-5 py-2 text-[10px] text-white/35"><span>يتحدث تلقائيًا كل 3 ثوانٍ</span><span>رابط عرض للقراءة فقط</span></footer>
    </section>
    {error && <p className="mt-2 inline-block rounded-lg bg-black/75 px-3 py-2 text-xs text-amber-100">تعذر تحديث البيانات مؤقتًا؛ نعرض آخر حالة متاحة.</p>}
  </main>;
}
