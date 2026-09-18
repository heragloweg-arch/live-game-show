import { create } from 'zustand';
import { supabase } from '../services/supabase/client';
import { ensureProfile, fetchProfile } from '../services/profile/profileApi';
import type { UserProfile } from '../types';

interface AuthState {
  user: UserProfile | null;
  sessionLoading: boolean;
  isAuthenticated: boolean;
  bootstrap: () => Promise<void>;
  signInAnonymously: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setUser: (user: UserProfile | null) => void;
}

async function loadUserProfile(userId: string, meta?: { username?: string; displayName?: string }) {
  return ensureProfile(userId, meta);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  sessionLoading: true,
  isAuthenticated: false,

  bootstrap: async () => {
    set({ sessionLoading: true });
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        const profile = await loadUserProfile(session.user.id, {
          username: session.user.user_metadata?.username,
          displayName: session.user.user_metadata?.display_name,
        });
        set({ user: profile, isAuthenticated: true, sessionLoading: false });
      } else {
        set({ user: null, isAuthenticated: false, sessionLoading: false });
      }
    } catch (err) {
      console.error('[Auth] bootstrap failed', err);
      set({ user: null, isAuthenticated: false, sessionLoading: false });
    }
  },

  signInAnonymously: async () => {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    if (data.user) {
      const profile = await loadUserProfile(data.user.id);
      set({ user: profile, isAuthenticated: true, sessionLoading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, isAuthenticated: false });
  },

  refreshProfile: async () => {
    const current = get().user;
    if (!current) return;
    const profile = await fetchProfile(current.id);
    if (profile) set({ user: profile });
  },

  setUser: (user) => set({ user, isAuthenticated: !!user }),
}));

// Keep session in sync
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      useAuthStore.getState().setUser(null);
    }
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      void useAuthStore.getState().bootstrap();
    }
  });
}
