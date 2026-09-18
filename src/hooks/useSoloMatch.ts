import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchState, AnswerSubmission, Difficulty } from '../types';
import {
  createSoloMatch,
  startRound,
  submitPlayerAnswer,
  resolveRoundWithAi,
  advanceToNextRound,
  finishMatch,
  handlePlayerTimeout,
} from '../services/game/matchEngine';
import { useMatchStore } from '../store/matchStore';
import { useAuthStore } from '../store/authStore';
import { remainingMs } from '../utils/time';

/**
 * High-level hook that runs a complete Solo vs AI match
 * using the local Match Engine (perfect for demo & offline).
 * Later the same UI will switch to Smart Polling against real Edge Functions.
 */
export function useSoloMatch() {
  const user = useAuthStore((s) => s.user);
  const { match, setMatch, clearMatch } = useMatchStore();
  const [phase, setPhase] = useState<'idle' | 'vs' | 'playing' | 'round_result' | 'finished'>('idle');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    timerRef.current = null;
    aiTimeoutRef.current = null;
  };

  const startSolo = useCallback(
    (difficulty: Difficulty = 'normal') => {
      if (!user) return;
      clearTimers();
      clearMatch();

      const m = createSoloMatch({
        userId: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        difficulty,
      });
      setMatch(m);
      setPhase('vs');

      // Auto-start first round after VS animation
      setTimeout(() => {
        const started = startRound(m);
        setMatch(started);
        setPhase('playing');
        startCountdown(started);
      }, 1800);
    },
    [user, setMatch, clearMatch]
  );

  const startCountdown = (m: MatchState) => {
    clearTimers();
    timerRef.current = setInterval(() => {
      const current = useMatchStore.getState().match;
      if (!current?.round || current.status !== 'ROUND_ACTIVE') return;

      const left = remainingMs(current.round.serverEndAt, new Date().toISOString());
      // Force a re-render by touching serverNow
      setMatch({ ...current, serverNow: new Date().toISOString() });

      if (left <= 0) {
        clearTimers();
        onTimeout();
      }
    }, 250);
  };

  const onTimeout = () => {
    const current = useMatchStore.getState().match;
    if (!current) return;
    const timed = handlePlayerTimeout(current);
    setMatch(timed);
    // Resolve AI after short delay
    aiTimeoutRef.current = setTimeout(() => {
      const withAi = resolveRoundWithAi(timed);
      setMatch(withAi);
      setPhase('round_result');
    }, 600);
  };

  const submitAnswer = useCallback(
    (answer: string) => {
      const current = useMatchStore.getState().match;
      if (!current || current.status !== 'ROUND_ACTIVE') return;

      clearTimers();

      const submission: AnswerSubmission = {
        requestId: `ans-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        matchId: current.matchId,
        roundId: current.round!.roundId,
        answer,
        clientTimestamp: new Date().toISOString(),
      };

      const { match: afterSubmit } = submitPlayerAnswer(current, submission);
      setMatch(afterSubmit);

      // Let AI answer
      aiTimeoutRef.current = setTimeout(() => {
        const withAi = resolveRoundWithAi(afterSubmit);
        setMatch(withAi);
        setPhase('round_result');
      }, 700);
    },
    [setMatch]
  );

  const nextRound = useCallback(() => {
    const current = useMatchStore.getState().match;
    if (!current) return;

    const advanced = advanceToNextRound(current);
    setMatch(advanced);

    if (advanced.status === 'MATCH_FINISHED') {
      setPhase('finished');
      return;
    }

    // Start the new round
    setTimeout(() => {
      const started = startRound(advanced);
      setMatch(started);
      setPhase('playing');
      startCountdown(started);
    }, 900);
  }, [setMatch]);

  const endMatch = useCallback(() => {
    const current = useMatchStore.getState().match;
    if (!current) return;
    const finished = finishMatch(current);
    setMatch(finished);
    setPhase('finished');
    clearTimers();
  }, [setMatch]);

  const reset = useCallback(() => {
    clearTimers();
    clearMatch();
    setPhase('idle');
  }, [clearMatch]);

  useEffect(() => {
    return () => clearTimers();
  }, []);

  return {
    match,
    phase,
    startSolo,
    submitAnswer,
    nextRound,
    endMatch,
    reset,
    remainingMs: match?.round
      ? remainingMs(match.round.serverEndAt, match.serverNow)
      : 0,
  };
}
