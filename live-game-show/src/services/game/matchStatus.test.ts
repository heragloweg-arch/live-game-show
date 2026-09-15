
import { describe, it, expect } from 'vitest';

const TERMINAL = new Set(['MATCH_FINISHED', 'FINAL_RESULT', 'MATCH_TERMINATED', 'FINISHED', 'CANCELLED']);

describe('match terminal states', () => {
  it('recognizes production finished statuses', () => {
    expect(TERMINAL.has('MATCH_FINISHED')).toBe(true);
    expect(TERMINAL.has('FINAL_RESULT')).toBe(true);
    expect(TERMINAL.has('ROUND_ACTIVE')).toBe(false);
  });
});
