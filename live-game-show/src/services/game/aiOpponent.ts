/**
 * AI Opponent — deterministic / probabilistic, no LLM.
 * Runs entirely on the "server" side in production.
 * Client uses it only for Solo demo mode.
 */

import type { Difficulty, AnswerOutcome, ChallengeType } from '../../types';

export interface AiConfig {
  difficulty: Difficulty;
  accuracy: number;       // 0–1 probability of correct answer
  minDelayMs: number;
  maxDelayMs: number;
  categoryBias?: Partial<Record<ChallengeType, number>>; // accuracy modifier
}

const PRESETS: Record<Difficulty, AiConfig> = {
  easy: {
    difficulty: 'easy',
    accuracy: 0.45,
    minDelayMs: 4000,
    maxDelayMs: 11000,
  },
  normal: {
    difficulty: 'normal',
    accuracy: 0.68,
    minDelayMs: 2500,
    maxDelayMs: 8000,
  },
  hard: {
    difficulty: 'hard',
    accuracy: 0.88,
    minDelayMs: 1200,
    maxDelayMs: 4500,
  },
};

export function getAiConfig(difficulty: Difficulty): AiConfig {
  return { ...PRESETS[difficulty] };
}

/**
 * Seeded pseudo-random for reproducible behavior in tests.
 * Uses a simple LCG.
 */
function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export interface AiDecision {
  outcome: AnswerOutcome;
  delayMs: number;
  willAnswer: boolean;
}

/**
 * Decide what the AI does for a given round.
 * @param matchSeed - stable seed derived from matchId + roundNumber for determinism
 */
export function decideAiAnswer(
  config: AiConfig,
  challengeType: ChallengeType,
  matchSeed: number,
  timeLimitMs: number
): AiDecision {
  const rand = seededRandom(matchSeed);

  const bias = config.categoryBias?.[challengeType] ?? 0;
  const effectiveAccuracy = Math.min(0.97, Math.max(0.05, config.accuracy + bias));

  const roll = rand();
  const isCorrect = roll < effectiveAccuracy;

  // Delay distribution
  const delayRange = config.maxDelayMs - config.minDelayMs;
  let delayMs = Math.floor(config.minDelayMs + rand() * delayRange);

  // Hard AI answers a bit faster on average
  if (config.difficulty === 'hard') {
    delayMs = Math.floor(delayMs * 0.85);
  }

  // Never exceed time limit
  delayMs = Math.min(delayMs, timeLimitMs - 200);

  // Small chance of timeout on easy
  if (config.difficulty === 'easy' && rand() < 0.12) {
    return {
      outcome: 'timeout',
      delayMs: timeLimitMs + 100,
      willAnswer: false,
    };
  }

  return {
    outcome: isCorrect ? 'correct' : 'wrong',
    delayMs: Math.max(400, delayMs),
    willAnswer: true,
  };
}

/**
 * Generate a simple fake answer string for demo UI (never used for scoring).
 */
export function generateDemoAiAnswer(outcome: AnswerOutcome, prompt: string): string {
  if (outcome === 'correct') return 'إجابة صحيحة (AI)';
  if (outcome === 'timeout') return '';
  return 'إجابة خاطئة';
}
