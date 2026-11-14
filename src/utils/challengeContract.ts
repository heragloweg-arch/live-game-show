export interface ChallengeContractView {
  prompt?: string;
  type?: string;
  validationMode?: string;
  validation_mode?: string;
  choices?: { id?: string; choice_id?: string; label: string }[];
  letterPool?: string[];
  letter_pool?: string[];
  maxLength?: number;
}

function lettersOf(challenge: ChallengeContractView) {
  return challenge.letterPool ?? challenge.letter_pool;
}

export function choicesOf(challenge: ChallengeContractView) {
  return (challenge.choices ?? []).filter((choice) =>
    Boolean(choice.id ?? choice.choice_id) && Boolean(choice.label?.trim()),
  );
}

export function getAnswerLength(challenge: ChallengeContractView): number | null {
  if (Number.isInteger(challenge.maxLength) && (challenge.maxLength ?? 0) > 0) return challenge.maxLength ?? null;
  const letters = lettersOf(challenge);
  if (letters?.length) return letters.length;
  return null;
}

export function hasPlayableAnswerContract(challenge: ChallengeContractView): boolean {
  if (!challenge.prompt?.trim() || challenge.prompt.trim().length < 8) return false;
  if (choicesOf(challenge).length >= 2) return true;
  const mode = challenge.validationMode ?? challenge.validation_mode;
  if (challenge.type === 'speed' || mode === 'open_speed' || mode === 'hybrid') return true;
  return Boolean(lettersOf(challenge)?.length && getAnswerLength(challenge));
}

export function answerHint(challenge: ChallengeContractView): string {
  if (choicesOf(challenge).length >= 2) return 'اختر الإجابة الصحيحة';
  const mode = challenge.validationMode ?? challenge.validation_mode;
  if (challenge.type === 'speed' || mode === 'open_speed' || mode === 'hybrid') return 'اكتب إجابة توافق التلميح';
  const length = getAnswerLength(challenge);
  return length ? `الإجابة من ${length} ${length === 1 ? 'حرف' : 'أحرف'}` : 'تكوين الإجابة من الحروف';
}
