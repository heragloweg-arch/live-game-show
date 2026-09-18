/**
 * Client-side Match Engine (Demo + Production contract).
 *
 * In production the real authority is Supabase Edge Functions.
 * This engine:
 *  - Runs a complete Solo vs AI match locally for development & offline demo.
 *  - Exposes the exact same state shape the real Smart Polling will deliver.
 *  - Never lets the client "decide" the final winner when connected to server.
 */

import type {
  MatchState,
  RoundState,
  Challenge,
  AnswerSubmission,
  AnswerResult,
  RoundResult,
  Difficulty,
  MatchStatus,
} from '../../types';
import { buildMatchChallenges, validateAnswer } from './challengeBank';
import { calculateScore } from './scoring';
import { decideAiAnswer, getAiConfig } from './aiOpponent';
import { normalizeArabic } from '../../utils/arabicNormalizer';
import { useConfigStore } from '../../store/configStore';

function nowIso(): string {
  return new Date().toISOString();
}

function addMs(iso: string, ms: number): string {
  return new Date(new Date(iso).getTime() + ms).toISOString();
}

function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export interface CreateSoloMatchOptions {
  userId: string;
  username: string;
  avatarUrl?: string | null;
  difficulty: Difficulty;
}

export function createSoloMatch(opts: CreateSoloMatchOptions): MatchState {
  const matchId = `solo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const seed = hashSeed(matchId);
  const challenges = buildMatchChallenges(seed);
  const first = challenges[0];
  const start = nowIso();

  const round: RoundState = {
    roundId: `${matchId}-r1`,
    matchId,
    roundNumber: 1,
    challenge: first,
    status: 'pending',
    serverStartAt: start,
    serverEndAt: addMs(start, first.timeLimitMs),
    sequence: 1,
  };

  return {
    matchId,
    mode: 'solo',
    status: 'VS',
    sequence: 1,
    currentRound: 1,
    totalRounds: 5,
    player: {
      id: opts.userId,
      username: opts.username,
      avatarUrl: opts.avatarUrl ?? null,
      score: 0,
      side: 'player',
    },
    opponent: {
      id: 'ai-opponent',
      username: `AI (${opts.difficulty})`,
      avatarUrl: null,
      score: 0,
      side: 'ai',
      isAi: true,
    },
    round,
    lastAnswerResult: null,
    lastRoundResult: null,
    winnerId: null,
    serverNow: start,
    createdAt: start,
    startedAt: null,
    endedAt: null,
    // internal (not in public type, but useful for demo engine)
    ...({ _challenges: challenges, _difficulty: opts.difficulty, _seed: seed } as any),
  };
}

export function startRound(match: MatchState): MatchState {
  if (!match.round) return match;
  const start = nowIso();
  const timeLimit = match.round.challenge.timeLimitMs;

  return {
    ...match,
    status: 'ROUND_ACTIVE',
    sequence: match.sequence + 1,
    startedAt: match.startedAt ?? start,
    serverNow: start,
    round: {
      ...match.round,
      status: 'active',
      serverStartAt: start,
      serverEndAt: addMs(start, timeLimit),
      sequence: match.sequence + 1,
    },
  };
}

export function submitPlayerAnswer(
  match: MatchState,
  submission: AnswerSubmission
): { match: MatchState; result: AnswerResult } {
  if (!match.round || match.status !== 'ROUND_ACTIVE') {
    throw new Error('No active round');
  }

  const challenge = match.round.challenge;
  const responseTimeMs =
    new Date(submission.clientTimestamp).getTime() -
    new Date(match.round.serverStartAt).getTime();

  const validation = validateAnswer(challenge.id, submission.answer, normalizeArabic);
  const outcome = validation.correct ? 'correct' : 'wrong';

  const config = useConfigStore.getState().config.scoring;
  const score = calculateScore({
    outcome,
    responseTimeMs: Math.max(0, responseTimeMs),
    timeLimitMs: challenge.timeLimitMs,
    difficulty: challenge.difficulty,
    challengeType: challenge.type,
    config: {
      baseCorrect: config.baseCorrect,
      speedBonusMax: config.speedBonusMax,
      difficultyMultiplier: config.difficultyMultiplier,
    },
  });

  const result: AnswerResult = {
    requestId: submission.requestId,
    outcome,
    points: score.points,
    bonus: score.bonus,
    serverValidatedAt: nowIso(),
    normalizedAnswer: normalizeArabic(submission.answer),
  };

  const newPlayerScore = match.player.score + score.total;

  const next: MatchState = {
    ...match,
    sequence: match.sequence + 1,
    status: 'ANSWER_SUBMITTED',
    serverNow: nowIso(),
    player: { ...match.player, score: newPlayerScore },
    lastAnswerResult: result,
  };

  return { match: next, result };
}

/**
 * Simulate AI answering and produce Round Result.
 * Called after player has answered (or timed out).
 */
export function resolveRoundWithAi(match: MatchState): MatchState {
  if (!match.round || !match.opponent) return match;

  const difficulty = (match as any)._difficulty as Difficulty ?? 'normal';
  const seed = (match as any)._seed as number ?? 42;
  const roundSeed = seed + match.currentRound * 31;
  const aiConfig = getAiConfig(difficulty);
  const challenge = match.round.challenge;

  const decision = decideAiAnswer(
    aiConfig,
    challenge.type,
    roundSeed,
    challenge.timeLimitMs
  );

  const config = useConfigStore.getState().config.scoring;
  let aiPoints = 0;
  let aiBonus = 0;

  if (decision.outcome === 'correct') {
    const score = calculateScore({
      outcome: 'correct',
      responseTimeMs: decision.delayMs,
      timeLimitMs: challenge.timeLimitMs,
      difficulty: challenge.difficulty,
      challengeType: challenge.type,
      config: {
        baseCorrect: config.baseCorrect,
        speedBonusMax: config.speedBonusMax,
        difficultyMultiplier: config.difficultyMultiplier,
      },
    });
    aiPoints = score.points;
    aiBonus = score.bonus;
  }

  const newOpponentScore = match.opponent.score + aiPoints + aiBonus;

  const roundResult: RoundResult = {
    roundId: match.round.roundId,
    roundNumber: match.currentRound,
    playerScore: match.player.score,
    opponentScore: newOpponentScore,
    playerOutcome: match.lastAnswerResult?.outcome ?? 'timeout',
    opponentOutcome: decision.outcome,
    sequence: match.sequence + 1,
  };

  return {
    ...match,
    sequence: match.sequence + 1,
    status: 'ROUND_RESULT',
    serverNow: nowIso(),
    opponent: { ...match.opponent, score: newOpponentScore },
    lastRoundResult: roundResult,
    round: { ...match.round, status: 'finished' },
  };
}

export function advanceToNextRound(match: MatchState): MatchState {
  const challenges: Challenge[] = (match as any)._challenges ?? [];
  const nextRoundNum = match.currentRound + 1;

  if (nextRoundNum > match.totalRounds) {
    return finishMatch(match);
  }

  const nextChallenge = challenges[nextRoundNum - 1];
  if (!nextChallenge) return finishMatch(match);

  const start = nowIso();

  const newRound: RoundState = {
    roundId: `${match.matchId}-r${nextRoundNum}`,
    matchId: match.matchId,
    roundNumber: nextRoundNum,
    challenge: nextChallenge,
    status: 'pending',
    serverStartAt: start,
    serverEndAt: addMs(start, nextChallenge.timeLimitMs),
    sequence: match.sequence + 1,
  };

  return {
    ...match,
    sequence: match.sequence + 1,
    status: 'ROUND_STARTING',
    currentRound: nextRoundNum,
    serverNow: start,
    round: newRound,
    lastAnswerResult: null,
    lastRoundResult: null,
  };
}

export function finishMatch(match: MatchState): MatchState {
  const playerScore = match.player.score;
  const opponentScore = match.opponent?.score ?? 0;

  let winnerId: string | null = null;
  if (playerScore > opponentScore) winnerId = match.player.id;
  else if (opponentScore > playerScore) winnerId = match.opponent?.id ?? null;

  return {
    ...match,
    sequence: match.sequence + 1,
    status: 'MATCH_FINISHED',
    serverNow: nowIso(),
    endedAt: nowIso(),
    winnerId,
    round: null,
  };
}

export function handlePlayerTimeout(match: MatchState): MatchState {
  if (!match.round || match.status !== 'ROUND_ACTIVE') return match;

  const result: AnswerResult = {
    requestId: `timeout-${Date.now()}`,
    outcome: 'timeout',
    points: 0,
    bonus: 0,
    serverValidatedAt: nowIso(),
  };

  return {
    ...match,
    sequence: match.sequence + 1,
    status: 'ANSWER_SUBMITTED',
    serverNow: nowIso(),
    lastAnswerResult: result,
  };
}
