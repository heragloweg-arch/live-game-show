import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Crown, Zap, Sparkles } from 'lucide-react';
import { completeOnboarding } from '../../services/daily/dailyApi';
import { useAuthStore } from '../../store/authStore';
import { updateProfile } from '../../services/profile/profileApi';
import { cn } from '../../utils/cn';

const STEPS = [
  {
    icon: Zap,
    color: 'text-zatona-400',
    glow: 'from-zatona-500/30 to-transparent',
    title: 'مرحباً في قدها',
    body: 'تحديات عربية سريعة بإيقاع سينمائي: معرفة، سرعة، كلمات، ولحظات فوز تستحق المشاركة.',
  },
  {
    icon: Swords,
    color: 'text-neon-cyan',
    glow: 'from-cyan-500/25 to-transparent',
    title: 'اختر ساحة اللعب',
    body: 'واجه الذكاء الاصطناعي، ابحث عن خصم 1 ضد 1، أو انضم لغرفة تحدٍ بصوت مباشر.',
  },
  {
    icon: Crown,
    color: 'text-gold-400',
    glow: 'from-gold-500/25 to-transparent',
    title: 'كن نجماً أو مضيفاً',
    body: 'استضف تحدياً، أطلق الأسئلة، وابنِ سلسلتك اليومية. اكتب اسمك وابدأ.',
  },
];

export function OnboardingScreen() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const setUser = useAuthStore((s) => s.setUser);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(user?.displayName ?? '');
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true);
    try {
      if (user && name.trim() && name.trim() !== user.displayName) {
        const updated = await updateProfile(user.id, { displayName: name.trim() });
        if (updated) setUser(updated);
      }
      try {
        await completeOnboarding();
      } catch {
        /* offline ok */
      }
      await refreshProfile();
      navigate('/home', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else void finish();
  };

  const s = STEPS[step];
  const Icon = s.icon;
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden px-6 pb-10 pt-12">
      <div className="pointer-events-none absolute inset-0 bg-hero-gradient" />
      <motion.div
        className={cn('pointer-events-none absolute -top-10 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-gradient-to-b blur-3xl', s.glow)}
        animate={{ opacity: [0.5, 0.85, 0.5], scale: [1, 1.08, 1] }}
        transition={{ duration: 4, repeat: Infinity }}
      />

      {/* Progress */}
      <div className="relative z-10 mb-8">
        <div className="mb-2 flex items-center justify-between text-[11px] text-white/40">
          <span>تعرّف على قدها</span>
          <span>
            {step + 1} / {STEPS.length}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-l from-zatona-500 to-gold-400"
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.98 }}
            transition={{ duration: 0.35 }}
            className="w-full max-w-sm text-center"
          >
            <div className="relative mx-auto mb-8 flex h-24 w-24 items-center justify-center">
              <div className="absolute inset-0 rounded-[1.75rem] bg-white/5 ring-1 ring-white/10" />
              <Icon className={cn('relative h-11 w-11', s.color)} />
              <Sparkles className="absolute -left-1 -top-1 h-4 w-4 text-gold-400/80" />
            </div>
            <h1 className="mb-3 font-display text-3xl font-black tracking-tight text-white">
              {s.title}
            </h1>
            <p className="mx-auto mb-10 max-w-xs text-sm leading-7 text-white/55">{s.body}</p>

            {step === STEPS.length - 1 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 text-right"
              >
                <label className="mb-2 block text-xs font-medium text-white/45">
                  اسمك الذي سيظهر للجميع
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field text-center text-lg font-semibold"
                  placeholder="لاعب قدها"
                  dir="rtl"
                  maxLength={24}
                  autoFocus
                />
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-sm space-y-3">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={next}
          disabled={busy}
          className="btn-primary w-full py-4 text-base shadow-glow"
        >
          {step < STEPS.length - 1 ? 'متابعة' : busy ? 'جاري التحضير...' : 'ادخل قدها'}
        </motion.button>
        {step > 0 && (
          <button
            onClick={() => setStep((x) => x - 1)}
            className="w-full py-2 text-sm text-white/40 transition hover:text-white/70"
          >
            رجوع
          </button>
        )}
        {step < STEPS.length - 1 && (
          <button
            onClick={() => void finish()}
            className="w-full py-1 text-xs text-white/25 hover:text-white/40"
          >
            تخطي
          </button>
        )}
      </div>
    </div>
  );
}
