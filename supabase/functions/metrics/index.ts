/**
 * Investor / soft-launch metrics warehouse
 * actions: snapshot | ingest_day | list_days | overview
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

    if (action === 'ingest_day') {
      // Client/session aggregate push (soft-launch). Server merges.
      const day = body.day || new Date().toISOString().slice(0, 10);
      const row = {
        day,
        dau: Number(body.dau) || 1,
        matches_started: Number(body.matches_started) || 0,
        matches_finished: Number(body.matches_finished) || 0,
        ad_impressions: Number(body.ad_impressions) || 0,
        revenue_micros: Number(body.revenue_micros) || 0,
        new_users: Number(body.new_users) || 0,
        updated_at: new Date().toISOString(),
      };
      const { data: existing } = await supabase.from('analytics_daily').select('*').eq('day', day).maybeSingle();
      if (existing) {
        await supabase.from('analytics_daily').update({
          dau: Math.max(existing.dau, row.dau),
          matches_started: existing.matches_started + row.matches_started,
          matches_finished: existing.matches_finished + row.matches_finished,
          ad_impressions: existing.ad_impressions + row.ad_impressions,
          revenue_micros: existing.revenue_micros + row.revenue_micros,
          new_users: existing.new_users + row.new_users,
          updated_at: row.updated_at,
        }).eq('day', day);
      } else {
        await supabase.from('analytics_daily').insert(row);
      }
      return json({ ok: true, day });
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
