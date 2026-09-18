import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Zap, Trophy, Play } from 'lucide-react';
import confetti from 'canvas-confetti';
import { cn } from '../../utils/cn';
import { formatCountdown } from '../../utils/time';
import {
  startRoomChallenge,
  getRoomChallengeState,
  submitRoomAnswer,
  revealRoomRound,
  getRoomLeaderboard,
  type RoomRoundState,
} from '../../services/livekit/roomChallengeApi';

interface Props {
  roomId: string;
  isHost: boolean;
}

export function RoomChallengePanel({ roomId, isHost }: Props) {
  const [round, setRound] = useState<RoomRoundState | null>(null);
  const [serverNow, setServerNow] = useState(new Date().toISOString());
  const [answer, setAnswer] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    outcome: string;
    points: number;
    bonus: number;
  } | null>(null);
  const [board, setBoard] = useState<
    { userId: string; name: string; score: number }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = round?.serverEndAt
    ? Math.max(0, new Date(round.serverEndAt).getTime() - new Date(serverNow).getTime())
    : 0;

  const poll = useCallback(async () => {
    try {
      const state = await getRoomChallengeState(roomId);
      setServerNow(state.serverNow);
      if (state.round) {
        setRound(state.round);
      } else if (round?.status === 'active') {
        // round ended remotely
        setRound(null);
      }
    } catch {
      /* network blip */
    }
  }, [roomId, round?.status]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 1500);
    return () => clearInterval(t);
  }, [poll]);

  useEffect(() => {
    if (!round) return;
    const t = setInterval(() => setServerNow(new Date().toISOString()), 250);
    return () => clearInterval(t);
  }, [round?.id]);

  const onStart = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setAnswer('');
    setSelected(null);
    try {
      const { round: r } = await startRoomChallenge(roomId);
      setRound(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async () => {
    if (!round) return;
    const value = round.challenge.choices ? selected ?? '' : answer.trim();
    if (!value) return;
    setSubmitting(true);
    try {
      const { result: res } = await submitRoomAnswer({
        roomId,
        roomRoundId: round.id,
        requestId: `ra-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        answer: value,
        clientTimestamp: new Date().toISOString(),
      });
      setResult({
        outcome: res.outcome,
        points: res.points,
        bonus: res.bonus,
      });
      if (res.outcome === 'correct') {
        confetti({ particleCount: 50, spread: 55, origin: { y: 0.75 }, colors: ['#22c55e', '#eab308'] });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const onReveal = async () => {
    if (!round) return;
    setBusy(true);
    try {
      await revealRoomRound(roomId, round.id);
      const { leaderboard } = await getRoomLeaderboard(roomId);
      setBoard(leaderboard);
      setRound({ ...round, status: 'revealed' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Host controls */}
      {isHost && (
        <div className="flex gap-2">
          <button
            onClick={onStart}
            disabled={busy || round?.status === 'active'}
            className="btn-primary flex-1 gap-2 py-3 text-sm"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {round?.status === 'active' ? 'جولة جارية...' : 'ابدأ تحدي جديد'}
          </button>
          {round?.status === 'active' && (
            <button onClick={onReveal} disabled={busy} className="btn-secondary px-4 py-3 text-sm">
              كشف النتائج
            </button>
          )}
        </div>
      )}

      <AnimatePresence mode="wait">
        {round && (round.status === 'active' || round.status === 'revealed') && (
          <motion.div
            key={round.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="card p-5"
          >
            <div className="mb-2 flex items-center justify-between text-xs text-zatona-400">
              <span className="flex items-center gap-1 font-semibold">
                <Zap className="h-3.5 w-3.5" />
                جولة {round.roundNumber} · {round.challenge.type}
              </span>
              {round.status === 'active' && (
                <span className={cn(remaining < 4000 && 'font-bold text-red-400')}>
                  {formatCountdown(remaining)}
                </span>
              )}
            </div>

            <h3 className="mb-4 text-center font-display text-lg font-bold leading-relaxed">
              {round.challenge.prompt}
            </h3>

            {round.status === 'active' && !result && (
              <>
                <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      remaining < 4000 ? 'bg-red-500' : 'bg-zatona-500'
                    )}
                    style={{
                      width: `${Math.max(0, (remaining / (round.challenge.timeLimitMs || 15000)) * 100)}%`,
                    }}
                  />
                </div>

                {round.challenge.choices ? (
                  <div className="grid gap-2">
                    {round.challenge.choices.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelected(c.id)}
                        className={cn(
                          'rounded-xl border px-3 py-2.5 text-right text-sm transition-all',
                          selected === c.id
                            ? 'border-zatona-500 bg-zatona-500/20'
                            : 'border-white/10 bg-white/5'
                        )}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                    placeholder="إجابتك..."
                    className="input-field text-center"
                    dir="rtl"
                  />
                )}

                <button
                  onClick={onSubmit}
                  disabled={submitting || (round.challenge.choices ? !selected : !answer.trim())}
                  className="btn-primary mt-3 w-full py-3 text-sm"
                >
                  {submitting ? 'جاري الإرسال...' : 'إرسال'}
                </button>
              </>
            )}

            {result && (
              <div className="text-center">
                <p
                  className={cn(
                    'font-display text-xl font-bold',
                    result.outcome === 'correct' ? 'text-zatona-400' : 'text-red-400'
                  )}
                >
                  {result.outcome === 'correct' ? 'صحيح! 🎉' : result.outcome === 'timeout' ? 'انتهى الوقت' : 'خطأ'}
                </p>
                {result.points + result.bonus > 0 && (
                  <p className="mt-1 text-sm text-white/50">
                    +{result.points + result.bonus} نقطة
                  </p>
                )}
              </div>
            )}

            {round.status === 'revealed' && board.length > 0 && (
              <div className="mt-4 border-t border-white/5 pt-4">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gold-400">
                  <Trophy className="h-3.5 w-3.5" />
                  ترتيب الغرفة
                </div>
                <div className="space-y-1.5">
                  {board.slice(0, 5).map((e, i) => (
                    <div
                      key={e.userId}
                      className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-sm"
                    >
                      <span className="w-5 text-xs text-white/40">{i + 1}</span>
                      <span className="flex-1 truncate">{e.name}</span>
                      <span className="font-bold text-zatona-400">{e.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {!round && !isHost && (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/35">
            في انتظار المضيف لبدء التحدي...
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
