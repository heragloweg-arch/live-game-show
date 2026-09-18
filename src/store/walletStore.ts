import { create } from 'zustand';
import type { Wallet, LedgerEntry } from '../types/economy';
import { fetchWallet, fetchLedger } from '../services/economy/walletApi';

interface WalletState {
  wallet: Wallet | null;
  ledger: LedgerEntry[];
  loading: boolean;
  error: string | null;
  loadWallet: () => Promise<void>;
  loadLedger: () => Promise<void>;
  setWallet: (w: Wallet | null) => void;
  creditLocal: (coins: number) => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  wallet: null,
  ledger: [],
  loading: false,
  error: null,

  loadWallet: async () => {
    set({ loading: true, error: null });
    try {
      const w = await fetchWallet();
      set({ wallet: w, loading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : String(e),
        loading: false,
      });
    }
  },

  loadLedger: async () => {
    try {
      const entries = await fetchLedger();
      set({ ledger: entries });
    } catch {
      /* non-critical */
    }
  },

  setWallet: (wallet) => set({ wallet }),

  creditLocal: (coins) => {
    const w = get().wallet;
    if (!w) return;
    set({
      wallet: {
        ...w,
        coins: w.coins + coins,
        updatedAt: new Date().toISOString(),
      },
    });
  },
}));
