/**
 * Smart Polling Protocol
 *
 * - Sequence number per match state
 * - Delta updates preferred
 * - Exponential backoff on errors / weak network
 * - Automatic stop when match is inactive
 * - Server timestamp is the only time authority
 */

import type { MatchDelta, MatchState } from '../../types';

export type PollHandler = (delta: MatchDelta) => void;
export type ErrorHandler = (error: Error) => void;

export interface SmartPollingOptions {
  matchId: string;
  /** Initial interval in ms */
  intervalMs?: number;
  maxIntervalMs?: number;
  /** Called to fetch the latest state/delta from the server */
  fetcher: (matchId: string, lastSequence: number) => Promise<MatchDelta | MatchState | null>;
  onDelta: PollHandler;
  onError?: ErrorHandler;
  /** Stop polling when status is one of these */
  stopOnStatuses?: string[];
}

const DEFAULT_STOP = ['MATCH_FINISHED', 'FINAL_RESULT', 'MATCH_TERMINATED'];

export class SmartPoller {
  private matchId: string;
  private intervalMs: number;
  private maxIntervalMs: number;
  private currentInterval: number;
  private lastSequence = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private consecutiveErrors = 0;
  private fetcher: SmartPollingOptions['fetcher'];
  private onDelta: PollHandler;
  private onError?: ErrorHandler;
  private stopOnStatuses: string[];

  constructor(opts: SmartPollingOptions) {
    this.matchId = opts.matchId;
    this.intervalMs = opts.intervalMs ?? 1000;
    this.maxIntervalMs = opts.maxIntervalMs ?? 8000;
    this.currentInterval = this.intervalMs;
    this.fetcher = opts.fetcher;
    this.onDelta = opts.onDelta;
    this.onError = opts.onError;
    this.stopOnStatuses = opts.stopOnStatuses ?? DEFAULT_STOP;
  }

  start(initialSequence = 0) {
    this.stopped = false;
    this.lastSequence = initialSequence;
    this.currentInterval = this.intervalMs;
    this.consecutiveErrors = 0;
    this.schedule();
  }

  stop() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule() {
    if (this.stopped) return;
    this.timer = setTimeout(() => this.tick(), this.currentInterval);
  }

  private async tick() {
    if (this.stopped) return;

    try {
      const data = await this.fetcher(this.matchId, this.lastSequence);

      if (!data) {
        this.backoff();
        this.schedule();
        return;
      }

      // Normalize full state into a delta-like shape
      const delta: MatchDelta =
        'deltaType' in data
          ? (data as MatchDelta)
          : {
              matchId: (data as MatchState).matchId,
              sequence: (data as MatchState).sequence,
              status: (data as MatchState).status,
              currentRound: (data as MatchState).currentRound,
              round: (data as MatchState).round,
              playerScore: (data as MatchState).player.score,
              opponentScore: (data as MatchState).opponent?.score,
              lastAnswerResult: (data as MatchState).lastAnswerResult,
              lastRoundResult: (data as MatchState).lastRoundResult,
              winnerId: (data as MatchState).winnerId,
              serverNow: (data as MatchState).serverNow,
              deltaType: 'full',
            };

      if (delta.sequence > this.lastSequence) {
        this.lastSequence = delta.sequence;
        this.onDelta(delta);
        this.consecutiveErrors = 0;
        this.currentInterval = this.intervalMs; // reset on success

        if (delta.status && this.stopOnStatuses.includes(delta.status)) {
          this.stop();
          return;
        }
      }
    } catch (err) {
      this.consecutiveErrors += 1;
      this.onError?.(err instanceof Error ? err : new Error(String(err)));
      this.backoff();
    }

    this.schedule();
  }

  private backoff() {
    // 1s → 2s → 4s → 8s (capped)
    this.currentInterval = Math.min(
      this.currentInterval * 2,
      this.maxIntervalMs
    );
  }

  getLastSequence() {
    return this.lastSequence;
  }

  isRunning() {
    return !this.stopped && this.timer !== null;
  }
}
