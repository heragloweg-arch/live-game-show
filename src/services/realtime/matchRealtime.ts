/**
 * Realtime Contract + Smart Polling (single request per tick).
 * Fetcher returns full MatchState; no second getMatch on delta.
 */

import { SmartPoller } from '../api/smartPolling';
import { getMatch } from '../api/matchApi';
import type { MatchState, MatchDelta } from '../../types';

export const TERMINAL_STATUSES = [
  'MATCH_FINISHED',
  'FINAL_RESULT',
  'MATCH_TERMINATED',
] as const;

export interface MatchRealtimeOptions {
  matchId: string;
  onState: (state: MatchState) => void;
  onError?: (err: Error) => void;
  intervalMs?: number;
  maxIntervalMs?: number;
}

function stateToDelta(state: MatchState): MatchDelta {
  return {
    matchId: state.matchId,
    sequence: state.sequence,
    status: state.status,
    currentRound: state.currentRound,
    round: state.round,
    playerScore: state.player?.score,
    opponentScore: state.opponent?.score,
    lastAnswerResult: state.lastAnswerResult,
    lastRoundResult: state.lastRoundResult,
    winnerId: state.winnerId,
    serverNow: state.serverNow,
    deltaType: 'full',
    /** full state attached once — consumer should use onState path */
    _full: state,
  } as MatchDelta & { _full?: MatchState };
}

export function startMatchRealtime(opts: MatchRealtimeOptions): () => void {
  const lastFull = { current: null as MatchState | null };

  const poller = new SmartPoller({
    matchId: opts.matchId,
    intervalMs: opts.intervalMs ?? 1000,
    maxIntervalMs: opts.maxIntervalMs ?? 8000,
    stopOnStatuses: [...TERMINAL_STATUSES],
    fetcher: async (matchId) => {
      const state = await getMatch(matchId);
      lastFull.current = state;
      return stateToDelta(state);
    },
    onDelta: (delta) => {
      const full =
        (delta as MatchDelta & { _full?: MatchState })._full ?? lastFull.current;
      if (full && full.sequence >= delta.sequence) {
        opts.onState(full);
      }
    },
    onError: (err) => opts.onError?.(err),
  });

  poller.start(0);
  return () => poller.stop();
}

export const MatchRealtimeContract = {
  transport: 'HTTP Smart Polling (single getMatch per tick)',
  roomsTransport: 'Supabase Realtime Channels',
  sequenceAuthority: 'server',
  timeAuthority: 'serverNow / server_start_at / server_end_at',
} as const;
