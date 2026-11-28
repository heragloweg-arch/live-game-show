import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, DoorOpen, Leaf, Mic2, Sparkles, Swords, Trophy, Users } from 'lucide-react';
import { cn } from '../../utils/cn';

const modes = [
  { icon: Leaf, title: 'شجرة التحدي', description: '48 ورقة ثابتة بصعوبة متدرجة', tone: 'cyan', primary: true, action: '/play/difficulty' },
  { icon: Swords, title: 'مباراة سريعة', description: 'مواجهة أساسية قابلة للعب', tone: 'violet', action: '/play/matchmaking?diff=normal' },
] as const;

const upcomingModes = [
  { icon: Trophy, title: 'الدوريات', description: 'منافسة موسمية بمكافآت أكبر' },
  { icon: DoorOpen, title: 'الغرف', description: 'ساحة خاصة للأصدقاء' },
  { icon: Users, title: 'الأصدقاء', description: 'دعوات ومواجهات معارفك' },
  { icon: Mic2, title: 'المضيف', description: 'قدّم عرضك أمام الجمهور' },
] as const;

export function PlayScreen() {
  const navigate = useNavigate();

  return (
    <main className="play-page" dir="rtl">
      <header className="play-header">
        <Link to="/home" className="btn-ghost play-back" aria-label="العودة للرئيسية"><ArrowRight size={20} /></Link>
        <div><span className="eyebrow">ساحة قدها</span><h1>اختر تحديك</h1></div>
        <span className="play-status"><span /> جاهز</span>
      </header>
      <section className="play-hero">
        <div className="play-hero-content"><span className="auth-kicker"><Sparkles size={14} /> كل إجابة تقرّبك من القمة</span><h2>العب بوضوح،<br /><strong>وأثبت أنك قدّها.</strong></h2><p>ثلاث تجارب أساسية، ومحتوى موثوق يختاره الخادم فقط عندما يكون قابلًا للعب.</p></div>
        <div className="play-hero-orbit" aria-hidden="true" />
      </section>

      <section className="play-section">
        <div className="play-section-heading"><div><span className="eyebrow">مساراتك الأساسية</span><h2>ابدأ من هنا</h2></div><span className="play-count">3 تجارب</span></div>
        <div className="play-mode-grid play-mode-grid-featured">
          {modes.map((mode) => <ModeCard key={mode.title} {...mode} onClick={() => navigate(mode.action)} />)}
        </div>
        <p className="play-note"><Sparkles size={14} /> التحدي اليومي موجود في الرئيسية حتى تصل إليه مباشرة، وكل سؤال يعرض إجابة ثابتة وتلميح عدد الحروف.</p>
      </section>
      <section className="play-section play-upcoming" aria-labelledby="upcoming-heading">
        <div className="play-section-heading"><div><span className="eyebrow">قريبًا في قدها</span><h2 id="upcoming-heading">ساحاتك القادمة</h2></div><span className="play-count">قيد الاختبار</span></div>
        <div className="play-upcoming-grid">
          {upcomingModes.map(({ icon: Icon, title, description }) => <div key={title} className="play-upcoming-card" aria-disabled="true"><span className="play-mode-icon"><Icon size={19} /></span><span><strong>{title}</strong><small>{description}</small></span><em>قريبًا</em></div>)}
        </div>
      </section>
      <Link to="/home" className="play-home-link">العودة إلى لوحة التحكم <ArrowRight size={15} /></Link>
    </main>
  );
}

function ModeCard({ icon: Icon, title, description, tone, primary, onClick }: { icon: typeof Swords; title: string; description: string; tone: string; primary?: boolean; onClick: () => void }) {
  return <motion.button type="button" whileTap={{ scale: 0.985 }} onClick={onClick} className={cn('play-mode-card', `play-mode-${tone}`, primary && 'play-mode-primary')}><span className="play-mode-icon"><Icon size={22} /></span><span className="play-mode-copy"><strong>{title}</strong><small>{description}</small></span><ArrowRight className="play-mode-arrow" size={18} /></motion.button>;
}
