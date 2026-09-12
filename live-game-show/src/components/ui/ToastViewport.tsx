import { useToastStore } from '../../store/toastStore';
import { cn } from '../../utils/cn';

export function ToastViewport() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);

  if (!items.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={cn(
            'pointer-events-auto max-w-sm rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur-md',
            t.kind === 'error' && 'border-red-500/40 bg-red-950/90 text-red-100',
            t.kind === 'success' && 'border-zatona-500/40 bg-emerald-950/90 text-emerald-100',
            t.kind === 'info' && 'border-white/10 bg-surface-800/95 text-white'
          )}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
