import { supabase } from '../supabase/client';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : '';

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  const res = await fetch(`${FUNCTIONS_URL}/daily`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Daily API failed');
  return data as T;
}

export interface DailyState {
  date: string;
  completed: boolean;
  bonusCoins: number;
  bonusXp: number;
  challenge: {
    id: string;
    type: string;
    prompt: string;
    difficulty: string;
    timeLimitMs: number;
    choices?: { id: string; label: string }[];
  };
  streak: {
    current_streak: number;
    longest_streak: number;
    last_daily_date: string | null;
  };
}

export async function getTodayDaily(): Promise<DailyState> {
  return invoke<DailyState>({ action: 'get_today' });
}

export async function submitDailyAnswer(answer: string, responseTimeMs?: number) {
  return invoke<{
    correct: boolean;
    points: number;
    coinGain: number;
    xpGain: number;
    streak: DailyState['streak'];
    alreadyCompleted?: boolean;
  }>({ action: 'submit', answer, responseTimeMs });
}

export async function getStreak() {
  return invoke<{ streak: DailyState['streak'] }>({ action: 'get_streak' });
}

export async function completeOnboarding() {
  return invoke<{ ok: boolean }>({ action: 'complete_onboarding' });
}
