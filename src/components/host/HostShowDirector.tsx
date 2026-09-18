/**
 * Host Show Mode — cinematic stage director for live challenge rooms.
 * Stages: intro → warm_up → main → fire → results → closing
 */

import { motion } from 'framer-motion';
import {
  Radio,
  Flame,
  Trophy,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
} from 'lucide-react';
import { cn } from '../../utils/cn';

export type ShowStage =
  | 'intro'
  | 'warm_up'
  | 'main'
  | 'fire'
  | 'results'
  | 'closing';

export const SHOW_STAGES: {
  id: ShowStage;
  title: string;
  subtitle: string;
  accent: string;
}[] = [
  {
    id: 'intro',
    title: 'افتتاحية',
    subtitle: 'رحّب باللاعبين واشرح القواعد سريعاً',
    accent: 'from-zatona-500/20 to-transparent',
  },
  {
    id: 'warm_up',
    title: 'إحماء',
    subtitle: 'سؤال سهل لكسر الجليد',
    accent: 'from-cyan-500/20 to-transparent',
  },
  {
    id: 'main',
    title: 'الجولات الرئيسية',
    subtitle: 'قلب العرض — أطلق التحديات تباعاً',
    accent: 'from-violet-500/20 to-transparent',
  },
  {
    id: 'fire',
    title: 'جولة النار',
    subtitle: 'وقت أقل · نقاط مضاعفة · توتر أعلى',
    accent: 'from-orange-500/25 to-transparent',
  },
  {
    id: 'results',
    title: 'كشف النتائج',
    subtitle: 'أعلن المراكز تدريجياً من الأخير للأول',
    accent: 'from-gold-500/20 to-transparent',
  },
  {
    id: 'closing',
    title: 'ختام',
    subtitle: 'شكر · دعوة للغد · مشاركة الكود',
    accent: 'from-white/10 to-transparent',
  },
];

interface Props {
  stage: ShowStage;
  onStageChange: (s: ShowStage) => void;
  participantCount: number;
  isLive: boolean;
}

export function HostShowDirector({ stage, onStageChange, participantCount, isLive }: Props) {
  const idx = SHOW_STAGES.findIndex((s) => s.id === stage);
  const current = SHOW_STAGES[idx] ?? SHOW_STAGES[0];

  const prev = () => {
    if (idx > 0) onStageChange(SHOW_STAGES[idx - 1].id);
  };
  const next = () => {
    if (idx < SHOW_STAGES.length - 1) onStageChange(SHOW_STAGES[idx + 1].id);
  };

  return (
    <div className="card relative overflow-hidden p-4">
      <div
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-b',
          current.accent
        )}
      />

      <div className="relative z-10 mb-3 flex items-center gap-2">
        <Clapperboard className="h-4 w-4 text-zatona-400" />
        <span className="text-xs font-semibold text-white/50">وضع العرض · Host Show</span>
        {isLive && (
          <span className="mr-auto flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400">
            <Radio className="h-3 w-3 animate-pulse" />
            LIVE
          </span>
        )}
      </div>

      {/* Stage chips */}
      <div className="relative z-10 mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {SHOW_STAGES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onStageChange(s.id)}
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold transition',
              s.id === stage
                ? 'bg-zatona-500 text-surface-950'
                : i < idx
                  ? 'bg-white/10 text-white/50'
                  : 'bg-white/5 text-white/30'
            )}
          >
            {i + 1}. {s.title}
          </button>
        ))}
      </div>

      <motion.div
        key={stage}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10"
      >
        <div className="mb-1 flex items-center gap-2">
          {stage === 'fire' ? (
            <Flame className="h-5 w-5 text-orange-400" />
          ) : stage === 'results' ? (
            <Trophy className="h-5 w-5 text-gold-400" />
          ) : (
            <Sparkles className="h-5 w-5 text-zatona-400" />
          )}
          <h3 className="font-display text-lg font-bold text-white">{current.title}</h3>
        </div>
        <p className="mb-4 text-sm text-white/55">{current.subtitle}</p>

        <div className="mb-4 rounded-xl bg-black/25 px-3 py-2 text-xs text-white/45">
          {stage === 'intro' && 'نصيحة: اطلب من الجميع تشغيل الميكروفون وتحية سريعة.'}
          {stage === 'warm_up' && 'اطلق سؤالاً سهلاً من لوحة التحديات ثم اكشف الإجابة.'}
          {stage === 'main' && `اللاعبون المتصلون: ${participantCount} — حافظ على إيقاع 15–20 ثانية.`}
          {stage === 'fire' && 'فعّل سؤالاً صعباً أو قلّل الوقت يدوياً في خطابك للرفع التوتر.'}
          {stage === 'results' && 'ابدأ من المركز الأخير صعوداً — لا تكشف الأول مباشرة.'}
          {stage === 'closing' && 'ادعُ للمباراة غداً ولـ تحدي اليوم لإشعال السلسلة.'}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={prev}
            disabled={idx === 0}
            className="btn-secondary flex flex-1 items-center justify-center gap-1 py-2.5 text-sm disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
            السابق
          </button>
          <button
            type="button"
            onClick={next}
            disabled={idx === SHOW_STAGES.length - 1}
            className="btn-primary flex flex-1 items-center justify-center gap-1 py-2.5 text-sm disabled:opacity-30"
          >
            التالي
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
