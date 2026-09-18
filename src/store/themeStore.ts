import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'dark' | 'light';

interface ThemeState {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'dark',
      setMode: (mode) => {
        set({ mode });
        applyTheme(mode);
      },
      toggle: () => {
        const next = get().mode === 'dark' ? 'light' : 'dark';
        set({ mode: next });
        applyTheme(next);
      },
    }),
    { name: 'qaddaha-theme' }
  )
);

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.classList.toggle('theme-light', mode === 'light');
  root.classList.toggle('theme-dark', mode === 'dark');
}

export function initTheme() {
  try {
    const raw = localStorage.getItem('qaddaha-theme');
    const parsed = raw ? JSON.parse(raw) : null;
    const mode = (parsed?.state?.mode as ThemeMode) || 'dark';
    applyTheme(mode);
  } catch {
    applyTheme('dark');
  }
}
