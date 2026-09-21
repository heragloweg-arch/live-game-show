import { supabase } from '../supabase/client';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : '';

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
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

  let data: any = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      res.ok ? 'Daily API returned non-JSON' : `Daily API failed (${res.status})`
    );
  }
  if (!res.ok) throw new Error(data?.error ?? `Daily API failed (${res.status})`);
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
    subtype?: string;
    prompt: string;
    difficulty: string;
    timeLimitMs: number;
    letterPool?: string[];
    /** عدد الكلمات المطلوب استخراجها من الحروف */
    targetWordCount?: number;
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

/** إجابة واحدة أو عدة كلمات مفصولة بـ | */
export async function submitDailyAnswer(answer: string, responseTimeMs?: number) {
  return invoke<{
    correct: boolean;
    points: number;
    coinGain: number;
    xpGain: number;
    streak: DailyState['streak'];
    alreadyCompleted?: boolean;
    matchedWords?: string[];
    needed?: number;
  }>({ action: 'submit', answer, responseTimeMs });
}

export async function getStreak() {
  return invoke<{ streak: DailyState['streak'] }>({ action: 'get_streak' });
}

export async function completeOnboarding() {
  return invoke<{ ok: boolean }>({ action: 'complete_onboarding' });
}

