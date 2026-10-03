/**
 * Profile API — profiles table is the source of truth for identity & progress.
 */

import { supabase } from '../supabase/client';
import type { UserProfile } from '../../types';

function mapRow(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id),
    username: String(row.username ?? 'player'),
    displayName: String(row.display_name ?? 'لاعب قدها'),
    avatarUrl: (row.avatar_url as string | null) ?? null,
    level: Number(row.level ?? 1),
    xp: Number(row.xp ?? 0),
    xpToNextLevel: Number(row.xp_to_next ?? 100),
    wins: Number(row.wins ?? 0),
    losses: Number(row.losses ?? 0),
    totalMatches: Number(row.total_matches ?? 0),
    coins: Number(row.coins ?? 0),
    onboardingDone: Boolean(row.onboarding_done ?? false),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[profile] fetch', error.message);
    return null;
  }
  if (!data) return null;
  return mapRow(data);
}

/** Ensure row exists (trigger should create it; this is a safety net). */
export async function ensureProfile(
  userId: string,
  meta?: { username?: string; displayName?: string }
): Promise<UserProfile> {
  const existing = await fetchProfile(userId);
  if (existing) return existing;

  const username = meta?.username ?? `player_${userId.slice(0, 8)}`;
  const displayName = meta?.displayName ?? 'لاعب قدها';

  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    username,
    display_name: displayName,
  });

  if (error) {
    console.warn('[profile] ensure upsert', error.message);
  }

  const again = await fetchProfile(userId);
  if (again) return again;

  // Offline / DB not ready — return ephemeral profile
  return {
    id: userId,
    username,
    displayName,
    avatarUrl: null,
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    wins: 0,
    losses: 0,
    totalMatches: 0,
    coins: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function updateProfile(
  userId: string,
  patch: { displayName?: string; username?: string; avatarUrl?: string | null }
): Promise<UserProfile | null> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.displayName !== undefined) payload.display_name = patch.displayName;
  if (patch.username !== undefined) payload.username = patch.username;
  if (patch.avatarUrl !== undefined) payload.avatar_url = patch.avatarUrl;

  const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
  if (error) throw new Error(error.message);
  return fetchProfile(userId);
}

export async function fetchLeaderboard(limit = 20): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('wins', { ascending: false })
    .order('xp', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[profile] leaderboard', error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

export interface MatchHistoryRecord {
  match_id: string;
  score: number;
  side: string;
  is_ai: boolean;
  joined_at: string;
  matches: {
    id: string;
    mode: string;
    status: string;
    winner_id: string | null;
    created_at: string;
    ended_at: string | null;
    total_rounds: number;
  } | null;
}

export async function fetchMatchHistory(userId: string, limit = 15): Promise<MatchHistoryRecord[]> {
  const { data, error } = await supabase
    .from('match_participants')
    .select(
      `
      match_id,
      score,
      side,
      is_ai,
      joined_at,
      matches:match_id (
        id,
        mode,
        status,
        winner_id,
        created_at,
        ended_at,
        total_rounds
      )
    `
    )
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[profile] history', error.message);
    return [];
  }
  return (data ?? []) as unknown as MatchHistoryRecord[];
}

export interface RecentOpponent {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  lastMatchId: string;
  playedAt: string;
}

export async function fetchRecentOpponents(userId: string, limit = 5): Promise<RecentOpponent[]> {
  const { data: mine, error } = await supabase
    .from('match_participants')
    .select('match_id, joined_at, matches:match_id(status, ended_at, created_at)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })
    .limit(30);
  if (error) return [];
  const matchIds = (mine ?? []).filter((row) => ['MATCH_FINISHED', 'FINAL_RESULT'].includes((row.matches as { status?: string } | null)?.status ?? '')).map((row) => row.match_id);
  if (!matchIds.length) return [];
  const { data: others } = await supabase
    .from('match_participants')
    .select('match_id, user_id, joined_at, profiles:user_id(id, username, display_name, avatar_url)')
    .in('match_id', matchIds)
    .neq('user_id', userId);
  const seen = new Set<string>();
  const result: RecentOpponent[] = [];
  for (const row of others ?? []) {
    const profile = row.profiles as { id?: string; username?: string; display_name?: string; avatar_url?: string | null } | null;
    if (!profile?.id || seen.has(profile.id)) continue;
    seen.add(profile.id);
    result.push({ userId: profile.id, username: profile.username ?? 'player', displayName: profile.display_name ?? 'لاعب قدها', avatarUrl: profile.avatar_url ?? null, lastMatchId: row.match_id, playedAt: row.joined_at });
    if (result.length >= limit) break;
  }
  return result;
}
