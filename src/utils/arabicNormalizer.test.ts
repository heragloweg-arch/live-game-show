import { describe, it, expect } from 'vitest';
import { normalizeArabic } from './arabicNormalizer';

describe('normalizeArabic', () => {
  it('strips tatweel and unifies alef', () => {
    expect(normalizeArabic('أإآ')).toContain('ا');
  });
  it('handles empty', () => {
    expect(normalizeArabic('')).toBe('');
  });
  it('trims spaces', () => {
    const n = normalizeArabic('  القاهرة  ');
    expect(n.length).toBeGreaterThan(0);
    expect(n).not.toMatch(/^\s/);
  });
});
