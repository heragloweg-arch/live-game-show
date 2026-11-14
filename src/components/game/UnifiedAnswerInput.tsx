import { useEffect, useRef } from 'react';
import type { ChallengeContractView } from '../../utils/challengeContract';
import { choicesOf, getAnswerLength } from '../../utils/challengeContract';
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
  placeholder = 'اكتب إجابتك هنا',
}: Props) {
  const submittedRef = useRef<string | null>(null);
  const letters = lettersOf(challenge);
  const choices = choicesOf(challenge);
  const answerLength = getAnswerLength(challenge);
  const lettersKey = letters.join('|');

  useEffect(() => {
    submittedRef.current = null;
  }, [challenge.prompt, challenge.maxLength, lettersKey, choices.length]);

  const submitOnce = (answer: string) => {
    const normalized = answer.trim();
    if (!normalized || disabled || submittedRef.current === normalized) return;
    submittedRef.current = normalized;
    onSubmit(normalized);
  };

  if (choices.length >= 2) {
    return (
      <div className="grid gap-2" role="radiogroup" aria-label="اختيارات الإجابة">
        {choices.map((choice, index) => {
          const id = choice.id ?? choice.choice_id ?? `choice-${index}`;
          const removed = removedChoiceIds.includes(id);
          const selected = selectedChoice === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`اختيار ${index + 1}: ${choice.label}`}
              disabled={disabled || removed}
              onClick={() => {
                onChoiceChange?.(id);
                onChange(id);
                submitOnce(id);
              }}
              className={`min-h-12 rounded-xl border px-4 py-3 text-right font-semibold transition ${
                removed ? 'cursor-not-allowed border-white/5 bg-white/5 text-white/20 line-through' :
                selected ? 'border-zatona-400 bg-zatona-500/20 text-white ring-2 ring-zatona-400/40' :
                'border-white/10 bg-white/5 text-white/85 hover:border-zatona-400/70 hover:bg-white/10'
              }`}
            >
              <span className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs text-zatona-300">{index + 1}</span>
              {choice.label}
            </button>
          );
        })}
      </div>
    );
  }

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
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        submitOnce(value);
      }}
    >
      <label className="sr-only" htmlFor="free-answer">الإجابة</label>
      <input
        id="free-answer"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        autoComplete="off"
        placeholder={placeholder}
        className="min-h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-center text-lg text-white outline-none transition placeholder:text-white/35 focus:border-zatona-400 focus:ring-2 focus:ring-zatona-400/25"
        aria-label="اكتب إجابتك"
      />
      <button type="submit" disabled={disabled || !value.trim()} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40">
        تأكيد الإجابة
      </button>
    </form>
  );
}
