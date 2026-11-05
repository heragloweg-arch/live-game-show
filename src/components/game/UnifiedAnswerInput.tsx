import { useEffect, useRef } from 'react';
import type { ChallengeContractView } from '../../utils/challengeContract';
import { getAnswerLength } from '../../utils/challengeContract';
import { LetterPoolBoard } from './LetterPoolBoard';

type Feedback = 'correct' | 'wrong' | null;

type Props = {
  challenge: ChallengeContractView;
  value: string;
  selectedChoice?: string | null;
  disabled?: boolean;
  feedback?: Feedback;
  removedChoiceIds?: string[];
  onChange: (value: string) => void;
  onChoiceChange?: (choiceId: string) => void;
  onSubmit: (value: string) => void;
  onComplete?: (value: string) => void;
  placeholder?: string;
};

function lettersOf(challenge: ChallengeContractView) {
  return challenge.letterPool ?? challenge.letter_pool ?? [];
}

export function UnifiedAnswerInput({
  challenge,
  disabled = false,
  feedback = null,
  onChange,
  onSubmit,
  onComplete,
}: Props) {
  const submittedRef = useRef<string | null>(null);
  const letters = lettersOf(challenge);
  const answerLength = getAnswerLength(challenge);
  const lettersKey = letters.join('|');

  useEffect(() => {
    submittedRef.current = null;
  }, [challenge.prompt, challenge.maxLength, lettersKey]);

  const submitOnce = (answer: string) => {
    const normalized = answer.trim();
    if (!normalized || disabled || submittedRef.current === normalized) return;
    submittedRef.current = normalized;
    onSubmit(normalized);
  };

  if (letters.length > 0) {
    return (
      <LetterPoolBoard
        letters={letters}
        maxLength={answerLength ?? undefined}
        onChange={onChange}
        onComplete={(next) => {
          onComplete?.(next);
          submitOnce(next);
        }}
        disabled={disabled}
        feedback={feedback}
      />
    );
  }

  return (
    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-center text-sm text-amber-100" role="status">
      هذا التحدي غير متاح مؤقتًا: يلزم عقد حروف صالح قبل إدخاله إلى اللعب.
    </div>
  );
}
