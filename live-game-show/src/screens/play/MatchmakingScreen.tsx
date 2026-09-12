import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Swords, Loader2 } from 'lucide-react';
import { useMatchmaking } from '../../hooks/useMatchmaking';
import type { Difficulty } from '../../types';

export function MatchmakingScreen() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const difficulty = (search.get('diff') as Difficulty) || 'normal';
  const { phase, matchId, error, waitedMs, startSearch, cancel } = useMatchmaking();

  useEffect(() => {
    startSearch(difficulty);
    return () => {
      cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === 'matched' && matchId) {
      navigate(`/match/${matchId}`, { replace: true });
    }
  }, [phase, matchId, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <Link to="/play" onClick={cancel} className="btn-ghost absolute right-4 top-6">
        <ArrowRight className="h-5 w-5" />
      </Link>

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card w-full max-w-sm p-8 text-center"
      >
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-zatona-500/15">
          {phase === 'searching' ? (
            <Loader2 className="h-10 w-10 animate-spin text-zatona-400" />
          ) : (
            <Swords className="h-10 w-10 text-zatona-400" />
          )}
        </div>

        {phase === 'searching' && (
          <>
            <h2 className="mb-2 font-display text-xl font-bold">جاري البحث عن خصم...</h2>
            <p className="mb-1 text-sm text-white/50">مستوى: {difficulty}</p>
            <p className="text-xs text-white/30">
              {waitedMs > 0 ? `${Math.floor(waitedMs / 1000)} ثانية` : 'لحظات...'}
            </p>
            <button onClick={cancel} className="btn-secondary mt-6 w-full">
              إلغاء البحث
            </button>
          </>
        )}

        {phase === 'matched' && (
          <>
            <h2 className="mb-2 font-display text-xl font-bold text-zatona-400">تم إيجاد خصم!</h2>
            <p className="text-sm text-white/50">جاري الانتقال للمباراة...</p>
          </>
        )}

        {phase === 'timeout' && (
          <>
            <h2 className="mb-2 font-display text-xl font-bold">لم يتم إيجاد خصم</h2>
            <p className="mb-6 text-sm text-white/50">حاول مرة أخرى أو العب ضد الكمبيوتر</p>
            <button onClick={() => startSearch(difficulty)} className="btn-primary mb-3 w-full">
              إعادة البحث
            </button>
            <Link to="/play/difficulty" className="btn-secondary block w-full text-center">
              ضد الكمبيوتر
            </Link>
          </>
        )}

        {phase === 'error' && (
          <>
            <h2 className="mb-2 font-display text-xl font-bold text-red-400">حدث خطأ</h2>
            <p className="mb-6 text-sm text-white/50">{error}</p>
            <button onClick={() => startSearch(difficulty)} className="btn-primary w-full">
              إعادة المحاولة
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
