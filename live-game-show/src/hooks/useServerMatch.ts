/**
 * Server-backed match lifecycle.
 * Uses Edge Functions + Smart Polling.
 * Falls back is NOT included — caller decides demo vs server via matchId prefix.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createSoloMatch,
  startRound as apiStartRound,
  nextRound as apiNextRound,
  finishMatch as apiFinishMatch,
  submitAnswer as apiSubmitAnswer,
  getMatch,
  type MatchReward,
} from '../services/api/matchApi';
import { applyMatchRewards } from '../services/economy/matchSettlement';
import { track } from '../analytics/events';
import {
  saveActiveMatch,
  clearActiveMatch,
  shouldClearForStatus,
  subscribeOnline,
} from '../services/realtime/reconnect';
import { startMatchRealtime } from '../services/realtime/matchRealtime';
import { useMatchStore } from '../store/matchStore';
import type { Difficulty, MatchState } from '../types';
import { remainingMs } from '../utils/time';

export type ServerMatchPhase =
  | 'idle'
  | 'loading'
  | 'vs'
  | 'playing'
  | 'submitting'
  | 'round_result'
  | 'finished'
  | 'error';

export function useServerMatch() {
  const { match, setMatch, clearMatch } = useMatchStore();
  const [phase, setPhase] = useState<ServerMatchPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastRewards, setLastRewards] = useState<MatchReward | null>(null);
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [reconnecting, setReconnecting] = useState(false);
  const stopRealtimeRef = useRef<(() => void) | null>(null);
  const localTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = () => {
    if (localTimerRef.current) clearInterval(localTimerRef.current);
    localTimerRef.current = null;
    if (stopRealtimeRef.current) {
      stopRealtimeRef.current();
      stopRealtimeRef.current = null;
    }
  };

  const attachRealtime = useCallback((matchId: string) => {
    stopRealtimeRef.current?.();
    stopRealtimeRef.current = startMatchRealtime({
      matchId,
      onState: (state) => {
        setMatch(state);
        if (state.status === 'ROUND_ACTIVE') setPhase('playing');
        if (state.status === 'ROUND_RESULT' || state.status === 'ANSWER_SUBMITTED') {
          // keep playing until we explicitly show result after submit
        }
        if (
          state.status === 'MATCH_FINISHED' ||
          state.status === 'FINAL_RESULT'
        ) {
          setPhase('finished');
          clearTimers();
        }
      },
      onError: (err) => {
        console.warn('[realtime]', err);
      },
    });
  }, [setMatch]);

  const startSolo = useCallback(async (difficulty: Difficulty = 'normal') => {
    clearTimers();
    clearMatch();
    setError(null);
    setPhase('loading');

    try {
      const state = await createSoloMatch(difficulty);
      setMatch(state);
      saveActiveMatch(state.matchId, state.mode);
      track('match_start', { matchId: state.matchId, mode: state.mode });
      setPhase('vs');
      attachRealtime(state.matchId);

      // Auto start first round after VS
      setTimeout(async () => {
        try {
          const started = await apiStartRound(state.matchId);
          setMatch(started);
          setPhase('playing');
          startLocalCountdown();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
          setPhase('error');
        }
      }, 1600);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [attachRealtime, clearMatch, setMatch]);

  const loadMatch = useCallback(async (matchId: string) => {
    clearTimers();
    setError(null);
    setPhase('loading');
    try {
      const state = await getMatch(matchId);
      setMatch(state);
      saveActiveMatch(matchId, state.mode);
      attachRealtime(matchId);
      if (state.status === 'VS' || state.status === 'ROUND_STARTING') {
        setPhase('vs');
        const started = await apiStartRound(matchId);
        setMatch(started);
        setPhase('playing');
        startLocalCountdown();
      } else if (state.status === 'ROUND_ACTIVE') {
        setPhase('playing');
        startLocalCountdown();
      } else if (
        state.status === 'MATCH_FINISHED' ||
        state.status === 'FINAL_RESULT'
      ) {
        setPhase('finished');
      } else {
        setPhase('playing');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [attachRealtime, setMatch]);

  const startLocalCountdown = () => {
    if (localTimerRef.current) clearInterval(localTimerRef.current);
    localTimerRef.current = setInterval(() => {
      const current = useMatchStore.getState().match;
      if (!current?.round || current.status !== 'ROUND_ACTIVE') return;
      // Touch serverNow for UI re-render; authority remains server end time
      setMatch({ ...current, serverNow: new Date().toISOString() });
      const left = remainingMs(current.round.serverEndAt, new Date().toISOString());
      if (left <= 0) {
        // Timeout — submit empty / let server handle on next poll
        // Client shows timeout UX; actual validation is server-side
      }
    }, 250);
  };

  const submitAnswer = useCallback(async (answer: string) => {
    const current = useMatchStore.getState().match;
    if (!current?.round || current.status !== 'ROUND_ACTIVE') return;

    setPhase('submitting');
    try {
      const result = await apiSubmitAnswer({
        matchId: current.matchId,
        roundId: current.round.roundId,
        requestId: `ans-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        answer,
        clientTimestamp: new Date().toISOString(),
      });

      // Optimistic local update
      const updated: MatchState = {
        ...current,
        sequence: current.sequence + 1,
        status: 'ANSWER_SUBMITTED',
        lastAnswerResult: result,
        player: {
          ...current.player,
          score: current.player.score + (result.points + (result.bonus ?? 0)),
        },
        serverNow: new Date().toISOString(),
      };
      setMatch(updated);
      setPhase('round_result');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [setMatch]);

  const goNextRound = useCallback(async () => {
    const current = useMatchStore.getState().match;
    if (!current) return;

    try {
      const next = await apiNextRound(current.matchId);
      setMatch(next);

      if (next.status === 'MATCH_FINISHED' || next.status === 'FINAL_RESULT') {
        const settled = await apiFinishMatch(current.matchId);
        setMatch(settled.match);
        const applied = applyMatchRewards(settled.rewards);
        setLastRewards(applied ?? null);
        clearActiveMatch();
        setPhase('finished');
        clearTimers();
        return;
      }

      const started = await apiStartRound(current.matchId);
      setMatch(started);
      setPhase('playing');
      startLocalCountdown();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [setMatch]);

  const endMatch = useCallback(async () => {
    const current = useMatchStore.getState().match;
    if (!current) return;
    try {
      const finished = await apiFinishMatch(current.matchId);
      setMatch(finished.match);
      const applied = applyMatchRewards(finished.rewards);
      setLastRewards(applied ?? null);
      clearActiveMatch();
      track('match_finish', { matchId: current.matchId });
      setPhase('finished');
      clearTimers();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [setMatch]);

  const reset = useCallback(() => {
    clearTimers();
    clearMatch();
    setPhase('idle');
    setError(null);
    setLastRewards(null);
    clearActiveMatch();
  }, [clearMatch]);


  useEffect(() => subscribeOnline(setOnline), []);

  const reconnect = useCallback(async () => {
    const current = useMatchStore.getState().match;
    if (!current?.matchId) return;
    setReconnecting(true);
    setError(null);
    try {
      const state = await getMatch(current.matchId);
      setMatch(state);
      if (shouldClearForStatus(state.status)) {
        clearActiveMatch();
        setPhase('finished');
        clearTimers();
      } else {
        saveActiveMatch(state.matchId, state.mode);
        attachRealtime(state.matchId);
        if (state.status === 'ROUND_ACTIVE') {
          setPhase('playing');
          startLocalCountdown();
        } else if (state.status === 'VS' || state.status === 'ROUND_STARTING') {
          setPhase('vs');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReconnecting(false);
    }
  }, [attachRealtime, setMatch]);

  useEffect(() => () => clearTimers(), []);

  return {
    match,
    phase,
    error,
    lastRewards,
    online,
    reconnecting,
    reconnect,
    startSolo,
    loadMatch,
    submitAnswer,
    goNextRound,
    endMatch,
    reset,
    remainingMs: match?.round
      ? remainingMs(match.round.serverEndAt, match.serverNow)
      : 0,
  };
}
