import { describe, it, expect } from 'vitest';
import { calculateScore, DEFAULT_SCORING } from '../services/game/scoring';

describe('scoring', () => {
  it('awards points for correct answer', () => {
    const r = calculateScore({
      outcome: 'correct',
      responseTimeMs: 1000,
      timeLimitMs: 10000,
      difficulty: 'normal',
      challengeType: 'speed',
      config: DEFAULT_SCORING,
    });
    expect(r.total).toBeGreaterThan(0);
  });

  it('zero for wrong', () => {
    const r = calculateScore({
      outcome: 'wrong',
      responseTimeMs: 1000,
      timeLimitMs: 10000,
      difficulty: 'normal',
      challengeType: 'knowledge',
      config: DEFAULT_SCORING,
    });
    expect(r.total).toBe(0);
  });
});
