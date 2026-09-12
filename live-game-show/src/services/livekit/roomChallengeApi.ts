/**
 * Live room challenge API
 */

import { supabase } from '../supabase/client';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : '';

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const res = await fetch(`${FUNCTIONS_URL}/room`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Room challenge failed');
  return data as T;
}

export interface RoomChallenge {
  id: string;
  type: string;
  subtype?: string;
  prompt: string;
  difficulty: string;
  timeLimitMs: number;
  letterPool?: string[];
  choices?: { id: string; label: string }[];
}

export interface RoomRoundState {
  id: string;
  roomId: string;
  roundNumber: number;
  status: 'pending' | 'active' | 'revealed' | 'closed';
  serverStartAt: string | null;
  serverEndAt: string | null;
  sequence: number;
  challenge: RoomChallenge;
}

export async function startRoomChallenge(roomId: string) {
  return invoke<{ round: RoomRoundState }>({ action: 'start_challenge', roomId });
}

export async function getRoomChallengeState(roomId: string) {
  return invoke<{
    room: { id: string; code: string; title: string; status: string; hostId: string };
    round: RoomRoundState | null;
    serverNow: string;
  }>({ action: 'get_state', roomId });
}

export async function submitRoomAnswer(params: {
  roomId: string;
  roomRoundId: string;
  requestId: string;
  answer: string;
  clientTimestamp: string;
}) {
  return invoke<{
    result: {
      requestId: string;
      outcome: string;
      points: number;
      bonus: number;
      total?: number;
      duplicate?: boolean;
    };
  }>({ action: 'submit_answer', ...params });
}

export async function revealRoomRound(roomId: string, roomRoundId: string) {
  return invoke({ action: 'reveal', roomId, roomRoundId });
}

export async function closeRoomRound(roomId: string, roomRoundId: string) {
  return invoke({ action: 'close_round', roomId, roomRoundId });
}

export async function getRoomLeaderboard(roomId: string) {
  return invoke<{
    leaderboard: { userId: string; name: string; score: number; avatarUrl: string | null }[];
  }>({ action: 'leaderboard', roomId });
}
