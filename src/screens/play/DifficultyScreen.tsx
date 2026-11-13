import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, Crown, Flame, Leaf, Loader2, LockKeyhole, Sparkles, TreePine, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { createSoloMatch, getSoloJourneyProgress } from '../../services/api/matchApi';
import { useAuthStore } from '../../store/authStore';
import { getSoloJourney, type SoloProgressRow } from '../../services/game/soloJourneyProgress';
import { GAME_FORMATS, formatById, parseGameFormat, type GameFormat } from '../../services/game/gameFormats';
import { track } from '../../services/analytics/events';
import type { Difficulty } from '../../types';
import { cn } from '../../utils/cn';

const BRANCHES = Array.from({ length: 6 }, (_, branchIndex) => ({
  number: branchIndex + 1,
  title: ['البداية', 'المعرفة', 'المغامرة', 'السرعة', 'الأبطال', 'القمة'][branchIndex],
  leaves: Array.from({ length: 8 }, (_, leafIndex) => ({ number: leafIndex + 1 })),
}));

const LEVELS: { id: Difficulty; title: string; subtitle: string; icon: React.ReactNode; color: string; border: string }[] = [
  { id: 'easy', title: 'هادئ', subtitle: 'وقت أوسع لبناء الثقة', icon: <Leaf className="h-6 w-6" />, color: 'text-emerald-300', border: 'border-emerald-400/30 hover:border-emerald-300' },
  { id: 'normal', title: 'متوازن', subtitle: 'الإيقاع الموصى به لمعظم اللاعبين', icon: <Zap className="h-6 w-6" />, color: 'text-amber-300', border: 'border-amber-300/35 hover:border-amber-200' },
  { id: 'hard', title: 'نخبة', subtitle: 'ثوانٍ أقل وقرار أسرع', icon: <Flame className="h-6 w-6" />, color: 'text-orange-300', border: 'border-orange-400/35 hover:border-orange-300' },
];

const formatIcons = { spark: Sparkles, bolt: Zap, letters: Leaf, brain: Crown, quote: Sparkles } as const;

export function DifficultyScreen() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const userId = useAuthStore((s) => s.user?.id);
  const requestedFormat = search.get('format');
  const focusedFormat = parseGameFormat(requestedFormat);
  const [selectedFormat, setSelectedFormat] = useState<GameFormat>(focusedFormat);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SoloProgressRow[]>([]);
  const journey = getSoloJourney(progress);
  const completedCount = journey.leaves.filter((leaf) => leaf.completed).length;
  const format = formatById(selectedFormat);

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

  const startFormat = async (difficulty: Difficulty) => {
    setError(null);
    setLoading(`format-${difficulty}`);
    track('game_format_selected', { format: selectedFormat, difficulty, source: 'solo_launcher' });
    try {
      const match = await createSoloMatch(difficulty, undefined, selectedFormat);
      track('game_format_started', { format: selectedFormat, difficulty, match_id: match.matchId });
      navigate(`/match/${match.matchId}?format=${selectedFormat}`, { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('GAME_FORMAT_NOT_AVAILABLE') ? 'هذا القالب يحتاج إلى أسئلة معتمدة إضافية حالياً. جرّب «مزيج قدها».' : msg.includes('authenticated') ? 'يجب تسجيل الدخول أولاً.' : `تعذر بدء الجولة: ${msg}`);
      setLoading(null);
    }
  };

  return (
    <main className="solo-tree-screen" dir="rtl">
      <div className="tree-stars" aria-hidden="true" />
      <header className="solo-tree-header">
        <Link to="/play" className="btn-ghost p-2" aria-label="العودة"><ArrowRight className="h-5 w-5" /></Link>
        <div className="flex-1"><p className="eyebrow">ساحة Solo · خادم قدها</p><h1 className="font-display text-2xl font-black text-gradient">اختر إيقاعك</h1><p className="text-xs text-white/55">قوالب أصلية، محتوى معتمد، ونتيجة يحسمها السيرفر.</p></div>
        <div className="tree-progress-badge"><TreePine className="h-4 w-4" /><span>{completedCount}/48</span></div>
      </header>

      {error && <div className="tree-error" role="alert">{error}</div>}

      <section className="format-launcher" aria-labelledby="format-title">
        <div className="format-launcher-header"><div><p className="eyebrow">جولة من 3 أسئلة</p><h2 id="format-title">ابدأ تجربة مركزة</h2></div><span className="format-live-badge"><span /> متاح الآن</span></div>
        <div className="format-picker">
          {GAME_FORMATS.map((entry) => {
            const Icon = formatIcons[entry.icon];
            return <button type="button" key={entry.id} onClick={() => setSelectedFormat(entry.id)} className={cn('format-picker-item', `format-${entry.tone}`, selectedFormat === entry.id && 'is-selected')}><Icon className="h-4 w-4" /><span>{entry.shortTitle}</span></button>;
          })}
        </div>
        <div className="format-selected-card"><div><span className="format-selected-kicker">القالب المختار</span><h3>{format.title}</h3><p>{format.detail}</p></div><Sparkles className="h-7 w-7 text-amber-200" /></div>
        <div className="format-level-grid">
          {LEVELS.map((level, index) => <motion.button type="button" key={level.id} whileTap={{ scale: .98 }} disabled={!!loading} onClick={() => void startFormat(level.id)} className={cn('format-level-card', level.border, loading && loading !== `format-${level.id}` && 'opacity-45')}><span className={cn('format-level-icon', level.color)}>{loading === `format-${level.id}` ? <Loader2 className="h-6 w-6 animate-spin" /> : level.icon}</span><span><strong>{level.title}</strong><small>{level.subtitle}</small></span><span className="format-level-number">0{index + 1}</span></motion.button>)}
        </div>
      </section>

      <section className="tree-journey-section" aria-label="رحلة شجرة التحدي">
        <div className="tree-section-heading"><div><p className="eyebrow">رحلة طويلة المدى</p><h2>شجرة التحدي</h2></div><span>48 ورقة</span></div>
        <p className="tree-section-copy">ثلاثة أسئلة متتابعة في كل ورقة. أجب عن اثنين لفتح الورقة التالية والحفاظ على رحلتك.</p>
        <div className="tree-stage">
          <div className="tree-canopy" aria-hidden="true"><span /><span /><span /><span /></div><div className="tree-trunk" aria-hidden="true"><i /><i /><i /></div><div className="tree-roots" aria-hidden="true"><i /><i /><i /><i /></div>
          {BRANCHES.map((branch, branchIndex) => <section key={branch.number} className={`tree-branch tree-branch-${branchIndex % 2 ? 'left' : 'right'}`}><div className="tree-branch-stem" aria-hidden="true" /><div className="tree-branch-label"><span className="tree-branch-number">{branch.number}</span><span><small>الغصن {branch.number}</small><strong>{branch.title}</strong></span></div><div className="tree-leaves-grid">{branch.leaves.map((leaf) => { const key = `${branch.number}-${leaf.number}`; const leafProgress = journey.leaves.find((item) => item.branch === branch.number && item.leaf === leaf.number); const disabled = !leafProgress?.unlocked || !!loading; return <motion.button key={key} type="button" whileTap={{ scale: .94 }} disabled={disabled} onClick={() => void start(branch.number, leaf.number)} className={`tree-leaf ${leafProgress?.completed ? 'is-completed' : leafProgress?.unlocked ? 'is-open' : 'is-locked'}`} aria-label={`${branch.title}، ورقة ${leaf.number}`}><span className="tree-leaf-shine" />{loading === key ? <Loader2 className="h-5 w-5 animate-spin" /> : leafProgress?.completed ? <Check className="h-5 w-5" /> : leafProgress?.unlocked ? <Leaf className="h-5 w-5" /> : <LockKeyhole className="h-4 w-4" />}<strong>{leaf.number}</strong><span className="tree-leaf-steps" aria-label={`${leafProgress?.completed ? 3 : 0} من 3 أسئلة`}>{[0, 1, 2].map((step) => <i key={step} className={leafProgress?.completed ? 'is-filled' : ''} />)}</span><small>{leafProgress?.completed ? 'مكتملة · مكافأة خادمية' : leafProgress?.unlocked ? '3 أسئلة · مكافأة خادمية' : 'مقفلة'}</small></motion.button>; })}</div></section>)}
        </div>
      </section>
    </main>
  );
}
