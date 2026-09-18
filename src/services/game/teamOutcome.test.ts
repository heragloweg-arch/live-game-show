import { describe, it, expect } from 'vitest';

function teamOutcome(scoreA: number, scoreB: number) {
  if (scoreA > scoreB) return 'a';
  if (scoreB > scoreA) return 'b';
  return 'draw';
}

describe('team outcome', () => {
  it('A wins', () => expect(teamOutcome(120, 80)).toBe('a'));
  it('B wins', () => expect(teamOutcome(10, 90)).toBe('b'));
  it('draw', () => expect(teamOutcome(50, 50)).toBe('draw'));
});
