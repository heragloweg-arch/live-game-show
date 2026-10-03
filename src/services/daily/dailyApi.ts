import { supabase } from '../supabase/client';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : '';

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  const res = await fetch(`${FUNCTIONS_URL}/daily`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Daily API failed');
  return data as T;
}

export interface DailyChallengeView {
  id: string;
  type: string;
  subtype?: string;
  prompt: string;
  difficulty: string;
  time_limit_ms?: number;
  letter_pool?: string[];
  choices?: { choice_id?: string; id?: string; label: string }[];
}
export interface DailyState {
  date: string;
  completed: boolean;
  bonusCoins: number;
  bonusXp: number;
  challenge: DailyChallengeView;
  streak: { current_streak: number; longest_streak: number; last_daily_date: string | null };
}
export interface DailyPackSlot { id: string; pack_id: string; slot_number: number; bonus_coins: number; bonus_xp: number; challenge: DailyChallengeView; }
export interface DailyPackState {
  date: string;
  pack: { id: string; title: string; theme: string; bonus_coins: number; bonus_xp: number };
  slots: DailyPackSlot[];
  completed: { slot_id: string; outcome: string; points: number }[];
  streak: DailyState['streak'];
}

export function getDailyPack(): Promise<DailyPackState> { return invoke<DailyPackState>({ action: 'get_pack' }); }
export function submitDailyPackSlot(slotId: string, answer: string, responseTimeMs?: number) {
  return invoke<{ ok: boolean; correct: boolean; points: number; coinGain: number; xpGain: number; alreadyCompleted?: boolean; packComplete?: boolean; completed?: number; streak: DailyState['streak'] }>({ action: 'submit_slot', slotId, answer, responseTimeMs });
}
export function getTodayDaily(): Promise<DailyState> { return invoke<DailyState>({ action: 'get_today' }); }
export function submitDailyAnswer(answer: string, responseTimeMs?: number) { return invoke<{ correct: boolean; points: number; coinGain: number; xpGain: number; streak: DailyState['streak']; alreadyCompleted?: boolean }>({ action: 'submit', answer, responseTimeMs }); }
export function getStreak() { return invoke<{ streak: DailyState['streak'] }>({ action: 'get_streak' }); }
export function completeOnboarding() { return invoke<{ ok: boolean }>({ action: 'complete_onboarding' }); }
