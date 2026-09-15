import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2, PenLine, Sparkles } from 'lucide-react';
import { ScreenShell } from '../../components/layout/ScreenShell';
import { creatorEnable, creatorList, creatorStatus, creatorSubmit } from '../../services/api/creatorApi';

export function CreatorScreen() {
  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await creatorStatus();
      setIsCreator(s.isCreator);
      if (s.isCreator) {
        const l = await creatorList();
        setItems(l.items ?? []);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScreenShell>
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/4 top-0 h-40 w-40 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute bottom-10 right-0 h-32 w-32 rounded-full bg-amber-400/15 blur-3xl" />
      </div>

      <header className="mb-6 flex items-center gap-3">
        <Link to="/home" className="btn-ghost -mr-2 p-2"><ArrowRight className="h-5 w-5" /></Link>
        <div>
          <h1 className="font-display text-2xl font-black text-gradient">وضع المبدع</h1>
          <p className="text-xs text-white/45">صمم أسئلة قدها — تُراجع ثم تدخل البنك</p>
          <Link to="/creator/admin" className="text-[10px] text-violet-300 underline">لوحة مراجعة الأدمن</Link>
        </div>
      </header>

      {err && <p className="mb-3 text-sm text-red-300">{err}</p>}
      {ok && <p className="mb-3 text-sm text-emerald-300">{ok}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-fuchsia-400" /></div>
      ) : !isCreator ? (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="card-glow p-6 text-center">
          <Sparkles className="mx-auto h-12 w-12 text-fuchsia-300" />
          <h2 className="mt-4 font-display text-xl font-bold">كن مبدع قدها</h2>
          <p className="mt-2 text-sm text-white/55">
            أرسل أسئلة عربية سريعة وممتعة. بعد الموافقة تظهر في المباريات.
          </p>
          <button
            type="button"
            className="btn-primary mt-6 w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await creatorEnable('مبدع قدها');
                await load();
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            تفعيل وضع المبدع
          </button>
        </motion.div>
      ) : (
        <div className="space-y-4">
          <div className="card space-y-3 p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-fuchsia-200">
              <PenLine className="h-4 w-4" />
              سؤال جديد
            </div>
            <textarea
              className="input-field min-h-[88px] resize-none"
              placeholder="اكتب السؤال بوضوح…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <input
              className="input-field"
              placeholder="الإجابة الصحيحة (يمكن لاحقاً أكثر من صيغة)"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary w-full"
              disabled={busy || prompt.length < 8 || !answer.trim()}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                setOk(null);
                try {
                  await creatorSubmit({
                    prompt,
                    answers: [answer.trim()],
                    type: 'knowledge',
                    difficulty: 'normal',
                  });
                  setPrompt('');
                  setAnswer('');
                  setOk('أُرسل للمراجعة');
                  await load();
                } catch (e) {
                  setErr(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              إرسال للمراجعة
            </button>
          </div>

          <div className="card p-4">
            <p className="mb-3 text-sm font-semibold">إرسالاتك</p>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {items.length === 0 && <p className="text-xs text-white/40">لا إرسالات بعد</p>}
              {items.map((it) => (
                <div key={it.id} className="rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-xs">
                  <p className="text-white/80 line-clamp-2">{it.prompt}</p>
                  <p className="mt-1 text-white/40">
                    {it.status === 'pending' ? 'قيد المراجعة' : it.status === 'approved' ? 'معتمد' : 'مرفوض'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </ScreenShell>
  );
}
