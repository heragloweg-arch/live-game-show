import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Leaf, Loader2, LockKeyhole, Sparkles, TreePine } from 'lucide-react';
import { motion } from 'framer-motion';
import { createSoloMatch, getSoloJourneyProgress } from '../../services/api/matchApi';
import { useAuthStore } from '../../store/authStore';
import { getSoloJourney, type SoloProgressRow } from '../../services/game/soloJourneyProgress';

const BRANCHES = Array.from({ length: 6 }, (_, branchIndex) => ({
  number: branchIndex + 1,
  title: ['البداية', 'المعرفة', 'المغامرة', 'السرعة', 'الأبطال', 'القمة'][branchIndex],
  leaves: Array.from({ length: 8 }, (_, leafIndex) => ({ number: leafIndex + 1 })),
}));

export function DifficultyScreen() {
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.user?.id);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SoloProgressRow[]>([]);
  const journey = getSoloJourney(progress);

  useEffect(() => {
    if (!userId) return;
    void getSoloJourneyProgress()
      .then(setProgress)
      .catch(() => setProgress([]));
  }, [userId]);

  const start = async (branchNumber: number, leafNumber: number) => {
    const key = `${branchNumber}-${leafNumber}`;
    setError(null);
    setLoading(key);
    try {
      // Solo uses server-selected mixed progression; difficulty is intentionally hidden.
      const match = await createSoloMatch('normal', { branch: branchNumber, leaf: leafNumber });
      navigate(`/match/${match.matchId}?branch=${branchNumber}&leaf=${leafNumber}`, { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('authenticated') ? 'يجب تسجيل الدخول أولاً.' : `تعذر بدء الغصن: ${msg}`);
      setLoading(null);
    }
  };

  return (
    <main className="min-h-screen px-5 pb-12 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/play" className="btn-ghost -mr-2 p-2" aria-label="العودة"><ArrowRight className="h-5 w-5" /></Link>
        <div className="flex-1"><p className="eyebrow">رحلة قدها</p><h1 className="font-display text-2xl font-black text-gradient">شجرة التحدي</h1><p className="text-xs text-white/45">فروع كثيرة، وأوراق أسئلة تتدرج تلقائياً</p></div>
        <TreePine className="h-7 w-7 text-emerald-300" />
      </header>

      {error && <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      <section className="card-glow mb-5 p-5 text-center">
        <div className="relative z-10"><TreePine className="mx-auto h-12 w-12 text-emerald-300" /><h2 className="mt-2 font-display text-xl font-black">كل إجابة تنبت مرحلة جديدة</h2><p className="mt-1 text-xs leading-5 text-white/50">لا توجد مستويات ثابتة؛ الخادم يخلط المعرفة والسرعة والأنواع المختلفة في كل غصن.</p></div>
      </section>

      <div className="relative space-y-5 before:absolute before:bottom-4 before:right-6 before:top-4 before:w-px before:bg-emerald-300/20">
        {BRANCHES.map((branch) => (
          <section key={branch.number} className="relative pr-12">
            <div className="absolute right-0 top-1 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-400/10 text-emerald-200"><span className="font-display text-lg font-black">{branch.number}</span></div>
            <div className="mb-2 flex items-center gap-2"><Sparkles className="h-4 w-4 text-gold-300" /><h2 className="font-display text-lg font-black">غصن {branch.title}</h2></div>
            <div className="grid grid-cols-4 gap-2">
              {branch.leaves.map((leaf) => {
                const key = `${branch.number}-${leaf.number}`;
                const leafProgress = journey.leaves.find((item) => item.branch === branch.number && item.leaf === leaf.number);
                const disabled = !leafProgress?.unlocked || !!loading;
                return <motion.button key={key} type="button" whileTap={{ scale: .92 }} disabled={disabled} onClick={() => void start(branch.number, leaf.number)} className={`relative flex min-h-16 flex-col items-center justify-center rounded-2xl border text-center transition ${leafProgress?.completed ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-200' : leafProgress?.unlocked ? 'border-violet-300/30 bg-violet-400/10 text-violet-100 hover:bg-violet-400/20' : 'border-white/5 bg-white/[.03] text-white/25'}`}>
                  {loading === key ? <Loader2 className="h-5 w-5 animate-spin" /> : leafProgress?.completed ? <Check className="h-4 w-4" /> : leafProgress?.unlocked ? <Leaf className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
                  <span className="mt-1 text-[10px] font-bold">ورقة {leaf.number}</span>
                </motion.button>;
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
