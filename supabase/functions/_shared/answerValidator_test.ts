import { inferOpenSpeedRules, validateOpenSpeed } from './answerValidator.ts';

Deno.test('Arabic starting-letter prompts parse a valid Arabic character', () => {
  const rules = inferOpenSpeedRules('اسم ولد يبدأ بحرف ك');
  if (rules.startsWith !== 'ك') {
    throw new Error(`Expected Arabic starting letter ك, got ${String(rules.startsWith)}`);
  }
  const result = validateOpenSpeed('كتاب', { prompt: 'اسم ولد يبدأ بحرف ك' });
  if (!result.correct) throw new Error(`Expected valid Arabic answer, got ${result.reason}`);
});

Deno.test('Arabic prompts can specify a Latin starting letter and validate Latin answers', () => {
  const rules = inferOpenSpeedRules('كلمة تبدأ بحرف A');
  if (rules.startsWith !== 'a') {
    throw new Error(`Expected Latin starting letter a, got ${String(rules.startsWith)}`);
  }
  const result = validateOpenSpeed('Apple', { prompt: 'كلمة تبدأ بحرف A' });
  if (!result.correct) throw new Error(`Expected valid Latin answer, got ${result.reason}`);
});

Deno.test('starting-letter validation rejects a mismatched answer', () => {
  const result = validateOpenSpeed('بيت', { prompt: 'اسم ولد يبدأ بحرف ك' });
  if (result.correct || result.reason !== 'starts_with') {
    throw new Error('Expected the answer to be rejected for a starting-letter mismatch');
  }
});
