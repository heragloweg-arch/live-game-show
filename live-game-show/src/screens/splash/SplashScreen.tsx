import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import { track } from '../../services/analytics/events';

export function SplashScreen() {
  const navigate = useNavigate();
  const { sessionLoading, isAuthenticated, signInAnonymously, user } = useAuthStore();

  useEffect(() => {
    track('app_open');
    let cancelled = false;

    async function boot() {
      await new Promise((r) => setTimeout(r, 2400));
      if (cancelled) return;

      if (!isAuthenticated) {
        try {
          await signInAnonymously();
        } catch {
          console.warn('Anonymous sign-in skipped');
        }
      }
      const needsOnboarding = user && user.onboardingDone === false;
      navigate(needsOnboarding ? '/onboarding' : '/home', { replace: true });
    }

    if (!sessionLoading) void boot();
    return () => {
      cancelled = true;
    };
  }, [sessionLoading, isAuthenticated, navigate, signInAnonymously, user]);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-surface-900">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.25)_0%,transparent_55%)]" />
      <motion.div
        className="absolute h-[420px] w-[420px] rounded-full bg-violet-600/20 blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.35, 0.65, 0.35] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute h-[280px] w-[280px] rounded-full bg-gold-500/15 blur-3xl"
        animate={{ scale: [1.1, 0.95, 1.1], opacity: [0.25, 0.5, 0.25] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      />

      <motion.div
        initial={{ scale: 0.55, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex flex-col items-center gap-5"
      >
        <div className="relative">
          <motion.div
            className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-[2rem] border-2 border-violet-400/40 bg-surface-800/80 shadow-[0_0_40px_rgba(124,58,237,0.45)] backdrop-blur-sm"
            animate={{
              boxShadow: [
                '0 0 30px rgba(124,58,237,0.35)',
                '0 0 60px rgba(234,179,8,0.35)',
                '0 0 30px rgba(124,58,237,0.35)',
              ],
            }}
            transition={{ duration: 2.8, repeat: Infinity }}
          >
            <img
              src="/images/logo-qaddaha.png"
              alt="قدها"
              className="h-full w-full object-cover"
              draggable={false}
            />
          </motion.div>
          <motion.div
            className="absolute -inset-3 rounded-[2.25rem] border border-gold-500/25"
            animate={{ rotate: 360 }}
            transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
          />
        </div>

        <motion.h1
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          className="font-display text-4xl font-black tracking-tight text-white"
        >
          قدها
        </motion.h1>
        <motion.p
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.55, duration: 0.5 }}
          className="text-sm text-white/50"
        >
          تحديات · سرعة · منافسة — وقدّها!
        </motion.p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1 }}
        className="absolute bottom-16 flex gap-1.5"
      >
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-violet-400"
            animate={{ opacity: [0.3, 1, 0.3], scale: [1, 1.3, 1] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </motion.div>
    </div>
  );
}
