/**
 * Authorization helpers — aligned with match_status enum
 */

const TERMINAL = new Set([
  'MATCH_FINISHED',
  'FINAL_RESULT',
  'MATCH_TERMINATED',
  'FINISHED',
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

/** All human players submitted OR server time expired */
export async function canAdvanceRound(
  supabase: any,
  matchId: string,
  roundId: string,
  _serverEndAt?: string | null
): Promise<{ can: boolean; reason?: string }> {
  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).maybeSingle();
  if (!round) return { can: false, reason: 'no_round' };

  const endAt = _serverEndAt || round.server_end_at;
  if (endAt && new Date(endAt).getTime() <= Date.now()) {
    return { can: true, reason: 'time_expired' };
  }

  const { data: humans } = await supabase
    .from('match_participants')
    .select('user_id')
    .eq('match_id', matchId)
    .eq('is_ai', false);
  const humanIds = (humans || []).map((h: any) => h.user_id).filter(Boolean);
  if (!humanIds.length) return { can: true, reason: 'no_humans' };

  const { count } = await supabase
    .from('answer_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('round_id', roundId)
    .in('user_id', humanIds);

  if ((count ?? 0) >= humanIds.length) {
    return { can: true, reason: 'all_answered' };
  }
  return { can: false, reason: 'waiting_answers' };
}
