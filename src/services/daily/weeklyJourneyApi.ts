import { supabase } from '../supabase/client';

export interface WeeklyJourneyDay { date: string; completedSlots: number; complete: boolean }
export async function getWeeklyJourney(): Promise<{ today: string; days: WeeklyJourneyDay[] }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('يجب تسجيل الدخول أولاً');
  const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/economy`;
  const response = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '' },
    body: JSON.stringify({ action: 'weekly_journey' }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body.error ?? 'تعذر تحميل رحلة الأسبوع'));
  return body as { today: string; days: WeeklyJourneyDay[] };
}
