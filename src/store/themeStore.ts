import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      setMode: (mode) => {
        set({ mode });
        applyTheme(mode);
      },
      toggle: () => {
        const next: ThemeMode = get().mode === 'dark' ? 'light' : 'dark';
        set({ mode: next });
        applyTheme(next);
      },
    }),
    { name: 'qaddaha-theme' }
  )
);

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode !== 'system') return mode;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const resolved = resolveTheme(mode);
  root.dataset.theme = mode;
  root.dataset.resolvedTheme = resolved;
  root.classList.toggle('theme-light', resolved === 'light');
  root.classList.toggle('theme-dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

export function initTheme() {
  try {
    const raw = localStorage.getItem('qaddaha-theme');
    const parsed = raw ? JSON.parse(raw) : null;
    const rawMode = parsed?.state?.mode;
    const mode: ThemeMode = rawMode === 'dark' || rawMode === 'light' || rawMode === 'system' ? rawMode : 'system';
    applyTheme(mode);
    if (typeof window !== 'undefined') {
      const media = window.matchMedia?.('(prefers-color-scheme: light)');
      media?.addEventListener?.('change', () => {
        const current = useThemeStore.getState().mode;
        if (current === 'system') applyTheme('system');
      });
    }
  } catch {
    applyTheme('system');
  }
}
