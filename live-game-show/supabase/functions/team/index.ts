/**
 * Teams — manage roster + queue team vs team (1–15 per side)
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

function code6() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
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
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Invalid token' }, 401);

    const body = await req.json();
    const action = body.action as string;

    if (action === 'my_team') {
      const { data: mem } = await supabase.from('team_members').select('team_id, role').eq('user_id', user.id).maybeSingle();
      if (!mem) return json({ team: null });
      const { data: team } = await supabase.from('teams').select('*').eq('id', mem.team_id).single();
      const { data: members } = await supabase
        .from('team_members')
        .select('user_id, role, joined_at, profile:profiles(username, display_name, avatar_url)')
        .eq('team_id', mem.team_id);
      return json({ team, role: mem.role, members: members ?? [] });
    }

    if (action === 'create') {
      const name = String(body.name || 'فريق قدها').slice(0, 40);
      const maxMembers = Math.min(15, Math.max(1, Number(body.maxMembers) || 5));
      const { data: team, error } = await supabase.from('teams').insert({
        name,
        invite_code: code6(),
        owner_id: user.id,
        max_members: maxMembers,
      }).select().single();
      if (error) return json({ error: error.message }, 500);
      await supabase.from('team_members').insert({ team_id: team.id, user_id: user.id, role: 'owner' });
      return json({ team });
    }

    if (action === 'join') {
      const code = String(body.code || '').trim().toUpperCase();
      const { data: team } = await supabase.from('teams').select('*').eq('invite_code', code).maybeSingle();
      if (!team) return json({ error: 'رمز غير صالح' }, 404);
      const { count } = await supabase.from('team_members').select('*', { count: 'exact', head: true }).eq('team_id', team.id);
      if ((count ?? 0) >= team.max_members) return json({ error: 'الفريق ممتلئ' }, 400);
      // one team per user
      await supabase.from('team_members').delete().eq('user_id', user.id);
      await supabase.from('team_members').insert({ team_id: team.id, user_id: user.id, role: 'member' });
      return json({ team });
    }

    if (action === 'leave') {
      await supabase.from('team_match_queue').delete().eq('owner_id', user.id);
      await supabase.from('team_members').delete().eq('user_id', user.id);
      return json({ ok: true });
    }

    if (action === 'set_size') {
      const size = Math.min(15, Math.max(1, Number(body.maxMembers) || 5));
      const { data: mem } = await supabase.from('team_members').select('team_id, role').eq('user_id', user.id).maybeSingle();
      if (!mem || mem.role !== 'owner') return json({ error: 'المالك فقط' }, 403);
      await supabase.from('teams').update({ max_members: size }).eq('id', mem.team_id);
      return json({ ok: true, maxMembers: size });
    }

    if (action === 'queue') {
      const difficulty = body.difficulty ?? 'normal';
      const { data: mem } = await supabase.from('team_members').select('team_id, role').eq('user_id', user.id).maybeSingle();
      if (!mem) return json({ error: 'انضم لفريق أولاً' }, 400);
      if (mem.role !== 'owner') return json({ error: 'قائد الفريق فقط يبدأ الطابور' }, 403);
      const { data: team } = await supabase.from('teams').select('*').eq('id', mem.team_id).single();
      const { count } = await supabase.from('team_members').select('*', { count: 'exact', head: true }).eq('team_id', team.id);
      const teamSize = team.max_members;
      if ((count ?? 0) < 1) return json({ error: 'الفريق فارغ' }, 400);

      // Try find opponent same size
      const { data: opp } = await supabase
        .from('team_match_queue')
        .select('*')
        .eq('status', 'queued')
        .eq('team_size', teamSize)
        .eq('difficulty', difficulty)
        .neq('team_id', team.id)
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (opp) {
        // Create match via internal logic — call match create_team through insert
        const matchId = await createTeamMatch(supabase, team.id, opp.team_id, teamSize, difficulty);
        await supabase.from('team_match_queue').update({ status: 'matched', match_id: matchId }).eq('team_id', opp.team_id);
        await supabase.from('team_match_queue').upsert({
          team_id: team.id,
          owner_id: user.id,
          team_size: teamSize,
          difficulty,
          status: 'matched',
          match_id: matchId,
        });
        return json({ status: 'matched', matchId });
      }

      await supabase.from('team_match_queue').upsert({
        team_id: team.id,
        owner_id: user.id,
        team_size: teamSize,
        difficulty,
        status: 'queued',
        match_id: null,
        joined_at: new Date().toISOString(),
      });
      return json({ status: 'queued', teamSize, message: 'بانتظار فريق منافس…' });
    }

    if (action === 'queue_status') {
      const { data: mem } = await supabase.from('team_members').select('team_id').eq('user_id', user.id).maybeSingle();
      if (!mem) return json({ status: 'idle' });
      const { data: q } = await supabase.from('team_match_queue').select('*').eq('team_id', mem.team_id).maybeSingle();
      if (!q) return json({ status: 'idle' });
      return json({ status: q.status, matchId: q.match_id, teamSize: q.team_size });
    }

    if (action === 'cancel_queue') {
      const { data: mem } = await supabase.from('team_members').select('team_id').eq('user_id', user.id).maybeSingle();
      if (mem) await supabase.from('team_match_queue').delete().eq('team_id', mem.team_id);
      return json({ status: 'cancelled' });
    }


    if (action === 'pickup') {
      const desired = Math.min(15, Math.max(1, Number(body.desiredSize) || 5));
      const difficulty = body.difficulty ?? 'normal';
      // leave existing team membership for pure pickup flow
      await supabase.from('team_pickup_queue').upsert({
        user_id: user.id,
        desired_size: desired,
        difficulty,
        status: 'waiting',
        team_id: null,
        joined_at: new Date().toISOString(),
      });
      // Try assemble team from waiting players same size
      const { data: waiting } = await supabase
        .from('team_pickup_queue')
        .select('*')
        .eq('status', 'waiting')
        .eq('desired_size', desired)
        .eq('difficulty', difficulty)
        .order('joined_at', { ascending: true })
        .limit(desired);
      if ((waiting?.length ?? 0) >= desired) {
        const batch = waiting!.slice(0, desired);
        const { data: team } = await supabase.from('teams').insert({
          name: `تجميع ${desired}v${desired}`,
          invite_code: code6(),
          owner_id: batch[0].user_id,
          max_members: desired,
        }).select().single();
        for (let i = 0; i < batch.length; i++) {
          await supabase.from('team_members').delete().eq('user_id', batch[i].user_id);
          await supabase.from('team_members').insert({
            team_id: team.id,
            user_id: batch[i].user_id,
            role: i === 0 ? 'owner' : 'member',
          });
          await supabase.from('team_pickup_queue').update({
            status: 'assigned',
            team_id: team.id,
          }).eq('user_id', batch[i].user_id);
        }
        // Owner queues matchmaking
        return json({ status: 'team_ready', teamId: team.id, size: desired, message: 'اكتمل الفريق — اطلب المباراة من القائد' });
      }
      return json({ status: 'waiting', size: desired, waiting: waiting?.length ?? 1, need: desired });
    }

    if (action === 'pickup_cancel') {
      await supabase.from('team_pickup_queue').delete().eq('user_id', user.id);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

async function createTeamMatch(
  supabase: any,
  teamAId: string,
  teamBId: string,
  teamSize: number,
  difficulty: string
) {
  const TOTAL = 5;
  const ROUND_SEQUENCE = ['speed', 'knowledge', 'words', 'speed', 'mystery'];
  const challenges: any[] = [];
  const used = new Set<string>();
  for (let i = 0; i < TOTAL; i++) {
    const desired = ROUND_SEQUENCE[i] === 'mystery' ? null : ROUND_SEQUENCE[i];
    let q = supabase.from('challenges').select('id').eq('active', true).eq('qa_status', 'approved');
    if (desired) q = q.eq('type', desired);
    const { data } = await q.limit(40);
    const pool = (data ?? []).filter((c: any) => !used.has(c.id));
    if (!pool.length) continue;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    used.add(pick.id);
    challenges.push(pick);
  }
  while (challenges.length < TOTAL && challenges.length > 0) challenges.push(challenges[0]);

  const now = new Date().toISOString();
  const { data: match, error } = await supabase.from('matches').insert({
    mode: 'team',
    status: 'VS',
    difficulty,
    current_round: 1,
    total_rounds: TOTAL,
    sequence: 1,
    server_now: now,
    team_size: teamSize,
    team_a_id: teamAId,
    team_b_id: teamBId,
  }).select().single();
  if (error) throw new Error(error.message);

  const { data: memA } = await supabase.from('team_members').select('user_id, profile:profiles(username, display_name, avatar_url)').eq('team_id', teamAId);
  const { data: memB } = await supabase.from('team_members').select('user_id, profile:profiles(username, display_name, avatar_url)').eq('team_id', teamBId);

  const rows: any[] = [];
  for (const m of memA ?? []) {
    rows.push({
      match_id: match.id,
      user_id: m.user_id,
      side: 'team_a',
      username: m.profile?.display_name || m.profile?.username || 'A',
      avatar_url: m.profile?.avatar_url,
      score: 0,
      is_ai: false,
    });
  }
  for (const m of memB ?? []) {
    rows.push({
      match_id: match.id,
      user_id: m.user_id,
      side: 'team_b',
      username: m.profile?.display_name || m.profile?.username || 'B',
      avatar_url: m.profile?.avatar_url,
      score: 0,
      is_ai: false,
    });
  }
  if (rows.length) await supabase.from('match_participants').insert(rows);

  for (let i = 0; i < challenges.length; i++) {
    await supabase.from('rounds').insert({
      match_id: match.id,
      round_number: i + 1,
      challenge_id: challenges[i].id,
      status: 'pending',
      sequence: 0,
    });
  }
  return match.id as string;
}
