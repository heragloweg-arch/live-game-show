import { describe, it, expect } from 'vitest';

/** Pure couple/solo outcome — mirrors settle_match rules */
function coupleOutcome(teamScore: number, opponentScore: number) {
  if (teamScore > opponentScore) return 'win';
  if (teamScore < opponentScore) return 'loss';
  return 'draw';
}

function soloOutcome(player: number, opponent: number) {
  if (player > opponent) return 'win';
  if (player < opponent) return 'loss';
  return 'draw';
}

describe('settlement logic', () => {
  it('couple beats the opponent', () => {
    expect(coupleOutcome(100, 80)).toBe('win');
  });
  it('opponent beats couple', () => {
    expect(coupleOutcome(50, 90)).toBe('loss');
  });
  it('solo opponent can win', () => {
    expect(soloOutcome(100, 200)).toBe('loss');
  });
  it('solo human win', () => {
    expect(soloOutcome(300, 100)).toBe('win');
  });
});
