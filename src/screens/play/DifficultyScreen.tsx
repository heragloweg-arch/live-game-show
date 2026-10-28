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
  const completedCount = journey.leaves.filter((leaf) => leaf.completed).length;

  useEffect(() => {
    if (!userId) return;
    void getSoloJourneyProgress().then(setProgress).catch(() => setProgress([]));
  }, [userId]);

  const start = async (branchNumber: number, leafNumber: number) => {
    const key = `${branchNumber}-${leafNumber}`;
    setError(null);
    setLoading(key);
    try {
      const match = await createSoloMatch('normal', { branch: branchNumber, leaf: leafNumber });
      navigate(`/match/${match.matchId}?branch=${branchNumber}&leaf=${leafNumber}`, { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('authenticated') ? 'يجب تسجيل الدخول أولاً.' : msg.includes('JOURNEY_STAGE_LOCKED') ? 'أكمل الورقة السابقة لفتح هذه الورقة.' : `تعذر بدء الورقة: ${msg}`);
      setLoading(null);
    }
  };

  return (
    <main className="solo-tree-screen" dir="rtl">
      <div className="tree-stars" aria-hidden="true" />
      <header className="solo-tree-header">
        <Link to="/play" className="btn-ghost p-2" aria-label="العودة"><ArrowRight className="h-5 w-5" /></Link>
        <div className="flex-1"><p className="eyebrow">رحلة قدها · الموسم الأول</p><h1 className="font-display text-2xl font-black text-gradient">شجرة التحدي</h1><p className="text-xs text-white/55">ثلاثة أسئلة في كل ورقة — إجابتان صحيحتان تفتحان الطريق.</p></div>
        <div className="tree-progress-badge"><TreePine className="h-4 w-4" /><span>{completedCount}/48</span></div>
      </header>

      {error && <div className="tree-error" role="alert">{error}</div>}

      <section className="tree-hero" aria-label="قواعد رحلة الشجرة">
        <div className="tree-hero-glow" />
        <div className="tree-hero-copy"><span className="tree-kicker"><Sparkles className="h-3.5 w-3.5" />رحلة سينمائية</span><h2>ازرع إجابتك، واحصد مجدك</h2><p>كل ورقة تحمل 3 تحديات متتابعة. تظهر النتيجة على الورقة، ولا تُفتح الورقة التالية إلا بعد إجابتين صحيحتين.</p></div>
        <TreePine className="tree-hero-icon" aria-hidden="true" />
      </section>

      <section className="tree-stage" aria-label="شجرة مراحل Solo">
        <div className="tree-trunk" aria-hidden="true" />
        <div className="tree-roots" aria-hidden="true" />
        {BRANCHES.map((branch, branchIndex) => (
          <section key={branch.number} className={`tree-branch tree-branch-${branchIndex % 2 ? 'left' : 'right'}`}>
            <div className="tree-branch-label"><span className="tree-branch-number">{branch.number}</span><span><small>الغصن {branch.number}</small><strong>{branch.title}</strong></span></div>
            <div className="tree-leaves-grid">
              {branch.leaves.map((leaf) => {
                const key = `${branch.number}-${leaf.number}`;
                const leafProgress = journey.leaves.find((item) => item.branch === branch.number && item.leaf === leaf.number);
                const disabled = !leafProgress?.unlocked || !!loading;
                return <motion.button key={key} type="button" whileTap={{ scale: .94 }} disabled={disabled} onClick={() => void start(branch.number, leaf.number)} className={`tree-leaf ${leafProgress?.completed ? 'is-completed' : leafProgress?.unlocked ? 'is-open' : 'is-locked'}`} aria-label={`${branch.title}، ورقة ${leaf.number}`}>
                  <span className="tree-leaf-shine" />
                  {loading === key ? <Loader2 className="h-5 w-5 animate-spin" /> : leafProgress?.completed ? <Check className="h-5 w-5" /> : leafProgress?.unlocked ? <Leaf className="h-5 w-5" /> : <LockKeyhole className="h-4 w-4" />}
                  <strong>{leaf.number}</strong><small>{leafProgress?.completed ? 'مكتملة' : leafProgress?.unlocked ? '3 أسئلة' : 'مقفلة'}</small>
                </motion.button>;
              })}
            </div>
          </section>
        ))}
      </section>
    </main>
  );
}
