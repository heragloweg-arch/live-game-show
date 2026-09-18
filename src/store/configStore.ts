import { create } from 'zustand';
import type { AppConfig } from '../types';

const DEFAULT_CONFIG: AppConfig = {
  timers: {
    speedMs: 15000,
    wordsMs: 20000,
    knowledgeMs: 12000,
    mysteryMs: 15000,
  },
  scoring: {
    baseCorrect: 100,
    speedBonusMax: 50,
    difficultyMultiplier: {
      easy: 1,
      normal: 1.25,
      hard: 1.5,
    },
  },
  features: {
    hostEnabled: true,
    roomsEnabled: true,
    voiceEnabled: true,
    adsEnabled: true,
  },
  version: '1.0.0',
};

interface ConfigState {
  config: AppConfig;
  loading: boolean;
  fetchConfig: () => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set) => ({
  config: DEFAULT_CONFIG,
  loading: false,

  fetchConfig: async () => {
    set({ loading: true });
    try {
      // In production this hits a Supabase Edge Function or config table.
      // For now we use the solid default that matches GDD.
      set({ config: DEFAULT_CONFIG, loading: false });
    } catch {
      set({ config: DEFAULT_CONFIG, loading: false });
    }
  },
}));
