/**
 * Client API for Match + Matchmaking + Answer Edge Functions.
 */

import { supabase } from '../supabase/client';
import type { MatchState, Difficulty, AnswerResult } from '../../types';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : '';

export interface MatchReward {
  userId: string;
  won?: boolean;
  draw?: boolean;
  xpGain?: number;
  coinGain?: number;
  coinsBalance?: number;
  profile?: {
    wins: number;
    losses: number;
    total_matches: number;
    xp: number;
    level: number;
    xp_to_next: number;
    coins: number;
    username?: string;
    display_name?: string;
  };
}

export interface MatchResponse {
  match: MatchState;
  rewards?: MatchReward[];
  alreadySettled?: boolean;
}

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function invoke<T>(fnName: string, body: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${FUNCTIONS_URL}/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Function ${fnName} failed`);
  return data as T;
}

export async function createSoloMatch(difficulty: Difficulty = 'normal'): Promise<MatchState> {
  const data = await invoke<{ match: MatchState }>('match', {
    action: 'create_solo',
    difficulty,
  });
  return data.match;
}

export async function create1v1Match(opponentId: string): Promise<MatchState> {
  const data = await invoke<{ match: MatchState }>('match', {
    action: 'create_1v1',
    opponentId,
  });
  return data.match;
}

export async function getMatch(matchId: string): Promise<MatchState> {
  const data = await invoke<{ match: MatchState }>('match', {
    action: 'get',
    matchId,
  });
  return data.match;
}

export async function startRound(matchId: string): Promise<MatchState> {
  const data = await invoke<{ match: MatchState }>('match', {
    action: 'start_round',
    matchId,
  });
  return data.match;
}

export async function nextRound(matchId: string): Promise<MatchState> {
  const data = await invoke<{ match: MatchState }>('match', {
    action: 'next_round',
    matchId,
  });
  return data.match;
}

export async function finishMatch(matchId: string): Promise<MatchResponse> {
  return invoke<MatchResponse>('match', {
    action: 'finish',
    matchId,
  });
}

export async function submitAnswer(params: {
  matchId: string;
  roundId: string;
  requestId: string;
  answer: string;
  clientTimestamp: string;
}): Promise<AnswerResult & { total?: number }> {
  const data = await invoke<{ result: AnswerResult & { total?: number }; duplicate?: boolean }>(
    'answer',
    params
  );
  return data.result;
}

export type MatchmakingStatus =
  | { status: 'queued'; waitedMs?: number; message?: string }
  | { status: 'matched'; match?: { matchId: string }; matchId?: string }
  | { status: 'timeout'; message?: string }
  | { status: 'cancelled' }
  | { status: 'idle' };

export async function joinMatchmaking(
  difficulty: Difficulty = 'normal',
  region = 'mena'
): Promise<MatchmakingStatus> {
  return invoke<MatchmakingStatus>('matchmaking', {
    action: 'join',
    difficulty,
    region,
  });
}

export async function cancelMatchmaking(): Promise<MatchmakingStatus> {
  return invoke<MatchmakingStatus>('matchmaking', { action: 'cancel' });
}

export async function getMatchmakingStatus(): Promise<MatchmakingStatus> {
  return invoke<MatchmakingStatus>('matchmaking', { action: 'status' });
}

export async function createCoupleMatch(difficulty: Difficulty = 'normal'): Promise<{ match: MatchState; coupleId?: string }> {
  return invoke('match', {
    action: 'create_couple',
    difficulty,
  });
}

export async function createMatchInvite(difficulty: Difficulty = 'normal') {
  return invoke<{ token: string; invite: any; sharePath: string }>('match', {
    action: 'create_invite',
    difficulty,
  });
}
export async function acceptMatchInvite(token: string) {
  return invoke<{ match: MatchState }>('match', {
    action: 'accept_invite',
    token,
  });
}
