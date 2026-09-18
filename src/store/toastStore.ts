import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error';

interface ToastItem {
  id: string;
  message: string;
  kind: ToastKind;
}

interface ToastState {
  items: ToastItem[];
  push: (message: string, kind?: ToastKind) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (message, kind = 'info') => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ items: [...s.items, { id, message, kind }] }));
    setTimeout(() => {
      set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    }, 3200);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));
