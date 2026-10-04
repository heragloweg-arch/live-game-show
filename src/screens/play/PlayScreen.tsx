import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Bot, CalendarDays, Crown, Swords, Users, Zap } from 'lucide-react';
import { cn } from '../../utils/cn';

const modes = [
  { icon: Swords, title: 'مباراة سريعة', description: 'خصم حقيقي الآن', tone: 'violet', primary: true, action: '/play/matchmaking?diff=normal' },
  { icon: CalendarDays, title: 'التحدي اليومي', description: '3 محطات ومكافأة اليوم', tone: 'gold', action: '/daily' },
  { icon: Bot, title: 'ضد الكمبيوتر', description: 'اختر مستوى التحدي', tone: 'cyan', action: '/play/difficulty' },
  { icon: Users, title: 'غرفة الأصدقاء', description: 'كود أو رابط دعوة', tone: 'cyan', action: '/room/join' },
  { icon: Users, title: 'معركة الفرق', description: 'تنافسوا كمجموعة', tone: 'pink', action: '/team' },
  { icon: Crown, title: 'استضف تحدياً', description: 'أدر الجولة مباشرة', tone: 'gold', action: '/host' },
] as const;

export function PlayScreen() {
  const navigate = useNavigate();
  return (
    <main className="play-page" dir="rtl">
      <header className="play-header">
        <Link to="/home" className="btn-ghost play-back" aria-label="العودة للرئيسية"><ArrowRight size={20} /></Link>
        <div><span className="eyebrow">ساحة المنافسة</span><h1>اختر تحديك</h1></div>
        <span className="play-status"><span /> جاهز</span>
      </header>
      <section className="play-hero">
        <div className="play-hero-content"><span className="auth-kicker"><Zap size={14} /> كل إجابة تقرّبك من القمة</span><h2>العب بطريقتك،<br /><strong>وأثبت أنك قدّها.</strong></h2><p>ابدأ بمباراة سريعة أو أكمل رحلة اليوم لتحافظ على سلسلتك.</p></div>
        <div className="play-hero-orbit" aria-hidden="true" />
      </section>
      <section className="play-section"><div className="play-section-heading"><div><span className="eyebrow">الاختيار الموصى به</span><h2>ابدأ الآن</h2></div><span className="play-count">{modes.length} ساحات</span></div><div className="play-mode-grid">{modes.slice(0, 2).map((mode) => <ModeCard key={mode.title} {...mode} onClick={() => navigate(mode.action)} />)}</div></section>
      <section className="play-section"><div className="play-section-heading"><div><span className="eyebrow">اكتشف أكثر</span><h2>ساحات أخرى</h2></div></div><div className="play-mode-grid">{modes.slice(2).map((mode) => <ModeCard key={mode.title} {...mode} onClick={() => navigate(mode.action)} />)}</div></section>
      <Link to="/home" className="play-home-link">العودة إلى لوحة التحكم <ArrowRight size={15} /></Link>
    </main>
  );
}

function ModeCard({ icon: Icon, title, description, tone, primary, onClick }: { icon: typeof Swords; title: string; description: string; tone: string; primary?: boolean; onClick: () => void }) {
  return <motion.button whileTap={{ scale: 0.985 }} onClick={onClick} className={cn('play-mode-card', `play-mode-${tone}`, primary && 'play-mode-primary')}><span className="play-mode-icon"><Icon size={22} /></span><span className="play-mode-copy"><strong>{title}</strong><small>{description}</small></span><ArrowRight className="play-mode-arrow" size={18} /></motion.button>;
}
