/**
 * Realtime Contract + Smart Polling against the server.
 *
 * Protocol:
 * - Client holds lastSequence
 * - Polls GET match state (via matchApi.getMatch) at controlled interval
 * - Server returns full state with sequence + serverNow
 * - Client applies only if sequence > lastSequence
 * - Backoff on errors: 1s → 2s → 4s → 8s (cap)
 * - Stop when status ∈ terminal states
 * - Server timestamps are the only time authority
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

/**
 * Convert full MatchState into a MatchDelta for the poller.
 */
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
  };
}

/**
 * Start server-backed smart polling for a match.
 * Returns a stop function.
 */
export function startMatchRealtime(opts: MatchRealtimeOptions): () => void {
  const poller = new SmartPoller({
    matchId: opts.matchId,
    intervalMs: opts.intervalMs ?? 1000,
    maxIntervalMs: opts.maxIntervalMs ?? 8000,
    stopOnStatuses: [...TERMINAL_STATUSES],
    fetcher: async (matchId, _lastSeq) => {
      const state = await getMatch(matchId);
      return stateToDelta(state);
    },
    onDelta: (delta) => {
      // Re-fetch full state to keep client shape consistent
      getMatch(opts.matchId)
        .then((state) => {
          if (state.sequence >= delta.sequence) {
            opts.onState(state);
          }
        })
        .catch((e) => opts.onError?.(e instanceof Error ? e : new Error(String(e))));
    },
    onError: (err) => opts.onError?.(err),
  });

  poller.start(0);

  return () => poller.stop();
}

/**
 * Realtime Contract — documented event shapes the server may emit
 * (via polling delta or future Realtime channel for rooms).
 */
export type ServerMatchEvent =
  | { type: 'MATCH_FOUND'; match: MatchState }
  | { type: 'MATCH_STARTED'; matchId: string; serverNow: string }
  | { type: 'ROUND_STARTED'; matchId: string; round: MatchState['round']; sequence: number }
  | { type: 'ANSWER_RESULT'; matchId: string; result: NonNullable<MatchState['lastAnswerResult']>; sequence: number }
  | { type: 'ROUND_RESULT'; matchId: string; result: NonNullable<MatchState['lastRoundResult']>; sequence: number }
  | { type: 'NEXT_ROUND'; matchId: string; currentRound: number; sequence: number }
  | { type: 'MATCH_FINISHED'; matchId: string; winnerId: string | null; sequence: number }
  | { type: 'RECONNECT_STATE'; match: MatchState }
  | { type: 'ERROR'; code: string; message: string };
