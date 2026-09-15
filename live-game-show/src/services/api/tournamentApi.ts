import { supabase } from '../supabase/client';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : '';

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  const res = await fetch(`${FUNCTIONS_URL}/tournament`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Tournament API failed');
  return data as T;
}

export interface Tournament {
  id: string;
  slug: string;
  title: string;
  description?: string;
  status: string;
  max_players: number;
  entry_coins: number;
  prize_pool: number;
  rounds_total: number;
  difficulty: string;
  starts_at?: string;
  ends_at?: string;
  entriesCount?: number;
}

export async function listTournaments() {
  return invoke<{ tournaments: Tournament[] }>({ action: 'list' });
}

export async function getTournament(tournamentId: string) {
  return invoke<{
    tournament: Tournament;
    entries: any[];
    matches: any[];
  }>({ action: 'get', tournamentId });
}

export async function joinTournament(tournamentId: string) {
  return invoke<{ ok: boolean; alreadyJoined?: boolean; entryFee?: number }>({
    action: 'join',
    tournamentId,
  });
}

export async function leaveTournament(tournamentId: string) {
  return invoke<{ ok: boolean }>({ action: 'leave', tournamentId });
}

export async function getStandings(tournamentId: string) {
  return invoke<{ standings: any[] }>({ action: 'standings', tournamentId });
}

export async function getMyEntry(tournamentId: string) {
  return invoke<{ entry: any | null }>({ action: 'my_entry', tournamentId });
}

export async function generateBracket(tournamentId: string, force = false) {
  return invoke<{ ok: boolean; bracket: any }>({
    action: 'generate_bracket',
    tournamentId,
    force,
  });
}

export async function reportTournamentResult(tournamentMatchId: string, winnerId: string) {
  return invoke<{ ok: boolean; winnerId: string }>({
    action: 'report_result',
    tournamentMatchId,
    winnerId,
  });
}

export async function finalizeTournament(tournamentId: string) {
  return invoke<{ ok: boolean; championId?: string; runnerUpId?: string }>({
    action: 'finalize',
    tournamentId,
  });
}
export async function distributePrizes(tournamentId: string) {
  return invoke<{ ok: boolean; paid?: any[]; already?: boolean }>({
    action: 'distribute_prizes',
    tournamentId,
  });
}
export async function createNextTournament(tournamentId: string, title?: string) {
  return invoke<{ ok: boolean; tournament: any }>({
    action: 'create_next',
    tournamentId,
    title,
  });
}
