import { create } from 'zustand';
import type { MatchState, MatchDelta, AnswerSubmission, AnswerResult } from '../types';
import { remainingMs } from '../utils/time';

interface MatchStore {
  match: MatchState | null;
  polling: boolean;
  lastSequence: number;
  error: string | null;

  setMatch: (match: MatchState) => void;
  applyDelta: (delta: MatchDelta) => void;
  clearMatch: () => void;
  setError: (msg: string | null) => void;
  setPolling: (v: boolean) => void;

  /** Client-side remaining time derived from server timestamps */
  getRemainingMs: () => number;
}

export const useMatchStore = create<MatchStore>((set, get) => ({
  match: null,
  polling: false,
  lastSequence: 0,
  error: null,

  setMatch: (match) =>
    set({
      match,
      lastSequence: match.sequence,
      error: null,
    }),

  applyDelta: (delta) => {
    const current = get().match;
    if (!current || delta.matchId !== current.matchId) return;
    if (delta.sequence <= get().lastSequence) return; // ignore old

    const next: MatchState = {
      ...current,
      sequence: delta.sequence,
      status: delta.status ?? current.status,
      currentRound: delta.currentRound ?? current.currentRound,
      serverNow: delta.serverNow,
      winnerId: delta.winnerId !== undefined ? delta.winnerId : current.winnerId,
      lastAnswerResult:
        delta.lastAnswerResult !== undefined
          ? delta.lastAnswerResult
          : current.lastAnswerResult,
      lastRoundResult:
        delta.lastRoundResult !== undefined
          ? delta.lastRoundResult
          : current.lastRoundResult,
      player: {
        ...current.player,
        score: delta.playerScore ?? current.player.score,
      },
      opponent: current.opponent
        ? {
            ...current.opponent,
            score: delta.opponentScore ?? current.opponent.score,
          }
        : current.opponent,
      round:
        delta.round === null
          ? null
          : delta.round
          ? { ...current.round!, ...delta.round } as any
          : current.round,
    };

    set({ match: next, lastSequence: delta.sequence });
  },

  clearMatch: () => set({ match: null, lastSequence: 0, polling: false, error: null }),

  setError: (error) => set({ error }),

  setPolling: (polling) => set({ polling }),

  getRemainingMs: () => {
    const m = get().match;
    if (!m?.round) return 0;
    return remainingMs(m.round.serverEndAt, m.serverNow);
  },
}));
