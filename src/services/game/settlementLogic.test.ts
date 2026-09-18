import { describe, it, expect } from 'vitest';

/** Pure couple/solo outcome — mirrors settle_match rules */
function coupleOutcome(teamScore: number, aiScore: number) {
  if (teamScore > aiScore) return 'win';
  if (teamScore < aiScore) return 'loss';
  return 'draw';
}

function soloOutcome(human: number, ai: number) {
  if (human > ai) return 'win';
  if (human < ai) return 'loss';
  return 'draw';
}

describe('settlement logic', () => {
  it('couple beats AI', () => {
    expect(coupleOutcome(100, 80)).toBe('win');
  });
  it('AI beats couple', () => {
    expect(coupleOutcome(50, 90)).toBe('loss');
  });
  it('solo AI can win', () => {
    expect(soloOutcome(100, 200)).toBe('loss');
  });
  it('solo human win', () => {
    expect(soloOutcome(300, 100)).toBe('win');
  });
});
