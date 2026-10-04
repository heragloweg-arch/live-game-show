export interface ChallengeContractView {
  prompt?: string;
  choices?: { id?: string; choice_id?: string; label: string }[];
  letterPool?: string[];
  letter_pool?: string[];
  maxLength?: number;
}

function lettersOf(challenge: ChallengeContractView) {
  return challenge.letterPool ?? challenge.letter_pool;
}

export function getAnswerLength(challenge: ChallengeContractView): number | null {
  if (Number.isInteger(challenge.maxLength) && (challenge.maxLength ?? 0) > 0) return challenge.maxLength ?? null;
  const letters = lettersOf(challenge);
  if (letters?.length) return letters.length;
  return null;
}

export function hasPlayableAnswerContract(challenge: ChallengeContractView): boolean {
  if (!challenge.prompt?.trim() || challenge.prompt.trim().length < 8) return false;
  if (challenge.choices?.length) return challenge.choices.length >= 2 && challenge.choices.every((choice) => Boolean(choice?.label?.trim()));
  if (lettersOf(challenge)?.length) return Boolean(getAnswerLength(challenge));
  // Open answers are validated server-side; they still require a valid prompt.
  return true;
}

export function answerHint(challenge: ChallengeContractView): string {
  const length = getAnswerLength(challenge);
  return length ? `الإجابة من ${length} ${length === 1 ? 'حرف' : 'أحرف'}` : 'أجب بكلمة أو عبارة قصيرة';
}
