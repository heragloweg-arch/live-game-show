import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';

interface Props {
  letters: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function LetterPoolBoard({ letters, onChange, disabled }: Props) {
  const shuffled = useMemo(() => {
    const arr = [...letters];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.map((ch, i) => ({ id: `${ch}-${i}`, ch }));
  }, [letters.join('')]);

  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    setPicked([]);
    onChange('');
  }, [letters.join('')]);

  const available = shuffled.filter((x) => !picked.includes(x.id));

  const pick = (id: string) => {
    if (disabled) return;
    const next = [...picked, id];
    setPicked(next);
    const word = next
      .map((pid) => shuffled.find((s) => s.id === pid)?.ch ?? '')
      .join('');
    onChange(word);
  };

  const undo = () => {
    if (disabled || !picked.length) return;
    const next = picked.slice(0, -1);
    setPicked(next);
    const word = next
      .map((pid) => shuffled.find((s) => s.id === pid)?.ch ?? '')
      .join('');
    onChange(word);
  };

  const clear = () => {
    setPicked([]);
    onChange('');
  };

  return (
    <div className="space-y-3">
      <div className="flex min-h-[48px] flex-wrap justify-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-3">
        {picked.length === 0 && (
          <span className="text-sm text-white/30">رتّب الحروف…</span>
        )}
        {picked.map((id) => {
          const ch = shuffled.find((s) => s.id === id)?.ch;
          return (
            <motion.span
              key={id}
              layout
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/30 font-display text-lg font-bold text-white"
            >
              {ch}
            </motion.span>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {available.map((x) => (
          <button
            key={x.id}
            type="button"
            disabled={disabled}
            onClick={() => pick(x.id)}
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-white/10 font-display text-lg font-bold',
              'active:scale-95 hover:bg-white/20 disabled:opacity-40'
            )}
          >
            {x.ch}
          </button>
        ))}
      </div>
      <div className="flex justify-center gap-2">
        <button type="button" className="btn-ghost text-xs" onClick={undo} disabled={disabled}>
          تراجع
        </button>
        <button type="button" className="btn-ghost text-xs" onClick={clear} disabled={disabled}>
          مسح
        </button>
      </div>
    </div>
  );
}
