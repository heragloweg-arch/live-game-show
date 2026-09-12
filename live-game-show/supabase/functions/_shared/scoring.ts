/**
 * Server-side scoring (mirrors client pure functions).
 * This is the authoritative version.
 */

export type Difficulty = 'easy' | 'normal' | 'hard';
export type ChallengeType = 'speed' | 'words' | 'knowledge' | 'mystery';
export type AnswerOutcome = 'correct' | 'wrong' | 'timeout' | 'invalid';

export interface ScoringConfig {
  baseCorrect: number;
  speedBonusMax: number;
  difficultyMultiplier: Record<Difficulty, number>;
}

export const DEFAULT_SCORING: ScoringConfig = {
  baseCorrect: 100,
  speedBonusMax: 50,
  difficultyMultiplier: { easy: 1, normal: 1.25, hard: 1.5 },
};

export function calculateScore(input: {
  outcome: AnswerOutcome;
  responseTimeMs: number;
  timeLimitMs: number;
  difficulty: Difficulty;
  challengeType: ChallengeType;
  config?: ScoringConfig;
}): { points: number; bonus: number; total: number } {
  const config = input.config ?? DEFAULT_SCORING;

  if (input.outcome !== 'correct') {
    return { points: 0, bonus: 0, total: 0 };
  }

  const base = config.baseCorrect;
  const diffMult = config.difficultyMultiplier[input.difficulty] ?? 1;
  const typeMult = input.challengeType === 'speed' ? 1.1 : input.challengeType === 'mystery' ? 1.15 : 1;

  const clamped = Math.max(0, Math.min(input.responseTimeMs, input.timeLimitMs));
  const speedRatio = 1 - clamped / input.timeLimitMs;
  const speedBonus = Math.round(config.speedBonusMax * speedRatio);

  const difficultyBonus = Math.round(base * (diffMult - 1));
  const typeBonus = Math.round(base * (typeMult - 1));
  const points = base + difficultyBonus + typeBonus;

  return { points, bonus: speedBonus, total: points + speedBonus };
}
