import { describe, expect, it } from 'vitest';
import { GAME_FORMATS, formatById, isGameFormat, parseGameFormat } from './gameFormats';

describe('game formats', () => {
  it('exposes only production-supported formats', () => {
    expect(GAME_FORMATS.map((format) => format.id)).toEqual([
      'mixed',
      'speed',
      'letters',
      'knowledge',
      'words',
    ]);
  });

  it('normalizes unknown deep links to the safe mixed format', () => {
    expect(parseGameFormat('not-a-format')).toBe('mixed');
    expect(parseGameFormat(null)).toBe('mixed');
    expect(isGameFormat('letters')).toBe(true);
    expect(isGameFormat('roulette')).toBe(false);
  });

  it('keeps a stable definition for every format', () => {
    for (const format of GAME_FORMATS) {
      expect(formatById(format.id).id).toBe(format.id);
      expect(format.description.length).toBeGreaterThan(8);
    }
  });
});
