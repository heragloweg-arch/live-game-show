import { useMemo, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Lightbulb, Delete, Eraser } from 'lucide-react';
import { cn } from '../../utils/cn';

interface Props {
  letters: string[];
  maxLength?: number;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  feedback?: 'correct' | 'wrong' | null;
}

const DISTRACTORS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';

export function LetterPoolBoard({ letters, maxLength, onChange, onComplete, disabled, feedback = null }: Props) {
  const lettersKey = letters.join('|');
  const answerLetters = useMemo(() => [...letters], [letters]);
  const shuffled = useMemo(() => {
    const base = [...letters];
    const extras: string[] = [];
    for (const ch of DISTRACTORS) {
      if (!base.includes(ch) && !extras.includes(ch)) extras.push(ch);
      if (extras.length === 5) break;
    }
    const arr = [...base, ...extras];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.map((ch, i) => ({ id: `${ch}-${i}`, ch }));
  }, [letters]);

  const [picked, setPicked] = useState<string[]>([]);
  const limit = maxLength ?? Math.max(answerLetters.length, 1);

  const emit = useCallback(
    (next: string[]) => {
      const word = next.map((pid) => shuffled.find((s) => s.id === pid)?.ch ?? '').join('');
      onChange(word);
    },
    [onChange, shuffled],
  );

  useEffect(() => {
    setPicked([]);
    onChange('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lettersKey]);

  const available = shuffled.filter((x) => !picked.includes(x.id));

  const pick = (id: string) => {
    if (disabled || picked.length >= limit) return;
    const next = [...picked, id];
    setPicked(next);
    const value = next.map((pid) => shuffled.find((s) => s.id === pid)?.ch ?? '').join('');
    onChange(value);
    if (next.length >= limit) onComplete?.(value);
  };

  const undo = () => {
    if (disabled || !picked.length) return;
    const next = picked.slice(0, -1);
    setPicked(next);
    emit(next);
  };

  const clear = () => {
    if (disabled) return;
    setPicked([]);
    onChange('');
  };

  const hint = () => {
    if (disabled || picked.length >= limit) return;
    const usedCounts: Record<string, number> = {};
    for (const id of picked) {
      const ch = shuffled.find((s) => s.id === id)?.ch ?? '';
      usedCounts[ch] = (usedCounts[ch] ?? 0) + 1;
    }
    const needCounts: Record<string, number> = {};
    for (const ch of answerLetters) needCounts[ch] = (needCounts[ch] ?? 0) + 1;
    let targetCh: string | null = null;
    for (const ch of answerLetters) {
      if ((usedCounts[ch] ?? 0) < (needCounts[ch] ?? 0)) {
        targetCh = ch;
        break;
      }
    }
    if (!targetCh) return;
    const candidate = available.find((x) => x.ch === targetCh);
    if (!candidate) return;
    const next = [...picked, candidate.id];
    setPicked(next);
    emit(next);
    if (next.length >= limit) {
      const value = next.map((pid) => shuffled.find((s) => s.id === pid)?.ch ?? '').join('');
      onComplete?.(value);
    }
  };

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'flex min-h-[52px] flex-wrap justify-center gap-2 rounded-2xl border px-3 py-3 transition-colors',
          feedback === 'correct' && 'border-emerald-400/50 bg-emerald-500/10',
          feedback === 'wrong' && 'border-red-400/50 bg-red-500/10',
          !feedback && 'border-white/10 bg-black/30',
        )}
      >
        {Array.from({ length: Math.max(limit, 1) }).map((_, index) => {
          const id = picked[index];
          const ch = id ? shuffled.find((s) => s.id === id)?.ch : '';
          return (
            <motion.span
              key={`${id ?? 'empty'}-${index}`}
              layout
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-xl border font-display text-lg font-bold',
                feedback === 'correct' && ch && 'border-emerald-400 bg-emerald-500/30 text-emerald-50',
                feedback === 'wrong' && ch && 'border-red-400 bg-red-500/30 text-red-100',
                !feedback && 'border-dashed border-white/20 bg-white/5 text-white',
              )}
            >
              {ch || <span className="text-white/35">_</span>}
            </motion.span>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {available.map((x) => (
          <button
            key={x.id}
            type="button"
            disabled={disabled || picked.length >= limit}
            onClick={() => pick(x.id)}
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-white/10 font-display text-lg font-bold',
              'active:scale-95 hover:bg-white/20 disabled:opacity-40',
            )}
          >
            {x.ch}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-400/15 px-3 py-1.5 text-xs font-bold text-amber-100" onClick={hint} disabled={disabled || picked.length >= limit}>
          <Lightbulb className="h-3.5 w-3.5" /> تلميح: حرف من الإجابة
        </button>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80" onClick={undo} disabled={disabled || !picked.length}>
          <Delete className="h-3.5 w-3.5" /> حذف حرف
        </button>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60" onClick={clear} disabled={disabled || !picked.length}>
          <Eraser className="h-3.5 w-3.5" /> مسح الكل
        </button>
      </div>
    </div>
  );
}
