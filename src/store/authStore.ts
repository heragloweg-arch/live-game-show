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

const AUTH_REQUEST_TIMEOUT_MS = 15_000;

async function withAuthTimeout<T>(request: PromiseLike<T>, operation: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`انتهت مهلة ${operation}. تحقق من اتصال الإنترنت ثم حاول مرة أخرى.`)), AUTH_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function fallbackProfile(userId: string, meta?: { username?: string; displayName?: string }): UserProfile {
  const now = new Date().toISOString();
  return {
    id: userId,
    username: meta?.username ?? `player_${userId.slice(0, 8)}`,
    displayName: meta?.displayName ?? 'لاعب قدها',
    avatarUrl: null,
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    wins: 0,
    losses: 0,
    totalMatches: 0,
    coins: 0,
    onboardingDone: false,
    createdAt: now,
    updatedAt: now,
  };
}

async function loadUserProfile(userId: string, meta?: { username?: string; displayName?: string }) {
  try {
    return await withAuthTimeout(ensureProfile(userId, meta), 'تحميل ملف الحساب');
  } catch (error) {
    console.warn('[Auth] profile bootstrap deferred', error);
    return fallbackProfile(userId, meta);
  }
}

function withAccountMeta(profile: UserProfile, authUser: { email?: string; is_anonymous?: boolean; app_metadata?: Record<string, unknown>; identities?: Array<{ provider?: string }> }): UserProfile {
  return {
    ...profile,
    email: authUser.email ?? null,
    authProvider: authUser.is_anonymous ? 'anonymous' : String(authUser.app_metadata?.provider ?? authUser.identities?.[0]?.provider ?? 'email'),
  };
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
        set({ user: withAccountMeta(profile, session.user), isAnonymousSession: Boolean(session.user.is_anonymous), isAuthenticated: true, sessionLoading: false });
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
      set({ user: withAccountMeta(profile, data.user), isAnonymousSession: true, isAuthenticated: true, sessionLoading: false });
    }
  },

  signInWithPassword: async (email, password) => {
    const { data, error } = await withAuthTimeout(
      supabase.auth.signInWithPassword({ email: email.trim(), password }),
      'تسجيل الدخول',
    );
    if (error) throw error;
    if (data.user) {
      const profile = await loadUserProfile(data.user.id, {
        username: data.user.user_metadata?.username,
        displayName: data.user.user_metadata?.display_name,
      });
      set({ user: withAccountMeta(profile, data.user), isAnonymousSession: false, isAuthenticated: true, sessionLoading: false });
    }
  },

  signUpWithPassword: async (email, password, displayName) => {
    const { data, error } = await withAuthTimeout(
      supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: displayName?.trim() || undefined },
          emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      }),
      'إنشاء الحساب',
    );
    if (error) throw error;
    if (data.user && data.session) {
      const profile = await loadUserProfile(data.user.id, { displayName: displayName?.trim() });
      set({ user: withAccountMeta(profile, data.user), isAnonymousSession: false, isAuthenticated: true, sessionLoading: false });
    }
    return { needsEmailConfirmation: Boolean(data.user && !data.session) };
  },

  signInWithGoogle: async () => {
    const { error } = await withAuthTimeout(
      supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
      }),
      'تسجيل الدخول بحساب Google',
    );
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
    if (profile) {
      const { data: { session } } = await supabase.auth.getSession();
      set({ user: session?.user ? withAccountMeta(profile, session.user) : profile });
    }
  },

  setUser: (user) => set({ user, isAuthenticated: !!user, isAnonymousSession: false }),
}));

if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') useAuthStore.getState().setUser(null);
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') void useAuthStore.getState().bootstrap();
  });
}
