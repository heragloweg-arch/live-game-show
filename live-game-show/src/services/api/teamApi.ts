import { supabase } from '../supabase/client';

const BASE = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/team`
  : '';

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Team API failed');
  return data as T;
}

export const teamMine = () => invoke<{ team: any; members?: any[]; role?: string }>({ action: 'my_team' });
export const teamCreate = (name: string, maxMembers = 5) => invoke({ action: 'create', name, maxMembers });
export const teamJoin = (code: string) => invoke({ action: 'join', code });
export const teamLeave = () => invoke({ action: 'leave' });
export const teamSetSize = (maxMembers: number) => invoke({ action: 'set_size', maxMembers });
export const teamQueue = (difficulty = 'normal') =>
  invoke<{ status: string; matchId?: string; message?: string; teamSize?: number }>({ action: 'queue', difficulty });
export const teamQueueStatus = () =>
  invoke<{ status: string; matchId?: string; teamSize?: number }>({ action: 'queue_status' });
export const teamCancelQueue = () => invoke({ action: 'cancel_queue' });

export const teamPickup = (desiredSize = 5, difficulty = 'normal') =>
  invoke<{ status: string; waiting?: number; need?: number; teamId?: string; message?: string }>({
    action: 'pickup',
    desiredSize,
    difficulty,
  });
export const teamPickupCancel = () => invoke({ action: 'pickup_cancel' });
