import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  BarChart3,
  Coins,
  Flame,
  Gamepad2,
  Home,
  Medal,
  Play,
  Sparkles,
  ShoppingBag,
  Swords,
  Trophy,
  User,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useWalletStore } from '../../store/walletStore';
import { claimDailyBonus } from '../../services/economy/walletApi';
import { ScreenShell } from '../../components/layout/ScreenShell';
import { loadActiveMatch } from '../../services/realtime/reconnect';
import { cn } from '../../utils/cn';
import { isSoundEnabled, playSound, setSoundEnabled } from '../../utils/sound';
import { getFeatureHealth, type FeatureHealth } from '../../services/api/featureHealthApi';
import { getWeeklyJourney, type WeeklyJourneyDay } from '../../services/daily/weeklyJourneyApi';
import { BottomAdBanner } from '../../components/ads/BottomAdBanner';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const item = {
  hidden: { y: 12, opacity: 0 },
  show: { y: 0, opacity: 1, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] } },
};

export function HomeScreen() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { wallet, loadWallet, setWallet } = useWalletStore();
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [featureHealth, setFeatureHealth] = useState<Record<string, FeatureHealth>>({});
  const [weeklyJourney, setWeeklyJourney] = useState<WeeklyJourneyDay[]>([]);

  useEffect(() => {
    loadWallet();
    setSoundEnabledState(isSoundEnabled());
    void getFeatureHealth().then(setFeatureHealth);
    void getWeeklyJourney().then((journey) => setWeeklyJourney(journey.days)).catch(() => setWeeklyJourney([]));
  }, [loadWallet]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabledState(next);
    setSoundEnabled(next);
    if (next) playSound('click');
  };

  const onDailyBonus = async () => {
    try {
      const nextWallet = await claimDailyBonus();
      setWallet(nextWallet);
    } catch {
      // The server safely ignores an already claimed bonus.
    }
  };

  const active = loadActiveMatch();
  const level = user?.level ?? 7;
  const xp = user?.xp ?? 64;
  const xpToNext = user?.xpToNextLevel ?? 100;
  const progress = Math.min(100, (xp / xpToNext) * 100);

  return (
    <ScreenShell orbs={false} className="home-screen mx-auto max-w-2xl px-4 pb-28 pt-5 sm:px-6">
      <div className="home-grid pointer-events-none" />
      <header className="relative z-10 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="brand-mark">
            <img src="/images/logo-qaddaha.png" alt="قدها" draggable={false} />
          </div>
          <div>
            <p className="eyebrow">أهلاً بعودتك</p>
            <h1 className="font-display text-xl font-black tracking-tight text-white">
              {user?.displayName ?? 'يا بطل'}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSound}
            className="icon-button"
            aria-label={soundEnabled ? 'كتم المؤثرات الصوتية' : 'تشغيل المؤثرات الصوتية'}
            title={soundEnabled ? 'كتم الصوت' : 'تشغيل الصوت'}
          >
            {soundEnabled ? <Volume2 className="h-[18px] w-[18px]" /> : <VolumeX className="h-[18px] w-[18px]" />}
          </button>
          <button type="button" onClick={onDailyBonus} className="coin-pill" aria-label="استلام المكافأة اليومية">
            <Coins className="h-4 w-4" />
            <span>{wallet?.coins ?? user?.coins ?? 0}</span>
          </button>
          <Link to="/profile" className="icon-button" aria-label="الملف الشخصي">
            <User className="h-[18px] w-[18px]" />
          </Link>
        </div>
      </header>

      {active && (
        <button type="button" onClick={() => navigate(`/match/${active.matchId}`)} className="resume-banner mb-5 w-full text-right">
          <span className="live-dot" />
          <span className="flex-1">
            <strong>مباراتك لم تنتهِ بعد</strong>
            <small>ارجع للمنافسة قبل أن ينتهي الوقت</small>
          </span>
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}

      <motion.div variants={container} initial="hidden" animate="show" className="relative z-10 space-y-5">
        <motion.section variants={item} className="hero-card">
          <div className="hero-noise" />
          <div className="hero-brand-orb"><img src="/images/logo-qaddaha.png" alt="" aria-hidden="true" /></div>
          <div className="relative z-10 max-w-[76%]">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-amber-100">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              الموسم 01 · تحدي الأبطال
            </div>
            <h2 className="font-display text-[2rem] font-black leading-[1.08] text-white sm:text-4xl">
              هل أنت <span className="text-gradient-gold">قدّها؟</span>
            </h2>
            <p className="mt-3 max-w-xs text-sm leading-7 text-white/65">
              أجب أسرع، نافس أذكى، واصعد إلى قمة الترتيب العالمي.
            </p>
            <Link to="/play" className="hero-cta mt-6">
              <span>ابدأ التحدي</span>
              <span className="hero-cta-icon"><Play className="h-4 w-4 fill-current" /></span>
            </Link>
          </div>
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="hero-bolt"><Zap className="h-10 w-10" /></div>
          <span className="hero-score">+250 XP</span>
        </motion.section>

        <motion.section variants={item} className="level-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">رحلة البطل</p>
              <div className="mt-1 flex items-baseline gap-2">
                <strong className="font-display text-2xl font-black text-white">المستوى {level}</strong>
                <span className="text-xs text-white/40">نجم صاعد</span>
              </div>
            </div>
            <div className="level-badge"><Medal className="h-5 w-5" /></div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="progress-track"><div className="progress-value" style={{ width: `${progress}%` }} /></div>
            <span className="min-w-fit text-xs font-bold text-white/45">{xp}/{xpToNext}</span>
          </div>
        </motion.section>

        <motion.section variants={item}>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="eyebrow">لا تفوّت السلسلة</p>
              <h2 className="section-title mt-1">تحدي اليوم</h2>
            </div>
            <Link to="/daily" className="section-link">عرض الكل <ArrowLeft className="h-3.5 w-3.5" /></Link>
          </div>
          <Link to="/daily" className="daily-card group">
            <div className="daily-icon"><Flame className="h-7 w-7" /></div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2"><span className="live-chip">متاح الآن</span><span className="text-xs text-white/35">بتوقيت الرياض</span></div>
              <h3 className="font-display text-lg font-black text-white">رحلة اليوم · 3 محطات</h3>
              <p className="mt-1 text-xs text-white/48">أكمل 3/3 لفتح مكافأة الحزمة والسلسلة</p>
            </div>
            <ArrowLeft className="h-5 w-5 text-white/40 transition-transform group-hover:-translate-x-1" />
          </Link>
        </motion.section>

        <motion.section variants={item}>
          <div className="mb-3 flex items-end justify-between"><h2 className="section-title">اختر طريقتك</h2><span className="text-xs text-white/35">جاهز للعب</span></div>
          <div className="grid grid-cols-2 gap-3">
            <ModeCard health={featureHealth.one_v_one} to="/play" icon={<Swords />} title="مواجهة" subtitle="لاعب ضد لاعب" tone="violet" />
            <ModeCard health={featureHealth.host} to="/room/join" icon={<Users />} title="غرفة" subtitle="مع الأصدقاء" tone="cyan" />
            <ModeCard health={featureHealth.tournament} to="/tournament" icon={<Trophy />} title="بطولة" subtitle="نافس على اللقب" tone="gold" />
            <ModeCard health={featureHealth.team} to="/team" icon={<Gamepad2 />} title="فريق" subtitle="معركة جماعية" tone="pink" />
          </div>
        </motion.section>

        <motion.section variants={item} className="quick-row">
          <Link to="/leaderboard" className="quick-item"><Trophy /><span>المتصدرون</span><ArrowLeft /></Link>
          <Link to="/metrics" className="quick-item"><BarChart3 /><span>إحصائياتي</span><ArrowLeft /></Link>
          <Link to="/shop" className="quick-item"><ShoppingBag /><span>المتجر</span><ArrowLeft /></Link>
        </motion.section>
        <motion.section variants={item} className="card p-4">
          <div className="mb-3 flex items-center justify-between"><div><p className="eyebrow">تقدمك هذا الأسبوع</p><h2 className="section-title mt-1">سبعة أيام، سبع فرص</h2></div><Link to="/daily" className="section-link">ابدأ <ArrowLeft className="h-3.5 w-3.5" /></Link></div>
          <div className="grid grid-cols-7 gap-1.5">{weeklyJourney.length ? weeklyJourney.map((day, index) => <div key={day.date} className={cn('rounded-xl border p-2 text-center', day.complete ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200' : day.date === new Date().toISOString().slice(0, 10) ? 'border-amber-300/30 bg-amber-400/10 text-amber-100' : 'border-white/8 bg-white/[0.03] text-white/35')}><span className="block text-[10px]">{['س','ح','ن','ث','ر','خ','ج'][index] ?? '•'}</span><span className="mt-1 block text-xs font-black">{day.complete ? '✓' : day.completedSlots ? `${day.completedSlots}/3` : '•'}</span></div>) : ['س','ح','ن','ث','ر','خ','ج'].map((day) => <div key={day} className="rounded-xl border border-white/8 bg-white/[0.03] p-2 text-center text-white/35"><span className="block text-[10px]">{day}</span><span className="mt-1 block text-xs font-black">•</span></div>)}</div>
          <p className="mt-3 text-xs text-white/45">أكمل حزمة اليوم لتحافظ على السلسلة وتفتح مكافأة الغد.</p>
        </motion.section>
      </motion.div>

      <nav className="bottom-nav" aria-label="التنقل الرئيسي">
        <NavItem to="/home" icon={<Home />} label="الرئيسية" active />
        <NavItem to="/leaderboard" icon={<Medal />} label="الترتيب" />
        <Link to="/play" className="play-nav-button" aria-label="ابدأ اللعب"><Swords className="h-6 w-6" /></Link>
        <NavItem to="/tournament" icon={<Trophy />} label="البطولات" />
        <NavItem to="/profile" icon={<User />} label="حسابي" />
      </nav>
      <BottomAdBanner />
    </ScreenShell>
  );
}

function ModeCard({ to, icon, title, subtitle, tone, health }: { to: string; icon: React.ReactNode; title: string; subtitle: string; tone: 'violet' | 'cyan' | 'gold' | 'pink'; health?: FeatureHealth }) {
  if (health?.status === 'disabled' || health?.status === 'maintenance') return null;
  return <Link to={to} className={cn('mode-card', `mode-${tone}`)}><div className="mode-icon">{icon}</div><div><h3>{title} {health?.status === 'beta' && <span className="ml-1 rounded-full border border-amber-300/30 px-1.5 py-0.5 text-[9px] text-amber-200">Beta</span>}</h3><p>{health?.status === 'beta' && health.message ? health.message : subtitle}</p></div><ArrowLeft className="mode-arrow" /></Link>;
}

function NavItem({ to, icon, label, active = false }: { to: string; icon: React.ReactNode; label: string; active?: boolean }) {
  return <Link to={to} className={cn('nav-item', active && 'nav-item-active')}>{icon}<span>{label}</span></Link>;
}
