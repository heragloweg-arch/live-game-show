/**
 * Voice / Room API — talks to Edge Function `voice`
 */

import { supabase } from '../supabase/client';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : '';

async function token(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return session.access_token;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const t = await token();
  const res = await fetch(`${FUNCTIONS_URL}/voice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${t}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? data.message ?? 'Voice API failed');
  return data as T;
}

export interface RoomInfo {
  id: string;
  code: string;
  title: string;
  status: 'waiting' | 'live' | 'ended';
  hostId: string;
}

export interface LiveKitCredentials {
  token: string;
  url: string;
  roomName: string;
  roomId: string;
  code: string;
  isHost: boolean;
  identity: string;
}

export interface RoomParticipant {
  userId: string;
  isHost: boolean;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: string;
}

export async function createRoom(title: string): Promise<RoomInfo> {
  const data = await invoke<{ room: RoomInfo }>({ action: 'create_room', title });
  return data.room;
}

export async function joinRoom(code: string): Promise<RoomInfo> {
  const data = await invoke<{ room: RoomInfo }>({ action: 'join_room', code });
  return data.room;
}

export async function goLive(roomId: string): Promise<void> {
  await invoke({ action: 'go_live', roomId });
}

export async function endRoom(roomId: string): Promise<void> {
  await invoke({ action: 'end_room', roomId });
}

export async function fetchLiveKitToken(
  roomId: string,
  canPublish?: boolean
): Promise<LiveKitCredentials> {
  return invoke<LiveKitCredentials>({
    action: 'token',
    roomId,
    canPublish,
  });
}

export async function listParticipants(roomId: string): Promise<RoomParticipant[]> {
  const data = await invoke<{ participants: RoomParticipant[] }>({
    action: 'list_participants',
    roomId,
  });
  return data.participants ?? [];
}
