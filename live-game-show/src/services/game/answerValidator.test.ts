import { describe, it, expect } from 'vitest';
import { clientOpenSpeedLooksValid } from './answerValidator';

describe('open speed client rules', () => {
  it('accepts name starting with ك', () => {
    expect(clientOpenSpeedLooksValid('اسم ولد يبدأ بحرف ك', 'كريم')).toBe(true);
  });
  it('rejects wrong start letter', () => {
    expect(clientOpenSpeedLooksValid('اسم ولد يبدأ بحرف ك', 'أحمد')).toBe(false);
  });
  it('checks length', () => {
    expect(clientOpenSpeedLooksValid('اسم بنت من 4 حروف', 'سارة')).toBe(true);
    expect(clientOpenSpeedLooksValid('اسم بنت من 4 حروف', 'نور')).toBe(false);
  });
});
