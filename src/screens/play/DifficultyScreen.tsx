import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Bot, Flame, Shield, Zap, Loader2 } from 'lucide-react';
import type { Difficulty } from '../../types';
import { cn } from '../../utils/cn';
import { createSoloMatch } from '../../services/api/matchApi';
import { FLAGS } from '../../config/flags';

const LEVELS: {
  id: Difficulty;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  border: string;
  accuracy: string;
}[] = [
  {
    id: 'easy',
    title: 'سهل',
    subtitle: 'مناسب للمبتدئين · دقة AI منخفضة',
    icon: <Shield className="h-7 w-7" />,
    color: 'text-emerald-400',
    border: 'border-emerald-500/40 hover:border-emerald-400',
    accuracy: '45%',
  },
  {
    id: 'normal',
    title: 'متوسط',
    subtitle: 'توازن جيد · التحدي الحقيقي يبدأ هنا',
    icon: <Zap className="h-7 w-7" />,
    color: 'text-zatona-400',
    border: 'border-zatona-500/50 hover:border-zatona-400 shadow-glow',
    accuracy: '68%',
  },
  {
    id: 'hard',
    title: 'صعب',
    subtitle: 'AI قوي وسريع · للاعبين المحترفين',
    icon: <Flame className="h-7 w-7" />,
    color: 'text-orange-400',
    border: 'border-orange-500/40 hover:border-orange-400',
    accuracy: '88%',
  },
];

export function DifficultyScreen() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<Difficulty | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (diff: Difficulty) => {
    setError(null);
    setLoading(diff);

    // Production path: server match
    try {
      const match = await createSoloMatch(diff);
      navigate(`/match/${match.matchId}`, { replace: true });
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Dev-only fallback
      if (FLAGS.enableLocalDemo) {
        navigate(`/match/solo-demo?diff=${diff}`);
        return;
      }
      setError(
        msg.includes('Not authenticated') || msg.includes('authenticated')
          ? 'يجب تسجيل الدخول أولاً. أعد فتح التطبيق.'
          : `تعذر بدء المباراة على السيرفر: ${msg}`
      );
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen px-5 pb-10 pt-6">
      <header className="mb-8 flex items-center gap-3">
        <Link to="/play" className="btn-ghost -mr-2 p-2">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold">اختر مستوى الصعوبة</h1>
          <p className="text-sm text-white/45">ضد الكمبيوتر · 5 جولات · سيرفر</p>
        </div>
      </header>

      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-white/5 bg-surface-800/60 p-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zatona-500/15">
          <Bot className="h-6 w-6 text-zatona-400" />
        </div>
        <div>
          <p className="font-medium text-white">الخصم: ذكاء اصطناعي</p>
          <p className="text-xs text-white/45">المباراة تُدار من السيرفر · لا Demo للمستخدم</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {LEVELS.map((level, i) => (
          <motion.button
            key={level.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            whileTap={{ scale: 0.98 }}
            disabled={!!loading}
            onClick={() => start(level.id)}
            className={cn(
              'card flex items-center gap-4 p-5 text-right transition-all',
              level.border,
              loading && loading !== level.id && 'opacity-50'
            )}
          >
            <div
              className={cn(
                'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/5',
                level.color
              )}
            >
              {loading === level.id ? (
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : (
                level.icon
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-white">{level.title}</h2>
                <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-white/50">
                  دقة {level.accuracy}
                </span>
              </div>
              <p className="mt-1 text-sm text-white/50">{level.subtitle}</p>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
