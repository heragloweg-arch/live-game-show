import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Zap } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useSoloMatch } from '../../hooks/useSoloMatch';
import { useServerMatch } from '../../hooks/useServerMatch';
import { grantMatchReward } from '../../services/economy/walletApi';
import { useWalletStore } from '../../store/walletStore';
import { useAuthStore } from '../../store/authStore';
import type { Difficulty } from '../../types';
import { cn } from '../../utils/cn';
import { FLAGS } from '../../config/flags';
import { formatCountdown } from '../../utils/time';

function isServerMatchId(id: string | undefined): boolean {
  if (!id) return false;
  // UUID v4 shape from server
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function MatchScreen() {
  const { matchId } = useParams();
  const [search] = useSearchParams();
  const difficulty = (search.get('diff') as Difficulty) || 'normal';
  const canLocal =
    FLAGS.enableLocalDemo &&
    !!matchId &&
    (matchId === 'solo-demo' || matchId.startsWith('solo'));
  const useServer = isServerMatchId(matchId) || !canLocal;

  const local = useSoloMatch();
  const server = useServerMatch();

  // Production: server path. Local engine only with VITE_ENABLE_LOCAL_DEMO=true
  const active = useServer && !canLocal ? server : canLocal ? local : server;
  const match = active.match;
  const phase = active.phase as string;
  const remaining = active.remainingMs;
  const creditLocal = useWalletStore((s) => s.creditLocal);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const [answer, setAnswer] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);

  useEffect(() => {
    if (canLocal) {
      local.startSolo(difficulty);
    } else if (matchId && isServerMatchId(matchId)) {
      server.loadMatch(matchId);
    } else if (matchId && matchId !== 'solo-demo') {
      // Non-uuid ids: try server load
      server.loadMatch(matchId);
    }
    return () => {
      local.reset();
      server.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  useEffect(() => {
    if (match?.lastAnswerResult?.outcome === 'correct') {
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#22c55e', '#eab308', '#22d3ee'],
      });
    }
  }, [match?.lastAnswerResult]);

  // Grant wallet reward when match finishes (server path)
  useEffect(() => {
    if (phase === 'finished' && match && useServer) {
      const won = match.winnerId === match.player?.id;
      grantMatchReward(match.matchId, won)
        .then((w) => {
          useWalletStore.getState().setWallet(w);
          void refreshProfile();
        })
        .catch(() => {
          // optimistic local credit if API fails
          creditLocal(won ? 50 : 15);
        });
    }
    if (phase === 'finished' && match && !useServer) {
      const won = match.winnerId === match.player?.id;
      creditLocal(won ? 50 : 15);
    }
  }, [phase, match?.matchId]);

  const handleSubmit = () => {
    const value = match?.round?.challenge?.choices
      ? selectedChoice ?? ''
      : answer.trim();
    if (!value) return;
    active.submitAnswer(value);
    setAnswer('');
    setSelectedChoice(null);
  };

  const handleNext = () => {
    if (useServer) {
      server.goNextRound();
    } else {
      local.nextRound();
    }
  };

  if ((phase === 'idle' || phase === 'loading') && !match) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-white/50">جاري تجهيز المباراة...</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <p className="text-red-400">{(active as any).error ?? 'حدث خطأ'}</p>
        <Link to="/home" className="btn-primary">العودة</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-900">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <Link to="/home" className="btn-ghost p-2" onClick={() => active.reset()}>
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-2 text-sm text-white/50">
          <Zap className="h-4 w-4 text-zatona-400" />
          جولة {match?.currentRound ?? 1} / {match?.totalRounds ?? 5}
          {useServer && <span className="text-[10px] text-zatona-500">SERVER</span>}
        </div>
        <div className="w-9" />
      </header>


      {useServer && (server as any).online === false && (
        <div className="flex items-center justify-between bg-amber-500/15 px-4 py-2 text-xs text-amber-200">
          <span>انقطع الاتصال — نحاول المزامنة مع السيرفر</span>
          <button
            type="button"
            className="rounded-lg bg-white/10 px-2 py-1 font-semibold"
            onClick={() => (server as any).reconnect?.()}
          >
            {(server as any).reconnecting ? '...' : 'إعادة الاتصال'}
          </button>
        </div>
      )}

      <div className="flex items-center justify-around px-6 py-5">
        <PlayerBadge
          name={match?.player?.username ?? 'أنت'}
          score={match?.player?.score ?? 0}
          side="player"
          highlight={phase === 'round_result' && match?.lastAnswerResult?.outcome === 'correct'}
        />
        <div className="font-display text-2xl font-black text-zatona-400">VS</div>
        <PlayerBadge
          name={match?.opponent?.username ?? 'AI'}
          score={match?.opponent?.score ?? 0}
          side="opponent"
        />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-5 pb-8">
        <AnimatePresence mode="wait">
          {(phase === 'vs' || phase === 'loading') && (
            <motion.div
              key="vs"
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <p className="mb-2 text-sm text-white/50">استعد</p>
              <h2 className="font-display text-4xl font-black text-gradient">VS</h2>
              <p className="mt-3 text-white/60">{match?.opponent?.username}</p>
            </motion.div>
          )}

          {(phase === 'playing' || phase === 'submitting' || phase === 'round_result') && match?.round && (
            <motion.div
              key={'round-' + match.currentRound}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="card w-full max-w-md p-6"
            >
              <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-zatona-400">
                {match.round.challenge?.type === 'speed' && 'سرعة ⚡'}
                {match.round.challenge?.type === 'words' && 'كلمات'}
                {match.round.challenge?.type === 'knowledge' && 'معرفة'}
                {match.round.challenge?.type === 'mystery' && 'غامض ❓'}
                {' · '}
                {match.round.challenge?.difficulty}
              </p>

              <h2 className="mb-6 text-center font-display text-xl font-bold leading-relaxed text-white">
                {match.round.challenge?.prompt}
              </h2>

              {phase === 'playing' && (
                <div className="mb-5">
                  <div className="mb-1.5 flex justify-between text-xs text-white/40">
                    <span>الوقت</span>
                    <span className={cn(remaining < 4000 && 'text-red-400 font-bold')}>
                      {formatCountdown(remaining)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-200',
                        remaining < 4000 ? 'bg-red-500' : 'bg-zatona-500'
                      )}
                      style={{
                        width:
                          Math.max(
                            0,
                            (remaining / (match.round.challenge?.timeLimitMs ?? 15000)) * 100
                          ) + '%',
                      }}
                    />
                  </div>
                </div>
              )}

              {phase === 'playing' && (
                <>
                  {match.round.challenge?.choices ? (
                    <div className="grid gap-2">
                      {match.round.challenge.choices.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setSelectedChoice(c.id)}
                          className={cn(
                            'rounded-xl border px-4 py-3 text-right transition-all',
                            selectedChoice === c.id
                              ? 'border-zatona-500 bg-zatona-500/20 text-white'
                              : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'
                          )}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                      placeholder="اكتب إجابتك هنا..."
                      className="input-field text-center text-lg"
                      dir="rtl"
                      autoFocus
                    />
                  )}
                  <button
                    onClick={handleSubmit}
                    disabled={
                      match.round.challenge?.choices ? !selectedChoice : !answer.trim()
                    }
                    className="btn-primary mt-4 w-full"
                  >
                    إرسال الإجابة
                  </button>
                </>
              )}

              {phase === 'submitting' && (
                <p className="text-center text-white/50">جاري التحقق...</p>
              )}

              {phase === 'round_result' && (
                <div className="mt-2 text-center">
                  <p
                    className={cn(
                      'mb-3 font-display text-2xl font-bold',
                      match.lastAnswerResult?.outcome === 'correct'
                        ? 'text-zatona-400'
                        : 'text-red-400'
                    )}
                  >
                    {match.lastAnswerResult?.outcome === 'correct' && 'إجابة صحيحة! 🎉'}
                    {match.lastAnswerResult?.outcome === 'wrong' && 'إجابة خاطئة'}
                    {match.lastAnswerResult?.outcome === 'timeout' && 'انتهى الوقت'}
                  </p>
                  {match.lastAnswerResult &&
                    match.lastAnswerResult.points + (match.lastAnswerResult.bonus ?? 0) > 0 && (
                      <p className="mb-4 text-sm text-white/60">
                        +{match.lastAnswerResult.points + (match.lastAnswerResult.bonus ?? 0)} نقطة
                      </p>
                    )}
                  <button onClick={handleNext} className="btn-primary w-full">
                    {(match.currentRound ?? 1) >= (match.totalRounds ?? 5)
                      ? 'النتيجة النهائية'
                      : 'الجولة التالية'}
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {phase === 'finished' && match && (
            <motion.div
              key="final"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="card w-full max-w-md p-8 text-center"
            >
              <h2 className="mb-2 font-display text-3xl font-black text-gradient">
                {match.winnerId === match.player?.id
                  ? 'فوز! 🏆'
                  : match.winnerId === null
                  ? 'تعادل'
                  : 'خسارة'}
              </h2>
              <p className="mb-2 text-white/60">
                {match.player?.score ?? 0} — {match.opponent?.score ?? 0}
              </p>
              <div className="mb-6 space-y-1 text-sm">
                <p className="text-gold-400">
                  +
                  {(server as any).lastRewards?.coinGain ??
                    (match.winnerId === match.player?.id ? 50 : 15)}{' '}
                  عملة
                </p>
                <p className="text-zatona-400/90">
                  +
                  {(server as any).lastRewards?.xpGain ??
                    (match.winnerId === match.player?.id ? 50 : 20)}{' '}
                  XP
                </p>
              </div>
              <div className="flex flex-col gap-3">
                {!useServer && (
                  <button
                    onClick={() => local.startSolo(difficulty)}
                    className="btn-primary w-full"
                  >
                    إعادة المباراة
                  </button>
                )}
                {useServer && (
                  <button
                    onClick={() => server.startSolo(difficulty)}
                    className="btn-primary w-full"
                  >
                    مباراة جديدة (سيرفر)
                  </button>
                )}
                <Link
                  to="/home"
                  onClick={() => active.reset()}
                  className="btn-secondary w-full text-center"
                >
                  العودة للرئيسية
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PlayerBadge({
  name,
  score,
  side,
  highlight,
}: {
  name: string;
  score: number;
  side: 'player' | 'opponent';
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full border-2 text-lg font-bold transition-all',
          side === 'player'
            ? 'border-zatona-500 bg-zatona-500/10 text-zatona-400'
            : 'border-white/20 bg-white/5 text-white/80',
          highlight && 'scale-110 shadow-glow'
        )}
      >
        {name[0]}
      </div>
      <span className="max-w-[80px] truncate text-sm font-medium text-white/80">{name}</span>
      <span className="font-display text-xl font-bold text-zatona-400">{score}</span>
    </div>
  );
}
