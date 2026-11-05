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
  // قدها uses one golden-path interaction: compose the answer from letters.
  // Choices and free text are not playable until migrated to this contract.
  return Boolean(lettersOf(challenge)?.length && getAnswerLength(challenge));
}

export function answerHint(challenge: ChallengeContractView): string {
  const length = getAnswerLength(challenge);
  return length ? `الإجابة من ${length} ${length === 1 ? 'حرف' : 'أحرف'}` : 'تكوين الإجابة من الحروف';
}
