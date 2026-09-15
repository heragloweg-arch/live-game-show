import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, Users, Crown, Trophy, User, Swords, Coins, Flame, Heart, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useWalletStore } from '../../store/walletStore';
import { claimDailyBonus } from '../../services/economy/walletApi';
import { cn } from '../../utils/cn';
import { useThemeStore } from '../../store/themeStore';
import { ScreenShell } from '../../components/layout/ScreenShell';
import { loadActiveMatch } from '../../services/realtime/reconnect';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { y: 16, opacity: 0 },
  show: { y: 0, opacity: 1 },
};

export function HomeScreen() {
  const toggleTheme = useThemeStore((s) => s.toggle);
  const themeMode = useThemeStore((s) => s.mode);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { wallet, loadWallet, setWallet } = useWalletStore();

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  const onDailyBonus = async () => {
    try {
      const w = await claimDailyBonus();
      setWallet(w);
    } catch {
      /* already claimed or offline */
    }
  };

  return (
    <div className="relative min-h-0 px-5 pb-10 pt-6">
      
      {(() => {
        const active = loadActiveMatch();
        if (!active) return null;
        return (
          <button
            type="button"
            onClick={() => navigate(`/match/${active.matchId}`)}
            className="mb-4 w-full rounded-2xl border border-zatona-500/30 bg-zatona-500/10 px-4 py-3 text-sm text-zatona-300"
          >
            لديك مباراة جارية — اضغط للمتابعة
          </button>
        );
      })()}

      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/images/logo-qaddaha.png"
            alt="قدها"
            className="h-12 w-12 rounded-2xl object-cover shadow-glow"
            draggable={false}
          />
          <div>
            <p className="text-sm text-white/50">قدها</p>
            <h1 className="font-display text-xl font-bold text-white">
              {user?.displayName ?? 'لاعب قدها'}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onDailyBonus}
            className="flex items-center gap-1.5 rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1.5 text-sm font-bold text-gold-400"
          >
            <Coins className="h-4 w-4" />
            {wallet?.coins ?? user?.coins ?? 0}
          </button>
          <Link
            to="/profile"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface-800"
          >
            <User className="h-5 w-5 text-zatona-400" />
          </Link>
        </div>
      </header>

      <div className="mb-8 rounded-2xl border border-white/5 bg-surface-800/70 p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-zatona-400">المستوى {user?.level ?? 1}</span>
          <span className="text-white/50">
            {user?.xp ?? 0} / {user?.xpToNextLevel ?? 100} XP
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-l from-zatona-500 to-zatona-400"
            style={{
              width: `${Math.min(100, ((user?.xp ?? 0) / (user?.xpToNextLevel ?? 100)) * 100)}%`,
            }}
          />
        </div>
      </div>

      <motion.div variants={container} initial="hidden" animate="show" className="mb-4">
        <motion.div variants={item}>
          <Link
            to="/daily"
            className="card flex items-center gap-3 border-orange-500/25 p-4 transition-all active:scale-[0.98]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/15">
              <Flame className="h-6 w-6 text-orange-400" />
            </div>
            <div className="flex-1 text-right">
              <h3 className="font-display font-bold text-white">تحدي اليوم</h3>
              <p className="text-xs text-white/45">سلسلة يومية · مكافآت إضافية</p>
            </div>
          </Link>
        </motion.div>
      </motion.div>

      <motion.div variants={container} initial="hidden" animate="show" className="mb-6 grid gap-3">
        <motion.div variants={item}>
          <Link
            to="/play"
            className={cn(
              'btn-primary w-full py-5 text-lg shadow-glow-lg',
              'flex items-center justify-center gap-3'
            )}
          >
            <Swords className="h-6 w-6" />
            ابدأ التحدي
          </Link>
        </motion.div>
      </motion.div>

      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 gap-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/35">ابدأ من هنا</p>
      <div className="mb-6 grid gap-3">
        <Link to="/play" className="card-glow flex items-center gap-4 p-5">
          <Zap className="h-8 w-8 text-amber-300" />
          <div className="flex-1 text-right">
            <p className="font-display text-lg font-black text-white">قدها؟ — ابدأ التحدي</p>
            <p className="text-xs text-white/45">Solo أو 1 ضد 1 · سرعة ومنافسة</p>
          </div>
        </Link>
        <Link to="/daily" className="card flex items-center gap-4 p-4">
          <Flame className="h-6 w-6 text-orange-400" />
          <div className="flex-1 text-right">
            <p className="font-bold">تحدي اليوم</p>
            <p className="text-xs text-white/40">سلسلة يومية + مكافآت</p>
          </div>
        </Link>
      </div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/35">المزيد</p>
      <FeatureCard to="/host" icon={<Crown className="h-6 w-6 text-gold-400" />} title="استضف تحدي" subtitle="Host Panel" glow="gold" />
        <FeatureCard to="/play" icon={<Zap className="h-6 w-6 text-zatona-400" />} title="لعب سريع" subtitle="1v1 أو Solo" />
        <FeatureCard to="/team" icon={<Users className="h-6 w-6 text-sky-400" />} title="معارك الفرق" subtitle="حتى 15 ضد 15" />
        <FeatureCard to="/creator" icon={<Sparkles className="h-6 w-6 text-fuchsia-400" />} title="المبدع" subtitle="صمّم أسئلة قدها" />
        <FeatureCard to="/couple" icon={<Heart className="h-6 w-6 text-pink-400" />} title="الثنائي" subtitle="العب مع شريكك" />
        <FeatureCard to="/tournament" icon={<Trophy className="h-6 w-6 text-gold-400" />} title="دوري الأبطال" subtitle="تنافس على اللقب" glow="gold" />
        <FeatureCard to="/subscription" icon={<Crown className="h-6 w-6 text-gold-400" />} title="الاشتراكات" subtitle="بلس ومضيف برو" />
        <FeatureCard to="/leaderboard" icon={<Trophy className="h-6 w-6 text-neon-cyan" />} title="المتصدرين" subtitle="الترتيب العالمي" />
        <FeatureCard to="/room/join" icon={<Users className="h-6 w-6 text-neon-purple" />} title="غرف التحدي" subtitle="منافسة جماعية" />
      </motion.div>

      <div className="mt-8 flex flex-wrap justify-center gap-3 text-[11px] text-white/30">
        <Link to="/legal/privacy" className="hover:text-white/50">الخصوصية</Link>
        <span>·</span>
        <Link to="/legal/terms" className="hover:text-white/50">الشروط</Link>
        <span>·</span>
        <Link to="/metrics" className="hover:text-white/50">مقاييس</Link>
      </div>
      <p className="mt-4 text-center text-xs text-white/30">قدها — قدها ⚡</p>
    </div>
  );
}

function FeatureCard({
  to, icon, title, subtitle, glow,
}: {
  to: string; icon: React.ReactNode; title: string; subtitle: string; glow?: 'gold';
}) {
  return (
    <motion.div variants={item}>
      <Link
        to={to}
        className={cn(
          'card card-glow flex flex-col items-start gap-3 p-4 transition-all active:scale-[0.98] hover:border-white/20',
          glow === 'gold' && 'border-gold-500/20 shadow-glow-gold'
        )}
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5">{icon}</div>
        <div>
          <h3 className="font-display font-bold text-white">{title}</h3>
          <p className="text-xs text-white/45">{subtitle}</p>
        </div>
      </Link>
    </motion.div>
  );
}