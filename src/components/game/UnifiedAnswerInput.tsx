import { useEffect, useRef } from 'react';
import { cn } from '../../utils/cn';
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
  value,
  selectedChoice = null,
  disabled = false,
  feedback = null,
  removedChoiceIds = [],
  onChange,
  onChoiceChange,
  onSubmit,
  onComplete,
  placeholder = 'اكتب إجابتك هنا...'
}: Props) {
  const submittedRef = useRef<string | null>(null);
  const letters = lettersOf(challenge);
  const choices = challenge.choices ?? [];
  const answerLength = getAnswerLength(challenge);
  const lettersKey = letters.join('|');
  const choicesKey = choices.map((choice) => choice.id ?? choice.choice_id ?? choice.label).join('|');

  useEffect(() => {
    submittedRef.current = null;
  }, [challenge.prompt, challenge.maxLength, lettersKey, choicesKey]);

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

  if (choices.length > 0) {
    return (
      <div className="grid gap-2" role="group" aria-label="اختيارات الإجابة">
        {choices.filter((choice) => !removedChoiceIds.includes(choice.id ?? choice.choice_id ?? '')).map((choice) => {
          const id = choice.id ?? choice.choice_id ?? choice.label;
          const active = selectedChoice === id;
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => {
                onChoiceChange?.(id);
                submitOnce(id);
              }}
              className={cn(
                'rounded-xl border px-4 py-3 text-right transition-all',
                feedback === 'correct' && active && 'border-emerald-400 bg-emerald-500/20 text-emerald-50',
                feedback === 'wrong' && active && 'border-red-400 bg-red-500/20 text-red-50',
                !feedback && active && 'border-zatona-500 bg-zatona-500/20 text-white',
                !active && 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <input
      type="text"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitOnce(value);
        }
      }}
      placeholder={placeholder}
      className={cn(
        'input-field text-center text-lg transition-colors',
        feedback === 'correct' && 'border-emerald-400 bg-emerald-500/10',
        feedback === 'wrong' && 'border-red-400 bg-red-500/10',
      )}
      dir="rtl"
      autoFocus
      aria-label="إجابة التحدي"
    />
  );
}
