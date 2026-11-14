import { describe, expect, it } from 'vitest';
import { answerHint, choicesOf, hasPlayableAnswerContract } from './challengeContract';

describe('challenge answer contract', () => {
  const choiceChallenge = {
    prompt: 'ما عاصمة المملكة العربية السعودية؟',
    choices: [
      { choice_id: 'riyadh', label: 'الرياض' },
      { choice_id: 'jeddah', label: 'جدة' },
    ],
  };

  it('accepts a complete multiple-choice contract without a letter pool', () => {
    expect(hasPlayableAnswerContract(choiceChallenge)).toBe(true);
    expect(choicesOf(choiceChallenge)).toHaveLength(2);
    expect(answerHint(choiceChallenge)).toBe('اختر الإجابة الصحيحة');
  });

  it('rejects an incomplete choice contract', () => {
    expect(hasPlayableAnswerContract({
      prompt: 'سؤال مكتمل وواضح',
      choices: [{ choice_id: 'only', label: 'إجابة واحدة' }],
    })).toBe(false);
  });

  it('keeps letter-pool contracts playable', () => {
    expect(hasPlayableAnswerContract({
      prompt: 'اكتب اسم مدينة عربية معروفة',
      letter_pool: ['ق', 'د', 'س'],
      maxLength: 3,
    })).toBe(true);
  });
});
