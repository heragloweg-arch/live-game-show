import { useCallback, useEffect, useRef, useState } from 'react';
import {
  joinMatchmaking,
  cancelMatchmaking,
  getMatchmakingStatus,
  type MatchmakingStatus,
} from '../services/api/matchApi';
import type { Difficulty } from '../types';

export type MmPhase = 'idle' | 'searching' | 'matched' | 'timeout' | 'error';

export function useMatchmaking() {
  const [phase, setPhase] = useState<MmPhase>('idle');
  const [matchId, setMatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waitedMs, setWaitedMs] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startSearch = useCallback(async (difficulty: Difficulty = 'normal') => {
    setError(null);
    setMatchId(null);
    setPhase('searching');
    setWaitedMs(0);

    try {
      const res = await joinMatchmaking(difficulty);
      if (res.status === 'matched') {
        const id = res.matchId ?? res.match?.matchId ?? null;
        setMatchId(id);
        setPhase('matched');
        return;
      }
      // Start polling status
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const st = await getMatchmakingStatus();
          if (st.status === 'matched') {
            stopPolling();
            const id = (st as any).matchId ?? (st as any).match?.matchId ?? null;
            setMatchId(id);
            setPhase('matched');
          } else if (st.status === 'timeout') {
            stopPolling();
            setPhase('timeout');
          } else if (st.status === 'queued' && st.waitedMs) {
            setWaitedMs(st.waitedMs);
          }
        } catch (e) {
          console.warn('[mm poll]', e);
        }
      }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, []);

  const cancel = useCallback(async () => {
    stopPolling();
    try {
      await cancelMatchmaking();
    } catch {
      /* ignore */
    }
    setPhase('idle');
    setMatchId(null);
    setWaitedMs(0);
  }, []);

  useEffect(() => () => stopPolling(), []);

  return { phase, matchId, error, waitedMs, startSearch, cancel };
}
