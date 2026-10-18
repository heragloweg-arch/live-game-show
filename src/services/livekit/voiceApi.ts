/**
 * Voice / Room API — talks to Edge Function `voice`
 */

import { supabase } from '../supabase/client';
import { getFunctionsUrl, getSupabaseAnonKey } from '../../config/runtime';

const FUNCTIONS_URL = getFunctionsUrl();

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
      apikey: getSupabaseAnonKey(),
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
  accessMode?: 'trial' | 'subscription' | 'coins';
  nextChargeAt?: string | null;
  coinCost?: number;
  intervalSeconds?: number;
  socialProvider?: 'tiktok' | null;
  socialAccountId?: string | null;
  coins?: number;
}

export interface HostStatus {
  trialAvailable: boolean;
  trialMinutes: number;
  coinCost: number;
  intervalMinutes: number;
  coins: number;
  hostSubscription: boolean;
  subscriptionExpiresAt: string | null;
  tiktok: {
    connected: boolean;
    openId?: string;
    displayName?: string | null;
    avatarUrl?: string | null;
    connectedAt?: string;
  };
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

export async function createHostRoom(title: string, social?: { provider: 'tiktok'; accountId: string }): Promise<RoomInfo> {
  const data = await invoke<{ room: RoomInfo }>({
    action: 'create_room',
    title,
    socialProvider: social?.provider,
    socialAccountId: social?.accountId,
  });
  return data.room;
}

export async function fetchHostStatus(): Promise<HostStatus> {
  return invoke<HostStatus>({ action: 'host_status' });
}

export async function heartbeatHostRoom(roomId: string) {
  return invoke<{ ok: boolean; billing: { active: boolean; reason?: string; charged?: number; next_charge_at?: string | null; coins?: number } }>({ action: 'host_heartbeat', roomId });
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
