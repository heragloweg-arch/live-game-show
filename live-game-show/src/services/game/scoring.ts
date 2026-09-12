/**
 * Scoring Engine — pure, configurable, server-authoritative design.
 * Client uses the same formulas for optimistic UI only.
 * Final points always come from the server.
 */

import type { ChallengeType, Difficulty, AnswerOutcome } from '../../types';

export interface ScoringConfig {
  baseCorrect: number;
  speedBonusMax: number;
  difficultyMultiplier: Record<Difficulty, number>;
  typeMultiplier?: Partial<Record<ChallengeType, number>>;
}

export interface ScoreInput {
  outcome: AnswerOutcome;
  responseTimeMs: number;
  timeLimitMs: number;
  difficulty: Difficulty;
  challengeType: ChallengeType;
  config: ScoringConfig;
}

export interface ScoreResult {
  points: number;
  bonus: number;
  total: number;
  breakdown: {
    base: number;
    speedBonus: number;
    difficultyBonus: number;
    typeBonus: number;
  };
}

const DEFAULT_TYPE_MULTIPLIER: Record<ChallengeType, number> = {
  speed: 1.1,
  words: 1.0,
  knowledge: 1.0,
  mystery: 1.15,
};

/**
 * Calculate points for a single answer.
 * Speed bonus is linear: faster answer → higher bonus (capped).
 */
export function calculateScore(input: ScoreInput): ScoreResult {
  const { outcome, responseTimeMs, timeLimitMs, difficulty, challengeType, config } = input;

  if (outcome !== 'correct') {
    return {
      points: 0,
      bonus: 0,
      total: 0,
      breakdown: { base: 0, speedBonus: 0, difficultyBonus: 0, typeBonus: 0 },
    };
  }

  const base = config.baseCorrect;
  const diffMult = config.difficultyMultiplier[difficulty] ?? 1;
  const typeMult =
    config.typeMultiplier?.[challengeType] ?? DEFAULT_TYPE_MULTIPLIER[challengeType] ?? 1;

  // Speed bonus: 0 → max based on how early the answer arrived
  const clampedTime = Math.max(0, Math.min(responseTimeMs, timeLimitMs));
  const speedRatio = 1 - clampedTime / timeLimitMs; // 1 = instant, 0 = last millisecond
  const speedBonus = Math.round(config.speedBonusMax * speedRatio);

  const difficultyBonus = Math.round(base * (diffMult - 1));
  const typeBonus = Math.round(base * (typeMult - 1));

  const points = base + difficultyBonus + typeBonus;
  const total = points + speedBonus;

  return {
    points,
    bonus: speedBonus,
    total,
    breakdown: {
      base,
      speedBonus,
      difficultyBonus,
      typeBonus,
    },
  };
}

/**
 * Aggregate score for a full match (sum of round totals).
 */
export function sumMatchScore(roundTotals: number[]): number {
  return roundTotals.reduce((acc, v) => acc + v, 0);
}
