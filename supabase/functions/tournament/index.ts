/**
 * Tournament / دوري الأبطال
 * actions: list | get | join | leave | my_entry | standings | generate_bracket | report_result | finalize | distribute_prizes | archive | create_next
 *
 * When registration reaches max_players → auto generate single-elim bracket + status=active
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';


function isTournamentAdmin(userId: string): boolean {
  const raw = Deno.env.get('TOURNAMENT_ADMIN_IDS') || '';
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return ids.includes(userId);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Fisher-Yates */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Invalid token' }, 401);

    const body = await req.json();
    const action = body.action as string;

    if (action === 'list') {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .in('status', ['registration', 'active', 'completed'])
        .order('starts_at', { ascending: false })
        .limit(20);
      if (error) return json({ error: error.message }, 500);

      const withCounts = [];
      for (const t of data ?? []) {
        const { count } = await supabase
          .from('tournament_entries')
          .select('*', { count: 'exact', head: true })
          .eq('tournament_id', t.id);
        withCounts.push({ ...t, entriesCount: count ?? 0 });
      }
      return json({ tournaments: withCounts });
    }

    if (action === 'get') {
      const id = body.tournamentId;
      const { data: t, error } = await supabase.from('tournaments').select('*').eq('id', id).single();
      if (error || !t) return json({ error: 'Not found' }, 404);
      const { data: entries } = await supabase
        .from('tournament_entries')
        .select('*, profile:profiles(id, username, display_name, avatar_url)')
        .eq('tournament_id', id)
        .order('points', { ascending: false });
      const { data: matches } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', id)
        .order('round_number')
        .order('created_at');
      return json({ tournament: t, entries: entries ?? [], matches: matches ?? [] });
    }

    if (action === 'join') {
      const tournamentId = body.tournamentId as string;
      const { data: t } = await supabase.from('tournaments').select('*').eq('id', tournamentId).single();
      if (!t) return json({ error: 'Tournament not found' }, 404);
      if (t.status !== 'registration') {
        return json({ error: 'التسجيل مغلق' }, 400);
      }

      const { count } = await supabase
        .from('tournament_entries')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId);
      if ((count ?? 0) >= t.max_players) return json({ error: 'الدوري ممتلئ' }, 400);

      const { data: existing } = await supabase
        .from('tournament_entries')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing) return json({ ok: true, alreadyJoined: true });

      const entryFee = t.entry_coins ?? 0;
      if (entryFee > 0) {
        const { data: prof } = await supabase.from('profiles').select('coins').eq('id', user.id).single();
        if ((prof?.coins ?? 0) < entryFee) return json({ error: 'رصيد العملات غير كافٍ' }, 400);
        await supabase
          .from('profiles')
          .update({ coins: (prof?.coins ?? 0) - entryFee })
          .eq('id', user.id);
        try {
          await supabase.from('wallet_ledger').insert({
            user_id: user.id,
            amount: -entryFee,
            type: 'tournament_entry',
            reference_id: tournamentId,
            balance_after: (prof?.coins ?? 0) - entryFee,
          });
        } catch {
          /* ledger schema may vary */
        }
      }

      const { error: joinErr } = await supabase.from('tournament_entries').insert({
        tournament_id: tournamentId,
        user_id: user.id,
        seed: (count ?? 0) + 1,
      });
      if (joinErr) return json({ error: joinErr.message }, 500);

      // Auto-bracket when full
      const { count: afterCount } = await supabase
        .from('tournament_entries')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId);

      let bracket = null;
      if ((afterCount ?? 0) >= t.max_players) {
        bracket = await generateBracket(supabase, tournamentId);
      }

      return json({
        ok: true,
        entryFee,
        filled: afterCount,
        maxPlayers: t.max_players,
        bracketGenerated: !!bracket,
        bracket,
      });
    }

    if (action === 'leave') {
      const tournamentId = body.tournamentId as string;
      const { data: t } = await supabase.from('tournaments').select('status').eq('id', tournamentId).single();
      if (t?.status !== 'registration') return json({ error: 'لا يمكن الانسحاب بعد بدء الدوري' }, 400);
      await supabase
        .from('tournament_entries')
        .delete()
        .eq('tournament_id', tournamentId)
        .eq('user_id', user.id);
      return json({ ok: true });
    }

    if (action === 'standings') {
      const tournamentId = body.tournamentId as string;
      const { data } = await supabase
        .from('tournament_entries')
        .select('*, profile:profiles(username, display_name, avatar_url)')
        .eq('tournament_id', tournamentId)
        .order('points', { ascending: false })
        .order('wins', { ascending: false });
      return json({ standings: data ?? [] });
    }

    if (action === 'my_entry') {
      const tournamentId = body.tournamentId as string;
      const { data } = await supabase
        .from('tournament_entries')
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('user_id', user.id)
        .maybeSingle();
      return json({ entry: data });
    }

    if (action === 'generate_bracket') {
      // admin gate generate_bracket
      if (!isTournamentAdmin(user.id) && action !== 'report_result') {
        return json({ error: 'Admin only', code: 'FORBIDDEN' }, 403);
      }

      const tournamentId = body.tournamentId as string;
      const { data: t } = await supabase.from('tournaments').select('*').eq('id', tournamentId).single();
      if (!t) return json({ error: 'Not found' }, 404);
      // Allow manual generate if registration and at least 2 players
      const bracket = await generateBracket(supabase, tournamentId, body.force === true);
      if (!bracket) return json({ error: 'تعذر توليد الشبكة — تحقق من عدد اللاعبين' }, 400);
      return json({ ok: true, bracket });
    }

    if (action === 'report_result') {
      // admin gate report_result
      if (!isTournamentAdmin(user.id) && action !== 'report_result') {
        return json({ error: 'Admin only', code: 'FORBIDDEN' }, 403);
      }

      const matchRowId = body.tournamentMatchId as string;
      const winnerId = body.winnerId as string;
      // Validate winner is one of the two players in this tournament match
      const { data: tmCheck } = await supabase.from('tournament_matches').select('*').eq('id', body.matchId).single();
      if (tmCheck && winnerId && winnerId !== tmCheck.player_a && winnerId !== tmCheck.player_b) {
        return json({ error: 'winnerId must be player_a or player_b' }, 400);
      }
      if (!isTournamentAdmin(user.id)) {
        // only participants can report
        if (user.id !== tmCheck?.player_a && user.id !== tmCheck?.player_b) {
          return json({ error: 'Only match participants or admin can report' }, 403);
        }
      }
      if (!matchRowId || !winnerId) return json({ error: 'tournamentMatchId and winnerId required' }, 400);

      const { data: tm } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('id', matchRowId)
        .single();
      if (!tm) return json({ error: 'Match not found' }, 404);
      if (tm.status === 'completed') return json({ ok: true, already: true });

      const loserId = tm.player_a === winnerId ? tm.player_b : tm.player_a;

      await supabase
        .from('tournament_matches')
        .update({ winner_id: winnerId, status: 'completed' })
        .eq('id', matchRowId);

      if (winnerId) {
        const { data: we } = await supabase
          .from('tournament_entries')
          .select('wins, points')
          .eq('tournament_id', tm.tournament_id)
          .eq('user_id', winnerId)
          .single();
        if (we) {
          await supabase
            .from('tournament_entries')
            .update({ wins: (we.wins ?? 0) + 1, points: (we.points ?? 0) + 3 })
            .eq('tournament_id', tm.tournament_id)
            .eq('user_id', winnerId);
        }
      }
      if (loserId) {
        const { data: le } = await supabase
          .from('tournament_entries')
          .select('losses')
          .eq('tournament_id', tm.tournament_id)
          .eq('user_id', loserId)
          .single();
        if (le) {
          await supabase
            .from('tournament_entries')
            .update({ losses: (le.losses ?? 0) + 1, eliminated: true })
            .eq('tournament_id', tm.tournament_id)
            .eq('user_id', loserId);
        }
      }

      // Advance winner into next round slot if exists
      await tryAdvanceWinner(supabase, tm, winnerId);

      // Complete tournament if no pending matches
      const { count: pending } = await supabase
        .from('tournament_matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tm.tournament_id)
        .neq('status', 'completed');
      if ((pending ?? 0) === 0) {
        // Auto crown from last winner
        const { data: lastWin } = await supabase
          .from('tournament_matches')
          .select('winner_id, round_number')
          .eq('tournament_id', tm.tournament_id)
          .eq('status', 'completed')
          .order('round_number', { ascending: false })
          .limit(1);
        const championId = lastWin?.[0]?.winner_id || winnerId;
        await supabase
          .from('tournaments')
          .update({
            status: 'completed',
            champion_id: championId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tm.tournament_id);
      }

      return json({ ok: true, winnerId });
    }


    if (action === 'finalize') {
      // admin gate finalize
      if (!isTournamentAdmin(user.id) && action !== 'report_result') {
        return json({ error: 'Admin only', code: 'FORBIDDEN' }, 403);
      }

      // Crown champion from last completed match / standings
      const tournamentId = body.tournamentId as string;
      const { data: trow } = await supabase.from('tournaments').select('*').eq('id', tournamentId).single();
      if (!trow) return json({ error: 'Not found' }, 404);

      const { data: standings } = await supabase
        .from('tournament_entries')
        .select('user_id, points, wins')
        .eq('tournament_id', tournamentId)
        .eq('eliminated', false)
        .order('points', { ascending: false })
        .order('wins', { ascending: false })
        .limit(2);

      // Prefer final match winner if exists
      const { data: finals } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('status', 'completed')
        .order('round_number', { ascending: false })
        .limit(1);

      let championId = finals?.[0]?.winner_id || standings?.[0]?.user_id || null;
      let runnerId = null as string | null;
      if (standings && standings.length > 1) {
        runnerId = standings.find((s: any) => s.user_id !== championId)?.user_id ?? standings[1]?.user_id;
      }

      await supabase.from('tournaments').update({
        status: 'completed',
        champion_id: championId,
        runner_up_id: runnerId,
        updated_at: new Date().toISOString(),
      }).eq('id', tournamentId);

      return json({
        ok: true,
        championId,
        runnerUpId: runnerId,
        tournament: { ...trow, status: 'completed', champion_id: championId, runner_up_id: runnerId },
      });
    }

    if (action === 'distribute_prizes') {
      if (!isTournamentAdmin(user.id)) return json({ error: 'Admin only' }, 403);
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('distribute_tournament_prizes', { p_tournament_id: body.tournamentId });
      if (rpcErr) return json({ error: rpcErr.message }, 500);
      return json(rpcRes);
    }
    if (action === 'distribute_prizes_legacy_disabled') {
      // admin gate distribute_prizes
      if (!isTournamentAdmin(user.id) && action !== 'report_result') {
        return json({ error: 'Admin only', code: 'FORBIDDEN' }, 403);
      }

      const tournamentId = body.tournamentId as string;
      const { data: trow } = await supabase.from('tournaments').select('*').eq('id', tournamentId).single();
      if (!trow) return json({ error: 'Not found' }, 404);
      if (trow.prizes_distributed) return json({ ok: true, already: true });
      if (trow.status !== 'completed') {
        return json({ error: 'يجب إنهاء الدوري (finalize) قبل توزيع الجوائز' }, 400);
      }

      const pool = Number(trow.prize_pool) || 0;
      const championShare = Math.floor(pool * 0.6);
      const runnerShare = Math.floor(pool * 0.3);
      const restShare = Math.max(0, pool - championShare - runnerShare);
      const paid: { userId: string; amount: number; place: string }[] = [];

      async function credit(userId: string | null, amount: number, place: string) {
        if (!userId || amount <= 0) return;
        const { data: prof } = await supabase.from('profiles').select('coins').eq('id', userId).single();
        const next = (prof?.coins ?? 0) + amount;
        await supabase.from('profiles').update({ coins: next }).eq('id', userId);
        try {
          await supabase.from('wallet_ledger').insert({
            user_id: userId,
            amount,
            type: 'tournament_prize',
            reference_id: tournamentId,
            balance_after: next,
          });
        } catch { /* ledger optional shape */ }
        paid.push({ userId, amount, place });
      }

      await credit(trow.champion_id, championShare, 'champion');
      await credit(trow.runner_up_id, runnerShare, 'runner_up');
      // small share to 3rd by points if any
      const { data: third } = await supabase
        .from('tournament_entries')
        .select('user_id')
        .eq('tournament_id', tournamentId)
        .order('points', { ascending: false })
        .range(2, 2);
      if (third?.[0]?.user_id) await credit(third[0].user_id, restShare, 'third');

      await supabase.from('tournaments').update({
        prizes_distributed: true,
        settled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', tournamentId);

      return json({ ok: true, paid, prizePool: pool });
    }

    if (action === 'archive') {
      // admin gate archive
      if (!isTournamentAdmin(user.id) && action !== 'report_result') {
        return json({ error: 'Admin only', code: 'FORBIDDEN' }, 403);
      }

      const tournamentId = body.tournamentId as string;
      await supabase.from('tournaments').update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      }).eq('id', tournamentId).eq('status', 'completed');
      return json({ ok: true });
    }

    if (action === 'create_next') {
      // admin gate create_next
      if (!isTournamentAdmin(user.id) && action !== 'report_result') {
        return json({ error: 'Admin only', code: 'FORBIDDEN' }, 403);
      }

      const tournamentId = body.tournamentId as string;
      const { data: prev } = await supabase.from('tournaments').select('*').eq('id', tournamentId).single();
      if (!prev) return json({ error: 'Not found' }, 404);

      const slug = `${prev.slug}-next-${Date.now().toString(36)}`;
      const { data: next, error } = await supabase.from('tournaments').insert({
        slug,
        title: body.title || `${prev.title} — الجولة التالية`,
        description: prev.description,
        status: 'registration',
        max_players: prev.max_players,
        entry_coins: prev.entry_coins,
        prize_pool: prev.prize_pool,
        rounds_total: prev.rounds_total,
        difficulty: prev.difficulty,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
        season_label: body.seasonLabel || `S${Date.now()}`,
      }).select().single();
      if (error) return json({ error: error.message }, 500);

      await supabase.from('tournaments').update({
        next_tournament_id: next.id,
        updated_at: new Date().toISOString(),
      }).eq('id', tournamentId);

      return json({ ok: true, tournament: next });
    }


    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('[tournament]', err);
    return json({ error: String(err) }, 500);
  }
});

/**
 * Single-elimination bracket.
 * Pads to power-of-2 with byes (null player_b / auto-win).
 */
async function generateBracket(supabase: any, tournamentId: string, force = false) {
  const { data: tmeta } = await supabase.from('tournaments').select('format').eq('id', tournamentId).single();
  if (tmeta?.format === 'round_robin') {
    return await generateRoundRobin(supabase, tournamentId, force);
  }

  const { data: t } = await supabase.from('tournaments').select('*').eq('id', tournamentId).single();
  if (!t) return null;
  if (t.status === 'active' && !force) {
    // already started — return existing
    const { data: existing } = await supabase
      .from('tournament_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('round_number');
    if (existing?.length) return { matches: existing, already: true };
  }
  if (t.status !== 'registration' && !force) return null;

  const { data: entries } = await supabase
    .from('tournament_entries')
    .select('user_id, seed')
    .eq('tournament_id', tournamentId);
  if (!entries || entries.length < 2) return null;

  // Clear old matches if regenerating
  await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId);

  const players = shuffle(entries.map((e: any) => e.user_id as string));
  const size = nextPowerOf2(players.length);
  while (players.length < size) players.push(null); // bye

  // Seed numbers
  for (let i = 0; i < entries.length; i++) {
    await supabase
      .from('tournament_entries')
      .update({ seed: i + 1 })
      .eq('tournament_id', tournamentId)
      .eq('user_id', entries[i].user_id);
  }

  const created: any[] = [];
  // Round 1 pairs
  for (let i = 0; i < size; i += 2) {
    const a = players[i];
    const b = players[i + 1];
    const isBye = !a || !b;
    const winner = isBye ? a || b : null;
    const { data: row } = await supabase
      .from('tournament_matches')
      .insert({
        tournament_id: tournamentId,
        round_number: 1,
        player_a: a,
        player_b: b,
        winner_id: winner,
        status: isBye ? 'completed' : 'pending',
      })
      .select()
      .single();
    if (row) created.push(row);
  }

  // Pre-create later round empty slots (structure)
  let roundMatches = size / 2;
  let round = 2;
  while (roundMatches >= 1) {
    for (let i = 0; i < roundMatches / 2; i++) {
      // only create placeholder rows for rounds > 1 when we have pairs from previous
      // Simpler: create empty pending matches for next rounds count
    }
    // Create roundMatches/2 slots? Actually for single elim next round count is roundMatches/2
    const nextCount = Math.floor(roundMatches / 2);
    if (nextCount < 1) break;
    for (let i = 0; i < nextCount; i++) {
      const { data: row } = await supabase
        .from('tournament_matches')
        .insert({
          tournament_id: tournamentId,
          round_number: round,
          player_a: null,
          player_b: null,
          status: 'pending',
        })
        .select()
        .single();
      if (row) created.push(row);
    }
    roundMatches = nextCount;
    round++;
  }

  // Advance bye winners into round 2
  const r1 = created.filter((m) => m.round_number === 1 && m.status === 'completed' && m.winner_id);
  for (const m of r1) {
    await tryAdvanceWinner(supabase, m, m.winner_id);
  }

  await supabase
    .from('tournaments')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', tournamentId);

  const { data: all } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('round_number');

  return { matches: all ?? created, size, players: players.length };
}

async function tryAdvanceWinner(supabase: any, tm: any, winnerId: string) {
  if (!winnerId) return;
  const nextRound = (tm.round_number ?? 1) + 1;

  // Find a next-round match with empty slot
  const { data: candidates } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tm.tournament_id)
    .eq('round_number', nextRound)
    .eq('status', 'pending')
    .order('created_at');

  if (!candidates?.length) return;

  // Pair index: R1 match order maps to R2 slots
  const { data: r1all } = await supabase
    .from('tournament_matches')
    .select('id')
    .eq('tournament_id', tm.tournament_id)
    .eq('round_number', tm.round_number)
    .order('created_at');
  const idx = (r1all ?? []).findIndex((x: any) => x.id === tm.id);
  const slot = Math.floor(Math.max(0, idx) / 2);
  const target = candidates[Math.min(slot, candidates.length - 1)];
  if (!target) return;

  if (!target.player_a) {
    await supabase.from('tournament_matches').update({ player_a: winnerId }).eq('id', target.id);
  } else if (!target.player_b) {
    await supabase.from('tournament_matches').update({ player_b: winnerId }).eq('id', target.id);
  }
}


async function generateRoundRobin(supabase: any, tournamentId: string, force = false) {
  const { data: t } = await supabase.from('tournaments').select('*').eq('id', tournamentId).single();
  if (!t) return null;
  if (t.status === 'active' && !force) return null;

  const { data: entries } = await supabase
    .from('tournament_entries')
    .select('user_id')
    .eq('tournament_id', tournamentId);
  const players = (entries || []).map((e: any) => e.user_id);
  if (players.length < 2) return null;

  await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId);

  const created: any[] = [];
  let n = 0;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      n++;
      const { data: row } = await supabase.from('tournament_matches').insert({
        tournament_id: tournamentId,
        round_number: 1,
        match_index: n,
        player_a: players[i],
        player_b: players[j],
        status: 'pending',
      }).select().single();
      if (row) created.push(row);
    }
  }
  await supabase.from('tournaments').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', tournamentId);
  return created;
}

