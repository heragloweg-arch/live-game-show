import { create } from 'zustand';
import { supabase } from '../services/supabase/client';
import { ensureProfile, fetchProfile } from '../services/profile/profileApi';
import type { UserProfile } from '../types';

interface AuthState {
  user: UserProfile | null;
  isAnonymousSession: boolean;
  sessionLoading: boolean;
  isAuthenticated: boolean;
  bootstrap: () => Promise<void>;
  signInAnonymously: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string, displayName?: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setUser: (user: UserProfile | null) => void;
}

async function loadUserProfile(userId: string, meta?: { username?: string; displayName?: string }) {
  return ensureProfile(userId, meta);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAnonymousSession: false,
  sessionLoading: true,
  isAuthenticated: false,

  bootstrap: async () => {
    set({ sessionLoading: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        if (session.user.is_anonymous) {
          await supabase.auth.signOut();
          set({ user: null, isAnonymousSession: false, isAuthenticated: false, sessionLoading: false });
          return;
        }
        const profile = await loadUserProfile(session.user.id, {
          username: session.user.user_metadata?.username,
          displayName: session.user.user_metadata?.display_name,
        });
        set({ user: profile, isAnonymousSession: Boolean(session.user.is_anonymous), isAuthenticated: true, sessionLoading: false });
      } else {
        set({ user: null, isAnonymousSession: false, isAuthenticated: false, sessionLoading: false });
      }
    } catch (err) {
      console.error('[Auth] bootstrap failed', err);
      set({ user: null, isAnonymousSession: false, isAuthenticated: false, sessionLoading: false });
    }
  },

  signInAnonymously: async () => {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    if (data.user) {
      const profile = await loadUserProfile(data.user.id);
      set({ user: profile, isAnonymousSession: true, isAuthenticated: true, sessionLoading: false });
    }
  },

  signInWithPassword: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    if (data.user) {
      const profile = await loadUserProfile(data.user.id, {
        username: data.user.user_metadata?.username,
        displayName: data.user.user_metadata?.display_name,
      });
      set({ user: profile, isAnonymousSession: false, isAuthenticated: true, sessionLoading: false });
    }
  },

  signUpWithPassword: async (email, password, displayName) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: displayName?.trim() || undefined },
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
    if (error) throw error;
    if (data.user && data.session) {
      const profile = await loadUserProfile(data.user.id, { displayName: displayName?.trim() });
      set({ user: profile, isAnonymousSession: false, isAuthenticated: true, sessionLoading: false });
    }
    return { needsEmailConfirmation: Boolean(data.user && !data.session) };
  },

  signInWithGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
    if (error) throw error;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, isAnonymousSession: false, isAuthenticated: false });
  },

  refreshProfile: async () => {
    const current = get().user;
    if (!current) return;
    const profile = await fetchProfile(current.id);
    if (profile) set({ user: profile });
  },

  setUser: (user) => set({ user, isAuthenticated: !!user, isAnonymousSession: false }),
}));

if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') useAuthStore.getState().setUser(null);
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') void useAuthStore.getState().bootstrap();
  });
}
