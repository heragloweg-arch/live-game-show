/**
 * Investor / soft-launch metrics warehouse
 * actions: snapshot | rebuild_day | list_days | overview
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authErr || !user) return json({ error: 'Invalid token' }, 401);

    const admins = (Deno.env.get('METRICS_ADMIN_IDS') || Deno.env.get('TOURNAMENT_ADMIN_IDS') || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    if (admins.length && !admins.includes(user.id)) {
      return json({ error: 'Admin only', code: 'FORBIDDEN' }, 403);
    }
    // If no admin list configured, still require auth but log warning (soft-launch)
    if (!admins.length) {
      return json({ error: 'Metrics locked until METRICS_ADMIN_IDS configured', code: 'ADMIN_REQUIRED' }, 503);
    }

    const body = await req.json();
    const action = body.action as string;

    if (action === 'overview') {
      const { count: profiles } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const { count: matches } = await supabase.from('matches').select('*', { count: 'exact', head: true });
      const { count: finished } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .in('status', ['MATCH_FINISHED', 'FINAL_RESULT']);
      const { count: rooms } = await supabase.from('rooms').select('*', { count: 'exact', head: true });
      const { count: coupleActive } = await supabase
        .from('couples')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      const { data: days } = await supabase
        .from('analytics_daily')
        .select('*')
        .order('day', { ascending: false })
        .limit(14);

      const completion =
        matches && matches > 0 ? (finished ?? 0) / matches : null;

      const { count: mpFinished } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .in('mode', ['1v1', 'couple', 'team'])
        .in('status', ['MATCH_FINISHED', 'FINAL_RESULT']);
      const northStar = {
        completedMultiplayerMatches: mpFinished ?? 0,
        definition: 'Completed multiplayer matches (1v1/couple/team)',
      };

      return json({
        overview: {
          northStar,
          totalUsers: profiles ?? 0,
          totalMatches: matches ?? 0,
          finishedMatches: finished ?? 0,
          matchCompletionRate: completion,
          rooms: rooms ?? 0,
          activeCouples: coupleActive ?? 0,
          qualityGates: {
            minMatchCompletionRate: 0.7,
            targetD1Retention: 0.25,
          },
        },
        last14Days: days ?? [],
        generatedAt: new Date().toISOString(),
      });
    }

    if (action === 'rebuild_day') {
      const day = typeof body.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.day)
        ? body.day
        : new Date().toISOString().slice(0, 10);
      const start = `${day}T00:00:00.000Z`;
      const end = `${day}T23:59:59.999Z`;
      const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select('id,status,created_at')
        .gte('created_at', start)
        .lte('created_at', end);
      if (matchesError) return json({ error: matchesError.message, code: 'METRICS_SOURCE_ERROR' }, 500);

      const matchRows = matches ?? [];
      const matchIds = matchRows.map((match) => match.id);
      const finishedStatuses = new Set(['MATCH_FINISHED', 'FINAL_RESULT']);
      const matchesFinished = matchRows.filter((match) => finishedStatuses.has(match.status)).length;
      let participants: Array<{ user_id: string | null }> = [];
      let answers: Array<{ outcome: string }> = [];
      if (matchIds.length) {
        const [{ data: participantRows, error: participantsError }, { data: answerRows, error: answersError }] = await Promise.all([
          supabase.from('match_participants').select('user_id').in('match_id', matchIds),
          supabase.from('answer_submissions').select('outcome').in('match_id', matchIds),
        ]);
        if (participantsError || answersError) {
          return json({ error: participantsError?.message ?? answersError?.message, code: 'METRICS_SOURCE_ERROR' }, 500);
        }
        participants = participantRows ?? [];
        answers = answerRows ?? [];
      }

      const answersSubmitted = answers.length;
      const answersCorrect = answers.filter((answer) => answer.outcome === 'correct').length;
      const answersWrong = answers.filter((answer) => answer.outcome === 'wrong').length;
      const matchesAbandoned = Math.max(0, matchRows.length - matchesFinished);
      const dropRate = matchRows.length ? matchesAbandoned / matchRows.length : 0;
      const dau = new Set(participants.map((participant) => participant.user_id).filter(Boolean)).size;
      const row = {
        day,
        dau,
        matches_started: matchRows.length,
        matches_finished: matchesFinished,
        answers_submitted: answersSubmitted,
        answers_correct: answersCorrect,
        answers_wrong: answersWrong,
        match_abandonments: matchesAbandoned,
        drop_rate: dropRate,
        source: 'server',
        updated_at: new Date().toISOString(),
      };
      const { error: upsertError } = await supabase.from('analytics_daily').upsert(row, { onConflict: 'day' });
      if (upsertError) return json({ error: upsertError.message, code: 'METRICS_WRITE_ERROR' }, 500);
      return json({ ok: true, day, metrics: row });
    }

    if (action === 'ingest_day') {
      return json({
        error: 'Client aggregate ingestion is disabled; use rebuild_day.',
        code: 'SERVER_DERIVED_ONLY',
      }, 410);
    }

    if (action === 'snapshot') {
      // Build investor snapshot from current overview + client funnel
      const { data: days } = await supabase.from('analytics_daily').select('*').order('day', { ascending: false }).limit(30);
      const label = body.label || `snapshot-${new Date().toISOString().slice(0, 10)}`;
      const payload = {
        clientFunnel: body.funnel || {},
        retention: body.retention || {},
        days: days ?? [],
        notes: body.notes || 'Soft-launch investor snapshot',
        at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('investor_snapshots').insert({
        label,
        payload,
      }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, snapshot: data });
    }

    if (action === 'list_snapshots') {
      const { data } = await supabase
        .from('investor_snapshots')
        .select('id, label, created_at, payload')
        .order('created_at', { ascending: false })
        .limit(20);
      return json({ snapshots: data ?? [] });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
