/**
 * Authorization helpers — aligned with match_status enum
 */

const TERMINAL = new Set([
  'MATCH_FINISHED',
  'FINAL_RESULT',
  'MATCH_TERMINATED',
  'FINISHED', // legacy alias if any
  'CANCELLED',
]);

export async function assertMatchParticipant(
  supabase: any,
  matchId: string,
  userId: string
): Promise<{ ok: true; participant: any } | { ok: false; error: string; status: number }> {
  if (!matchId) return { ok: false, error: 'matchId required', status: 400 };

  const { data: participant } = await supabase
    .from('match_participants')
    .select('*')
    .eq('match_id', matchId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!participant) {
    return { ok: false, error: 'Not a participant of this match', status: 403 };
  }
  return { ok: true, participant };
}

export async function assertMatchNotFinished(
  supabase: any,
  matchId: string
): Promise<{ ok: true; match: any } | { ok: false; error: string; status: number }> {
  const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).single();
  if (!match) return { ok: false, error: 'Match not found', status: 404 };
  if (TERMINAL.has(String(match.status))) {
    return { ok: false, error: 'Match already finished', status: 409 };
  }
  return { ok: true, match };
}

export type RoundAdvanceGate =
  | { can: true; reason: 'TIME_EXPIRED' | 'ALL_ANSWERED' }
  | { can: false; reason: 'ROUND_NOT_FOUND' | 'WAITING_FOR_OPPONENT' };

/** All human players submitted OR server time expired. */
export async function canAdvanceRound(
  supabase: any,
  matchId: string,
  roundId: string
): Promise<RoundAdvanceGate> {
  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).maybeSingle();
  if (!round) return { can: false, reason: 'ROUND_NOT_FOUND' };
  if (round.server_end_at && new Date(round.server_end_at).getTime() <= Date.now()) {
    return { can: true, reason: 'TIME_EXPIRED' };
  }
  const { data: humans } = await supabase
    .from('match_participants')
    .select('user_id')
    .eq('match_id', matchId)
    .eq('is_ai', false);
  const humanIds = (humans || []).map((h: any) => h.user_id).filter(Boolean);
  if (!humanIds.length) return { can: true, reason: 'ALL_ANSWERED' };
  const { count } = await supabase
    .from('answer_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('round_id', roundId)
    .in('user_id', humanIds);
  return (count ?? 0) >= humanIds.length
    ? { can: true, reason: 'ALL_ANSWERED' }
    : { can: false, reason: 'WAITING_FOR_OPPONENT' };
}
