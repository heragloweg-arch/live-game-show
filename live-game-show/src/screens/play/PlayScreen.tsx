import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Bot, Swords, Users, Crown } from 'lucide-react';
import { cn } from '../../utils/cn';

export function PlayScreen() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen px-5 pb-10 pt-6">
      <header className="mb-8 flex items-center gap-3">
        <Link to="/home" className="btn-ghost -mr-2 p-2">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="font-display text-2xl font-bold">اختر وضع اللعب</h1>
      </header>

      <div className="flex flex-col gap-4">
        <ModeCard
          icon={<Bot className="h-7 w-7 text-zatona-400" />}
          title="ضد الكمبيوتر"
          description="تحدى الذكاء الاصطناعي · 3 مستويات · سيرفر"
          onClick={() => navigate('/play/difficulty')}
        />
        <ModeCard
          icon={<Swords className="h-7 w-7 text-neon-cyan" />}
          title="مباراة سريعة 1 ضد 1"
          description="ابحث عن خصم حقيقي الآن"
          onClick={() => navigate('/play/matchmaking?diff=normal')}
          primary
        />
        <ModeCard
          icon={<Users className="h-7 w-7 text-amber-300" />}
          title="ادعُ صديقاً"
          description="أنشئ رابط دعوة 1 ضد 1 وشاركه"
          onClick={() => navigate('/play/invite/create')}
        />
        <ModeCard
          icon={<Users className="h-7 w-7 text-neon-purple" />}
          title="غرف التحدي"
          description="انضم بكود الغرفة أو من دعوة المضيف"
          onClick={() => navigate('/room/join')}
        />
        <ModeCard
          icon={<Users className="h-7 w-7 text-sky-400" />}
          title="معارك الفرق"
          description="1v1 حتى 15v15 · مجموع نقاط الفريق"
          onClick={() => navigate('/team')}
        />
        <ModeCard
          icon={<Crown className="h-7 w-7 text-gold-400" />}
          title="استضف تحدي مباشر"
          description="لوحة المضيف + صوت LiveKit + أسئلة"
          onClick={() => navigate('/host')}
        />
      </div>
    </div>
  );
}

function ModeCard({
  icon,
  title,
  description,
  onClick,
  primary,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'card flex items-start gap-4 p-5 text-right transition-all',
        primary && 'border-zatona-500/40 shadow-glow'
      )}
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/5">
        {icon}
      </div>
      <div className="flex-1">
        <h2 className="font-display text-lg font-bold text-white">{title}</h2>
        <p className="mt-1 text-sm text-white/50">{description}</p>
      </div>
    </motion.button>
  );
}
